import { getCityQueryAliases } from './aqi.ts';
import type { AqiCategory, StationReading } from './types.ts';

export interface MapMarkerVisualSpec {
  category: AqiCategory;
  fillHex: string;
  ringHex: string;
  textHex: string;
  rangeLabel: string;
}

/**
 * Exact CPCB National AQI category color mapping for geospatial map markers:
 * Good (0-50): green
 * Satisfactory (51-100): light green
 * Moderate (101-200): yellow
 * Poor (201-300): orange
 * Very Poor (301-400): red
 * Severe (401-500): dark red
 */
export const MAP_CPCB_MARKER_SPECS: Record<AqiCategory, MapMarkerVisualSpec> = {
  Good: {
    category: 'Good',
    fillHex: '#22C55E',
    ringHex: '#86EFAC',
    textHex: '#052E16',
    rangeLabel: '0–50',
  },
  Satisfactory: {
    category: 'Satisfactory',
    fillHex: '#84CC16',
    ringHex: '#D9F99D',
    textHex: '#1A2E05',
    rangeLabel: '51–100',
  },
  Moderate: {
    category: 'Moderate',
    fillHex: '#EAB308',
    ringHex: '#FEF08A',
    textHex: '#422006',
    rangeLabel: '101–200',
  },
  Poor: {
    category: 'Poor',
    fillHex: '#F97316',
    ringHex: '#FDBA74',
    textHex: '#431407',
    rangeLabel: '201–300',
  },
  'Very Poor': {
    category: 'Very Poor',
    fillHex: '#EF4444',
    ringHex: '#FCA5A5',
    textHex: '#FFFFFF',
    rangeLabel: '301–400',
  },
  Severe: {
    category: 'Severe',
    fillHex: '#991B1B',
    ringHex: '#FCA5A5',
    textHex: '#FEF2F2',
    rangeLabel: '401–500',
  },
  Unavailable: {
    category: 'Unavailable',
    fillHex: '#475569',
    ringHex: '#94A3B8',
    textHex: '#F8FAFC',
    rangeLabel: 'N/A',
  },
};

export const MAP_CATEGORY_SEVERITY_RANK: Record<AqiCategory, number> = {
  Unavailable: 0,
  Good: 1,
  Satisfactory: 2,
  Moderate: 3,
  Poor: 4,
  'Very Poor': 5,
  Severe: 6,
};

export const INDIA_DEFAULT_CENTER: [number, number] = [22.5937, 78.9629];
export const INDIA_DEFAULT_ZOOM = 5;
export const INDIA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [4.0, 63.0],
  [39.0, 101.0],
];

export function hasValidIndianCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 6.0 &&
    lat <= 38.0 &&
    lng >= 67.0 &&
    lng <= 98.5
  );
}

/**
 * Only apply a subtle pulse on selected stations or active fresh simulated intervals.
 */
export function isRecentlyUpdatedStation(
  station: StationReading,
  nowMs: number = Date.now()
): boolean {
  if (station.isStale) return false;
  const parsed = Date.parse(station.lastUpdatedIso);
  if (Number.isNaN(parsed)) return false;
  const ageMs = nowMs - parsed;
  return ageMs >= -5 * 60 * 1000 && ageMs <= 60 * 60 * 1000;
}

export function filterMapStations(
  stations: StationReading[],
  options: {
    query?: string;
    category?: 'All' | AqiCategory;
    state?: string | null;
    cityOnly?: string | null;
  }
): StationReading[] {
  const q = (options.query ?? '').trim().toLowerCase();
  const category = options.category ?? 'All';
  const stateFilter = (options.state ?? '').trim().toLowerCase();
  const cityAliases = options.cityOnly
    ? getCityQueryAliases(options.cityOnly).map((a) => a.toLowerCase())
    : null;

  return stations.filter((station) => {
    if (!hasValidIndianCoordinates(station.lat, station.lng)) {
      return false;
    }
    if (category !== 'All' && station.category !== category) {
      return false;
    }
    if (stateFilter && stateFilter !== 'all') {
      const stateMatch =
        station.state.toLowerCase() === stateFilter ||
        (station.stateCode?.toLowerCase() ?? '') === stateFilter;
      if (!stateMatch) return false;
    }
    if (cityAliases) {
      const cityL = station.city.toLowerCase();
      const stationL = station.station.toLowerCase();
      const stateL = station.state.toLowerCase();
      const matchesCity = cityAliases.some(
        (alias) =>
          cityL.includes(alias) ||
          stationL.includes(alias) ||
          stateL === alias
      );
      if (!matchesCity) return false;
    }
    if (!q) return true;
    return (
      station.station.toLowerCase().includes(q) ||
      station.city.toLowerCase().includes(q) ||
      (station.district?.toLowerCase() ?? '').includes(q) ||
      station.state.toLowerCase().includes(q) ||
      (station.stateCode?.toLowerCase() ?? '').includes(q)
    );
  });
}

export function computeStationsBounds(
  stations: StationReading[]
): [[number, number], [number, number]] | null {
  const valid = stations.filter((s) => hasValidIndianCoordinates(s.lat, s.lng));
  if (valid.length === 0) return null;

  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLng = valid[0].lng;
  let maxLng = valid[0].lng;

  for (const st of valid) {
    if (st.lat < minLat) minLat = st.lat;
    if (st.lat > maxLat) maxLat = st.lat;
    if (st.lng < minLng) minLng = st.lng;
    if (st.lng > maxLng) maxLng = st.lng;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function getWorstCategory(categories: AqiCategory[]): AqiCategory {
  let worst: AqiCategory = 'Unavailable';
  let worstRank = 0;
  for (const cat of categories) {
    const rank = MAP_CATEGORY_SEVERITY_RANK[cat] ?? 0;
    if (rank > worstRank) {
      worstRank = rank;
      worst = cat;
    }
  }
  return worst;
}
