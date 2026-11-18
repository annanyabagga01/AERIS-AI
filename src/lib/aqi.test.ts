import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCpcbAqi,
  discoverCpcbSchemaMapping,
  findNearestSupportedCity,
  getCityQueryAliases,
  hasSufficientPollutantsForOfficialAqi,
  isTimestampStale,
  normalizePollutantUnit,
  parseCpcbTimestamp,
  resolveStationSelection,
  resolveSupportedCity,
} from './aqi.ts';
import type { PollutantReading } from './types.ts';
import {
  aggregateCpcbRecords,
  filterStationsByCityAliases,
} from '../../server/adapters/cpcb.ts';

test('classifyCpcbAqi follows official CPCB National AQI breakpoints', () => {
  assert.equal(classifyCpcbAqi(0).category, 'Good');
  assert.equal(classifyCpcbAqi(50).category, 'Good');
  assert.equal(classifyCpcbAqi(51).category, 'Satisfactory');
  assert.equal(classifyCpcbAqi(100).category, 'Satisfactory');
  assert.equal(classifyCpcbAqi(101).category, 'Moderate');
  assert.equal(classifyCpcbAqi(200).category, 'Moderate');
  assert.equal(classifyCpcbAqi(201).category, 'Poor');
  assert.equal(classifyCpcbAqi(300).category, 'Poor');
  assert.equal(classifyCpcbAqi(301).category, 'Very Poor');
  assert.equal(classifyCpcbAqi(400).category, 'Very Poor');
  assert.equal(classifyCpcbAqi(401).category, 'Severe');
  assert.equal(classifyCpcbAqi(500).category, 'Severe');
  assert.equal(classifyCpcbAqi(null).category, 'Unavailable');
  assert.equal(classifyCpcbAqi(undefined).category, 'Unavailable');
  assert.equal(classifyCpcbAqi(-5).category, 'Unavailable');
});

test('hasSufficientPollutantsForOfficialAqi rejects incomplete or unit-incompatible readings', () => {
  const twoPollutants: PollutantReading[] = [
    { id: 'PM2.5', label: 'PM2.5', value: 120, min: 90, max: 150, unit: 'µg/m³' },
    { id: 'PM10', label: 'PM10', value: 210, min: 180, max: 250, unit: 'µg/m³' },
  ];
  assert.equal(hasSufficientPollutantsForOfficialAqi(twoPollutants), false);

  const threeWithoutPm: PollutantReading[] = [
    { id: 'NO2', label: 'NO2', value: 45, min: 30, max: 60, unit: 'µg/m³' },
    { id: 'SO2', label: 'SO2', value: 12, min: 8, max: 18, unit: 'µg/m³' },
    { id: 'CO', label: 'CO', value: 1.1, min: 0.8, max: 1.5, unit: 'mg/m³' },
  ];
  assert.equal(hasSufficientPollutantsForOfficialAqi(threeWithoutPm), false);

  const incompatibleUnits: PollutantReading[] = [
    { id: 'PM2.5', label: 'PM2.5', value: 155, min: 110, max: 190, unit: 'µg/m³', unitCompatibleWithCpcb: true },
    { id: 'NO2', label: 'NO2', value: 45, min: 30, max: 60, unit: 'ppb', unitCompatibleWithCpcb: false },
    { id: 'CO', label: 'CO', value: 1.2, min: 0.9, max: 1.5, unit: 'ppm', unitCompatibleWithCpcb: false },
  ];
  assert.equal(hasSufficientPollutantsForOfficialAqi(incompatibleUnits), false);

  const completeThreeWithPm: PollutantReading[] = [
    { id: 'PM2.5', label: 'PM2.5', value: 155, min: 110, max: 190, unit: 'µg/m³', unitCompatibleWithCpcb: true },
    { id: 'NO2', label: 'NO2', value: 45, min: 30, max: 60, unit: 'µg/m³', unitCompatibleWithCpcb: true },
    { id: 'OZONE', label: 'Ozone', value: 38, min: 20, max: 52, unit: 'µg/m³', unitCompatibleWithCpcb: true },
  ];
  assert.equal(hasSufficientPollutantsForOfficialAqi(completeThreeWithPm), true);
});

test('normalizePollutantUnit never merges incompatible units', () => {
  const coValid = normalizePollutantUnit('mg/m3', 'CO');
  assert.equal(coValid.unit, 'mg/m³');
  assert.equal(coValid.compatibleWithCpcb, true);

  const coPpm = normalizePollutantUnit('ppm', 'CO');
  assert.equal(coPpm.unit, 'ppm');
  assert.equal(coPpm.compatibleWithCpcb, false);

  const pmValid = normalizePollutantUnit('ug/m3', 'PM2.5');
  assert.equal(pmValid.unit, 'µg/m³');
  assert.equal(pmValid.compatibleWithCpcb, true);

  const no2Ppb = normalizePollutantUnit('ppb', 'NO2');
  assert.equal(no2Ppb.unit, 'ppb');
  assert.equal(no2Ppb.compatibleWithCpcb, false);
});

test('getCityQueryAliases resolves Gurugram/Gurgaon, Delhi, and Kolkata', () => {
  assert.deepEqual(getCityQueryAliases('Gurugram'), ['Gurugram', 'Gurgaon']);
  assert.deepEqual(getCityQueryAliases('Delhi'), ['Delhi', 'New Delhi']);
  assert.deepEqual(getCityQueryAliases('Kolkata'), ['Kolkata', 'Calcutta']);
});

test('discoverCpcbSchemaMapping adapts to data.gov.in field metadata variants', () => {
  const schema = discoverCpcbSchemaMapping([
    { id: 'station_name', name: 'Station', type: 'keyword' },
    { id: 'city', name: 'City', type: 'keyword' },
    { id: 'avg_value', name: 'Average', type: 'double' },
    { id: 'pollutant_unit', name: 'Unit', type: 'keyword' },
  ]);
  assert.equal(schema.stationField, 'station_name');
  assert.equal(schema.avgField, 'avg_value');
  assert.equal(schema.unitField, 'pollutant_unit');
});

test('aggregateCpcbRecords normalizes Gurugram, Delhi, Kolkata and rejects incomplete AQI', () => {
  const nowMs = Date.parse('2026-11-17T15:00:00+05:30');
  const records = [
    // Gurugram (via Gurgaon alias) with 3 valid CPCB pollutants -> computes official AQI
    {
      country: 'India',
      state: 'Haryana',
      city: 'Gurgaon',
      station: 'Vikas Sadan, Gurugram - HSPCB',
      last_update: '17-11-2026 14:30:00',
      latitude: '28.4501',
      longitude: '77.0263',
      pollutant_id: 'PM2.5',
      pollutant_min: '95',
      pollutant_max: '175',
      pollutant_avg: '135',
    },
    {
      city: 'Gurgaon',
      station: 'Vikas Sadan, Gurugram - HSPCB',
      last_update: '17-11-2026 14:30:00',
      pollutant_id: 'PM10',
      pollutant_avg: '240',
    },
    {
      city: 'Gurgaon',
      station: 'Vikas Sadan, Gurugram - HSPCB',
      last_update: '17-11-2026 14:30:00',
      pollutant_id: 'NO2',
      pollutant_avg: '52',
    },
    // Kolkata station with only 2 pollutants -> MUST remain Unavailable (null)
    {
      state: 'West Bengal',
      city: 'Kolkata',
      station: 'Ballygunge, Kolkata - WBPCB',
      last_update: '17-11-2026 14:00:00',
      latitude: '22.5367',
      longitude: '88.3638',
      pollutant_id: 'PM2.5',
      pollutant_avg: '110',
    },
    {
      state: 'West Bengal',
      city: 'Kolkata',
      station: 'Ballygunge, Kolkata - WBPCB',
      last_update: '17-11-2026 14:00:00',
      pollutant_id: 'NO2',
      pollutant_avg: '40',
    },
    // Delhi station
    {
      state: 'Delhi',
      city: 'Delhi',
      station: 'Anand Vihar, Delhi - DPCC',
      last_update: '17-11-2026 14:30:00',
      latitude: '28.6476',
      longitude: '77.3158',
      pollutant_id: 'PM2.5',
      pollutant_avg: '185',
    },
    {
      state: 'Delhi',
      city: 'Delhi',
      station: 'Anand Vihar, Delhi - DPCC',
      last_update: '17-11-2026 14:30:00',
      pollutant_id: 'PM10',
      pollutant_avg: '310',
    },
    {
      state: 'Delhi',
      city: 'Delhi',
      station: 'Anand Vihar, Delhi - DPCC',
      last_update: '17-11-2026 14:30:00',
      pollutant_id: 'CO',
      pollutant_avg: '2.1',
      pollutant_unit: 'mg/m3',
    },
  ];

  const allStations = aggregateCpcbRecords(records, nowMs);
  assert.equal(allStations.length, 3);

  const gurugramStations = filterStationsByCityAliases(allStations, 'Gurugram');
  assert.equal(gurugramStations.length, 1);
  assert.equal(gurugramStations[0].isOfficialNationalAqi, true);
  assert.ok(gurugramStations[0].officialAqi !== null && gurugramStations[0].officialAqi > 300);

  const kolkataStations = filterStationsByCityAliases(allStations, 'Kolkata');
  assert.equal(kolkataStations.length, 1);
  assert.equal(kolkataStations[0].officialAqi, null);
  assert.equal(kolkataStations[0].category, 'Unavailable');
  assert.equal(kolkataStations[0].isOfficialNationalAqi, false);

  const delhiStations = filterStationsByCityAliases(allStations, 'Delhi');
  assert.equal(delhiStations.length, 1);
  const selected = resolveStationSelection(delhiStations, delhiStations[0].id);
  assert.equal(selected.selectedStation?.station, 'Anand Vihar, Delhi - DPCC');
  assert.ok(selected.primaryAqi !== null && selected.primaryAqi >= 300);
});

test('parseCpcbTimestamp and isTimestampStale handle data.gov.in IST timestamps', () => {
  const iso = parseCpcbTimestamp('17-11-2026 14:30:00');
  assert.equal(iso, '2026-11-17T14:30:00+05:30');

  const nowMs = Date.parse('2026-11-17T15:00:00+05:30');
  assert.equal(isTimestampStale(iso, nowMs, 180), false);

  const sixHoursLaterMs = Date.parse('2026-11-17T20:30:00+05:30');
  assert.equal(isTimestampStale(iso, sixHoursLaterMs, 180), true);
});

test('findNearestSupportedCity resolves Mumbai coordinates to Mumbai', () => {
  const city = findNearestSupportedCity(19.1, 72.88);
  assert.equal(city.name, 'Mumbai');
});

test('resolveSupportedCity resolves canonical city aliases and rejects unknown cities', () => {
  assert.equal(resolveSupportedCity('Gurgaon')?.name, 'Gurugram');
  assert.equal(resolveSupportedCity('Bangalore')?.name, 'Bengaluru');
  assert.equal(resolveSupportedCity('Calcutta')?.name, 'Kolkata');
  assert.equal(resolveSupportedCity('New Delhi')?.name, 'Delhi');
  assert.equal(resolveSupportedCity('UnknownCity'), null);
});

test('filterStationsByCityAliases matches exact UT states without partial state false positives', () => {
  const stations = aggregateCpcbRecords(
    [
      {
        state: 'Uttar Pradesh',
        city: 'Noida',
        station: 'Sector 62, Noida - UPPCB',
        last_update: '17-11-2026 14:30:00',
        pollutant_id: 'PM2.5',
        pollutant_avg: '140',
      },
      {
        state: 'Chandigarh',
        city: 'Sector-25',
        station: 'Sector-25 - CPCC',
        last_update: '17-11-2026 14:30:00',
        pollutant_id: 'PM2.5',
        pollutant_avg: '90',
      },
    ],
    Date.parse('2026-11-17T15:00:00+05:30')
  );

  assert.equal(filterStationsByCityAliases(stations, 'Uttar').length, 0);
  assert.equal(filterStationsByCityAliases(stations, 'Noida').length, 1);
  assert.equal(filterStationsByCityAliases(stations, 'Chandigarh').length, 1);
});
