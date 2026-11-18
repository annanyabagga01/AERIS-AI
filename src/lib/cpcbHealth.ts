import { classifyCpcbAqi, formatFreshnessLabel } from './aqi.ts';
import type {
  AqiCategory,
  CityAqiResponse,
  FamilyPreferences,
  StationReading,
} from './types.ts';

export interface CpcbHealthBandSpec {
  category: AqiCategory;
  rangeLabel: string;
  accentHex: string;
  textClass: string;
  borderClass: string;
  surfaceClass: string;
  officialHealthImplication: string;
  avoidOutdoorPhysicalActivity: boolean;
  outdoorActivityHeadline: string;
  generalPopulationGuidance: string[];
  sensitiveHouseholdGuidance: string[];
  sourceTitle: string;
}

export interface CpcbHealthCitation {
  title: string;
  detail: string;
}

export interface CpcbHealthRecommendation {
  category: AqiCategory;
  rangeLabel: string;
  aqiValue: number | null;
  predominantPollutant: string | null;
  city: string;
  stationName: string;
  officialHealthImplication: string;
  avoidOutdoorPhysicalActivity: boolean;
  outdoorActivityHeadline: string;
  activeAudience: 'sensitive' | 'general';
  generalPopulationGuidance: string[];
  sensitiveHouseholdGuidance: string[];
  householdTailoredNotes: string[];
  explanation: string;
  observedTimestampIso: string;
  observedTimestampDisplay: string;
  freshnessLabel: string;
  isStale: boolean;
  isDemo: boolean;
  isLiveVerified: boolean;
  dataLimitations: string[];
  sourceCitations: CpcbHealthCitation[];
  medicalDisclaimer: string;
  protectiveEquipmentCaveat: string;
}

export const CPCB_NON_MEDICAL_DISCLAIMER =
  'Informational precautionary guidance only. AERIS AI does not diagnose health conditions, prescribe treatments, or prescribe medication. Consult a qualified clinician for any respiratory or cardiac symptoms or personal care plans.';

export const CPCB_PROTECTIVE_EQUIPMENT_CAVEAT =
  'Well-fitted N95/KF94 respirators and indoor HEPA purifiers can help reduce inhaled particle exposure as precautionary aids, but no mask or purifier guarantees complete protection against all particulate or gaseous pollutants.';

export const CPCB_HEALTH_BANDS: Record<AqiCategory, CpcbHealthBandSpec> = {
  Good: {
    category: 'Good',
    rangeLabel: '0 – 50',
    accentHex: '#10B981',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
    surfaceClass: 'bg-emerald-500/10',
    officialHealthImplication: 'Minimal impact.',
    avoidOutdoorPhysicalActivity: false,
    outdoorActivityHeadline: 'Outdoor physical activity supported',
    generalPopulationGuidance: [
      'Normal outdoor physical activity, walking, cycling, and school play are supported.',
      'Cross-ventilate indoor rooms naturally during daytime hours.',
      'Prefer active mobility or transit away from heavy idling intersections.',
    ],
    sensitiveHouseholdGuidance: [
      'Normal light-to-moderate outdoor routines are generally well tolerated.',
      'Continue keeping indoor rooms smoke-free (avoid incense, candles, and indoor tobacco).',
      'Monitor individual comfort if unusually sensitive to roadside dust.',
    ],
    sourceTitle: 'CPCB National AQI Standard — Good (0–50)',
  },
  Satisfactory: {
    category: 'Satisfactory',
    rangeLabel: '51 – 100',
    accentHex: '#14B8A6',
    textClass: 'text-teal-300',
    borderClass: 'border-teal-500/40',
    surfaceClass: 'bg-teal-500/10',
    officialHealthImplication:
      'May cause minor breathing discomfort to sensitive people.',
    avoidOutdoorPhysicalActivity: false,
    outdoorActivityHeadline:
      'Outdoor activity generally acceptable; monitor sensitive comfort',
    generalPopulationGuidance: [
      'Normal outdoor exercise and commuting can proceed; prefer parks or quiet internal roads.',
      'Use kitchen exhaust when cooking and wet-mop dust instead of dry sweeping.',
      'Ventilate rooms during clear midday hours rather than evening traffic peaks.',
    ],
    sensitiveHouseholdGuidance: [
      'Keep outdoor exertion light-to-moderate and take breaks if minor throat or airway discomfort appears.',
      'Avoid peak roadside traffic corridors for children and older adults.',
      'Keep indoor air clean without incense, mosquito coils, or unvented fumes.',
    ],
    sourceTitle: 'CPCB National AQI Standard — Satisfactory (51–100)',
  },
  Moderate: {
    category: 'Moderate',
    rangeLabel: '101 – 200',
    accentHex: '#F59E0B',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/40',
    surfaceClass: 'bg-amber-500/10',
    officialHealthImplication:
      'May cause breathing discomfort to people with lung disease such as asthma, and discomfort to people with heart disease, children and older adults.',
    avoidOutdoorPhysicalActivity: false,
    outdoorActivityHeadline:
      'Moderate intensity only for general public; curtail prolonged exertion for sensitive groups',
    generalPopulationGuidance: [
      'Shorten prolonged vigorous outdoor workouts and shift cardio away from busy intersections.',
      'Limit natural ventilation to brief midday dispersion hours; close windows at dusk.',
      'Choose enclosed Metro, AC bus, or shared vehicles over high-exertion roadside cycling.',
    ],
    sensitiveHouseholdGuidance: [
      'Children, older adults, and sensitive individuals should reduce prolonged or heavy outdoor exertion.',
      'Move structured exercise indoors and prioritize brief midday light walks only if visibility is clearer.',
      'Close exterior gaps during dawn/evening peaks and run indoor HEPA filtration if available.',
    ],
    sourceTitle: 'CPCB National AQI Standard — Moderate (101–200)',
  },
  Poor: {
    category: 'Poor',
    rangeLabel: '201 – 300',
    accentHex: '#F97316',
    textClass: 'text-orange-300',
    borderClass: 'border-orange-500/40',
    surfaceClass: 'bg-orange-500/10',
    officialHealthImplication:
      'May cause breathing discomfort to people on prolonged exposure, and discomfort to people with heart disease.',
    avoidOutdoorPhysicalActivity: false,
    outdoorActivityHeadline:
      'Restrict prolonged outdoor exertion; shift sensitive groups indoors',
    generalPopulationGuidance: [
      'Limit prolonged outdoor physical exertion and move vigorous training or running indoors.',
      'Use enclosed transit (Metro or closed-window vehicles) instead of two-wheelers or outdoor jogging.',
      'Keep windows sealed during morning/evening inversions; wet-mop floors and vent kitchen smoke.',
    ],
    sensitiveHouseholdGuidance: [
      'Avoid prolonged outdoor physical activity; keep children’s school play and older adults’ walks indoors.',
      'Use closed rooms with mechanical HEPA filtration if available, keeping indoor sources zero-smoke.',
      'When essential outdoor transit cannot be skipped, wear a snug N95/KF94 respirator as a precautionary aid (not guaranteed protection).',
    ],
    sourceTitle: 'CPCB National AQI Standard — Poor (201–300)',
  },
  'Very Poor': {
    category: 'Very Poor',
    rangeLabel: '301 – 400',
    accentHex: '#F43F5E',
    textClass: 'text-rose-300',
    borderClass: 'border-rose-500/40',
    surfaceClass: 'bg-rose-500/10',
    officialHealthImplication:
      'May cause respiratory illness to the people on prolonged exposure. Effect may be more pronounced in people with lung and heart diseases.',
    avoidOutdoorPhysicalActivity: true,
    outdoorActivityHeadline:
      'Avoid outdoor physical activity — move all workouts and school drills indoors',
    generalPopulationGuidance: [
      'Avoid outdoor physical activity, jogging, sports practice, and heavy labour outdoors.',
      'Keep doors and windows sealed during dawn and evening smog peaks; operate indoor HEPA filtration if available.',
      'Use enclosed Metro or closed-window transit and keep indoor rooms free of incense, coils, or frying smoke.',
    ],
    sensitiveHouseholdGuidance: [
      'Strictly avoid outdoor physical activity and minimize non-essential outdoor exposure for children, older adults, and sensitive individuals.',
      'Stay in a closed, filtered indoor room where possible and maintain wet-mopped, dust-free surfaces.',
      'If stepping outdoors for essential errands, use a well-fitted N95/KF94 mask strictly as an exposure-reduction precaution (never a guarantee of protection).',
    ],
    sourceTitle: 'CPCB National AQI Standard — Very Poor (301–400)',
  },
  Severe: {
    category: 'Severe',
    rangeLabel: '401 – 500',
    accentHex: '#EF4444',
    textClass: 'text-red-300',
    borderClass: 'border-red-500/45',
    surfaceClass: 'bg-red-500/15',
    officialHealthImplication:
      'May cause respiratory impact even on healthy people, and serious health impacts on people with lung/heart disease. The health impacts may be experienced even during light physical activity.',
    avoidOutdoorPhysicalActivity: true,
    outdoorActivityHeadline:
      'Avoid all outdoor physical activity — even light outdoor exertion increases exposure',
    generalPopulationGuidance: [
      'Avoid all outdoor physical activity, including brisk walking and light outdoor workouts.',
      'Remain indoors with windows sealed as much as practical; run properly sized HEPA purifiers continuously in occupied rooms.',
      'Eliminate indoor particulate sources (no smoking, agarbatti, candles, or unvented cooking fumes) and work/study remotely if feasible.',
    ],
    sensitiveHouseholdGuidance: [
      'Strictly avoid all outdoor physical activity and remain indoors in cleaner, sealed rooms; follow any pre-arranged clinician action plan.',
      'Avoid even brief outdoor errands during peak morning/night inversion; coordinate indoor school or care routines.',
      'Precautionary masks (N95/KF94) and purifiers help reduce particulate intake during unavoidable transit but do not guarantee complete protection.',
    ],
    sourceTitle: 'CPCB National AQI Standard — Severe (401–500)',
  },
  Unavailable: {
    category: 'Unavailable',
    rangeLabel: 'N/A',
    accentHex: '#64748B',
    textClass: 'text-slate-300',
    borderClass: 'border-slate-700',
    surfaceClass: 'bg-slate-800/50',
    officialHealthImplication:
      'Official CPCB National AQI health impact tier cannot be verified because required station pollutant readings are incomplete or unavailable.',
    avoidOutdoorPhysicalActivity: false,
    outdoorActivityHeadline:
      'Exercise caution — live official AQI cannot be verified for outdoor workouts',
    generalPopulationGuidance: [
      'Avoid intense outdoor workouts until fresh CPCB data (>=3 pollutants including PM2.5 or PM10) is verified.',
      'Observe local haze/visibility conditions and rely on clean indoor routines if smog is visible.',
      'Keep indoor air clean with kitchen exhaust and wet mopping.',
    ],
    sensitiveHouseholdGuidance: [
      'Take a conservative precautionary approach: keep strenuous physical activity for children, older adults, and sensitive members indoors.',
      'Avoid incense, candles, and smoke indoors while waiting for verified monitoring telemetry.',
      'Refresh station telemetry or switch to an active nearby monitoring station in your city.',
    ],
    sourceTitle: 'CPCB National AQI Protocol — Insufficient Data Guardrail',
  },
};

export const OFFICIAL_SIX_CPCB_CATEGORIES: CpcbHealthBandSpec[] = [
  CPCB_HEALTH_BANDS.Good,
  CPCB_HEALTH_BANDS.Satisfactory,
  CPCB_HEALTH_BANDS.Moderate,
  CPCB_HEALTH_BANDS.Poor,
  CPCB_HEALTH_BANDS['Very Poor'],
  CPCB_HEALTH_BANDS.Severe,
];

function formatTimestampDisplay(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'Timestamp unavailable';
  return new Date(ms).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

export function buildCpcbHealthRecommendation(params: {
  aqiData: CityAqiResponse | null;
  preferences: FamilyPreferences;
  nowMs?: number;
}): CpcbHealthRecommendation {
  const { aqiData, preferences, nowMs = Date.now() } = params;

  const activeStation: StationReading | undefined = aqiData
    ? (aqiData.selectedStationId
        ? aqiData.stations.find((s) => s.id === aqiData.selectedStationId)
        : undefined) ?? aqiData.stations[0]
    : undefined;

  const aqiValue = aqiData?.primaryAqi ?? null;
  const meta = classifyCpcbAqi(aqiValue);
  const band = CPCB_HEALTH_BANDS[meta.category];

  const isDemo = !aqiData || !aqiData.hasOfficialData || aqiData.dataMode === 'demo';
  const isStale = Boolean(
    activeStation?.isStale ||
      (aqiData &&
        aqiData.stations.length > 0 &&
        aqiData.staleStationsCount >= aqiData.stations.length)
  );
  const isMissing = aqiValue === null || meta.category === 'Unavailable';
  const isLiveVerified = Boolean(
    aqiData && aqiData.hasOfficialData && aqiData.dataMode === 'live' && !isMissing && !isStale
  );

  const sensitiveActive =
    preferences.pollutionSensitiveHousehold ||
    preferences.hasChildren ||
    preferences.hasOlderAdults;

  const householdTailoredNotes: string[] = [];
  if (preferences.pollutionSensitiveHousehold) {
    householdTailoredNotes.push(
      'Sensitive Household toggle is ON: AERIS prioritizes the Pollution-Sensitive Households precautionary column.'
    );
  }
  if (preferences.hasChildren) {
    householdTailoredNotes.push(
      band.avoidOutdoorPhysicalActivity || meta.category === 'Poor'
        ? 'Children in household: keep morning school assembly/playground games indoors and verify school transit precautions.'
        : 'Children in household: keep high-exertion outdoor sports aligned with midday clearer air only.'
    );
  }
  if (preferences.hasOlderAdults) {
    householdTailoredNotes.push(
      band.avoidOutdoorPhysicalActivity || meta.category === 'Poor'
        ? 'Older adults in household: postpone dawn/dusk park walks and maintain dust-free, well-filtered indoor rooms.'
        : 'Older adults in household: prefer well-lit midday walks away from main vehicular roads.'
    );
  }

  const city = aqiData?.city ?? preferences.city;
  const stationName = aqiData?.selectedStationId
    ? activeStation?.station ?? aqiData.selectedStationName ?? `${city} Station`
    : `${city} Aggregate (${aqiData?.stations.length ?? 0} stations)`;
  const predominantPollutant = aqiData?.predominantPollutant ?? activeStation?.predominantPollutant ?? null;
  const observedTimestampIso = aqiData?.lastUpdatedIso ?? new Date(nowMs).toISOString();
  const freshnessLabel = formatFreshnessLabel(observedTimestampIso, nowMs);
  const observedTimestampDisplay = formatTimestampDisplay(observedTimestampIso);

  let explanation: string;
  if (isMissing) {
    explanation = `No official CPCB National AQI could be calculated for ${stationName} (${city}) because CPCB standards require valid readings for at least 3 pollutants (including PM2.5 or PM10) in compatible units. AERIS AI never guesses missing AQI values.`;
  } else {
    const pollutantNote = predominantPollutant
      ? `${predominantPollutant} is the predominant pollutant driving today’s index.`
      : 'Particulate and gaseous sub-indices determine this tier.';
    const stationNote = aqiData?.selectedStationId
      ? `Calculated from focused monitor ${stationName}.`
      : `Aggregated across ${aqiData?.stations.length ?? 1} station(s) in ${city}.`;
    const activityNote = band.avoidOutdoorPhysicalActivity
      ? `At ${meta.category} (${band.rangeLabel}), inhaled particle dose rises sharply during exertion, so outdoor physical activity should be avoided.`
      : `At ${meta.category} (${band.rangeLabel}), precautionary adjustments scale according to household sensitivity.`;
    explanation = `CPCB AQI ${aqiValue} falls in the ${meta.category} (${band.rangeLabel}) category. ${pollutantNote} ${stationNote} ${activityNote}`;
  }

  const dataLimitations: string[] = [];
  if (!aqiData) {
    dataLimitations.push(
      'Telemetry feed has not finished loading; no verified live monitoring measurement is currently active.'
    );
  } else if (isDemo) {
    dataLimitations.push(
      'Demo Reference Mode: official CPCB live feed credentials are unavailable or unreachable, so baseline reference figures are displayed instead of real-time readings.'
    );
  } else if (isStale) {
    dataLimitations.push(
      `Stale Monitoring Timestamp: latest observation (${observedTimestampDisplay}) is older than the 3-hour freshness threshold and may not reflect rapid local shifts.`
    );
  }
  if (isMissing) {
    dataLimitations.push(
      'Incomplete Pollutant Coverage: fewer than 3 CPCB-compatible pollutants (with PM2.5 or PM10) were reported for this selection.'
    );
  }
  if (aqiData?.hasOpenAqData) {
    dataLimitations.push(
      'OpenAQ v3 Sensor Distinction: supplementary OpenAQ v3 raw sensor concentrations are shown separately and are never converted into official Indian National AQI.'
    );
  }
  dataLimitations.push(
    'Spatial & Temporal Scope: fixed CAAQMS/CPCB ambient monitors represent point-in-time station averages and cannot measure hyper-local traffic kerbside plumes, indoor smoke, or future AQI forecasts.'
  );

  const sourceCitations: CpcbHealthCitation[] = [
    {
      title: 'Central Pollution Control Board (CPCB) — National Air Quality Index (NAQI)',
      detail: `Official 6-tier AQI breakpoints & health impact table (${band.category}: ${band.rangeLabel}).`,
    },
    aqiData && aqiData.hasOfficialData
      ? {
          title: 'CPCB Real-Time AQI Telemetry (data.gov.in)',
          detail: `${stationName} · Observed ${observedTimestampDisplay} (${freshnessLabel}).`,
        }
      : {
          title: 'AERIS AI Demo Reference Profile (Fallback — Not Live CPCB)',
          detail: `${stationName} · Reference timestamp ${observedTimestampDisplay}.`,
        },
  ];

  if (aqiData && aqiData.hasOpenAqData && aqiData.openAqSensors.length > 0) {
    sourceCitations.push({
      title: 'OpenAQ v3 Sensor Network (Supplementary Only)',
      detail: `${aqiData.openAqSensors.length} raw sensor reading(s) displayed separately without CPCB conversion.`,
    });
  }

  return {
    category: meta.category,
    rangeLabel: band.rangeLabel,
    aqiValue,
    predominantPollutant,
    city,
    stationName,
    officialHealthImplication: band.officialHealthImplication,
    avoidOutdoorPhysicalActivity: band.avoidOutdoorPhysicalActivity,
    outdoorActivityHeadline: band.outdoorActivityHeadline,
    activeAudience: sensitiveActive ? 'sensitive' : 'general',
    generalPopulationGuidance: band.generalPopulationGuidance,
    sensitiveHouseholdGuidance: band.sensitiveHouseholdGuidance,
    householdTailoredNotes,
    explanation,
    observedTimestampIso,
    observedTimestampDisplay,
    freshnessLabel,
    isStale,
    isDemo,
    isLiveVerified,
    dataLimitations,
    sourceCitations,
    medicalDisclaimer: CPCB_NON_MEDICAL_DISCLAIMER,
    protectiveEquipmentCaveat: CPCB_PROTECTIVE_EQUIPMENT_CAVEAT,
  };
}
