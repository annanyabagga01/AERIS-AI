import type { Request } from 'express';
import { findNearestSupportedCity, INDIAN_CITIES } from '../src/lib/aqi.ts';
import { INDIA_STATES_AND_UTS } from '../src/lib/indiaSimulation.ts';

export interface ApproximateLocationResult {
  detected: boolean;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  region: string | null;
  detectionMethod: 'ip_approximate' | 'unavailable';
  isApproximate: true;
  coordinatesStored: false;
  provider: string | null;
  reason?: 'private_ip' | 'outside_india' | 'lookup_unavailable';
  message: string;
}

export interface RawIpGeoPayload {
  provider: string;
  countryCode?: string | null;
  countryName?: string | null;
  city?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const INDIA_LAT_MIN = 6.0;
const INDIA_LAT_MAX = 37.6;
const INDIA_LNG_MIN = 68.0;
const INDIA_LNG_MAX = 97.6;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
  const clean = ip.trim().replace(/^::ffff:/i, '');
  if (!clean) return true;
  if (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === '0.0.0.0' ||
    clean === 'localhost'
  ) {
    return true;
  }
  if (clean.startsWith('10.') || clean.startsWith('192.168.') || clean.startsWith('169.254.')) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(clean)) {
    return true;
  }
  if (/^(fc|fd|fe80):/i.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Extracts the originating client IP transiently from proxy headers for
 * one-time approximate city lookup. Never logged or stored.
 */
export function extractClientIp(req: Pick<Request, 'headers' | 'socket'>): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const candidates = forwarded
      .split(',')
      .map((part) => part.trim().replace(/^::ffff:/i, ''))
      .filter(Boolean);
    const firstPublic = candidates.find((ip) => !isPrivateOrLoopbackIp(ip));
    if (firstPublic) return firstPublic;
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    const clean = realIp.trim().replace(/^::ffff:/i, '');
    if (!isPrivateOrLoopbackIp(clean)) return clean;
  }
  const remote = req.socket?.remoteAddress?.replace(/^::ffff:/i, '') ?? '';
  if (remote && !isPrivateOrLoopbackIp(remote)) {
    return remote;
  }
  return null;
}

function isWithinIndiaBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= INDIA_LAT_MIN &&
    lat <= INDIA_LAT_MAX &&
    lng >= INDIA_LNG_MIN &&
    lng <= INDIA_LNG_MAX
  );
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  bombay: 'Mumbai',
  calcutta: 'Kolkata',
  madras: 'Chennai',
  gurgaon: 'Gurugram',
  trivandrum: 'Thiruvananthapuram',
  cochin: 'Kochi',
  poona: 'Pune',
  baroda: 'Vadodara',
  benares: 'Varanasi',
  pondicherry: 'Puducherry',
  'new delhi': 'Delhi',
  panjim: 'Panaji',
  mysore: 'Mysuru',
  mangalore: 'Mangaluru',
  vizag: 'Visakhapatnam',
};

const STATE_ALIASES: Record<string, string> = {
  'national capital territory of delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  'jammu & kashmir': 'Jammu and Kashmir',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

function findStateMeta(stateName: string) {
  const norm = normalizeText(stateName);
  const canonical = STATE_ALIASES[norm] ?? stateName;
  const canonicalNorm = normalizeText(canonical);
  return (
    INDIA_STATES_AND_UTS.find(
      (s) =>
        normalizeText(s.name) === canonicalNorm ||
        s.code.toLowerCase() === canonicalNorm
    ) ?? null
  );
}

/**
 * Pure matcher that converts an IP geolocation payload into an approximate
 * Indian city from AERIS AI's India-wide catalog without storing or exposing
 * coordinates.
 */
export function resolveIndianCityFromIpPayload(
  payload: RawIpGeoPayload
): ApproximateLocationResult {
  const cc = (payload.countryCode ?? '').trim().toUpperCase();
  const countryNorm = normalizeText(payload.countryName);
  const isIndia = cc === 'IN' || countryNorm === 'india';

  if (!isIndia) {
    return {
      detected: false,
      city: null,
      state: null,
      stateCode: null,
      region: null,
      detectionMethod: 'unavailable',
      isApproximate: true,
      coordinatesStored: false,
      provider: payload.provider,
      reason: 'outside_india',
      message:
        'Approximate network location appears to be outside India (or via VPN/cloud proxy). Please select an Indian city manually.',
    };
  }

  // 1. Direct city name match (including common Indian city aliases)
  const rawCityNorm = normalizeText(payload.city);
  const aliasedCity = CITY_ALIASES[rawCityNorm] ?? payload.city ?? '';
  const aliasedCityNorm = normalizeText(aliasedCity);
  if (aliasedCityNorm) {
    const directCity = INDIAN_CITIES.find(
      (c) => normalizeText(c.name) === aliasedCityNorm
    );
    if (directCity) {
      const stateMeta = findStateMeta(directCity.state);
      return {
        detected: true,
        city: directCity.name,
        state: directCity.state,
        stateCode: stateMeta?.code ?? null,
        region: stateMeta?.region ?? null,
        detectionMethod: 'ip_approximate',
        isApproximate: true,
        coordinatesStored: false,
        provider: payload.provider,
        message: `Approximate city detected via network IP: ${directCity.name}, ${directCity.state}. This is an approximate IP match, not exact GPS.`,
      };
    }
  }

  // 2. Temporary coordinate-to-nearest-Indian-city lookup (coordinates discarded immediately)
  if (
    typeof payload.latitude === 'number' &&
    typeof payload.longitude === 'number' &&
    isWithinIndiaBounds(payload.latitude, payload.longitude)
  ) {
    const nearest = findNearestSupportedCity(payload.latitude, payload.longitude);
    const stateMeta = findStateMeta(nearest.state);
    return {
      detected: true,
      city: nearest.name,
      state: nearest.state,
      stateCode: stateMeta?.code ?? null,
      region: stateMeta?.region ?? null,
      detectionMethod: 'ip_approximate',
      isApproximate: true,
      coordinatesStored: false,
      provider: payload.provider,
      message: `Approximate nearest city detected via network IP: ${nearest.name}, ${nearest.state}. This is an approximate IP estimate, not exact GPS.`,
    };
  }

  // 3. State / UT region fallback
  if (payload.region) {
    const stateMeta = findStateMeta(payload.region);
    if (stateMeta) {
      const stateCity = INDIAN_CITIES.find(
        (c) => normalizeText(c.state) === normalizeText(stateMeta.name)
      );
      if (stateCity) {
        return {
          detected: true,
          city: stateCity.name,
          state: stateCity.state,
          stateCode: stateMeta.code,
          region: stateMeta.region,
          detectionMethod: 'ip_approximate',
          isApproximate: true,
          coordinatesStored: false,
          provider: payload.provider,
          message: `Approximate regional city detected via network IP: ${stateCity.name}, ${stateCity.state}. This is an approximate IP match, not exact GPS.`,
        };
      }
    }
  }

  return {
    detected: false,
    city: null,
    state: null,
    stateCode: null,
    region: null,
    detectionMethod: 'unavailable',
    isApproximate: true,
    coordinatesStored: false,
    provider: payload.provider,
    reason: 'lookup_unavailable',
    message:
      'Approximate IP city lookup could not map your network region reliably. Please select an Indian city manually.',
  };
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = 3500
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Performs a temporary, zero-storage server-side IP approximate city lookup.
 * Uses ipwho.is with ipapi.co fallback. Never invents fake coordinates.
 */
export async function detectApproximateIndianCity(
  clientIp: string | null
): Promise<ApproximateLocationResult> {
  if (clientIp && isPrivateOrLoopbackIp(clientIp)) {
    return {
      detected: false,
      city: null,
      state: null,
      stateCode: null,
      region: null,
      detectionMethod: 'unavailable',
      isApproximate: true,
      coordinatesStored: false,
      provider: null,
      reason: 'private_ip',
      message:
        'Approximate IP location is unavailable on a local/private network address. Please select an Indian city manually.',
    };
  }

  const encodedIp = clientIp ? encodeURIComponent(clientIp) : '';

  // Primary provider: ipwho.is (HTTPS, no key required, returns country_code, city, region, lat/lon)
  const ipWhoUrl = encodedIp
    ? `https://ipwho.is/${encodedIp}`
    : 'https://ipwho.is/';
  const ipWho = await fetchJsonWithTimeout<{
    success?: boolean;
    country_code?: string;
    country?: string;
    city?: string;
    region?: string;
    latitude?: number;
    longitude?: number;
  }>(ipWhoUrl);

  if (ipWho && ipWho.success !== false && ipWho.country_code) {
    return resolveIndianCityFromIpPayload({
      provider: 'ipwho.is',
      countryCode: ipWho.country_code,
      countryName: ipWho.country,
      city: ipWho.city,
      region: ipWho.region,
      latitude: typeof ipWho.latitude === 'number' ? ipWho.latitude : null,
      longitude: typeof ipWho.longitude === 'number' ? ipWho.longitude : null,
    });
  }

  // Secondary fallback: ipapi.co
  const ipApiUrl = encodedIp
    ? `https://ipapi.co/${encodedIp}/json/`
    : 'https://ipapi.co/json/';
  const ipApi = await fetchJsonWithTimeout<{
    error?: boolean;
    country_code?: string;
    country_name?: string;
    city?: string;
    region?: string;
    latitude?: number;
    longitude?: number;
  }>(ipApiUrl);

  if (ipApi && !ipApi.error && ipApi.country_code) {
    return resolveIndianCityFromIpPayload({
      provider: 'ipapi.co',
      countryCode: ipApi.country_code,
      countryName: ipApi.country_name,
      city: ipApi.city,
      region: ipApi.region,
      latitude: typeof ipApi.latitude === 'number' ? ipApi.latitude : null,
      longitude: typeof ipApi.longitude === 'number' ? ipApi.longitude : null,
    });
  }

  return {
    detected: false,
    city: null,
    state: null,
    stateCode: null,
    region: null,
    detectionMethod: 'unavailable',
    isApproximate: true,
    coordinatesStored: false,
    provider: null,
    reason: 'lookup_unavailable',
    message:
      'Approximate IP location service could not be reached right now. Please choose your Indian city manually below.',
  };
}
