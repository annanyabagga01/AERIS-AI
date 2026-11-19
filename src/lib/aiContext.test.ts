import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllowedSourceReferences,
  enforceRecommendationGuardrails,
  evaluateAqiVerificationStatus,
  sanitizeChatHistory,
} from './aiContext.ts';
import { classifyCpcbAqi } from './aqi.ts';
import {
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
} from './indiaSimulation.ts';
import type { AiRecommendationStructured, CityAqiResponse } from './types.ts';

function makeSimulatedContext(
  overrides: Partial<CityAqiResponse> = {}
): CityAqiResponse {
  const cat = classifyCpcbAqi(320);
  return {
    city: 'Delhi',
    district: 'East Delhi',
    state: 'Delhi',
    stateCode: 'DL',
    lat: 28.6139,
    lng: 77.209,
    primaryAqi: 320,
    category: cat.category,
    categoryMeta: cat,
    predominantPollutant: 'PM2.5',
    selectedStationId: 'in-dl-anand-vihar',
    selectedStationName: 'Anand Vihar Transit Hub',
    stations: [
      {
        id: 'in-dl-anand-vihar',
        station: 'Anand Vihar Transit Hub',
        city: 'Delhi',
        district: 'East Delhi',
        state: 'Delhi',
        stateCode: 'DL',
        lat: 28.6469,
        lng: 77.316,
        officialAqi: 320,
        category: 'Very Poor',
        predominantPollutant: 'PM2.5',
        pollutants: [],
        lastUpdatedIso: '2026-11-19T06:00:00Z',
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
    lastUpdatedIso: '2026-11-19T06:00:00Z',
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
        lastCheckedIso: '2026-11-19T06:00:00Z',
      },
    },
    ...overrides,
  };
}

test('evaluateAqiVerificationStatus transparently labels simulated and missing readings', () => {
  const simCtx = makeSimulatedContext();
  const simStatus = evaluateAqiVerificationStatus(simCtx);
  assert.equal(simStatus.isLiveVerified, false);
  assert.equal(simStatus.isDemo, true);
  assert.match(simStatus.verificationNotice, /SIMULATED DATA/i);
  assert.match(simStatus.verificationNotice, /not actual environmental measurements/i);

  const missingCtx = makeSimulatedContext({
    primaryAqi: null,
    category: 'Unavailable',
    categoryMeta: classifyCpcbAqi(null),
  });
  const missingStatus = evaluateAqiVerificationStatus(missingCtx);
  assert.equal(missingStatus.isLiveVerified, false);
  assert.equal(missingStatus.isMissing, true);
  assert.match(missingStatus.verificationNotice, /unavailable/i);
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

test('enforceRecommendationGuardrails guarantees simulation notices, safety caveats, and allowed sources', () => {
  const simCtx = makeSimulatedContext();
  const sampleRaw: AiRecommendationStructured = {
    summary: 'Very Poor simulated conditions require indoor precautions.',
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
    reasoning: 'PM2.5 is the primary simulated driver.',
    sourceReferences: [],
    dataLimitations: '',
  };

  const guarded = enforceRecommendationGuardrails(sampleRaw, simCtx);
  assert.match(guarded.currentRisk, /Very Poor/);
  assert.match(guarded.currentRisk, /Simulated/i);
  assert.match(guarded.dataLimitations, /SIMULATED DATA/i);
  assert.match(guarded.dataLimitations, /diagnos|prescrib/i);
  assert.match(guarded.dataLimitations, /do not guarantee complete protection/i);
  assert.ok(
    guarded.avoidActions.some((item) => /avoid outdoor physical activity/i.test(item))
  );
  assert.deepEqual(
    guarded.sourceReferences,
    buildAllowedSourceReferences(simCtx)
  );
});
