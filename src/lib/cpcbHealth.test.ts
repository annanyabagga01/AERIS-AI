import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCpcbHealthRecommendation,
  CPCB_HEALTH_BANDS,
  CPCB_NON_MEDICAL_DISCLAIMER,
  CPCB_PROTECTIVE_EQUIPMENT_CAVEAT,
  OFFICIAL_SIX_CPCB_CATEGORIES,
} from './cpcbHealth.ts';
import { classifyCpcbAqi } from './aqi.ts';
import {
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
} from './indiaSimulation.ts';
import type { CityAqiResponse, FamilyPreferences } from './types.ts';

function makePrefs(overrides: Partial<FamilyPreferences> = {}): FamilyPreferences {
  return {
    city: 'Delhi',
    householdSize: 3,
    hasChildren: false,
    hasOlderAdults: false,
    pollutionSensitiveHousehold: false,
    commuteMode: 'metro',
    workStartHour: '09:00',
    workEndHour: '18:30',
    preferredExerciseTime: 'morning',
    anonymousHandle: 'Aeris-Test',
    communityOptIn: false,
    ...overrides,
  };
}

function makeCityData(
  aqi: number | null,
  overrides: Partial<CityAqiResponse> = {}
): CityAqiResponse {
  const meta = classifyCpcbAqi(aqi);
  return {
    city: 'Delhi',
    district: 'New Delhi',
    state: 'Delhi',
    stateCode: 'DL',
    lat: 28.6139,
    lng: 77.209,
    primaryAqi: aqi,
    category: meta.category,
    categoryMeta: meta,
    predominantPollutant: aqi === null ? null : 'PM2.5',
    selectedStationId: 'st-1',
    selectedStationName: 'R K Puram Institutional Area',
    stations: [
      {
        id: 'st-1',
        station: 'R K Puram Institutional Area',
        city: 'Delhi',
        district: 'New Delhi',
        state: 'Delhi',
        stateCode: 'DL',
        lat: 28.56,
        lng: 77.18,
        officialAqi: aqi,
        category: meta.category,
        predominantPollutant: aqi === null ? null : 'PM2.5',
        pollutants: [],
        lastUpdatedIso: '2026-11-19T06:00:00.000Z',
        source: 'AERIS_SIMULATION_ENGINE',
        sourceLabel: 'AERIS AI Simulation Engine (SIMULATED)',
        dataType: 'SIMULATED',
        isOfficialNationalAqi: false,
        isDemo: true,
        isStale: false,
        staleNote: 'Simulated interval snapshot (Demo Mode)',
      },
    ],
    openAqSensors: [],
    trend24h: [],
    lastUpdatedIso: '2026-11-19T06:00:00.000Z',
    dataMode: 'demo',
    dataSource: SIMULATION_DATA_SOURCE,
    dataType: SIMULATION_DATA_TYPE,
    sourceDisclaimer:
      'SIMULATED DATA · DEMO MODE — These readings are generated for demonstration and are not actual environmental measurements.',
    hasOfficialData: false,
    hasOpenAqData: false,
    staleStationsCount: 0,
    sourceHealth: {
      simulation: {
        sourceId: 'simulation',
        name: SIMULATION_DATA_SOURCE,
        configured: true,
        status: 'simulated',
        message: 'Active deterministic simulation.',
        lastCheckedIso: '2026-11-19T06:00:00.000Z',
      },
    },
    ...overrides,
  };
}

test('OFFICIAL_SIX_CPCB_CATEGORIES covers all six CPCB bands in order', () => {
  assert.deepEqual(
    OFFICIAL_SIX_CPCB_CATEGORIES.map((b) => b.category),
    ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe']
  );
  assert.equal(CPCB_HEALTH_BANDS.Good.rangeLabel, '0 – 50');
  assert.equal(CPCB_HEALTH_BANDS.Severe.rangeLabel, '401 – 500');
  for (const band of OFFICIAL_SIX_CPCB_CATEGORIES) {
    assert.ok(band.officialHealthImplication.length > 10);
    assert.ok(band.generalPopulationGuidance.length >= 3);
    assert.ok(band.sensitiveHouseholdGuidance.length >= 3);
  }
});

test('Very Poor and Severe AQI explicitly recommend avoiding outdoor physical activity', () => {
  const nowMs = Date.parse('2026-11-19T06:30:00.000Z');
  const veryPoor = buildCpcbHealthRecommendation({
    aqiData: makeCityData(342),
    preferences: makePrefs(),
    nowMs,
  });
  assert.equal(veryPoor.category, 'Very Poor');
  assert.equal(veryPoor.avoidOutdoorPhysicalActivity, true);
  assert.match(veryPoor.outdoorActivityHeadline, /avoid outdoor physical activity/i);
  assert.match(veryPoor.generalPopulationGuidance[0], /avoid outdoor physical activity/i);
  assert.match(veryPoor.sensitiveHouseholdGuidance[0], /avoid outdoor physical activity/i);

  const severe = buildCpcbHealthRecommendation({
    aqiData: makeCityData(438),
    preferences: makePrefs({ pollutionSensitiveHousehold: true }),
    nowMs,
  });
  assert.equal(severe.category, 'Severe');
  assert.equal(severe.avoidOutdoorPhysicalActivity, true);
  assert.equal(severe.activeAudience, 'sensitive');
  assert.match(severe.outdoorActivityHeadline, /avoid all outdoor physical activity/i);
});

test('Differentiates general population vs pollution-sensitive households and adds family notes', () => {
  const nowMs = Date.parse('2026-11-19T06:30:00.000Z');
  const generalRec = buildCpcbHealthRecommendation({
    aqiData: makeCityData(155),
    preferences: makePrefs(),
    nowMs,
  });
  assert.equal(generalRec.activeAudience, 'general');
  assert.equal(generalRec.householdTailoredNotes.length, 0);

  const sensitiveRec = buildCpcbHealthRecommendation({
    aqiData: makeCityData(155),
    preferences: makePrefs({
      pollutionSensitiveHousehold: true,
      hasChildren: true,
      hasOlderAdults: true,
    }),
    nowMs,
  });
  assert.equal(sensitiveRec.activeAudience, 'sensitive');
  assert.equal(sensitiveRec.householdTailoredNotes.length, 3);
  assert.notDeepEqual(
    sensitiveRec.generalPopulationGuidance,
    sensitiveRec.sensitiveHouseholdGuidance
  );
});

test('Includes simulation citations, timestamps, limitations, and strictly non-medical caveats', () => {
  const nowMs = Date.parse('2026-11-19T06:30:00.000Z');
  const simRec = buildCpcbHealthRecommendation({
    aqiData: makeCityData(280),
    preferences: makePrefs(),
    nowMs,
  });

  assert.equal(simRec.isDemo, true);
  assert.equal(simRec.isLiveVerified, false);
  assert.ok(simRec.sourceCitations.length >= 2);
  assert.match(simRec.observedTimestampDisplay, /IST/);
  assert.ok(simRec.dataLimitations.some((d) => /SIMULATED DATA/i.test(d)));
  assert.equal(simRec.medicalDisclaimer, CPCB_NON_MEDICAL_DISCLAIMER);
  assert.equal(simRec.protectiveEquipmentCaveat, CPCB_PROTECTIVE_EQUIPMENT_CAVEAT);
  assert.match(simRec.medicalDisclaimer, /does not diagnose.*prescribe medication/i);
  assert.match(simRec.protectiveEquipmentCaveat, /no mask or purifier guarantees complete protection/i);
});

test('Missing AQI falls back safely to Unavailable with explicit limitation', () => {
  const nowMs = Date.parse('2026-11-19T06:30:00.000Z');
  const unavailable = buildCpcbHealthRecommendation({
    aqiData: makeCityData(null),
    preferences: makePrefs(),
    nowMs,
  });
  assert.equal(unavailable.category, 'Unavailable');
  assert.equal(unavailable.aqiValue, null);
  assert.equal(unavailable.isLiveVerified, false);
  assert.ok(unavailable.dataLimitations.some((d) => /incomplete pollutant coverage/i.test(d)));
});
