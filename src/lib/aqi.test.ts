import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCpcbAqi,
  findNearestSupportedCity,
  getCityQueryAliases,
  hasSufficientPollutantsForOfficialAqi,
  isTimestampStale,
  normalizePollutantUnit,
  resolveStationSelection,
  resolveSupportedCity,
} from './aqi.ts';
import type { PollutantReading, StationReading } from './types.ts';

test('classifyCpcbAqi follows India CPCB National AQI breakpoints', () => {
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

test('hasSufficientPollutantsForOfficialAqi validates pollutant completeness and units', () => {
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
});

test('getCityQueryAliases and resolveSupportedCity handle nationwide cities and aliases', () => {
  assert.deepEqual(getCityQueryAliases('Gurugram'), ['Gurugram', 'Gurgaon']);
  assert.equal(resolveSupportedCity('Gurgaon')?.name, 'Gurugram');
  assert.equal(resolveSupportedCity('Bangalore')?.name, 'Bengaluru');
  assert.equal(resolveSupportedCity('Calcutta')?.name, 'Kolkata');
  assert.equal(resolveSupportedCity('New Delhi')?.name, 'Delhi');
  assert.equal(resolveSupportedCity('Kochi')?.state, 'Kerala');
  assert.equal(resolveSupportedCity('Port Blair')?.state, 'Andaman and Nicobar Islands');
  assert.equal(resolveSupportedCity('Guwahati')?.state, 'Assam');
  assert.equal(resolveSupportedCity('UnknownCity'), null);
});

test('resolveStationSelection aggregates or focuses specific station', () => {
  const stations: StationReading[] = [
    {
      id: 'st-1',
      station: 'Station Alpha',
      city: 'Delhi',
      state: 'Delhi',
      lat: 28.64,
      lng: 77.31,
      officialAqi: 300,
      category: 'Poor',
      predominantPollutant: 'PM2.5',
      pollutants: [],
      lastUpdatedIso: '2026-11-19T06:00:00Z',
      source: 'AERIS_SIMULATION_ENGINE',
      sourceLabel: 'AERIS AI Simulation Engine (SIMULATED)',
      isOfficialNationalAqi: false,
      isDemo: true,
      isStale: false,
      staleNote: 'Simulated',
    },
    {
      id: 'st-2',
      station: 'Station Beta',
      city: 'Delhi',
      state: 'Delhi',
      lat: 28.56,
      lng: 77.18,
      officialAqi: 200,
      category: 'Moderate',
      predominantPollutant: 'PM10',
      pollutants: [],
      lastUpdatedIso: '2026-11-19T06:00:00Z',
      source: 'AERIS_SIMULATION_ENGINE',
      sourceLabel: 'AERIS AI Simulation Engine (SIMULATED)',
      isOfficialNationalAqi: false,
      isDemo: true,
      isStale: false,
      staleNote: 'Simulated',
    },
  ];

  const all = resolveStationSelection(stations, 'all');
  assert.equal(all.primaryAqi, 250);
  assert.equal(all.selectedStation, null);

  const focused = resolveStationSelection(stations, 'st-2');
  assert.equal(focused.primaryAqi, 200);
  assert.equal(focused.selectedStation?.id, 'st-2');
});

test('isTimestampStale and findNearestSupportedCity work across India', () => {
  const iso = '2026-11-19T06:00:00Z';
  assert.equal(isTimestampStale(iso, Date.parse('2026-11-19T06:30:00Z'), 180), false);
  assert.equal(isTimestampStale(iso, Date.parse('2026-11-19T12:00:00Z'), 180), true);

  assert.equal(findNearestSupportedCity(19.08, 72.87).name, 'Mumbai');
  assert.equal(findNearestSupportedCity(9.97, 76.31).name, 'Kochi');
  assert.equal(findNearestSupportedCity(11.62, 92.72).name, 'Port Blair');
});
