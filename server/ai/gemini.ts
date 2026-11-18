import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildAllowedSourceReferences,
  enforceRecommendationGuardrails,
  evaluateAqiVerificationStatus,
  sanitizeChatHistory,
} from '../../src/lib/aiContext.ts';
import { CPCB_CATEGORY_META } from '../../src/lib/aqi.ts';
import {
  buildCpcbHealthRecommendation,
  CPCB_HEALTH_BANDS,
} from '../../src/lib/cpcbHealth.ts';
import { EMISSION_FACTORS_KG_PER_KM } from '../../src/lib/emissions.ts';
import type {
  AiRecommendationStructured,
  ChatHistoryTurn,
  CityAqiResponse,
  FamilyPreferences,
} from '../../src/lib/types.ts';

const SYSTEM_INSTRUCTION = `You are AERIS AI, an urban air quality, winter smog, indoor air, and sustainable lifestyle advisor for Indian families.

STRICT ACCURACY, SAFETY & VERIFICATION RULES:
1. NEVER invent, estimate, or alter live AQI readings, pollutant numbers, or future AQI forecasts. Use ONLY the verified AQI, pollutant concentrations, station names, timestamps, and source status provided in the server context payload.
2. If verificationStatus.isLiveVerified is false (for example, live AQI is missing, demo fallback, or stale >3 hours old), you MUST explicitly state in summary, currentRisk, and dataLimitations that live official AQI cannot be verified right now, and clearly distinguish Demo Reference Data or separate OpenAQ v3 sensor readings from official CPCB National AQI.
3. NEVER diagnose illnesses, prescribe treatments/medications/inhalers/dosages, invent medical claims, or promise quantified health benefits (such as claiming X% lower risk). NEVER promise or imply that any mask (e.g., N95/KF94) or air purifier guarantees complete protection — describe them strictly as precautionary exposure-reduction tools.
4. Use the six official CPCB National AQI categories and health implications provided in cpcbHealthGuidance (Good 0-50, Satisfactory 51-100, Moderate 101-200, Poor 201-300, Very Poor 301-400, Severe 401-500, or Unavailable). Differentiate guidance for the general population vs. pollution-sensitive households (children, older adults, respiratory/cardiac sensitivity). For Very Poor (301-400) and Severe (401-500), explicitly recommend avoiding outdoor physical activity.
5. Transparently explain monitoring data limitations whenever relevant (such as station-level vs kerbside/indoor microclimate variation, >3h staleness, incomplete pollutants marked Unavailable, Demo Reference fallback, point-in-time snapshot intervals, or separate OpenAQ v3 raw concentrations).
6. Cover all relevant areas requested by the user: outdoor activity, school routines (for children), older adult adjustments, commuting, home ventilation timing, HEPA/low-cost filtration, avoiding indoor pollution (incense/agarbatti, candles, mosquito coils, unvented cooking smoke, indoor tobacco), and sustainable choices. NEVER claim houseplants can reliably clean room air.
7. For commuting & sustainable choices: recommend walking or cycling ONLY when AQI <= 100 (or cautiously <= 150 only for non-sensitive households); otherwise prioritize Metro rail, enclosed bus, or carpooling. When estimating CO2e avoided, calculate carefully from emissionFactorsKgPerKm * distance * trips, state the exact basis clearly, and NEVER label a single-trip figure as "per week". Label outputs estimates of CO2e avoided, NOT measured local AQI improvement.
8. Only cite sources from allowedSourceReferences or cpcbHealthGuidance.sourceCitations provided in the context. Never invent external links, organizations, or citations.
9. Generate personalized morning, afternoon, and evening schedules adapted to the household's work/school hours, commute mode, children/older adult flags, and pollutionSensitiveHousehold toggle.
10. CONCISENESS: Keep summary <= 2 sentences, each bullet in arrays <= 18 words, and each morning/afternoon/evening entry <= 22 words for fast, scannable guidance.`;

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

export async function generateAerisRecommendations(params: {
  aqiContext: CityAqiResponse;
  preferences: FamilyPreferences;
  userPrompt?: string;
  history?: ChatHistoryTurn[];
}): Promise<AiRecommendationStructured> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets to enable live Gemini AI recommendations.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const activeStation =
    (params.aqiContext.selectedStationId
      ? params.aqiContext.stations.find(
          (s) => s.id === params.aqiContext.selectedStationId
        )
      : undefined) ?? params.aqiContext.stations[0];

  const verificationStatus = evaluateAqiVerificationStatus(params.aqiContext);
  const allowedSourceReferences = buildAllowedSourceReferences(params.aqiContext);
  const cpcbHealthGuidance = buildCpcbHealthRecommendation({
    aqiData: params.aqiContext,
    preferences: params.preferences,
  });

  const pollutantSummary = activeStation
    ? activeStation.pollutants.map((p) => ({
        pollutant: p.label,
        average: p.value,
        min: p.min,
        max: p.max,
        unit: p.unit,
        unitCompatibleWithCpcb: p.unitCompatibleWithCpcb !== false,
      }))
    : [];

  const openAqSample = params.aqiContext.openAqSensors.slice(0, 6).map((s) => ({
    location: s.locationName,
    parameter: s.parameter,
    value: s.value,
    unit: s.unit,
    lastUpdatedIso: s.lastUpdatedIso,
    isStale: s.isStale,
    note: 'OpenAQ v3 raw sensor reading — separate from official Indian National AQI',
  }));

  const contextPayload = {
    location: {
      city: params.aqiContext.city,
      state: params.aqiContext.state,
      station: activeStation?.station ?? 'Unavailable',
      stationCountInCity: params.aqiContext.stations.length,
    },
    airQualityData: {
      officialAqi: params.aqiContext.primaryAqi,
      cpcbCategory: params.aqiContext.category,
      cpcbCategoryMeta: CPCB_CATEGORY_META[params.aqiContext.category].rangeLabel,
      officialCpcbHealthImplication:
        CPCB_HEALTH_BANDS[params.aqiContext.category].officialHealthImplication,
      predominantPollutant: params.aqiContext.predominantPollutant,
      dataMode: params.aqiContext.dataMode,
      sourceDisclaimer: params.aqiContext.sourceDisclaimer,
      lastUpdatedIso: params.aqiContext.lastUpdatedIso,
      stationIsStale: activeStation?.isStale ?? true,
      staleStationsCount: params.aqiContext.staleStationsCount,
      pollutants: pollutantSummary,
      openAqSensorsSeparate: openAqSample,
    },
    cpcbHealthGuidance: {
      category: cpcbHealthGuidance.category,
      rangeLabel: cpcbHealthGuidance.rangeLabel,
      officialHealthImplication: cpcbHealthGuidance.officialHealthImplication,
      avoidOutdoorPhysicalActivity: cpcbHealthGuidance.avoidOutdoorPhysicalActivity,
      outdoorActivityHeadline: cpcbHealthGuidance.outdoorActivityHeadline,
      generalPopulationGuidance: cpcbHealthGuidance.generalPopulationGuidance,
      sensitiveHouseholdGuidance: cpcbHealthGuidance.sensitiveHouseholdGuidance,
      observedTimestampDisplay: cpcbHealthGuidance.observedTimestampDisplay,
      dataLimitations: cpcbHealthGuidance.dataLimitations,
      sourceCitations: cpcbHealthGuidance.sourceCitations,
      medicalDisclaimer: cpcbHealthGuidance.medicalDisclaimer,
      protectiveEquipmentCaveat: cpcbHealthGuidance.protectiveEquipmentCaveat,
    },
    verificationStatus,
    allowedSourceReferences,
    familyPreferences: {
      householdSize: params.preferences.householdSize,
      hasChildren: params.preferences.hasChildren,
      hasOlderAdults: params.preferences.hasOlderAdults,
      pollutionSensitiveHousehold: params.preferences.pollutionSensitiveHousehold,
      commuteMode: params.preferences.commuteMode,
      workStartHour: params.preferences.workStartHour,
      workEndHour: params.preferences.workEndHour,
      preferredExerciseTime: params.preferences.preferredExerciseTime,
    },
    emissionFactorsKgCo2ePerPassengerKm: EMISSION_FACTORS_KG_PER_KM,
    userQuestion:
      params.userPrompt?.trim() ||
      'Provide a structured morning, afternoon, and evening air quality, indoor protection, commuting, and eco impact plan for my household today.',
  };

  const boundedHistory = sanitizeChatHistory(params.history, 8);
  const contents = [
    ...boundedHistory.map((turn) => ({
      role: turn.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: JSON.stringify(contextPayload) }],
    },
  ];

  let response;
  let lastErr: unknown;
  const startedAt = Date.now();
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  ];

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const { model, thinkingLevel } = attempts[attempt];
    try {
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          abortSignal: AbortSignal.timeout(15000),
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description:
                  'Clear 2-sentence direct answer grounded strictly in the verified AQI, timestamp, source, and user question.',
              },
              currentRisk: {
                type: Type.STRING,
                description:
                  'CPCB category and precautionary risk tier (explicitly state if live AQI cannot be verified).',
              },
              recommendedActions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concise, actionable steps covering outdoor/school activity, protective precautions, or sustainable habits.',
              },
              avoidActions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concise actions or pollution exposures to avoid.',
              },
              indoorAdvice: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concise indoor air steps: ventilation timing, HEPA/low-cost filtration, wet mopping, kitchen exhaust, smoke-free living.',
              },
              commuteAdvice: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '2 to 3 commuting & eco choices respecting AQI safety thresholds and transparent kg CO2e estimates.',
              },
              dailySchedule: {
                type: Type.OBJECT,
                properties: {
                  morning: { type: Type.STRING },
                  afternoon: { type: Type.STRING },
                  evening: { type: Type.STRING },
                },
                required: ['morning', 'afternoon', 'evening'],
                description:
                  'Personalized morning, afternoon, and evening routine adapted to school/work hours and household sensitivity.',
              },
              reasoning: {
                type: Type.STRING,
                description:
                  'Brief 1-2 sentence explanation citing verified pollutant readings, timestamp freshness, and household sensitivity factors.',
              },
              sourceReferences: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Verified sources only from allowedSourceReferences.',
              },
              dataLimitations: {
                type: Type.STRING,
                description:
                  'Explicit note on verification status, demo/stale/missing data limitations, no future forecasts, and non-medical precautionary notice.',
              },
            },
            required: [
              'summary',
              'currentRisk',
              'recommendedActions',
              'avoidActions',
              'indoorAdvice',
              'commuteAdvice',
              'dailySchedule',
              'reasoning',
              'sourceReferences',
              'dataLimitations',
            ],
          },
        },
      });
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Gemini attempt ${attempt + 1} (${model}) failed after ${Date.now() - startedAt}ms:`,
        msg
      );
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        (err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError'));
      if (isTransient && attempt < attempts.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error('Gemini API timed out. Please retry.');
      }
      if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        throw new Error(
          'Gemini API rejected the server credentials. Check GEMINI_API_KEY in Settings > Secrets.'
        );
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        throw new Error(
          'Gemini API quota temporarily reached (429). Please wait a moment or check your billing tier in Settings > Secrets.'
        );
      }
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        throw new Error(
          'Gemini service is temporarily busy (503). Please try again in a moment.'
        );
      }
      throw err;
    }
  }

  if (!response) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Gemini request failed.');
  }

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  const parsed = JSON.parse(rawText) as AiRecommendationStructured;
  return enforceRecommendationGuardrails(
    parsed,
    params.aqiContext,
    params.preferences
  );
}
