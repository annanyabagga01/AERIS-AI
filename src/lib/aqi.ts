import {
  INDIA_SIMULATED_CITIES,
  resolveSimulatedCityName,
} from './indiaSimulation.ts';
import type {
  AqiCategory,
  CpcbCategoryMeta,
  PollutantReading,
  StationReading,
} from './types.ts';

export interface SupportedCity {
  name: string;
  state: string;
  stateCode?: string;
  lat: number;
  lng: number;
}

export const INDIAN_CITIES: SupportedCity[] = INDIA_SIMULATED_CITIES.map((c) => ({
  name: c.name,
  state: c.state,
  stateCode: c.stateCode,
  lat: c.lat,
  lng: c.lng,
}));

export const CPCB_CATEGORY_META: Record<AqiCategory, CpcbCategoryMeta> = {
  Good: {
    category: 'Good',
    rangeLabel: '0 – 50',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
    surfaceClass: 'bg-emerald-500/10',
    accentHex: '#10B981',
    advisorySummary: 'Minimal impact on air breathing comfort.',
  },
  Satisfactory: {
    category: 'Satisfactory',
    rangeLabel: '51 – 100',
    textClass: 'text-teal-300',
    borderClass: 'border-teal-500/40',
    surfaceClass: 'bg-teal-500/10',
    accentHex: '#14B8A6',
    advisorySummary:
      'Minor breathing discomfort possible for unusually sensitive people.',
  },
  Moderate: {
    category: 'Moderate',
    rangeLabel: '101 – 200',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/40',
    surfaceClass: 'bg-amber-500/10',
    accentHex: '#F59E0B',
    advisorySummary:
      'Discomfort possible for people with lung, heart sensitivity, children, and older adults.',
  },
  Poor: {
    category: 'Poor',
    rangeLabel: '201 – 300',
    textClass: 'text-orange-300',
    borderClass: 'border-orange-500/40',
    surfaceClass: 'bg-orange-500/10',
    accentHex: '#F97316',
    advisorySummary:
      'Breathing discomfort likely on prolonged exposure; limit strenuous outdoor exertion.',
  },
  'Very Poor': {
    category: 'Very Poor',
    rangeLabel: '301 – 400',
    textClass: 'text-rose-300',
    borderClass: 'border-rose-500/40',
    surfaceClass: 'bg-rose-500/10',
    accentHex: '#F43F5E',
    advisorySummary:
      'High particulate burden; keep strenuous activity indoors and use fitted N95 masks outdoors.',
  },
  Severe: {
    category: 'Severe',
    rangeLabel: '401 – 500',
    textClass: 'text-red-300',
    borderClass: 'border-red-500/45',
    surfaceClass: 'bg-red-500/15',
    accentHex: '#EF4444',
    advisorySummary:
      'Severe ambient smog; avoid outdoor exertion and prioritize indoor air filtration.',
  },
  Unavailable: {
    category: 'Unavailable',
    rangeLabel: 'N/A',
    textClass: 'text-slate-300',
    borderClass: 'border-slate-700',
    surfaceClass: 'bg-slate-800/50',
    accentHex: '#64748B',
    advisorySummary:
      'CPCB National AQI category cannot be determined because required pollutant readings are incomplete or missing.',
  },
};

export function classifyCpcbAqi(
  aqi: number | null | undefined
): CpcbCategoryMeta {
  if (
    aqi === null ||
    aqi === undefined ||
    Number.isNaN(aqi) ||
    !Number.isFinite(aqi) ||
    aqi < 0
  ) {
    return CPCB_CATEGORY_META.Unavailable;
  }
  const rounded = Math.round(aqi);
  if (rounded <= 50) return CPCB_CATEGORY_META.Good;
  if (rounded <= 100) return CPCB_CATEGORY_META.Satisfactory;
  if (rounded <= 200) return CPCB_CATEGORY_META.Moderate;
  if (rounded <= 300) return CPCB_CATEGORY_META.Poor;
  if (rounded <= 400) return CPCB_CATEGORY_META['Very Poor'];
  return CPCB_CATEGORY_META.Severe;
}

/**
 * CPCB National AQI requires at least 3 pollutants with valid concentrations
 * in CPCB-compatible units, and at least one of those MUST be PM2.5 or PM10.
 */
export function hasSufficientPollutantsForOfficialAqi(
  pollutants: PollutantReading[]
): boolean {
  const valid = pollutants.filter(
    (p) =>
      p.value !== null &&
      Number.isFinite(p.value) &&
      p.value >= 0 &&
      p.unitCompatibleWithCpcb !== false
  );
  if (valid.length < 3) return false;
  return valid.some((p) => p.id === 'PM2.5' || p.id === 'PM10');
}

export function getCityQueryAliases(cityName: string): string[] {
  const trimmed = cityName.trim();
  if (!trimmed) return ['Delhi'];
  const lower = trimmed.toLowerCase();
  const aliasMap: Record<string, string[]> = {
    gurugram: ['Gurugram', 'Gurgaon'],
    gurgaon: ['Gurgaon', 'Gurugram'],
    bengaluru: ['Bengaluru', 'Bangalore'],
    bangalore: ['Bangalore', 'Bengaluru'],
    kolkata: ['Kolkata', 'Calcutta'],
    calcutta: ['Kolkata', 'Calcutta'],
    delhi: ['Delhi', 'New Delhi'],
    'new delhi': ['Delhi', 'New Delhi'],
    thiruvananthapuram: ['Thiruvananthapuram', 'Trivandrum'],
    trivandrum: ['Thiruvananthapuram', 'Trivandrum'],
    kochi: ['Kochi', 'Cochin'],
    visakhapatnam: ['Visakhapatnam', 'Vizag'],
    mysuru: ['Mysuru', 'Mysore'],
    puducherry: ['Puducherry', 'Pondicherry'],
  };
  return aliasMap[lower] ?? [trimmed];
}

export function resolveSupportedCity(cityQuery: string): SupportedCity | null {
  const canonical = resolveSimulatedCityName(cityQuery);
  if (!canonical) return null;
  return (
    INDIAN_CITIES.find(
      (c) => c.name.toLowerCase() === canonical.toLowerCase()
    ) ?? null
  );
}

export function normalizePollutantUnit(
  rawUnit: string | undefined | null,
  pollutantId: PollutantReading['id']
): { unit: string; rawUnit: string; compatibleWithCpcb: boolean } {
  const canonicalUnit = pollutantId === 'CO' ? 'mg/m³' : 'µg/m³';
  if (!rawUnit || !rawUnit.trim()) {
    return {
      unit: canonicalUnit,
      rawUnit: canonicalUnit,
      compatibleWithCpcb: true,
    };
  }

  const trimmed = rawUnit.trim();
  const compact = trimmed.toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'µ');

  const isUgM3 =
    compact === 'µg/m³' ||
    compact === 'ug/m3' ||
    compact === 'ug/m³' ||
    compact === 'µg/m3' ||
    compact === 'mcg/m3';
  const isMgM3 = compact === 'mg/m³' || compact === 'mg/m3';

  if (pollutantId === 'CO') {
    if (isMgM3) {
      return { unit: 'mg/m³', rawUnit: trimmed, compatibleWithCpcb: true };
    }
    return { unit: trimmed, rawUnit: trimmed, compatibleWithCpcb: false };
  }

  if (isUgM3) {
    return { unit: 'µg/m³', rawUnit: trimmed, compatibleWithCpcb: true };
  }

  return { unit: trimmed, rawUnit: trimmed, compatibleWithCpcb: false };
}

export function resolveStationSelection(
  stations: StationReading[],
  stationQuery?: string | null
): {
  selectedStation: StationReading | null;
  primaryAqi: number | null;
  categoryMeta: CpcbCategoryMeta;
  predominantPollutant: string | null;
  lastUpdatedIso: string;
} {
  const trimmed = (stationQuery ?? '').trim();
  const wantsSpecific = trimmed.length > 0 && trimmed.toLowerCase() !== 'all';

  let selectedStation: StationReading | null = null;
  if (wantsSpecific) {
    const qLower = trimmed.toLowerCase();
    selectedStation =
      stations.find((s) => s.id.toLowerCase() === qLower) ??
      stations.find((s) => s.station.toLowerCase() === qLower) ??
      stations.find((s) => s.station.toLowerCase().includes(qLower)) ??
      null;
  }

  if (selectedStation) {
    const meta = classifyCpcbAqi(selectedStation.officialAqi);
    return {
      selectedStation,
      primaryAqi: selectedStation.officialAqi,
      categoryMeta: meta,
      predominantPollutant: selectedStation.predominantPollutant,
      lastUpdatedIso: selectedStation.lastUpdatedIso || new Date().toISOString(),
    };
  }

  const validAqis = stations
    .map((s) => s.officialAqi)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const primaryAqi =
    validAqis.length > 0
      ? Math.round(validAqis.reduce((a, b) => a + b, 0) / validAqis.length)
      : null;
  const categoryMeta = classifyCpcbAqi(primaryAqi);
  const predominantPollutant =
    stations.find((s) => s.predominantPollutant)?.predominantPollutant ?? null;
  const lastUpdatedIso =
    stations
      .map((s) => s.lastUpdatedIso)
      .filter(Boolean)
      .sort()
      .reverse()[0] || new Date().toISOString();

  return {
    selectedStation: null,
    primaryAqi,
    categoryMeta,
    predominantPollutant,
    lastUpdatedIso,
  };
}

/**
 * Determines whether a station reading timestamp is stale (> 3 hours old by default).
 */
export function isTimestampStale(
  isoTimestamp: string,
  nowMs: number = Date.now(),
  maxAgeMinutes: number = 180
): boolean {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return true;
  const ageMinutes = (nowMs - parsed) / 60000;
  return ageMinutes > maxAgeMinutes;
}

export function formatFreshnessLabel(
  isoTimestamp: string,
  nowMs: number = Date.now()
): string {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return 'Timestamp unavailable';
  const diffMinutes = Math.max(0, Math.round((nowMs - parsed) / 60000));
  if (diffMinutes < 2) return 'Just updated';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ${diffMinutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function findNearestSupportedCity(
  lat: number,
  lng: number
): SupportedCity {
  let closest = INDIAN_CITIES[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const city of INDIAN_CITIES) {
    const dLat = toRad(city.lat - lat);
    const dLng = toRad(city.lng - lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat)) *
        Math.cos(toRad(city.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = 6371 * c;
    if (distKm < bestDist) {
      bestDist = distKm;
      closest = city;
    }
  }
  return closest;
}
