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
    state: 'Delhi NCR',
    lat: 28.6139,
    lng: 77.209,
    primaryAqi: aqi,
    category: meta.category,
    categoryMeta: meta,
    predominantPollutant: aqi === null ? null : 'PM2.5',
    selectedStationId: 'st-1',
    selectedStationName: 'R K Puram, Delhi - DPCC',
    stations: [
      {
        id: 'st-1',
        station: 'R K Puram, Delhi - DPCC',
        city: 'Delhi',
        state: 'Delhi NCR',
        lat: 28.56,
        lng: 77.18,
        officialAqi: aqi,
        category: meta.category,
        predominantPollutant: aqi === null ? null : 'PM2.5',
        pollutants: [],
        lastUpdatedIso: '2026-11-17T09:00:00.000Z',
        source: 'CPCB_DATA_GOV_IN',
        sourceLabel: 'CPCB / data.gov.in Official Feed',
        isOfficialNationalAqi: aqi !== null,
        isDemo: false,
        isStale: false,
        staleNote: 'Within 3-hour freshness window',
      },
    ],
    openAqSensors: [],
    trend24h: [],
    lastUpdatedIso: '2026-11-17T09:00:00.000Z',
    dataMode: 'live',
    sourceDisclaimer: 'Live official CPCB feed.',
    hasOfficialData: true,
    hasOpenAqData: false,
    staleStationsCount: 0,
    sourceHealth: {
      cpcb: {
        sourceId: 'cpcb',
        name: 'CPCB',
        configured: true,
        status: 'live',
        message: 'Live',
        lastCheckedIso: '2026-11-17T09:00:00.000Z',
      },
      openAq: {
        sourceId: 'openaq',
        name: 'OpenAQ v3',
        configured: false,
        status: 'unconfigured',
        message: 'Off',
        lastCheckedIso: '2026-11-17T09:00:00.000Z',
      },
    },
    ...overrides,
  };
}

test('OFFICIAL_SIX_CPCB_CATEGORIES covers all six official CPCB bands in order', () => {
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
  const nowMs = Date.parse('2026-11-17T09:30:00.000Z');
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
  assert.match(severe.officialHealthImplication, /even on healthy people/i);
});

test('Differentiates general population vs pollution-sensitive households and adds family notes', () => {
  const nowMs = Date.parse('2026-11-17T09:30:00.000Z');
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

test('Includes citations, timestamps, monitoring limitations, and strictly non-medical/non-guarantee caveats', () => {
  const nowMs = Date.parse('2026-11-17T14:00:00.000Z');
  const staleDemo = buildCpcbHealthRecommendation({
    aqiData: makeCityData(280, {
      hasOfficialData: false,
      dataMode: 'demo',
      staleStationsCount: 1,
      stations: [
        {
          ...makeCityData(280).stations[0],
          isDemo: true,
          isStale: true,
        },
      ],
    }),
    preferences: makePrefs(),
    nowMs,
  });

  assert.equal(staleDemo.isDemo, true);
  assert.equal(staleDemo.isLiveVerified, false);
  assert.ok(staleDemo.sourceCitations.length >= 2);
  assert.match(staleDemo.observedTimestampDisplay, /IST/);
  assert.ok(staleDemo.dataLimitations.some((d) => /demo reference mode/i.test(d)));
  assert.ok(staleDemo.dataLimitations.some((d) => /spatial/i.test(d)));
  assert.equal(staleDemo.medicalDisclaimer, CPCB_NON_MEDICAL_DISCLAIMER);
  assert.equal(staleDemo.protectiveEquipmentCaveat, CPCB_PROTECTIVE_EQUIPMENT_CAVEAT);
  assert.match(staleDemo.medicalDisclaimer, /does not diagnose.*prescribe medication/i);
  assert.match(staleDemo.protectiveEquipmentCaveat, /no mask or purifier guarantees complete protection/i);
});

test('Missing / incomplete AQI falls back safely to Unavailable with explicit limitation', () => {
  const nowMs = Date.parse('2026-11-17T09:30:00.000Z');
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
