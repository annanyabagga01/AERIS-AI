import {
  classifyCpcbAqi,
  type DataGovFieldMeta,
  discoverCpcbSchemaMapping,
  getCityQueryAliases,
  hasSufficientPollutantsForOfficialAqi,
  isTimestampStale,
  normalizePollutantUnit,
  parseCpcbTimestamp,
} from '../../src/lib/aqi.ts';
import type {
  PollutantReading,
  SourceHealthEntry,
  StationReading,
} from '../../src/lib/types.ts';

export type DataGovRecord = Record<string, unknown>;

interface DataGovApiResponse {
  status?: string;
  message?: string;
  total?: number;
  count?: number;
  updated_date?: string;
  field?: DataGovFieldMeta[];
  records?: DataGovRecord[];
}

interface CacheEntry {
  fetchedAtMs: number;
  stations: StationReading[];
  discoveredSchemaFields: string[];
  recordsCount: number;
  latencyMs: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const cpcbCache = new Map<string, CacheEntry>();

let lastCpcbHealth: SourceHealthEntry = {
  sourceId: 'cpcb',
  name: 'CPCB Official Feed (data.gov.in)',
  configured: false,
  status: 'unconfigured',
  message:
    'DATA_GOV_IN_API_KEY and DATA_GOV_IN_RESOURCE_ID are not set in server environment secrets.',
  lastCheckedIso: new Date().toISOString(),
  endpointHint: 'https://api.data.gov.in/resource/{DATA_GOV_IN_RESOURCE_ID}',
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === 'NA' || v === 'N/A') {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function normalizePollutantId(
  raw: string | undefined
): PollutantReading['id'] | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'PM2.5' || upper === 'PM25' || upper === 'PM_2_5') return 'PM2.5';
  if (upper === 'PM10' || upper === 'PM_10') return 'PM10';
  if (upper === 'NO2') return 'NO2';
  if (upper === 'SO2') return 'SO2';
  if (upper === 'CO') return 'CO';
  if (upper === 'OZONE' || upper === 'O3') return 'OZONE';
  if (upper === 'NH3') return 'NH3';
  return null;
}

// Official CPCB National AQI breakpoints (24h/8h linear sub-index)
function computeSubIndex(id: PollutantReading['id'], val: number): number | null {
  type Bp = [number, number, number, number];
  const tables: Partial<Record<PollutantReading['id'], Bp[]>> = {
    'PM2.5': [
      [0, 30, 0, 50],
      [30, 60, 51, 100],
      [60, 90, 101, 200],
      [90, 120, 201, 300],
      [120, 250, 301, 400],
      [250, 500, 401, 500],
    ],
    PM10: [
      [0, 50, 0, 50],
      [50, 100, 51, 100],
      [100, 250, 101, 200],
      [250, 350, 201, 300],
      [350, 430, 301, 400],
      [430, 600, 401, 500],
    ],
    NO2: [
      [0, 40, 0, 50],
      [40, 80, 51, 100],
      [80, 180, 101, 200],
      [180, 280, 201, 300],
      [280, 400, 301, 400],
      [400, 800, 401, 500],
    ],
    SO2: [
      [0, 40, 0, 50],
      [40, 80, 51, 100],
      [80, 380, 101, 200],
      [380, 800, 201, 300],
      [800, 1600, 301, 400],
      [1600, 2400, 401, 500],
    ],
    CO: [
      [0, 1, 0, 50],
      [1, 2, 51, 100],
      [2, 10, 101, 200],
      [10, 17, 201, 300],
      [17, 34, 301, 400],
      [34, 50, 401, 500],
    ],
    OZONE: [
      [0, 50, 0, 50],
      [50, 100, 51, 100],
      [100, 168, 101, 200],
      [168, 208, 201, 300],
      [208, 748, 301, 400],
      [748, 1000, 401, 500],
    ],
    NH3: [
      [0, 200, 0, 50],
      [200, 400, 51, 100],
      [400, 800, 101, 200],
      [800, 1200, 201, 300],
      [1200, 1800, 301, 400],
      [1800, 2400, 401, 500],
    ],
  };

  const bps = tables[id];
  if (!bps) return null;
  for (const [bLo, bHi, iLo, iHi] of bps) {
    if (val <= bHi) {
      return Math.round(((iHi - iLo) / (bHi - bLo)) * (val - bLo) + iLo);
    }
  }
  return 500;
}

export function isCpcbConfigured(): boolean {
  return Boolean(
    process.env.DATA_GOV_IN_API_KEY?.trim() &&
      process.env.DATA_GOV_IN_RESOURCE_ID?.trim()
  );
}

export function getLastCpcbHealth(): SourceHealthEntry {
  const configured = isCpcbConfigured();
  if (!configured) {
    return {
      ...lastCpcbHealth,
      configured: false,
      status: 'unconfigured',
    };
  }
  if (lastCpcbHealth.status === 'unconfigured') {
    return {
      ...lastCpcbHealth,
      configured: true,
      status: 'configured',
      message: 'CPCB secrets configured on server; awaiting first station query.',
    };
  }
  return { ...lastCpcbHealth, configured: true };
}

async function requestDataGovPage(
  resourceId: string,
  apiKey: string,
  params: { limit: number; offset?: number; cityFilter?: string },
  signal: AbortSignal
): Promise<DataGovApiResponse> {
  const search = new URLSearchParams({
    'api-key': apiKey,
    format: 'json',
    limit: String(params.limit),
  });
  if (typeof params.offset === 'number' && params.offset > 0) {
    search.set('offset', String(params.offset));
  }
  if (params.cityFilter) {
    search.set('filters[city]', params.cityFilter);
  }

  const url = `https://api.data.gov.in/resource/${encodeURIComponent(
    resourceId
  )}?${search.toString()}`;

  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`data.gov.in returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as DataGovApiResponse;
  if (json.status === 'error' && json.message) {
    throw new Error(`data.gov.in error: ${json.message}`);
  }
  return json;
}

export async function fetchCpcbStations(options?: {
  cityFilter?: string;
  forceRefresh?: boolean;
}): Promise<{
  configured: boolean;
  stations: StationReading[];
  health: SourceHealthEntry;
  error?: string;
}> {
  const apiKey = process.env.DATA_GOV_IN_API_KEY?.trim();
  const resourceId = process.env.DATA_GOV_IN_RESOURCE_ID?.trim();
  const cityFilter = options?.cityFilter?.trim();
  const forceRefresh = Boolean(options?.forceRefresh);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (!apiKey || !resourceId) {
    const health: SourceHealthEntry = {
      sourceId: 'cpcb',
      name: 'CPCB Official Feed (data.gov.in)',
      configured: false,
      status: 'unconfigured',
      message:
        'DATA_GOV_IN_API_KEY and DATA_GOV_IN_RESOURCE_ID are not set on the server. Demo Reference Mode active.',
      lastCheckedIso: nowIso,
      endpointHint: 'https://api.data.gov.in/resource/{DATA_GOV_IN_RESOURCE_ID}',
    };
    lastCpcbHealth = health;
    return { configured: false, stations: [], health };
  }

  const cacheKey = cityFilter ? `city:${cityFilter.toLowerCase()}` : 'all';
  if (!forceRefresh) {
    const cached = cpcbCache.get(cacheKey);
    if (cached && nowMs - cached.fetchedAtMs < CACHE_TTL_MS) {
      const health: SourceHealthEntry = {
        sourceId: 'cpcb',
        name: 'CPCB Official Feed (data.gov.in)',
        configured: true,
        status: 'live',
        message: `Served ${cached.stations.length} CPCB station(s) from 5-min server cache.`,
        lastCheckedIso: new Date(cached.fetchedAtMs).toISOString(),
        latencyMs: cached.latencyMs,
        recordsCount: cached.recordsCount,
        cacheHit: true,
        discoveredSchemaFields: cached.discoveredSchemaFields,
        endpointHint: 'https://api.data.gov.in/resource/{DATA_GOV_IN_RESOURCE_ID}',
      };
      lastCpcbHealth = health;
      return { configured: true, stations: cached.stations, health };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedMs = Date.now();

  try {
    let allRecords: DataGovRecord[] = [];
    let schemaFieldsMeta: DataGovFieldMeta[] | undefined;

    if (cityFilter) {
      const aliases = getCityQueryAliases(cityFilter);
      for (const alias of aliases) {
        const payload = await requestDataGovPage(
          resourceId,
          apiKey,
          { limit: 500, cityFilter: alias },
          controller.signal
        );
        if (!schemaFieldsMeta && Array.isArray(payload.field)) {
          schemaFieldsMeta = payload.field;
        }
        const recs = Array.isArray(payload.records) ? payload.records : [];
        if (recs.length > 0) {
          allRecords = recs;
          break;
        }
      }

      // Fallback if custom resource uses non-standard city casing or unindexed filter
      if (allRecords.length === 0) {
        const nationalSlice = await requestDataGovPage(
          resourceId,
          apiKey,
          { limit: 1000 },
          controller.signal
        );
        if (!schemaFieldsMeta && Array.isArray(nationalSlice.field)) {
          schemaFieldsMeta = nationalSlice.field;
        }
        allRecords = Array.isArray(nationalSlice.records)
          ? nationalSlice.records
          : [];
      }
    } else {
      // Paginate national station query (up to 3 pages of 1000 rows)
      for (let page = 0; page < 3; page++) {
        const offset = page * 1000;
        const payload = await requestDataGovPage(
          resourceId,
          apiKey,
          { limit: 1000, offset },
          controller.signal
        );
        if (!schemaFieldsMeta && Array.isArray(payload.field)) {
          schemaFieldsMeta = payload.field;
        }
        const recs = Array.isArray(payload.records) ? payload.records : [];
        allRecords.push(...recs);
        const total = typeof payload.total === 'number' ? payload.total : 0;
        if (recs.length < 1000 || (total > 0 && allRecords.length >= total)) {
          break;
        }
      }
    }

    const schema = discoverCpcbSchemaMapping(schemaFieldsMeta, allRecords[0]);
    const aggregated = aggregateCpcbRecords(allRecords, nowMs, schemaFieldsMeta);
    const filteredStations = cityFilter
      ? filterStationsByCityAliases(aggregated, cityFilter)
      : aggregated;
    const latencyMs = Date.now() - startedMs;

    cpcbCache.set(cacheKey, {
      fetchedAtMs: nowMs,
      stations: filteredStations,
      discoveredSchemaFields: schema.discoveredFields,
      recordsCount: allRecords.length,
      latencyMs,
    });

    const health: SourceHealthEntry = {
      sourceId: 'cpcb',
      name: 'CPCB Official Feed (data.gov.in)',
      configured: true,
      status: 'live',
      message:
        filteredStations.length > 0
          ? `Live CPCB feed connected (${filteredStations.length} station(s), ${allRecords.length} pollutant rows).`
          : `Connected to data.gov.in (${allRecords.length} rows), but 0 stations matched ${cityFilter ?? 'query'}.`,
      lastCheckedIso: nowIso,
      latencyMs,
      recordsCount: allRecords.length,
      cacheHit: false,
      discoveredSchemaFields: schema.discoveredFields,
      endpointHint: `https://api.data.gov.in/resource/${resourceId}`,
    };
    lastCpcbHealth = health;

    return { configured: true, stations: filteredStations, health };
  } catch (err) {
    const latencyMs = Date.now() - startedMs;
    const causeObj =
      err instanceof Error && typeof err.cause === 'object' && err.cause !== null
        ? (err.cause as { code?: string; address?: string; port?: number; message?: string })
        : null;
    const baseMsg =
      err instanceof Error && err.name === 'AbortError'
        ? `data.gov.in request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : err instanceof Error
        ? err.message
        : 'Failed to fetch data.gov.in CPCB data';
    const causeDetail = causeObj
      ? [causeObj.code, causeObj.address && causeObj.port ? `${causeObj.address}:${causeObj.port}` : causeObj.message]
          .filter(Boolean)
          .join(' ')
      : '';
    const looksLikeApiKey = /^579b[a-f0-9]{40,}$/i.test(resourceId);
    const configHint = looksLikeApiKey
      ? ' (Also check DATA_GOV_IN_RESOURCE_ID: current value matches a data.gov.in API key format rather than a dataset Resource ID UUID)'
      : '';
    const message = `${baseMsg}${causeDetail ? ` (${causeDetail})` : ''}${configHint}`;

    const health: SourceHealthEntry = {
      sourceId: 'cpcb',
      name: 'CPCB Official Feed (data.gov.in)',
      configured: true,
      status: 'error',
      message,
      lastCheckedIso: nowIso,
      latencyMs,
      error: message,
      endpointHint: 'https://api.data.gov.in/resource/{DATA_GOV_IN_RESOURCE_ID}',
    };
    lastCpcbHealth = health;

    return {
      configured: true,
      stations: [],
      health,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function filterStationsByCityAliases(
  stations: StationReading[],
  cityFilter?: string
): StationReading[] {
  if (!cityFilter) return stations;
  const aliases = getCityQueryAliases(cityFilter).map((a) => a.toLowerCase());
  return stations.filter((s) => {
    const cityL = s.city.toLowerCase();
    const stateL = s.state.toLowerCase();
    const stationL = s.station.toLowerCase();
    return aliases.some(
      (q) => cityL.includes(q) || stationL.includes(q) || stateL === q
    );
  });
}

export function aggregateCpcbRecords(
  records: DataGovRecord[],
  nowMs: number,
  schemaMeta?: DataGovFieldMeta[]
): StationReading[] {
  const schema = discoverCpcbSchemaMapping(schemaMeta, records[0]);

  const byStation = new Map<
    string,
    {
      station: string;
      city: string;
      state: string;
      lat: number;
      lng: number;
      lastUpdatedIso: string;
      explicitAqi: number | null;
      pollutants: Map<PollutantReading['id'], PollutantReading>;
    }
  >();

  for (const row of records) {
    const stationName = toText(
      row[schema.stationField] ?? row.station ?? row.station_name
    );
    const cityName = toText(row[schema.cityField] ?? row.city ?? row.city_name);
    if (!stationName || !cityName) continue;

    const key = `${cityName}::${stationName}`;
    let entry = byStation.get(key);
    const rowTimestamp = parseCpcbTimestamp(
      toText(row[schema.lastUpdateField] ?? row.last_update ?? row.updated_date)
    );
    const rowExplicitAqi = toNum(row[schema.aqiField] ?? row.aqi);

    if (!entry) {
      entry = {
        station: stationName,
        city: cityName,
        state: toText(row[schema.stateField] ?? row.state) || 'India',
        lat: toNum(row[schema.latField] ?? row.latitude) ?? 0,
        lng: toNum(row[schema.lngField] ?? row.longitude) ?? 0,
        lastUpdatedIso: rowTimestamp,
        explicitAqi: rowExplicitAqi,
        pollutants: new Map(),
      };
      byStation.set(key, entry);
    } else {
      if (!entry.lastUpdatedIso && rowTimestamp) {
        entry.lastUpdatedIso = rowTimestamp;
      }
      if (entry.explicitAqi === null && rowExplicitAqi !== null) {
        entry.explicitAqi = rowExplicitAqi;
      }
    }

    const pId = normalizePollutantId(
      toText(row[schema.pollutantIdField] ?? row.pollutant_id ?? row.pollutant)
    );
    if (pId) {
      const avg = toNum(
        row[schema.avgField] ?? row.pollutant_avg ?? row.avg_value
      );
      const min = toNum(
        row[schema.minField] ?? row.pollutant_min ?? row.min_value
      );
      const max = toNum(
        row[schema.maxField] ?? row.pollutant_max ?? row.max_value
      );
      const rawUnitStr = toText(
        row[schema.unitField] ?? row.pollutant_unit ?? row.unit ?? row.units
      );
      const unitInfo = normalizePollutantUnit(rawUnitStr, pId);

      entry.pollutants.set(pId, {
        id: pId,
        label: pId === 'OZONE' ? 'Ozone' : pId,
        value: avg,
        min,
        max,
        unit: unitInfo.unit,
        rawUnit: unitInfo.rawUnit,
        unitCompatibleWithCpcb: unitInfo.compatibleWithCpcb,
        source: 'CPCB_DATA_GOV_IN',
      });
    }
  }

  const results: StationReading[] = [];
  for (const [key, item] of byStation.entries()) {
    const pollutantList = Array.from(item.pollutants.values());
    let officialAqi = item.explicitAqi;
    let predominantPollutant: string | null = null;

    if (
      officialAqi === null &&
      hasSufficientPollutantsForOfficialAqi(pollutantList)
    ) {
      let maxSub = -1;
      for (const p of pollutantList) {
        if (p.value === null || p.unitCompatibleWithCpcb === false) continue;
        const sub = computeSubIndex(p.id, p.value);
        if (sub !== null && sub > maxSub) {
          maxSub = sub;
          predominantPollutant = p.label;
        }
      }
      if (maxSub >= 0) {
        officialAqi = maxSub;
      }
    } else if (officialAqi !== null) {
      let maxSub = -1;
      for (const p of pollutantList) {
        if (p.value === null || p.unitCompatibleWithCpcb === false) continue;
        const sub = computeSubIndex(p.id, p.value);
        if (sub !== null && sub > maxSub) {
          maxSub = sub;
          predominantPollutant = p.label;
        }
      }
    }

    const categoryMeta = classifyCpcbAqi(officialAqi);
    const stale = isTimestampStale(item.lastUpdatedIso, nowMs, 180);

    results.push({
      id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      station: item.station,
      city: item.city,
      state: item.state,
      lat: item.lat,
      lng: item.lng,
      officialAqi,
      category: categoryMeta.category,
      predominantPollutant,
      pollutants: pollutantList,
      lastUpdatedIso: item.lastUpdatedIso,
      source: 'CPCB_DATA_GOV_IN',
      sourceLabel: 'CPCB / data.gov.in Official Feed',
      isOfficialNationalAqi: officialAqi !== null,
      isDemo: false,
      isStale: stale,
      staleNote: stale
        ? 'Reading older than 3 hours or timestamp missing (stale)'
        : 'Within 3-hour freshness window',
    });
  }

  return results;
}
