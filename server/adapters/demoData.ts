import {
  classifyCpcbAqi,
  INDIAN_CITIES,
  resolveStationSelection,
} from '../../src/lib/aqi.ts';
import type {
  AqiTrendPoint,
  CityAqiResponse,
  CommunityChallenge,
  CommunityContribution,
  PollutantReading,
  SourceHealthReport,
  StationReading,
} from '../../src/lib/types.ts';

interface CityDemoProfile {
  baseAqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  ozone: number;
  nh3: number;
  predominant: string;
  stations: { name: string; offsetAqi: number; dLat: number; dLng: number; stale?: boolean }[];
}

const CITY_PROFILES: Record<string, CityDemoProfile> = {
  Delhi: {
    baseAqi: 342,
    pm25: 174,
    pm10: 298,
    no2: 68,
    so2: 19,
    co: 2.1,
    ozone: 42,
    nh3: 36,
    predominant: 'PM2.5',
    stations: [
      { name: 'Anand Vihar, Delhi - DPCC', offsetAqi: 38, dLat: 0.032, dLng: 0.106 },
      { name: 'R K Puram, Delhi - DPCC', offsetAqi: -12, dLat: -0.05, dLng: -0.03 },
      { name: 'ITO, Delhi - CPCB', offsetAqi: 14, dLat: 0.015, dLng: 0.031 },
      { name: 'Punjabi Bagh, Delhi - DPCC', offsetAqi: -4, dLat: 0.055, dLng: -0.078, stale: true },
    ],
  },
  Gurugram: {
    baseAqi: 294,
    pm25: 138,
    pm10: 256,
    no2: 54,
    so2: 14,
    co: 1.7,
    ozone: 46,
    nh3: 28,
    predominant: 'PM2.5',
    stations: [
      { name: 'Vikas Sadan, Gurugram - HSPCB', offsetAqi: 8, dLat: 0.005, dLng: 0.006 },
      { name: 'Teri Gram, Gurugram - HSPCB', offsetAqi: -28, dLat: -0.032, dLng: 0.088 },
    ],
  },
  Noida: {
    baseAqi: 318,
    pm25: 154,
    pm10: 274,
    no2: 61,
    so2: 16,
    co: 1.9,
    ozone: 40,
    nh3: 31,
    predominant: 'PM2.5',
    stations: [
      { name: 'Sector 62, Noida - IMD', offsetAqi: -10, dLat: 0.091, dLng: -0.028 },
      { name: 'Sector 125, Noida - UPPCB', offsetAqi: 18, dLat: 0.008, dLng: -0.058 },
    ],
  },
  Mumbai: {
    baseAqi: 134,
    pm25: 68,
    pm10: 142,
    no2: 44,
    so2: 15,
    co: 1.1,
    ozone: 52,
    nh3: 18,
    predominant: 'PM10',
    stations: [
      { name: 'Bandra Kurla Complex, Mumbai - MPCB', offsetAqi: 16, dLat: -0.01, dLng: -0.01 },
      { name: 'Colaba, Mumbai - MPCB', offsetAqi: -24, dLat: -0.17, dLng: -0.06 },
      { name: 'Worli, Mumbai - MPCB', offsetAqi: -6, dLat: -0.07, dLng: -0.06 },
    ],
  },
  Bengaluru: {
    baseAqi: 78,
    pm25: 32,
    pm10: 76,
    no2: 28,
    so2: 9,
    co: 0.8,
    ozone: 41,
    nh3: 14,
    predominant: 'PM10',
    stations: [
      { name: 'BTM Layout, Bengaluru - KSPCB', offsetAqi: 6, dLat: -0.055, dLng: 0.016 },
      { name: 'Hebbal, Bengaluru - KSPCB', offsetAqi: -8, dLat: 0.064, dLng: -0.003 },
    ],
  },
  Kolkata: {
    baseAqi: 214,
    pm25: 98,
    pm10: 186,
    no2: 52,
    so2: 14,
    co: 1.4,
    ozone: 39,
    nh3: 24,
    predominant: 'PM2.5',
    stations: [
      { name: 'Ballygunge, Kolkata - WBPCB', offsetAqi: 10, dLat: -0.045, dLng: 0.002 },
      { name: 'Victoria, Kolkata - WBPCB', offsetAqi: -14, dLat: -0.028, dLng: -0.022 },
    ],
  },
  Chennai: {
    baseAqi: 84,
    pm25: 36,
    pm10: 82,
    no2: 26,
    so2: 11,
    co: 0.7,
    ozone: 44,
    nh3: 15,
    predominant: 'PM10',
    stations: [
      { name: 'Manali Village, Chennai - TNPCB', offsetAqi: 24, dLat: 0.084, dLng: -0.011 },
      { name: 'Velachery, Chennai - TNPCB', offsetAqi: -12, dLat: -0.101, dLng: -0.05 },
    ],
  },
  Hyderabad: {
    baseAqi: 118,
    pm25: 54,
    pm10: 116,
    no2: 34,
    so2: 10,
    co: 0.9,
    ozone: 47,
    nh3: 19,
    predominant: 'PM10',
    stations: [
      { name: 'Zoo Park, Hyderabad - TSPCB', offsetAqi: 14, dLat: -0.035, dLng: -0.035 },
      { name: 'HCU, Hyderabad - TSPCB', offsetAqi: -22, dLat: 0.075, dLng: -0.155 },
    ],
  },
  Pune: {
    baseAqi: 122,
    pm25: 58,
    pm10: 124,
    no2: 36,
    so2: 12,
    co: 1.0,
    ozone: 45,
    nh3: 16,
    predominant: 'PM10',
    stations: [
      { name: 'Shivajinagar, Pune - MPCB', offsetAqi: 8, dLat: 0.011, dLng: -0.015 },
      { name: 'Lohegaon, Pune - MPCB', offsetAqi: -14, dLat: 0.068, dLng: 0.064 },
    ],
  },
  Ahmedabad: {
    baseAqi: 168,
    pm25: 76,
    pm10: 164,
    no2: 46,
    so2: 18,
    co: 1.3,
    ozone: 48,
    nh3: 21,
    predominant: 'PM10',
    stations: [
      { name: 'Maninagar, Ahmedabad - GPCB', offsetAqi: 12, dLat: -0.025, dLng: 0.034 },
      { name: 'Chandkheda, Ahmedabad - GPCB', offsetAqi: -16, dLat: 0.088, dLng: 0.014 },
    ],
  },
  Lucknow: {
    baseAqi: 268,
    pm25: 118,
    pm10: 224,
    no2: 52,
    so2: 14,
    co: 1.6,
    ozone: 38,
    nh3: 26,
    predominant: 'PM2.5',
    stations: [
      { name: 'Lalbagh, Lucknow - UPPCB', offsetAqi: 18, dLat: 0.002, dLng: -0.006 },
      { name: 'Gomti Nagar, Lucknow - UPPCB', offsetAqi: -18, dLat: 0.006, dLng: 0.056 },
    ],
  },
  Patna: {
    baseAqi: 286,
    pm25: 128,
    pm10: 238,
    no2: 48,
    so2: 13,
    co: 1.7,
    ozone: 35,
    nh3: 29,
    predominant: 'PM2.5',
    stations: [
      { name: 'Muradpur, Patna - BSPCB', offsetAqi: 14, dLat: 0.024, dLng: 0.022 },
      { name: 'Danapur, Patna - BSPCB', offsetAqi: -16, dLat: 0.031, dLng: -0.095 },
    ],
  },
  Jaipur: {
    baseAqi: 176,
    pm25: 74,
    pm10: 178,
    no2: 41,
    so2: 12,
    co: 1.2,
    ozone: 44,
    nh3: 20,
    predominant: 'PM10',
    stations: [
      { name: 'Adarsh Nagar, Jaipur - RSPCB', offsetAqi: 10, dLat: -0.014, dLng: 0.031 },
      { name: 'Shastri Nagar, Jaipur - RSPCB', offsetAqi: -12, dLat: 0.036, dLng: -0.008 },
    ],
  },
  Chandigarh: {
    baseAqi: 146,
    pm25: 71,
    pm10: 148,
    no2: 33,
    so2: 9,
    co: 1.1,
    ozone: 39,
    nh3: 18,
    predominant: 'PM2.5',
    stations: [
      { name: 'Sector 22, Chandigarh - CPCC', offsetAqi: 8, dLat: -0.003, dLng: -0.006 },
      { name: 'Sector 53, Chandigarh - CPCC', offsetAqi: -14, dLat: -0.021, dLng: -0.044 },
    ],
  },
};

function makePollutants(p: CityDemoProfile, scale: number): PollutantReading[] {
  return [
    {
      id: 'PM2.5',
      label: 'PM2.5',
      value: Math.round(p.pm25 * scale),
      min: Math.round(p.pm25 * scale * 0.72),
      max: Math.round(p.pm25 * scale * 1.28),
      unit: 'µg/m³',
      rawUnit: 'µg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
    {
      id: 'PM10',
      label: 'PM10',
      value: Math.round(p.pm10 * scale),
      min: Math.round(p.pm10 * scale * 0.75),
      max: Math.round(p.pm10 * scale * 1.25),
      unit: 'µg/m³',
      rawUnit: 'µg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
    {
      id: 'NO2',
      label: 'NO2',
      value: Math.round(p.no2 * scale),
      min: Math.round(p.no2 * scale * 0.7),
      max: Math.round(p.no2 * scale * 1.3),
      unit: 'µg/m³',
      rawUnit: 'µg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
    {
      id: 'SO2',
      label: 'SO2',
      value: Math.round(p.so2 * scale),
      min: Math.round(p.so2 * scale * 0.68),
      max: Math.round(p.so2 * scale * 1.3),
      unit: 'µg/m³',
      rawUnit: 'µg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
    {
      id: 'CO',
      label: 'CO',
      value: Number((p.co * scale).toFixed(1)),
      min: Number((p.co * scale * 0.65).toFixed(1)),
      max: Number((p.co * scale * 1.35).toFixed(1)),
      unit: 'mg/m³',
      rawUnit: 'mg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
    {
      id: 'OZONE',
      label: 'Ozone',
      value: Math.round(p.ozone * (2 - scale * 0.9)),
      min: Math.round(p.ozone * 0.6),
      max: Math.round(p.ozone * 1.35),
      unit: 'µg/m³',
      rawUnit: 'µg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
    {
      id: 'NH3',
      label: 'NH3',
      value: Math.round(p.nh3 * scale),
      min: Math.round(p.nh3 * scale * 0.7),
      max: Math.round(p.nh3 * scale * 1.25),
      unit: 'µg/m³',
      rawUnit: 'µg/m³',
      unitCompatibleWithCpcb: true,
      source: 'DEMO_REFERENCE',
    },
  ];
}

export function buildDemoCityResponse(
  cityName: string,
  stationFilter?: string,
  sourceHealth?: SourceHealthReport
): CityAqiResponse {
  const cityMeta =
    INDIAN_CITIES.find((c) => c.name.toLowerCase() === cityName.toLowerCase()) ??
    INDIAN_CITIES[0];
  const profile = CITY_PROFILES[cityMeta.name] ?? CITY_PROFILES.Delhi;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const freshIso = new Date(nowMs - 18 * 60 * 1000).toISOString();
  const staleIso = new Date(nowMs - 245 * 60 * 1000).toISOString();

  const stations: StationReading[] = profile.stations.map((st, idx) => {
    const aqi = Math.max(15, Math.min(490, profile.baseAqi + st.offsetAqi));
    const scale = aqi / profile.baseAqi;
    const meta = classifyCpcbAqi(aqi);
    const ts = st.stale ? staleIso : freshIso;
    return {
      id: `demo-${cityMeta.name.toLowerCase()}-${idx + 1}`,
      station: st.name,
      city: cityMeta.name,
      state: cityMeta.state,
      lat: Number((cityMeta.lat + st.dLat).toFixed(4)),
      lng: Number((cityMeta.lng + st.dLng).toFixed(4)),
      officialAqi: aqi,
      category: meta.category,
      predominantPollutant: profile.predominant,
      pollutants: makePollutants(profile, scale),
      lastUpdatedIso: ts,
      source: 'DEMO_REFERENCE',
      sourceLabel: 'Demo Reference Data (Sample Winter Profile — Not Live)',
      isOfficialNationalAqi: true,
      isDemo: true,
      isStale: Boolean(st.stale),
      staleNote: st.stale
        ? 'Demo sample flagged as stale (>3h old) to illustrate freshness checks'
        : 'Demo sample within 3-hour window',
    };
  });

  const selection = resolveStationSelection(stations, stationFilter);

  // Historical reference window (past 24 hours, never future forecasts)
  const diurnalFactors = [
    1.12, 1.15, 1.18, 1.14, 1.05, 0.92, 0.81, 0.78, 0.84, 0.95, 1.04, 1.0,
  ];
  const baseForTrend = selection.primaryAqi ?? profile.baseAqi;
  const trendScale = baseForTrend / profile.baseAqi;
  const trend24h: AqiTrendPoint[] = diurnalFactors.map((factor, i) => {
    const hoursAgo = (diurnalFactors.length - 1 - i) * 2;
    const tDate = new Date(nowMs - hoursAgo * 3600000);
    const label = tDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return {
      label,
      timestampIso: tDate.toISOString(),
      aqi: Math.round(baseForTrend * factor),
      pm25: Math.round(profile.pm25 * trendScale * factor),
      pm10: Math.round(profile.pm10 * trendScale * factor),
      isObservedHistory: true,
    };
  });

  const fallbackHealth: SourceHealthReport = sourceHealth ?? {
    cpcb: {
      sourceId: 'cpcb',
      name: 'CPCB Official Feed (data.gov.in)',
      configured: false,
      status: 'demo',
      message:
        'DATA_GOV_IN_API_KEY and DATA_GOV_IN_RESOURCE_ID are not configured on the server.',
      lastCheckedIso: nowIso,
      endpointHint: 'https://api.data.gov.in/resource/{DATA_GOV_IN_RESOURCE_ID}',
    },
    openAq: {
      sourceId: 'openaq',
      name: 'OpenAQ v3 Sensor Network',
      configured: false,
      status: 'unconfigured',
      message: 'OPENAQ_API_KEY is not configured (optional secondary feed).',
      lastCheckedIso: nowIso,
      endpointHint: 'https://api.openaq.org/v3/locations',
    },
  };

  return {
    city: cityMeta.name,
    state: cityMeta.state,
    lat: selection.selectedStation?.lat ?? cityMeta.lat,
    lng: selection.selectedStation?.lng ?? cityMeta.lng,
    primaryAqi: selection.selectedStation ? selection.primaryAqi : profile.baseAqi,
    category: selection.selectedStation
      ? selection.categoryMeta.category
      : classifyCpcbAqi(profile.baseAqi).category,
    categoryMeta: selection.selectedStation
      ? selection.categoryMeta
      : classifyCpcbAqi(profile.baseAqi),
    predominantPollutant: selection.predominantPollutant ?? profile.predominant,
    selectedStationId: selection.selectedStation?.id ?? null,
    selectedStationName: selection.selectedStation?.station ?? null,
    stations,
    openAqSensors: [],
    trend24h,
    lastUpdatedIso: selection.selectedStation
      ? selection.lastUpdatedIso
      : freshIso,
    dataMode: 'demo',
    sourceDisclaimer:
      'Demo Reference Mode (Not Live CPCB Data). Configure DATA_GOV_IN_API_KEY and DATA_GOV_IN_RESOURCE_ID on the server to stream official CPCB station data.',
    hasOfficialData: false,
    hasOpenAqData: false,
    staleStationsCount: stations.filter((s) => s.isStale).length,
    sourceHealth: fallbackHealth,
  };
}

export function buildDemoAllCitiesStations(): StationReading[] {
  return INDIAN_CITIES.flatMap((c) => buildDemoCityResponse(c.name).stations);
}

export const DEMO_CHALLENGES: CommunityChallenge[] = [
  {
    id: 'ncr-metro-week',
    title: '7-Day Metro & Bus Swap',
    description:
      'Replace at least 5 solo car or two-wheeler commutes this week with Metro rail or city bus.',
    cityScope: 'Delhi NCR',
    targetActions: 250,
    isDemo: true,
  },
  {
    id: 'smoke-free-indoors',
    title: 'Smoke-Free Winter Indoors',
    description:
      'Keep indoor living rooms free from incense sticks, candles, and mosquito coils during high-smog evenings.',
    cityScope: 'All Indian Cities',
    targetActions: 400,
    isDemo: true,
  },
  {
    id: 'zero-leaf-burning',
    title: 'Neighbourhood Zero-Burning Watch',
    description:
      'Compost dry winter leaves locally and encourage RWA staff to avoid open biomass burning.',
    cityScope: 'Northern Plains',
    targetActions: 150,
    isDemo: true,
  },
];

export const DEMO_CONTRIBUTIONS: CommunityContribution[] = [
  {
    id: 'demo-c1',
    anonymousHandle: 'RohiniCommuter_14',
    city: 'Delhi',
    actionType: 'metro_commute',
    co2AvoidedKg: 3.1,
    note: 'Switched morning Sector 18 to Connaught Place drive to Yellow/Red Line Metro.',
    challengeId: 'ncr-metro-week',
    createdAtIso: new Date(Date.now() - 42 * 60000).toISOString(),
    isDemo: true,
  },
  {
    id: 'demo-c2',
    anonymousHandle: 'BandraHousehold_08',
    city: 'Mumbai',
    actionType: 'energy_saving',
    co2AvoidedKg: 1.9,
    note: 'Shifted geyser and washing machine loads outside evening peak demand.',
    challengeId: 'smoke-free-indoors',
    createdAtIso: new Date(Date.now() - 115 * 60000).toISOString(),
    isDemo: true,
  },
  {
    id: 'demo-c3',
    anonymousHandle: 'IndiranagarCyclist',
    city: 'Bengaluru',
    actionType: 'carpool',
    co2AvoidedKg: 2.4,
    note: 'Shared Bellandur office commute with 2 colleagues.',
    challengeId: 'ncr-metro-week',
    createdAtIso: new Date(Date.now() - 210 * 60000).toISOString(),
    isDemo: true,
  },
];
