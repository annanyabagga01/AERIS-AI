export type AqiCategory =
  | 'Good'
  | 'Satisfactory'
  | 'Moderate'
  | 'Poor'
  | 'Very Poor'
  | 'Severe'
  | 'Unavailable';

export type ValidAqiCategory = Exclude<AqiCategory, 'Unavailable'>;

export type DataSourceType =
  | 'AERIS_SIMULATION_ENGINE'
  | 'DEMO_REFERENCE';

export interface CpcbCategoryMeta {
  category: AqiCategory;
  rangeLabel: string;
  textClass: string;
  borderClass: string;
  surfaceClass: string;
  accentHex: string;
  advisorySummary: string;
}

export interface PollutantReading {
  id: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'CO' | 'OZONE' | 'NH3';
  label: string;
  value: number | null;
  min: number | null;
  max: number | null;
  unit: string;
  rawUnit?: string;
  unitCompatibleWithCpcb?: boolean;
  source?: DataSourceType;
}

export interface StationReading {
  id: string;
  station: string;
  city: string;
  district?: string;
  state: string;
  stateCode?: string;
  lat: number;
  lng: number;
  officialAqi: number | null;
  category: AqiCategory;
  predominantPollutant: string | null;
  pollutants: PollutantReading[];
  lastUpdatedIso: string;
  source: DataSourceType;
  sourceLabel: string;
  dataType?: 'SIMULATED';
  isOfficialNationalAqi: boolean;
  isDemo: boolean;
  isStale: boolean;
  staleNote: string;
}

export interface SimulatedIndiaStation {
  id: string;
  station_name: string;
  city: string;
  district: string;
  state: string;
  state_code: string;
  latitude: number;
  longitude: number;
  aqi: number;
  aqi_category: ValidAqiCategory;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  timestamp: string;
  data_source: 'AERIS AI Simulation Engine';
  data_type: 'SIMULATED';
}

export interface StateAqiComparison {
  state: string;
  state_code: string;
  isUnionTerritory: boolean;
  region:
    | 'North'
    | 'South'
    | 'East'
    | 'West'
    | 'Central'
    | 'Northeast'
    | 'Islands';
  stationCount: number;
  averageAqi: number;
  maxAqi: number;
  minAqi: number;
  category: ValidAqiCategory;
  representativeCity: string;
}

export interface CategoryDistributionItem {
  category: ValidAqiCategory;
  count: number;
  percentage: number;
}

export interface IndiaAqiSummary {
  totalStations: number;
  statesCovered: number;
  unionTerritoriesCovered: number;
  averageAqi: number;
  highestStation: SimulatedIndiaStation | null;
  lowestStation: SimulatedIndiaStation | null;
  categoryDistribution: CategoryDistributionItem[];
  stateComparison: StateAqiComparison[];
  generatedAt: string;
  nextUpdateAt: string;
  intervalMs: number;
  data_source: 'AERIS AI Simulation Engine';
  data_type: 'SIMULATED';
  disclaimer: string;
}

export interface IndiaAqiApiResponse {
  stations: SimulatedIndiaStation[];
  summary: IndiaAqiSummary;
  states: { name: string; code: string; isUnionTerritory: boolean }[];
  metadata: {
    data_source: 'AERIS AI Simulation Engine';
    data_type: 'SIMULATED';
    badge: 'SIMULATED DATA · DEMO MODE';
    disclaimer: string;
    generatedAt: string;
    nextUpdateAt: string;
    intervalMs: number;
    totalUnfilteredStations: number;
  };
}

export interface AqiTrendPoint {
  label: string;
  timestampIso: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  isObservedHistory: boolean;
}

export interface OpenAqSensorReading {
  id: string;
  locationName: string;
  city: string;
  lat: number;
  lng: number;
  parameter: string;
  value: number;
  unit: string;
  lastUpdatedIso: string;
  isStale: boolean;
  source: 'AERIS_SIMULATION_ENGINE';
  sourceLabel: string;
  isOfficialNationalAqi: false;
}

export interface SourceHealthEntry {
  sourceId: 'simulation';
  name: string;
  configured: boolean;
  status: 'simulated' | 'error';
  message: string;
  lastCheckedIso: string;
  latencyMs?: number;
  recordsCount?: number;
  cacheHit?: boolean;
  intervalMs?: number;
  error?: string;
}

export interface SourceHealthReport {
  simulation: SourceHealthEntry;
}

export interface CityAqiResponse {
  city: string;
  district?: string;
  state: string;
  stateCode?: string;
  lat: number;
  lng: number;
  primaryAqi: number | null;
  category: AqiCategory;
  categoryMeta: CpcbCategoryMeta;
  predominantPollutant: string | null;
  selectedStationId: string | null;
  selectedStationName: string | null;
  stations: StationReading[];
  openAqSensors: OpenAqSensorReading[];
  trend24h: AqiTrendPoint[];
  lastUpdatedIso: string;
  dataMode: 'demo';
  dataSource: 'AERIS AI Simulation Engine';
  dataType: 'SIMULATED';
  sourceDisclaimer: string;
  hasOfficialData: false;
  hasOpenAqData: false;
  staleStationsCount: number;
  sourceHealth: SourceHealthReport;
}

export type CommuteMode =
  | 'solo_car'
  | 'two_wheeler'
  | 'metro'
  | 'bus'
  | 'carpool'
  | 'ev_cab'
  | 'walk_cycle';

export interface FamilyPreferences {
  city: string;
  householdSize: number;
  hasChildren: boolean;
  hasOlderAdults: boolean;
  pollutionSensitiveHousehold: boolean;
  commuteMode: CommuteMode;
  workStartHour: string;
  workEndHour: string;
  preferredExerciseTime: 'morning' | 'afternoon' | 'evening';
  anonymousHandle: string;
  communityOptIn: boolean;
}

export interface AiRecommendationStructured {
  summary: string;
  currentRisk: string;
  recommendedActions: string[];
  avoidActions: string[];
  indoorAdvice: string[];
  commuteAdvice: string[];
  dailySchedule: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  reasoning: string;
  sourceReferences: string[];
  dataLimitations: string;
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  structured?: AiRecommendationStructured;
  timestampIso: string;
  error?: string;
}

export interface EmissionsInput {
  baselineMode: 'solo_car' | 'two_wheeler';
  alternativeMode:
    | 'metro'
    | 'bus'
    | 'carpool'
    | 'ev_cab'
    | 'walk_cycle'
    | 'shared_e_rickshaw';
  oneWayDistanceKm: number;
  tripsPerWeek: number;
  aqi: number | null;
  pollutionSensitiveHousehold: boolean;
}

export interface EmissionsResult {
  baselineFactorKgPerKm: number | null;
  alternativeFactorKgPerKm: number | null;
  baselineWeeklyKg: number | null;
  alternativeWeeklyKg: number | null;
  estimatedWeeklyCo2eAvoidedKg: number | null;
  estimatedAnnualCo2eAvoidedKg: number | null;
  isQualitativeOnly: boolean;
  qualitativeComparison?: string;
  activeMobilitySafe: boolean;
  activeMobilityAdvisory: string;
  assumptions: string[];
  sources: string[];
  disclaimer: string;
}

export type ActionType =
  | 'metro_commute'
  | 'carpool'
  | 'no_burning'
  | 'hepa_maintenance'
  | 'energy_saving'
  | 'bus_commute';

export interface ImpactLogEntry {
  id: string;
  dateIso: string;
  actionType: ActionType;
  label: string;
  co2AvoidedKg: number;
  isQualitative?: boolean;
  qualitativeNote?: string;
  city: string;
  note?: string;
}

export interface CommunityChallenge {
  id: string;
  title: string;
  description: string;
  cityScope: string;
  targetActions: number;
  isDemo: boolean;
}

export interface CommunityContribution {
  id: string;
  anonymousHandle: string;
  city: string;
  actionType: ActionType;
  co2AvoidedKg: number;
  isQualitative?: boolean;
  isMine?: boolean;
  note?: string;
  challengeId?: string;
  createdAtIso: string;
  isDemo: boolean;
}

export interface ChallengeParticipantRecord {
  challengeId: string;
  city: string;
  isMine: boolean;
  isDemo?: boolean;
}
