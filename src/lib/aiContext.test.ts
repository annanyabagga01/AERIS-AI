import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllowedSourceReferences,
  enforceRecommendationGuardrails,
  evaluateAqiVerificationStatus,
  sanitizeChatHistory,
} from './aiContext.ts';
import { classifyCpcbAqi } from './aqi.ts';
import type { AiRecommendationStructured, CityAqiResponse } from './types.ts';

function makeBaseContext(overrides: Partial<CityAqiResponse> = {}): CityAqiResponse {
  const cat = classifyCpcbAqi(320);
  return {
    city: 'Delhi',
    state: 'Delhi NCR',
    lat: 28.6139,
    lng: 77.209,
    primaryAqi: 320,
    category: cat.category,
    categoryMeta: cat,
    predominantPollutant: 'PM2.5',
    selectedStationId: 'st-1',
    selectedStationName: 'Anand Vihar, Delhi - DPCC',
    stations: [
      {
        id: 'st-1',
        station: 'Anand Vihar, Delhi - DPCC',
        city: 'Delhi',
        state: 'Delhi NCR',
        lat: 28.64,
        lng: 77.31,
        officialAqi: 320,
        category: 'Very Poor',
        predominantPollutant: 'PM2.5',
        pollutants: [],
        lastUpdatedIso: '2026-11-17T12:00:00Z',
        source: 'CPCB_DATA_GOV_IN',
        sourceLabel: 'CPCB / data.gov.in Official Feed',
        isOfficialNationalAqi: true,
        isDemo: false,
        isStale: false,
        staleNote: 'Within 3-hour freshness window',
      },
    ],
    openAqSensors: [],
    trend24h: [],
    lastUpdatedIso: '2026-11-17T12:00:00Z',
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
        lastCheckedIso: '2026-11-17T12:00:00Z',
      },
      openAq: {
        sourceId: 'openaq',
        name: 'OpenAQ v3',
        configured: false,
        status: 'unconfigured',
        message: 'Off',
        lastCheckedIso: '2026-11-17T12:00:00Z',
      },
    },
    ...overrides,
  };
}

test('evaluateAqiVerificationStatus flags demo, stale, and missing readings explicitly', () => {
  const liveCtx = makeBaseContext();
  assert.equal(evaluateAqiVerificationStatus(liveCtx).isLiveVerified, true);

  const staleCtx = makeBaseContext({
    staleStationsCount: 1,
    stations: [
      {
        ...makeBaseContext().stations[0],
        isStale: true,
      },
    ],
  });
  const staleStatus = evaluateAqiVerificationStatus(staleCtx);
  assert.equal(staleStatus.isLiveVerified, false);
  assert.equal(staleStatus.isStale, true);
  assert.match(staleStatus.verificationNotice, /cannot be verified/i);

  const demoCtx = makeBaseContext({
    hasOfficialData: false,
    dataMode: 'demo',
  });
  const demoStatus = evaluateAqiVerificationStatus(demoCtx);
  assert.equal(demoStatus.isLiveVerified, false);
  assert.equal(demoStatus.isDemo, true);
  assert.match(demoStatus.verificationNotice, /cannot be verified/i);

  const missingCtx = makeBaseContext({
    primaryAqi: null,
    category: 'Unavailable',
    categoryMeta: classifyCpcbAqi(null),
  });
  const missingStatus = evaluateAqiVerificationStatus(missingCtx);
  assert.equal(missingStatus.isLiveVerified, false);
  assert.equal(missingStatus.isMissing, true);
  assert.match(missingStatus.verificationNotice, /cannot be verified/i);

  const partialDemoOpenAqCtx = makeBaseContext({
    hasOfficialData: false,
    hasOpenAqData: true,
    dataMode: 'partial',
  });
  const partialStatus = evaluateAqiVerificationStatus(partialDemoOpenAqCtx);
  assert.equal(partialStatus.isLiveVerified, false);
  assert.equal(partialStatus.isDemo, true);
  assert.match(partialStatus.verificationNotice, /OpenAQ v3/i);
});

test('sanitizeChatHistory bounds conversation length and strips invalid entries', () => {
  const raw = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `Turn ${i + 1}`,
  }));
  const bounded = sanitizeChatHistory(
    [...raw, { role: 'system', text: 'ignore me' }, { role: 'user', text: '   ' }],
    6
  );
  assert.equal(bounded.length, 6);
  assert.equal(bounded[0].text, 'Turn 7');
  assert.equal(bounded[5].text, 'Turn 12');
});

test('enforceRecommendationGuardrails guarantees verification warnings and allowed sources', () => {
  const demoCtx = makeBaseContext({
    hasOfficialData: false,
    dataMode: 'partial',
    hasOpenAqData: true,
    openAqSensors: [
      {
        id: 'o-1',
        locationName: 'R K Puram',
        city: 'Delhi',
        lat: 28.56,
        lng: 77.18,
        parameter: 'PM25',
        value: 85,
        unit: 'µg/m³',
        lastUpdatedIso: '2026-11-17T11:30:00Z',
        isStale: false,
        source: 'OPENAQ_V3_SENSOR',
        sourceLabel: 'OpenAQ v3',
        isOfficialNationalAqi: false,
      },
    ],
  });

  const sampleRaw: AiRecommendationStructured = {
    summary: 'Very Poor conditions require indoor precautions.',
    currentRisk: 'Elevated',
    recommendedActions: ['Run HEPA purifier in bedrooms.'],
    avoidActions: ['Avoid burning incense indoors.'],
    indoorAdvice: ['Close windows during evening peak smog.'],
    commuteAdvice: ['Take Delhi Metro instead of two-wheeler.'],
    dailySchedule: {
      morning: 'Indoor warm-up only.',
      afternoon: 'Brief window check.',
      evening: 'Stay indoors.',
    },
    reasoning: 'PM2.5 is the primary driver.',
    sourceReferences: [],
    dataLimitations: '',
  };

  const guarded = enforceRecommendationGuardrails(sampleRaw, demoCtx);
  assert.match(guarded.currentRisk, /Very Poor/);
  assert.match(guarded.currentRisk, /cannot be verified/i);
  assert.match(guarded.dataLimitations, /cannot be verified/i);
  assert.match(guarded.dataLimitations, /diagnos|prescrib/i);
  assert.match(guarded.dataLimitations, /do not guarantee complete protection/i);
  assert.ok(
    guarded.avoidActions.some((item) => /avoid outdoor physical activity/i.test(item))
  );
  assert.deepEqual(
    guarded.sourceReferences,
    buildAllowedSourceReferences(demoCtx)
  );
});
