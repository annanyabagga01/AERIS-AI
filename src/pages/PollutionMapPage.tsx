import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Database,
  Globe2,
  LocateFixed,
  Maximize2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type {
  IndiaStationMapHandle,
  MapBasemapMode,
} from '../components/IndiaStationMap.tsx';
import { MapSkeleton } from '../components/SkeletonCards.tsx';
import { buildApiUrl } from '../lib/apiClient.ts';
import {
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DISCLAIMER_TEXT,
  toStationReading,
} from '../lib/indiaSimulation.ts';
import {
  filterMapStations,
  MAP_CPCB_MARKER_SPECS,
} from '../lib/mapUtils.ts';
import type {
  AqiCategory,
  IndiaAqiApiResponse,
  StationReading,
} from '../lib/types.ts';

const LazyIndiaStationMap = lazy(
  () => import('../components/IndiaStationMap.tsx')
);

interface PollutionMapPageProps {
  activeCity: string;
  onSelectCity: (city: string) => void;
}

const CATEGORIES: ('All' | AqiCategory)[] = [
  'All',
  'Good',
  'Satisfactory',
  'Moderate',
  'Poor',
  'Very Poor',
  'Severe',
];

export function PollutionMapPage({
  activeCity,
  onSelectCity,
}: PollutionMapPageProps) {
  const [stations, setStations] = useState<StationReading[]>([]);
  const [stateOptions, setStateOptions] = useState<
    { name: string; code: string; isUnionTerritory: boolean }[]
  >([]);
  const [summaryMeta, setSummaryMeta] = useState<{
    statesCovered: number;
    unionTerritoriesCovered: number;
    generatedAt: string;
  }>({
    statesCovered: 28,
    unionTerritoriesCovered: 8,
    generatedAt: '',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | AqiCategory>('All');
  const [cityScopeActive, setCityScopeActive] = useState(false);
  const [basemap, setBasemap] = useState<MapBasemapMode>('dark');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<StationReading | null>(
    null
  );

  const abortRef = useRef<AbortController | null>(null);
  const mapHandleRef = useRef<IndiaStationMapHandle | null>(null);

  const loadStations = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl('/api/india/aqi'), {
        signal: controller.signal,
      });
      if (!res.ok) {
        let serverError = `HTTP ${res.status}`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody?.error) serverError = errBody.error;
        } catch {
          // ignore non-JSON body
        }
        throw new Error(serverError);
      }
      const json = (await res.json()) as IndiaAqiApiResponse;
      const mapped = Array.isArray(json.stations)
        ? json.stations.map(toStationReading)
        : [];

      setStations(mapped);
      setStateOptions(Array.isArray(json.states) ? json.states : []);
      if (json.summary) {
        setSummaryMeta({
          statesCovered: json.summary.statesCovered,
          unionTerritoriesCovered: json.summary.unionTerritoriesCovered,
          generatedAt: json.summary.generatedAt,
        });
      }

      setSelectedStation((prev) => {
        if (prev) {
          const refreshed = mapped.find((s) => s.id === prev.id);
          if (refreshed) return refreshed;
        }
        return (
          mapped.find((s) => s.city.toLowerCase() === activeCity.toLowerCase()) ??
          mapped[0] ??
          null
        );
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load simulated India AQI map.'
      );
    } finally {
      setLoading(false);
    }
  }, [activeCity]);

  useEffect(() => {
    void loadStations();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadStations]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const filteredStations = useMemo(() => {
    return filterMapStations(stations, {
      query: searchQuery,
      category: categoryFilter,
      state: stateFilter === 'All' ? null : stateFilter,
      cityOnly: cityScopeActive ? activeCity : null,
    });
  }, [stations, searchQuery, categoryFilter, stateFilter, cityScopeActive, activeCity]);

  const categoryCounts = useMemo(() => {
    const base = filterMapStations(stations, {
      query: searchQuery,
      category: 'All',
      state: stateFilter === 'All' ? null : stateFilter,
      cityOnly: cityScopeActive ? activeCity : null,
    });
    const counts: Record<'All' | AqiCategory, number> = {
      All: base.length,
      Good: 0,
      Satisfactory: 0,
      Moderate: 0,
      Poor: 0,
      'Very Poor': 0,
      Severe: 0,
      Unavailable: 0,
    };
    for (const st of base) {
      counts[st.category] = (counts[st.category] ?? 0) + 1;
    }
    return counts;
  }, [stations, searchQuery, stateFilter, cityScopeActive, activeCity]);

  const handleStateFilterChange = (nextState: string) => {
    setStateFilter(nextState);
    setCityScopeActive(false);
    const matching = filterMapStations(stations, {
      query: searchQuery,
      category: categoryFilter,
      state: nextState === 'All' ? null : nextState,
    });
    if (nextState === 'All') {
      mapHandleRef.current?.resetView();
    } else if (matching.length > 0) {
      mapHandleRef.current?.fitStations(matching);
      setSelectedStation(matching[0]);
    }
  };

  const handleShowMyActiveCity = () => {
    setSearchQuery('');
    setStateFilter('All');
    setCategoryFilter('All');
    setCityScopeActive(true);
    const matching = filterMapStations(stations, {
      cityOnly: activeCity,
    });
    mapHandleRef.current?.focusCity(activeCity, matching);
    if (matching.length > 0) {
      setSelectedStation(matching[0]);
    }
  };

  const handleShowAllIndia = () => {
    setSearchQuery('');
    setStateFilter('All');
    setCategoryFilter('All');
    setCityScopeActive(false);
    mapHandleRef.current?.resetView();
  };

  const handleSelectStationFromList = (station: StationReading) => {
    setSelectedStation(station);
    mapHandleRef.current?.focusStation(station);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredStations.length > 0) {
      const first = filteredStations[0];
      setSelectedStation(first);
      mapHandleRef.current?.focusStation(first);
    }
  };

  const statesOnly = useMemo(
    () => stateOptions.filter((s) => !s.isUnionTerritory),
    [stateOptions]
  );
  const utsOnly = useMemo(
    () => stateOptions.filter((s) => s.isUnionTerritory),
    [stateOptions]
  );

  return (
    <div className="space-y-4">
      {/* Transparent Simulation Notice Banner */}
      <div
        role="status"
        data-testid="map-simulation-banner"
        className="rounded-xl border border-amber-500/35 bg-amber-500/8 px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5"
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0 text-xs">
          <Database className="w-4 h-4 text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 font-mono text-[11px] font-semibold text-amber-200 mr-2">
              {SIMULATION_BADGE_TEXT}
            </span>
            <span className="text-slate-200">{SIMULATION_DISCLAIMER_TEXT}</span>
          </div>
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
          {SIMULATION_DATA_SOURCE} · {summaryMeta.statesCovered} States &amp;{' '}
          {summaryMeta.unionTerritoriesCovered} UTs
        </div>
      </div>

      {/* Main Controls Header */}
      <section className="aeris-panel rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-slate-100 leading-tight">
              India Air Monitoring Station Map
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                All {summaryMeta.statesCovered} States &amp;{' '}
                {summaryMeta.unionTerritoriesCovered} Union Territories
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-300">
                Showing {filteredStations.length} of {stations.length} stations
              </span>
              {stateFilter !== 'All' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-300">State/UT: {stateFilter}</span>
                </>
              )}
              {cityScopeActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-300">Scoped to {activeCity}</span>
                </>
              )}
            </p>
          </div>

          {/* Search + State Filter + Single-Line Compact Map Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex-1 sm:flex-none min-w-[160px]"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (cityScopeActive) setCityScopeActive(false);
                }}
                placeholder="Search city, state, station..."
                aria-label="Search city, state, or monitoring station"
                className="w-full sm:w-48 pl-8 pr-7 py-1.5 rounded-lg aeris-input text-xs text-slate-100 placeholder:text-slate-500 min-h-[38px]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            <select
              aria-label="Filter by Indian State or Union Territory"
              data-testid="map-state-filter"
              value={stateFilter}
              onChange={(e) => handleStateFilterChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg aeris-input text-xs text-slate-100 min-h-[38px] max-w-[210px]"
            >
              <option value="All">All 28 States &amp; 8 UTs</option>
              <optgroup label="States (28)">
                {statesOnly.map((st) => (
                  <option key={st.code} value={st.name}>
                    {st.name} ({st.code})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Union Territories (8)">
                {utsOnly.map((ut) => (
                  <option key={ut.code} value={ut.name}>
                    {ut.name} ({ut.code})
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              type="button"
              onClick={handleShowMyActiveCity}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors min-h-[38px] whitespace-nowrap ${
                cityScopeActive
                  ? 'border-cyan-400/55 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-[#070D1D] text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
              <span>My City ({activeCity})</span>
            </button>

            <button
              type="button"
              onClick={handleShowAllIndia}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors min-h-[38px] whitespace-nowrap ${
                !cityScopeActive &&
                stateFilter === 'All' &&
                categoryFilter === 'All' &&
                !searchQuery
                  ? 'border-cyan-400/45 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-700 bg-[#070D1D] text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>All India</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#070D1D] text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors min-h-[38px] whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>

            <button
              type="button"
              onClick={() => void loadStations()}
              disabled={loading}
              aria-label="Reload simulated stations"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#070D1D] text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-60 transition-colors min-h-[38px] whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only sm:not-sr-only">Refresh</span>
            </button>
          </div>
        </div>

        {/* Interactive AQI Category Filter Strip */}
        <div
          role="group"
          aria-label="Filter stations by CPCB AQI category"
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-2 border-t border-slate-800/80"
        >
          {CATEGORIES.map((cat) => {
            const isActive = categoryFilter === cat;
            const spec = cat === 'All' ? null : MAP_CPCB_MARKER_SPECS[cat];
            const count = categoryCounts[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  isActive
                    ? 'bg-cyan-500/18 text-cyan-100 border border-cyan-400/50'
                    : 'bg-[#070D1D] text-slate-300 border border-slate-800 hover:border-slate-600 hover:text-slate-100'
                }`}
              >
                {spec && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: spec.fillHex }}
                    aria-hidden="true"
                  />
                )}
                <span>{cat}</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-400">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Network Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-200"
        >
          <span>Simulated India AQI request failed ({error}).</span>
          <button
            type="button"
            onClick={() => void loadStations()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 font-medium text-rose-100 hover:bg-rose-500/25"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Main Geospatial Map Viewport */}
      {loading && stations.length === 0 ? (
        <MapSkeleton />
      ) : (
        <Suspense fallback={<MapSkeleton />}>
          <LazyIndiaStationMap
            ref={mapHandleRef}
            stations={filteredStations}
            selectedStation={selectedStation}
            onSelectStation={setSelectedStation}
            onSetActiveCity={onSelectCity}
            activeCity={activeCity}
            basemap={basemap}
            onBasemapChange={setBasemap}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
            hasAnyStations={stations.length > 0}
            onResetFilters={handleShowAllIndia}
          />
        </Suspense>
      )}

      {/* Nationwide Station Directory */}
      <section className="aeris-panel rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              India Simulated Station Directory ({filteredStations.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any station to pan the map and inspect simulated pollutant
              metrics ({SIMULATION_DATA_SOURCE}).
            </p>
          </div>
          {(searchQuery ||
            stateFilter !== 'All' ||
            categoryFilter !== 'All' ||
            cityScopeActive) && (
            <button
              type="button"
              onClick={handleShowAllIndia}
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
            >
              Reset filters
            </button>
          )}
        </div>

        {filteredStations.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border-t border-slate-800/80">
            No simulated stations match the active search, state, or AQI category
            filter.
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-800/80">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] font-medium text-slate-400">
                  <th className="py-2.5 pr-4">Station</th>
                  <th className="py-2.5 px-3">City / District</th>
                  <th className="py-2.5 px-3">State / UT</th>
                  <th className="py-2.5 px-3 text-right">Simulated AQI</th>
                  <th className="py-2.5 px-3 text-right">PM2.5</th>
                  <th className="py-2.5 pl-3 text-right">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredStations.map((st) => {
                  const isSelected = selectedStation?.id === st.id;
                  const spec =
                    MAP_CPCB_MARKER_SPECS[st.category] ??
                    MAP_CPCB_MARKER_SPECS.Unavailable;
                  const pm25 = st.pollutants.find((p) => p.id === 'PM2.5');

                  return (
                    <tr
                      key={st.id}
                      onClick={() => handleSelectStationFromList(st)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectStationFromList(st);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-cyan-500/12 ${
                        isSelected
                          ? 'bg-cyan-500/12 text-slate-50'
                          : 'hover:bg-slate-800/45 text-slate-200'
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-medium max-w-[230px] truncate">
                        {st.station}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                        {st.city}
                        {st.district && st.district !== st.city
                          ? ` (${st.district})`
                          : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {st.state}
                        {st.stateCode ? ` · ${st.stateCode}` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: spec.fillHex }}
                            aria-hidden="true"
                          />
                          <span className="font-semibold text-slate-100">
                            {st.officialAqi ?? 'N/A'}
                          </span>
                          <span className="text-slate-400">{st.category}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-200">
                        {pm25?.value !== null && pm25?.value !== undefined
                          ? `${pm25.value} ${pm25.unit}`
                          : 'N/A'}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono tabular-nums whitespace-nowrap text-amber-300">
                        {st.dataType ?? 'SIMULATED'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
