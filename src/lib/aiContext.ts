import {
  buildCpcbHealthRecommendation,
  CPCB_HEALTH_BANDS,
} from './cpcbHealth.ts';
import {
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DISCLAIMER_TEXT,
} from './indiaSimulation.ts';
import type {
  AiRecommendationStructured,
  ChatHistoryTurn,
  CityAqiResponse,
  FamilyPreferences,
} from './types.ts';

export interface AqiVerificationStatus {
  isLiveVerified: boolean;
  isStale: boolean;
  isMissing: boolean;
  isDemo: boolean;
  verificationNotice: string;
}

export function evaluateAqiVerificationStatus(
  aqiContext: CityAqiResponse
): AqiVerificationStatus {
  const activeStation =
    (aqiContext.selectedStationId
      ? aqiContext.stations.find((s) => s.id === aqiContext.selectedStationId)
      : undefined) ?? aqiContext.stations[0];

  const isMissing =
    aqiContext.primaryAqi === null || aqiContext.category === 'Unavailable';
  const isStale = Boolean(
    activeStation?.isStale ||
      (aqiContext.stations.length > 0 &&
        aqiContext.staleStationsCount >= aqiContext.stations.length)
  );

  // AERIS AI currently runs on the self-generated India simulation engine (SIMULATED DATA · DEMO MODE)
  if (isMissing) {
    return {
      isLiveVerified: false,
      isStale,
      isMissing: true,
      isDemo: true,
      verificationNotice:
        `${SIMULATION_BADGE_TEXT}: AQI reading is unavailable for this selection. ${SIMULATION_DISCLAIMER_TEXT}`,
    };
  }

  return {
    isLiveVerified: false,
    isStale,
    isMissing: false,
    isDemo: true,
    verificationNotice: `${SIMULATION_BADGE_TEXT} (${SIMULATION_DATA_SOURCE}): ${SIMULATION_DISCLAIMER_TEXT}`,
  };
}

export function sanitizeChatHistory(
  rawHistory: unknown,
  maxMessages: number = 8
): ChatHistoryTurn[] {
  if (!Array.isArray(rawHistory)) return [];
  const valid: ChatHistoryTurn[] = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if (
      (role === 'user' || role === 'assistant') &&
      typeof text === 'string' &&
      text.trim().length > 0
    ) {
      valid.push({
        role,
        text: text.trim().slice(0, 800),
      });
    }
  }
  if (valid.length <= maxMessages) return valid;
  return valid.slice(valid.length - maxMessages);
}

export function buildAllowedSourceReferences(
  _aqiContext: CityAqiResponse
): string[] {
  return [
    `${SIMULATION_DATA_SOURCE} (${SIMULATION_BADGE_TEXT} — Not actual environmental measurements)`,
    'CPCB National AQI Categories & Health Impacts (0–500 Demonstration Scale)',
    'AERIS AI Sourced Commute Emission Factors (kg CO2e/passenger-km estimate)',
  ];
}

function cleanStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
  return cleaned.length > 0 ? cleaned : fallback;
}

const DEFAULT_PREFERENCES_FALLBACK: FamilyPreferences = {
  city: 'Delhi',
  householdSize: 2,
  hasChildren: false,
  hasOlderAdults: false,
  pollutionSensitiveHousehold: false,
  commuteMode: 'metro',
  workStartHour: '09:00',
  workEndHour: '18:00',
  preferredExerciseTime: 'morning',
  anonymousHandle: 'Aeris-Household',
  communityOptIn: false,
};

export function enforceRecommendationGuardrails(
  raw: AiRecommendationStructured,
  aqiContext: CityAqiResponse,
  preferences: FamilyPreferences = DEFAULT_PREFERENCES_FALLBACK
): AiRecommendationStructured {
  const verification = evaluateAqiVerificationStatus(aqiContext);
  const allowedSources = buildAllowedSourceReferences(aqiContext);
  const cpcbHealth = buildCpcbHealthRecommendation({
    aqiData: aqiContext,
    preferences,
  });
  const band =
    CPCB_HEALTH_BANDS[aqiContext.category] ?? CPCB_HEALTH_BANDS.Unavailable;

  const aqiLabel =
    aqiContext.primaryAqi !== null
      ? `Simulated AQI ${aqiContext.primaryAqi} (${aqiContext.category})`
      : `Unavailable (${aqiContext.category})`;

  const rawRisk =
    typeof raw.currentRisk === 'string' ? raw.currentRisk.trim() : '';
  let currentRisk = rawRisk;
  if (
    !currentRisk ||
    !currentRisk.toLowerCase().includes(aqiContext.category.toLowerCase())
  ) {
    currentRisk = rawRisk ? `${aqiLabel} — ${rawRisk}` : aqiLabel;
  }
  if (!currentRisk.toLowerCase().includes('simulated')) {
    currentRisk = `${currentRisk} — Simulated Data (Demo Mode)`;
  }

  const rawLimitations =
    typeof raw.dataLimitations === 'string' ? raw.dataLimitations.trim() : '';
  const disclaimer =
    'Precautionary guidance only — never diagnoses conditions or prescribes medication; fitted masks and HEPA purifiers reduce exposure but do not guarantee complete protection.';
  const dataLimitationsParts: string[] = [verification.verificationNotice];

  if (rawLimitations) {
    const distinctSentences = rawLimitations
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => {
        if (!s) return false;
        if (verification.verificationNotice.includes(s)) return false;
        if (
          /official cpcb live|verified live aqi|actual real-time aqi|government verified/i.test(
            s
          )
        ) {
          return false;
        }
        return true;
      });
    if (distinctSentences.length > 0) {
      dataLimitationsParts.push(distinctSentences.join(' '));
    }
  }

  if (
    !dataLimitationsParts.some((p) =>
      /medical|diagnos|prescrib|guarantee/i.test(p)
    )
  ) {
    dataLimitationsParts.push(disclaimer);
  } else if (!dataLimitationsParts.some((p) => /guarantee/i.test(p))) {
    dataLimitationsParts.push(
      'Masks and air purifiers help reduce particulate intake but do not guarantee complete protection; no diagnosis or medication advice is given.'
    );
  }

  const avoidActions = cleanStringArray(raw.avoidActions, [
    'Avoid incense sticks, candles, mosquito coils, and unvented indoor smoke.',
  ]);
  if (
    band.avoidOutdoorPhysicalActivity &&
    !avoidActions.some((item) =>
      /outdoor physical activity|outdoor exercise|outdoor exertion/i.test(item)
    )
  ) {
    avoidActions.unshift(
      `Avoid outdoor physical activity under ${aqiContext.category} (${band.rangeLabel}) air quality.`
    );
  }

  return {
    summary:
      typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : `Simulated demonstration guidance for ${aqiContext.city} (${aqiLabel}). ${cpcbHealth.officialHealthImplication}`,
    currentRisk,
    recommendedActions: cleanStringArray(raw.recommendedActions, [
      'Review local environmental alerts before planning prolonged outdoor exertion.',
    ]),
    avoidActions,
    indoorAdvice: cleanStringArray(raw.indoorAdvice, [
      'Run a properly sized HEPA purifier in occupied bedrooms with doors and windows closed during high-smog hours.',
    ]),
    commuteAdvice: cleanStringArray(raw.commuteAdvice, [
      'Prefer enclosed Metro rail, city bus, or carpooling over open-air road commutes during elevated particulate levels.',
    ]),
    dailySchedule: {
      morning:
        typeof raw.dailySchedule?.morning === 'string' &&
        raw.dailySchedule.morning.trim()
          ? raw.dailySchedule.morning.trim()
          : 'Keep early-morning activity indoors when winter inversion traps surface particulates.',
      afternoon:
        typeof raw.dailySchedule?.afternoon === 'string' &&
        raw.dailySchedule.afternoon.trim()
          ? raw.dailySchedule.afternoon.trim()
          : 'Check midday local conditions before brief ventilation or essential errands.',
      evening:
        typeof raw.dailySchedule?.evening === 'string' &&
        raw.dailySchedule.evening.trim()
          ? raw.dailySchedule.evening.trim()
          : 'Seal exterior drafts before dusk, use kitchen exhaust while cooking, and keep evening routines indoors.',
    },
    reasoning:
      typeof raw.reasoning === 'string' && raw.reasoning.trim()
        ? raw.reasoning.trim()
        : cpcbHealth.explanation,
    sourceReferences: cleanStringArray(raw.sourceReferences, allowedSources),
    dataLimitations: dataLimitationsParts.join(' '),
  };
}
