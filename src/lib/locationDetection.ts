import { INDIAN_CITIES } from './aqi.ts';
import { INDIA_STATES_AND_UTS, type IndiaRegion } from './indiaSimulation.ts';

export type LocationUiState =
  | 'idle'
  | 'detecting'
  | 'gps_matched'
  | 'gps_denied'
  | 'gps_blocked'
  | 'ip_approximate'
  | 'manual_selection';

export type LocationDetectionMethod =
  | 'browser_gps_temporary'
  | 'ip_approximate'
  | 'manual_selection';

export type GpsFailureCategory =
  | 'blocked_by_policy'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'outside_india';

export interface SearchableIndiaCity {
  name: string;
  state: string;
  stateCode: string;
  isUnionTerritory: boolean;
  region: IndiaRegion;
}

const STATE_META_BY_NAME = new Map(
  INDIA_STATES_AND_UTS.map((s) => [s.name.toLowerCase(), s])
);

export const ALL_INDIA_SEARCHABLE_CITIES: SearchableIndiaCity[] =
  INDIAN_CITIES.map((city) => {
    const meta = STATE_META_BY_NAME.get(city.state.toLowerCase());
    return {
      name: city.name,
      state: city.state,
      stateCode: meta?.code ?? '',
      isUnionTerritory: meta?.isUnionTerritory ?? false,
      region: meta?.region ?? 'North',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

export function getCityCatalogEntry(cityName: string): SearchableIndiaCity | null {
  const norm = cityName.trim().toLowerCase();
  return (
    ALL_INDIA_SEARCHABLE_CITIES.find((c) => c.name.toLowerCase() === norm) ?? null
  );
}

/**
 * Filters Indian cities across all 28 States and 8 Union Territories by
 * free-text search (city, state, state code, or region) and optional State/UT filter.
 */
export function filterIndianCities(params: {
  query?: string;
  stateFilter?: string;
}): SearchableIndiaCity[] {
  const q = (params.query ?? '').trim().toLowerCase();
  const stateFilter = (params.stateFilter ?? 'ALL').trim().toLowerCase();

  return ALL_INDIA_SEARCHABLE_CITIES.filter((city) => {
    if (
      stateFilter &&
      stateFilter !== 'all' &&
      city.state.toLowerCase() !== stateFilter &&
      city.stateCode.toLowerCase() !== stateFilter
    ) {
      return false;
    }
    if (!q) return true;
    return (
      city.name.toLowerCase().includes(q) ||
      city.state.toLowerCase().includes(q) ||
      city.stateCode.toLowerCase().includes(q) ||
      city.region.toLowerCase().includes(q)
    );
  });
}

/**
 * Classifies a GeolocationPositionError (or thrown DOMException) into a clean
 * failure category so blocked iframes and user denials never repeatedly prompt.
 */
export function classifyGeolocationError(err: {
  code?: number;
  message?: string;
}): GpsFailureCategory {
  const msg = (err.message ?? '').toLowerCase();
  if (
    msg.includes('permissions policy') ||
    msg.includes('feature policy') ||
    msg.includes('disabled in this document') ||
    msg.includes('only secure origins')
  ) {
    return 'blocked_by_policy';
  }
  if (err.code === 1 || msg.includes('denied') || msg.includes('permission')) {
    return 'permission_denied';
  }
  if (err.code === 3 || msg.includes('timeout')) {
    return 'timeout';
  }
  return 'unavailable';
}

export function isCoordinateWithinIndia(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 6.0 &&
    lat <= 37.6 &&
    lng >= 68.0 &&
    lng <= 97.6
  );
}

export function getLocationMethodLabel(method: LocationDetectionMethod): string {
  switch (method) {
    case 'browser_gps_temporary':
      return 'Browser Geolocation (Temporary · No GPS Stored)';
    case 'ip_approximate':
      return 'Approximate IP City (Server Fallback · Not Exact GPS)';
    case 'manual_selection':
      return 'Manual City Selection';
  }
}

export function getLocationStateBadge(state: LocationUiState): {
  label: string;
  tone: 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
} {
  switch (state) {
    case 'detecting':
      return { label: 'Detecting location', tone: 'cyan' };
    case 'gps_matched':
      return { label: 'Nearest city matched (No GPS stored)', tone: 'emerald' };
    case 'ip_approximate':
      return { label: 'Approximate city detected', tone: 'cyan' };
    case 'gps_denied':
      return { label: 'GPS permission denied', tone: 'amber' };
    case 'gps_blocked':
      return { label: 'GPS blocked by browser', tone: 'amber' };
    case 'manual_selection':
      return { label: 'Manual city selection', tone: 'slate' };
    default:
      return { label: 'Manual city selection', tone: 'slate' };
  }
}
