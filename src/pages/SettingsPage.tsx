import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { buildApiUrl } from '../lib/apiClient.ts';
import { classifyCpcbAqi, findNearestSupportedCity } from '../lib/aqi.ts';
import {
  containsSensitivePiiOrLocation,
  sanitizeAnonymousHandle,
} from '../lib/community.ts';
import {
  INDIA_STATES_AND_UTS,
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
  SIMULATION_DISCLAIMER_TEXT,
} from '../lib/indiaSimulation.ts';
import {
  ALL_INDIA_SEARCHABLE_CITIES,
  classifyGeolocationError,
  filterIndianCities,
  getCityCatalogEntry,
  getLocationMethodLabel,
  getLocationStateBadge,
  isCoordinateWithinIndia,
  type GpsFailureCategory,
  type LocationDetectionMethod,
  type LocationUiState,
} from '../lib/locationDetection.ts';
import type {
  CityAqiResponse,
  CommuteMode,
  FamilyPreferences,
  IndiaAqiApiResponse,
} from '../lib/types.ts';

interface SettingsPageProps {
  preferences: FamilyPreferences;
  onSavePreferences: (next: FamilyPreferences) => void;
  aqiData?: CityAqiResponse | null;
  aqiLoading?: boolean;
}

interface HealthStatus {
  status: string;
  integrations: {
    geminiConfigured: boolean;
    firebaseConfigured: boolean;
    simulationEngineActive: boolean;
  };
  simulationEngine?: {
    dataSource: string;
    dataType: string;
    badge: string;
    disclaimer: string;
    totalStations: number;
    statesCovered: number;
    unionTerritoriesCovered: number;
    intervalMs: number;
    generatedAt: string;
    nextUpdateAt: string;
  };
}

interface ApproximateLocationApiResponse {
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

interface CitySimulationSnapshot {
  city: string;
  state: string;
  stateCode: string;
  averageAqi: number | null;
  category: string;
  stationCount: number;
  dataSource: string;
  dataType: string;
}

const INDIAN_STATES_ONLY = INDIA_STATES_AND_UTS.filter(
  (s) => !s.isUnionTerritory
).sort((a, b) => a.name.localeCompare(b.name));

const INDIAN_UTS_ONLY = INDIA_STATES_AND_UTS.filter(
  (s) => s.isUnionTerritory
).sort((a, b) => a.name.localeCompare(b.name));

function checkDocumentAllowsGeolocation(): boolean {
  if (typeof document === 'undefined') return true;
  const doc = document as Document & {
    permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
    featurePolicy?: { allowsFeature?: (feature: string) => boolean };
  };
  try {
    if (typeof doc.permissionsPolicy?.allowsFeature === 'function') {
      return doc.permissionsPolicy.allowsFeature('geolocation');
    }
    if (typeof doc.featurePolicy?.allowsFeature === 'function') {
      return doc.featurePolicy.allowsFeature('geolocation');
    }
  } catch {
    // Ignore unsupported permissionsPolicy inspection
  }
  return true;
}

async function queryBrowserGeoPermissionState(): Promise<
  'granted' | 'prompt' | 'denied' | 'unknown'
> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });
    if (
      status.state === 'granted' ||
      status.state === 'prompt' ||
      status.state === 'denied'
    ) {
      return status.state;
    }
  } catch {
    // Permissions API may not support geolocation query in some browsers
  }
  return 'unknown';
}

export function SettingsPage({
  preferences,
  onSavePreferences,
  aqiData,
  aqiLoading = false,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<FamilyPreferences>(preferences);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Ephemeral location detection state (NEVER persisted to storage or Firestore)
  const [locationState, setLocationState] = useState<LocationUiState>('idle');
  const [detectionMethod, setDetectionMethod] =
    useState<LocationDetectionMethod>('manual_selection');
  const [locationDetail, setLocationDetail] = useState<string | null>(null);
  const [gpsStatusNote, setGpsStatusNote] = useState<string | null>(null);
  const [showManualSelector, setShowManualSelector] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [citySimSnapshot, setCitySimSnapshot] =
    useState<CitySimulationSnapshot | null>(null);
  const [citySimLoading, setCitySimLoading] = useState(false);

  // In-memory session guard so blocked/denied GPS is never repeatedly requested
  const gpsBlockedCategoryRef = useRef<GpsFailureCategory | null>(null);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch(buildApiUrl('/api/health'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealth((await res.json()) as HealthStatus);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : 'Unable to check server health.'
      );
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  // Fetch simulated AQI snapshot from /api/india/aqi whenever city changes
  const fetchIndiaSimulatedCityAqi = useCallback(async (cityName: string) => {
    setCitySimLoading(true);
    try {
      const res = await fetch(
        buildApiUrl(`/api/india/aqi?city=${encodeURIComponent(cityName)}`)
      );
      if (!res.ok) return;
      const json = (await res.json()) as IndiaAqiApiResponse;
      if (json.stations.length > 0) {
        const first = json.stations[0];
        const avgAqi =
          json.summary.averageAqi ??
          Math.round(
            json.stations.reduce((acc, s) => acc + s.aqi, 0) /
              json.stations.length
          );
        const categoryMeta = classifyCpcbAqi(avgAqi);
        setCitySimSnapshot({
          city: first.city,
          state: first.state,
          stateCode: first.state_code,
          averageAqi: avgAqi,
          category: categoryMeta.category,
          stationCount: json.stations.length,
          dataSource:
            first.data_source ||
            json.summary.data_source ||
            SIMULATION_DATA_SOURCE,
          dataType:
            first.data_type || json.summary.data_type || SIMULATION_DATA_TYPE,
        });
      }
    } catch {
      // Fall back silently to App-level aqiData prop
    } finally {
      setCitySimLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIndiaSimulatedCityAqi(draft.city);
  }, [draft.city, fetchIndiaSimulatedCityAqi]);

  const filteredCities = useMemo(
    () =>
      filterIndianCities({
        query: citySearchQuery,
        stateFilter,
      }),
    [citySearchQuery, stateFilter]
  );

  const selectedCityMeta = useMemo(
    () => getCityCatalogEntry(draft.city),
    [draft.city]
  );

  const applyCitySelection = useCallback(
    (
      cityName: string,
      method: LocationDetectionMethod,
      nextState: LocationUiState,
      detailMessage: string
    ) => {
      // Store ONLY the city name in local preferences — NEVER GPS coordinates
      const updated: FamilyPreferences = { ...draft, city: cityName };
      setDraft(updated);
      onSavePreferences(updated);
      setDetectionMethod(method);
      setLocationState(nextState);
      setLocationDetail(detailMessage);
      void fetchIndiaSimulatedCityAqi(cityName);
    },
    [draft, onSavePreferences, fetchIndiaSimulatedCityAqi]
  );

  const runIpApproximateFallback = useCallback(
    async (gpsFailure: GpsFailureCategory, gpsReasonText: string) => {
      setGpsStatusNote(gpsReasonText);
      try {
        const res = await fetch(buildApiUrl('/api/location/approximate'), {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as ApproximateLocationApiResponse;
          if (data.detected && data.city) {
            setShowManualSelector(false);
            applyCitySelection(
              data.city,
              'ip_approximate',
              'ip_approximate',
              `${data.message} You can switch cities anytime below.`
            );
            return;
          }
          // IP fallback could not determine an Indian city reliably — open manual selector honestly
          setShowManualSelector(true);
          setDetectionMethod('manual_selection');
          setLocationState(
            gpsFailure === 'blocked_by_policy'
              ? 'gps_blocked'
              : gpsFailure === 'permission_denied'
              ? 'gps_denied'
              : 'manual_selection'
          );
          setLocationDetail(
            `${data.message} Select your city from all 28 Indian States & 8 Union Territories below.`
          );
          return;
        }
      } catch {
        // Network error calling backend IP fallback
      }

      setShowManualSelector(true);
      setDetectionMethod('manual_selection');
      setLocationState(
        gpsFailure === 'blocked_by_policy'
          ? 'gps_blocked'
          : gpsFailure === 'permission_denied'
          ? 'gps_denied'
          : 'manual_selection'
      );
      setLocationDetail(
        'Approximate IP detection could not be completed. Please choose your Indian city manually below.'
      );
    },
    [applyCitySelection]
  );

  const handleDetectLocation = useCallback(
    async (isRetry: boolean = false) => {
      setLocationState('detecting');
      setLocationDetail(
        'Checking browser location permission (coordinates are temporary and never stored)...'
      );
      setGpsStatusNote(null);

      // 1. Check whether geolocation is unavailable or blocked by document/iframe permissions policy
      if (
        typeof navigator === 'undefined' ||
        !('geolocation' in navigator) ||
        !checkDocumentAllowsGeolocation()
      ) {
        gpsBlockedCategoryRef.current = 'blocked_by_policy';
        await runIpApproximateFallback(
          'blocked_by_policy',
          'GPS blocked by browser or iframe permissions policy — skipped GPS prompt and checked server IP fallback.'
        );
        return;
      }

      // 2. Check Permissions API & in-memory session guard so we NEVER repeatedly nag/request blocked or denied GPS
      const permState = await queryBrowserGeoPermissionState();
      if (permState === 'denied') {
        gpsBlockedCategoryRef.current = 'permission_denied';
        await runIpApproximateFallback(
          'permission_denied',
          'GPS permission denied in browser settings — skipped repeated GPS prompt and checked server IP fallback.'
        );
        return;
      }

      if (
        gpsBlockedCategoryRef.current === 'blocked_by_policy' ||
        (gpsBlockedCategoryRef.current === 'permission_denied' &&
          permState !== 'granted' &&
          !isRetry)
      ) {
        const failure = gpsBlockedCategoryRef.current;
        await runIpApproximateFallback(
          failure,
          failure === 'blocked_by_policy'
            ? 'GPS remains blocked by iframe/browser permissions policy — using server IP fallback without re-requesting GPS.'
            : 'GPS permission was previously denied — using server IP fallback without re-requesting GPS.'
        );
        return;
      }

      // 3. Attempt one-time browser geolocation (temporary in-memory coordinates only)
      const positionResult = await new Promise<
        | { ok: true; lat: number; lng: number }
        | { ok: false; failure: GpsFailureCategory; rawMessage: string }
      >((resolve) => {
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                ok: true,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              });
            },
            (err) => {
              const failure = classifyGeolocationError({
                code: err.code,
                message: err.message,
              });
              resolve({
                ok: false,
                failure,
                rawMessage: err.message || 'Location request declined',
              });
            },
            {
              enableHighAccuracy: false,
              timeout: 7000,
              maximumAge: 0,
            }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          resolve({
            ok: false,
            failure: classifyGeolocationError({ message: msg }),
            rawMessage: msg,
          });
        }
      });

      if (positionResult.ok) {
        // Coordinates are used ONLY synchronously right here and NEVER stored anywhere
        if (!isCoordinateWithinIndia(positionResult.lat, positionResult.lng)) {
          setGpsStatusNote(
            'Browser geolocation returned coordinates outside India; coordinates were discarded immediately.'
          );
          setShowManualSelector(true);
          setDetectionMethod('manual_selection');
          setLocationState('manual_selection');
          setLocationDetail(
            'Your current location appears to be outside India. Please select an Indian city manually below to view India-wide simulated AQI data.'
          );
          return;
        }

        const nearest = findNearestSupportedCity(
          positionResult.lat,
          positionResult.lng
        );
        gpsBlockedCategoryRef.current = null;
        setShowManualSelector(false);
        setGpsStatusNote(null);
        applyCitySelection(
          nearest.name,
          'browser_gps_temporary',
          'gps_matched',
          `Matched nearest supported Indian city via temporary browser geolocation: ${nearest.name}, ${nearest.state}. Exact GPS coordinates were discarded immediately and never stored.`
        );
        return;
      }

      // Record policy block / denial in memory only so we do not repeatedly prompt GPS
      if (
        positionResult.failure === 'blocked_by_policy' ||
        positionResult.failure === 'permission_denied'
      ) {
        gpsBlockedCategoryRef.current = positionResult.failure;
      }

      const reasonMap: Record<GpsFailureCategory, string> = {
        blocked_by_policy:
          'GPS blocked by browser/iframe permissions policy — switched to server IP approximate fallback.',
        permission_denied:
          'GPS permission denied — switched to server IP approximate fallback.',
        timeout:
          'Browser GPS timed out — switched to server IP approximate fallback.',
        unavailable:
          'Browser GPS unavailable — switched to server IP approximate fallback.',
        outside_india:
          'Detected coordinates were outside India — please select an Indian city manually.',
      };

      await runIpApproximateFallback(
        positionResult.failure,
        reasonMap[positionResult.failure]
      );
    },
    [applyCitySelection, runIpApproximateFallback]
  );

  const handleManualCityPick = (cityName: string, stateName: string) => {
    setGpsStatusNote(null);
    applyCitySelection(
      cityName,
      'manual_selection',
      'manual_selection',
      `Manually selected ${cityName}, ${stateName}. Fetched corresponding simulated AQI data from the India-wide simulation API.`
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedNotice(false);

    const piiWarning = containsSensitivePiiOrLocation(draft.anonymousHandle);
    if (piiWarning) {
      setSaveError(piiWarning);
      return;
    }

    const sanitized: FamilyPreferences = {
      ...draft,
      workStartHour: draft.workStartHour || '09:00',
      workEndHour: draft.workEndHour || '18:00',
      anonymousHandle: sanitizeAnonymousHandle(draft.anonymousHandle),
    };
    setDraft(sanitized);
    onSavePreferences(sanitized);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const stateBadge = getLocationStateBadge(locationState);
  const badgeColorClass =
    stateBadge.tone === 'emerald'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : stateBadge.tone === 'cyan'
      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
      : stateBadge.tone === 'amber'
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
      : stateBadge.tone === 'rose'
      ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
      : 'bg-slate-800/80 border-slate-700 text-slate-300';

  const displayedAqi = citySimSnapshot?.averageAqi ?? aqiData?.primaryAqi ?? null;
  const displayedCategory =
    citySimSnapshot?.category ?? aqiData?.category ?? 'Unavailable';
  const displayedState =
    citySimSnapshot?.state ?? selectedCityMeta?.state ?? aqiData?.state ?? 'India';
  const displayedStateCode =
    citySimSnapshot?.stateCode ?? selectedCityMeta?.stateCode ?? '';
  const displayedDataType =
    citySimSnapshot?.dataType ?? aqiData?.dataType ?? SIMULATION_DATA_TYPE;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Household & Preferences Form */}
        <section className="lg:col-span-7 aeris-panel rounded-xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Household &amp; Air Quality Preferences
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              City name and household settings are stored locally in your browser.
              AERIS AI never stores GPS coordinates, precise location, or medical
              diagnoses in localStorage or Firestore.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-5 text-sm">
            {/* Resilient Location Detection & All-India City Selector */}
            <div className="rounded-xl border border-slate-800 bg-[#070D1D]/75 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-100 truncate">
                    Indian City &amp; Temporary Location Detection
                  </h3>
                </div>
                <span
                  data-testid="location-state-badge"
                  className={`inline-flex items-center gap-1.5 self-start sm:self-auto text-[11px] font-mono px-2.5 py-0.5 rounded border whitespace-nowrap ${badgeColorClass}`}
                >
                  {locationState === 'detecting' && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  <span>{stateBadge.label}</span>
                </span>
              </div>

              {/* Primary Action Controls */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
                <button
                  type="button"
                  data-testid="detect-nearest-city-btn"
                  disabled={locationState === 'detecting'}
                  onClick={() => void handleDetectLocation(false)}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
                >
                  {locationState === 'detecting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LocateFixed className="w-4 h-4" />
                  )}
                  <span>
                    {locationState === 'detecting'
                      ? 'Detecting location...'
                      : 'Detect Nearest City (No GPS Stored)'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="retry-location-btn"
                  disabled={locationState === 'detecting'}
                  onClick={() => void handleDetectLocation(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Location</span>
                </button>

                <button
                  type="button"
                  data-testid="toggle-manual-city-picker"
                  onClick={() => setShowManualSelector((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>
                    {showManualSelector
                      ? 'Hide City Search'
                      : 'Search All Indian Cities'}
                  </span>
                </button>
              </div>

              {/* Status & Fallback Transparency Alerts */}
              {gpsStatusNote && (
                <p
                  role="status"
                  className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 leading-relaxed"
                >
                  {gpsStatusNote}
                </p>
              )}

              {locationDetail && (
                <p
                  role="status"
                  className="text-xs text-cyan-200 bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-3 py-2 leading-relaxed"
                >
                  {locationDetail}
                </p>
              )}

              {/* Active Selected City, State, Detection Method & Simulated AQI Metadata */}
              <div
                data-testid="selected-location-summary"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-800/90 bg-[#050A17] p-3.5 text-xs"
              >
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Selected City &amp; State
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {draft.city}, {displayedState}
                    {displayedStateCode ? (
                      <span className="ml-1.5 text-[11px] font-mono text-cyan-300">
                        ({displayedStateCode})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {citySimLoading || aqiLoading
                      ? 'Fetching simulated India AQI...'
                      : displayedAqi !== null
                      ? `Simulated AQI ${displayedAqi} (${displayedCategory}) · ${citySimSnapshot?.stationCount ?? aqiData?.stations.length ?? 1} station(s)`
                      : 'Simulated AQI ready'}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Detection Method &amp; Data Type
                  </p>
                  <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{getLocationMethodLabel(detectionMethod)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-200">
                      {SIMULATION_BADGE_TEXT}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {displayedDataType} · {SIMULATION_DATA_SOURCE}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Dropdown covering all Indian Cities grouped by States & UTs */}
              <div>
                <label
                  htmlFor="pref-city"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Primary Indian City (All 28 States &amp; 8 Union Territories)
                </label>
                <select
                  id="pref-city"
                  value={draft.city}
                  onChange={(e) => {
                    const nextCity = e.target.value;
                    const meta = getCityCatalogEntry(nextCity);
                    handleManualCityPick(nextCity, meta?.state ?? 'India');
                  }}
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
                >
                  {ALL_INDIA_SEARCHABLE_CITIES.map((c) => (
                    <option key={`${c.name}-${c.stateCode}`} value={c.name}>
                      {c.name} — {c.state} ({c.stateCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Searchable All-India Manual City Selector (Shown automatically on fallback or on toggle) */}
              {showManualSelector && (
                <div
                  data-testid="manual-city-selector"
                  className="rounded-lg border border-cyan-500/30 bg-[#050A17]/95 p-3.5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <p className="text-xs font-semibold text-slate-100">
                      Searchable Manual City Selector (28 States &amp; 8 UTs)
                    </p>
                    <span className="text-[11px] font-mono text-slate-400">
                      {filteredCities.length} matching cities
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        aria-label="Search Indian city or state"
                        value={citySearchQuery}
                        onChange={(e) => setCitySearchQuery(e.target.value)}
                        placeholder="Search city, state, or code (e.g. Kochi, KL)..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg aeris-input text-xs text-slate-100 placeholder:text-slate-500"
                      />
                    </div>

                    <select
                      aria-label="Filter cities by State or Union Territory"
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg aeris-input text-xs text-slate-100"
                    >
                      <option value="ALL">
                        All India (28 States &amp; 8 Union Territories)
                      </option>
                      <optgroup label="28 Indian States">
                        {INDIAN_STATES_ONLY.map((s) => (
                          <option key={s.code} value={s.name}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="8 Union Territories">
                        {INDIAN_UTS_ONLY.map((ut) => (
                          <option key={ut.code} value={ut.name}>
                            {ut.name} ({ut.code})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {filteredCities.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      No matching Indian cities found. Clear the search filter to
                      browse all 28 States and 8 Union Territories.
                    </p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                      {filteredCities.map((c) => {
                        const isSelected =
                          c.name.toLowerCase() === draft.city.toLowerCase();
                        return (
                          <button
                            key={`${c.name}-${c.stateCode}`}
                            type="button"
                            onClick={() => handleManualCityPick(c.name, c.state)}
                            className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-100'
                                : 'bg-[#081022] border-slate-800 text-slate-200 hover:border-cyan-500/35 hover:bg-slate-800/70'
                            }`}
                          >
                            <span className="truncate">
                              <span className="font-medium">{c.name}</span>
                              <span className="text-slate-400">
                                {' '}
                                · {c.state}
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-cyan-300 shrink-0">
                              {c.stateCode}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Zero GPS stored: coordinates are used transiently in memory only
                  when browser geolocation succeeds, never saved to Firebase,
                  Firestore, or browser storage. {SIMULATION_DISCLAIMER_TEXT}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pref-household"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Household Size
                </label>
                <input
                  id="pref-household"
                  type="number"
                  min={1}
                  max={15}
                  value={draft.householdSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      householdSize: Math.max(
                        1,
                        Math.min(15, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="pref-work-start"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Work / School Start
                </label>
                <input
                  id="pref-work-start"
                  type="time"
                  value={draft.workStartHour}
                  onChange={(e) =>
                    setDraft({ ...draft, workStartHour: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="pref-work-end"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Return Commute
                </label>
                <input
                  id="pref-work-end"
                  type="time"
                  value={draft.workEndHour}
                  onChange={(e) =>
                    setDraft({ ...draft, workEndHour: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pref-commute"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Default Commute Mode
                </label>
                <select
                  id="pref-commute"
                  value={draft.commuteMode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      commuteMode: e.target.value as CommuteMode,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
                >
                  <option value="metro">Metro Rail</option>
                  <option value="bus">City Bus</option>
                  <option value="carpool">Shared Carpool</option>
                  <option value="ev_cab">EV Cab / Auto</option>
                  <option value="solo_car">Private Car</option>
                  <option value="two_wheeler">Two-Wheeler</option>
                  <option value="walk_cycle">Walk / Cycle</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pref-handle"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Anonymous Community Handle
                </label>
                <input
                  id="pref-handle"
                  type="text"
                  maxLength={36}
                  value={draft.anonymousHandle}
                  onChange={(e) =>
                    setDraft({ ...draft, anonymousHandle: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hasChildren}
                  onChange={(e) =>
                    setDraft({ ...draft, hasChildren: e.target.checked })
                  }
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>Include school &amp; children outdoor schedule adaptations</span>
              </label>

              <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hasOlderAdults}
                  onChange={(e) =>
                    setDraft({ ...draft, hasOlderAdults: e.target.checked })
                  }
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>Include older adult indoor-first adjustments</span>
              </label>

              <label className="flex items-center gap-2.5 text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.pollutionSensitiveHousehold}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      pollutionSensitiveHousehold: e.target.checked,
                    })
                  }
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>
                  Pollution-sensitive household (stricter Moderate AQI thresholds, no medical info stored)
                </span>
              </label>
            </div>

            {saveError && (
              <p
                role="alert"
                className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/35 rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{saveError}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
              >
                Save Preferences
              </button>
              {savedNotice && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Preferences saved locally</span>
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Server Integration Health Panel */}
        <section className="lg:col-span-5 aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-semibold text-slate-100">
                Server Integration Health
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void loadHealth()}
              disabled={healthLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`}
              />
              <span>Check</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            All API keys are read exclusively on the Node.js server from environment
            secrets. No secrets are exposed to the browser.
          </p>

          {healthError && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              Health check failed ({healthError}).
            </p>
          )}

          <div className="divide-y divide-slate-800/80 text-xs">
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-200">
                  AERIS AI Simulation Engine
                </p>
                <p className="text-slate-400">
                  {health?.simulationEngine
                    ? `${health.simulationEngine.totalStations} stations across ${health.simulationEngine.statesCovered} States & ${health.simulationEngine.unionTerritoriesCovered} UTs (${Math.round(health.simulationEngine.intervalMs / 60000)}m interval)`
                    : 'Self-generated India-wide simulated AQI API (/api/india/aqi)'}
                </p>
              </div>
              <span className="text-amber-300 font-mono font-medium shrink-0">
                SIMULATED
              </span>
            </div>

            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-200">
                  Approximate IP City Fallback
                </p>
                <p className="text-slate-400">
                  Server-side fallback (/api/location/approximate) · zero GPS stored
                </p>
              </div>
              <span className="text-cyan-300 font-medium shrink-0">Active</span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-200">
                  Gemini AI Server Proxy
                </p>
                <p className="text-slate-400">
                  Server-side @google/genai via GEMINI_API_KEY
                </p>
              </div>
              <span
                className={
                  health?.integrations.geminiConfigured
                    ? 'text-emerald-300 font-medium'
                    : 'text-amber-300 font-medium'
                }
              >
                {health?.integrations.geminiConfigured
                  ? 'Configured'
                  : 'Key Not Set'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-200">
                  Firebase Auth &amp; Firestore
                </p>
                <p className="text-slate-400">
                  Opt-in anonymous community hub storage
                </p>
              </div>
              <span
                className={
                  health?.integrations.firebaseConfigured
                    ? 'text-emerald-300 font-medium'
                    : 'text-slate-400'
                }
              >
                {health?.integrations.firebaseConfigured
                  ? 'Configured'
                  : 'Demo Only'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
