import { isTimestampStale } from '../../src/lib/aqi.ts';
import type { OpenAqSensorReading, SourceHealthEntry } from '../../src/lib/types.ts';

interface OpenAqLocation {
  id: number;
  name?: string;
  locality?: string;
  coordinates?: { latitude: number; longitude: number };
  sensors?: {
    id: number;
    parameter?: { name?: string; units?: string };
  }[];
  datetimeLast?: { utc?: string };
}

interface OpenAqLatestResult {
  sensorsId: number;
  value: number;
  datetime?: { utc?: string };
}

interface OpenAqCacheEntry {
  fetchedAtMs: number;
  sensors: OpenAqSensorReading[];
  latencyMs: number;
}

const cache = new Map<string, OpenAqCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

let lastOpenAqHealth: SourceHealthEntry = {
  sourceId: 'openaq',
  name: 'OpenAQ v3 Sensor Network',
  configured: false,
  status: 'unconfigured',
  message: 'OPENAQ_API_KEY not set (optional secondary sensor feed).',
  lastCheckedIso: new Date().toISOString(),
  endpointHint: 'https://api.openaq.org/v3/locations',
};

export function isOpenAqConfigured(): boolean {
  return Boolean(process.env.OPENAQ_API_KEY?.trim());
}

export function getLastOpenAqHealth(): SourceHealthEntry {
  const configured = isOpenAqConfigured();
  if (!configured) {
    return {
      ...lastOpenAqHealth,
      configured: false,
      status: 'unconfigured',
    };
  }
  if (lastOpenAqHealth.status === 'unconfigured') {
    return {
      ...lastOpenAqHealth,
      configured: true,
      status: 'configured',
      message: 'OpenAQ v3 secret configured on server; awaiting first sensor query.',
    };
  }
  return { ...lastOpenAqHealth, configured: true };
}

export async function fetchOpenAqSensors(
  cityName: string,
  lat: number,
  lng: number,
  options?: { forceRefresh?: boolean }
): Promise<{
  configured: boolean;
  sensors: OpenAqSensorReading[];
  health: SourceHealthEntry;
  error?: string;
}> {
  const apiKey = process.env.OPENAQ_API_KEY?.trim();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (!apiKey) {
    const health: SourceHealthEntry = {
      sourceId: 'openaq',
      name: 'OpenAQ v3 Sensor Network',
      configured: false,
      status: 'unconfigured',
      message:
        'OPENAQ_API_KEY is not configured (optional secondary sensor feed).',
      lastCheckedIso: nowIso,
      endpointHint: 'https://api.openaq.org/v3/locations',
    };
    lastOpenAqHealth = health;
    return { configured: false, sensors: [], health };
  }

  const cacheKey = `${cityName.toLowerCase()}:${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (!options?.forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && nowMs - cached.fetchedAtMs < CACHE_TTL_MS) {
      const health: SourceHealthEntry = {
        sourceId: 'openaq',
        name: 'OpenAQ v3 Sensor Network',
        configured: true,
        status: 'live',
        message: `Served ${cached.sensors.length} OpenAQ v3 sensor reading(s) from 5-min cache.`,
        lastCheckedIso: new Date(cached.fetchedAtMs).toISOString(),
        latencyMs: cached.latencyMs,
        recordsCount: cached.sensors.length,
        cacheHit: true,
        endpointHint: 'https://api.openaq.org/v3/locations',
      };
      lastOpenAqHealth = health;
      return { configured: true, sensors: cached.sensors, health };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedMs = Date.now();

  try {
    const locUrl = `https://api.openaq.org/v3/locations?coordinates=${lat.toFixed(
      4
    )},${lng.toFixed(4)}&radius=25000&limit=25`;

    const locRes = await fetch(locUrl, {
      signal: controller.signal,
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
    });

    if (!locRes.ok) {
      throw new Error(`OpenAQ v3 returned HTTP ${locRes.status}`);
    }

    const locJson = (await locRes.json()) as { results?: OpenAqLocation[] };
    const rawLocations = Array.isArray(locJson.results) ? locJson.results : [];
    const locations = [...rawLocations].sort((a, b) => {
      const aTime = Date.parse(a.datetimeLast?.utc ?? '') || 0;
      const bTime = Date.parse(b.datetimeLast?.utc ?? '') || 0;
      return bTime - aTime;
    });

    const latestBatches = await Promise.all(
      locations.slice(0, 4).map(async (loc) => {
        const latestRes = await fetch(
          `https://api.openaq.org/v3/locations/${loc.id}/latest`,
          {
            signal: controller.signal,
            headers: {
              'X-API-Key': apiKey,
              Accept: 'application/json',
            },
          }
        );
        if (!latestRes.ok) return [] as OpenAqSensorReading[];
        const latestJson = (await latestRes.json()) as {
          results?: OpenAqLatestResult[];
        };
        const sensorMeta = new Map(
          (loc.sensors ?? []).map((s) => [s.id, s.parameter])
        );

        const AIR_POLLUTANT_PARAMS = new Set([
          'PM25',
          'PM2.5',
          'PM10',
          'PM1',
          'NO2',
          'NO',
          'NOX',
          'SO2',
          'CO',
          'O3',
          'OZONE',
          'NH3',
          'BC',
        ]);

        const batch: OpenAqSensorReading[] = [];
        for (const item of latestJson.results ?? []) {
          const param = sensorMeta.get(item.sensorsId);
          const paramName = (param?.name ?? '').toUpperCase();
          if (
            !paramName ||
            !AIR_POLLUTANT_PARAMS.has(paramName) ||
            typeof item.value !== 'number' ||
            !Number.isFinite(item.value)
          ) {
            continue;
          }

          const ts = item.datetime?.utc ?? loc.datetimeLast?.utc ?? '';
          const unitStr = param?.units?.trim() || 'unitless';
          batch.push({
            id: `openaq-${loc.id}-${item.sensorsId}`,
            locationName: loc.name ?? loc.locality ?? `${cityName} Sensor`,
            city: cityName,
            lat: loc.coordinates?.latitude ?? lat,
            lng: loc.coordinates?.longitude ?? lng,
            parameter: paramName,
            value: Number(item.value.toFixed(2)),
            unit: unitStr,
            lastUpdatedIso: ts,
            isStale: isTimestampStale(ts, nowMs, 180),
            source: 'OPENAQ_V3_SENSOR',
            sourceLabel: 'OpenAQ v3 Sensor Reading (Not Official CPCB National AQI)',
            isOfficialNationalAqi: false,
          });
        }
        return batch;
      })
    );
    const readings: OpenAqSensorReading[] = latestBatches
      .flat()
      .sort((a, b) => (Date.parse(b.lastUpdatedIso) || 0) - (Date.parse(a.lastUpdatedIso) || 0));

    const latencyMs = Date.now() - startedMs;
    cache.set(cacheKey, { fetchedAtMs: nowMs, sensors: readings, latencyMs });

    const health: SourceHealthEntry = {
      sourceId: 'openaq',
      name: 'OpenAQ v3 Sensor Network',
      configured: true,
      status: 'live',
      message:
        readings.length > 0
          ? `OpenAQ v3 connected (${readings.length} sensor readings within 25 km).`
          : `OpenAQ v3 connected; 0 active sensors within 25 km of ${cityName}.`,
      lastCheckedIso: nowIso,
      latencyMs,
      recordsCount: readings.length,
      cacheHit: false,
      endpointHint: 'https://api.openaq.org/v3/locations',
    };
    lastOpenAqHealth = health;

    return { configured: true, sensors: readings, health };
  } catch (err) {
    const latencyMs = Date.now() - startedMs;
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? `OpenAQ v3 request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : err instanceof Error
        ? err.message
        : 'OpenAQ v3 request failed';

    const health: SourceHealthEntry = {
      sourceId: 'openaq',
      name: 'OpenAQ v3 Sensor Network',
      configured: true,
      status: 'error',
      message,
      lastCheckedIso: nowIso,
      latencyMs,
      error: message,
      endpointHint: 'https://api.openaq.org/v3/locations',
    };
    lastOpenAqHealth = health;

    return {
      configured: true,
      sensors: [],
      health,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
