import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MapPin, RefreshCw, Search } from 'lucide-react';
import { AqiStatusText } from '../components/AqiBadge.tsx';
import { MapSkeleton } from '../components/SkeletonCards.tsx';
import { classifyCpcbAqi, formatFreshnessLabel } from '../lib/aqi.ts';
import type { AqiCategory, StationReading } from '../lib/types.ts';

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
  'Unavailable',
];

// Project India lat/lng bounds (67°E–98°E, 7°N–37°N) to SVG 640x680 viewBox
function projectIndia(lat: number, lng: number): { x: number; y: number } {
  const minLng = 67;
  const maxLng = 98;
  const minLat = 7;
  const maxLat = 37;
  const x = ((lng - minLng) / (maxLng - minLng)) * 560 + 40;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 600 + 40;
  return { x, y };
}

export function PollutionMapPage({
  activeCity,
  onSelectCity,
}: PollutionMapPageProps) {
  const [stations, setStations] = useState<StationReading[]>([]);
  const [dataMode, setDataMode] = useState<'live' | 'demo'>('demo');
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | AqiCategory>('All');
  const [selectedStation, setSelectedStation] = useState<StationReading | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);

  const loadStations = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/aqi/all', { signal: controller.signal });
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
      const json = (await res.json()) as {
        dataMode: 'live' | 'demo';
        stations: StationReading[];
        disclaimer: string;
      };
      setStations(json.stations);
      setDataMode(json.dataMode);
      setDisclaimer(json.disclaimer);
      const match =
        json.stations.find(
          (s) => s.city.toLowerCase() === activeCity.toLowerCase()
        ) ?? json.stations[0] ?? null;
      setSelectedStation(match);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(
        err instanceof Error ? err.message : 'Unable to load station map.'
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stations.filter((s) => {
      if (categoryFilter !== 'All' && s.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.station.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q)
      );
    });
  }, [stations, searchQuery, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="aeris-panel rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            India Air Monitoring Station Map
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {disclaimer ||
              (dataMode === 'live'
                ? 'Live CPCB station markers'
                : 'Demo Reference Markers (Not Live)')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city or station..."
              aria-label="Search monitoring station"
              className="pl-9 pr-3 py-2 rounded-lg aeris-input text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as 'All' | AqiCategory)
            }
            aria-label="Filter by CPCB category"
            className="px-3 py-2 rounded-lg aeris-input text-sm text-slate-100"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                Category: {cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadStations()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-[#070D1D] text-sm text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {error && stations.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-200"
        >
          <span>Map reload failed ({error}). Showing previously loaded markers.</span>
          <button
            type="button"
            onClick={() => void loadStations()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 font-medium text-rose-100 hover:bg-rose-500/25"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Map</span>
          </button>
        </div>
      )}

      {loading && stations.length === 0 ? (
        <MapSkeleton />
      ) : error && stations.length === 0 ? (
        <div className="aeris-panel rounded-xl p-10 text-center space-y-4 max-w-xl mx-auto">
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-sm font-medium text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadStations()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Map</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Interactive Geospatial Station Plot */}
          <div className="lg:col-span-7 aeris-panel rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>Interactive India Station Coordinates (67°E–98°E, 7°N–37°N)</span>
              <span className="font-mono tabular-nums">
                Showing {filtered.length} markers
              </span>
            </div>

            <div className="relative flex-1 min-h-[420px] rounded-lg bg-[#050A17] border border-cyan-500/20 overflow-hidden">
              <svg
                viewBox="0 0 640 680"
                className="w-full h-full max-h-[540px]"
                role="img"
                aria-label="Map of Indian air quality monitoring stations"
              >
                {/* Graticule grid */}
                {[120, 240, 360, 480].map((x) => (
                  <line
                    key={`vx-${x}`}
                    x1={x}
                    y1={20}
                    x2={x}
                    y2={660}
                    stroke="rgba(148,163,184,0.08)"
                  />
                ))}
                {[140, 280, 420, 560].map((y) => (
                  <line
                    key={`hy-${y}`}
                    x1={20}
                    y1={y}
                    x2={620}
                    y2={y}
                    stroke="rgba(148,163,184,0.08)"
                  />
                ))}

                {/* Coordinate-aligned India silhouette (67°E-98°E, 7°N-37°N) */}
                <path
                  d="M 192 58 L 245 48 L 285 95 L 308 152 L 385 212 L 455 216 L 510 198 L 575 210 L 588 265 L 542 328 L 485 308 L 462 355 L 408 392 L 352 458 L 305 538 L 260 618 L 236 626 L 208 552 L 178 468 L 146 384 L 94 335 L 72 292 L 106 254 L 154 218 L 166 154 Z"
                  fill="rgba(22, 56, 89, 0.35)"
                  stroke="rgba(56, 189, 248, 0.4)"
                  strokeWidth="2"
                />

                {filtered.map((st) => {
                  const { x, y } = projectIndia(st.lat, st.lng);
                  const meta = classifyCpcbAqi(st.officialAqi);
                  const isSelected = selectedStation?.id === st.id;
                  return (
                    <g key={st.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? 14 : 9}
                        fill={meta.accentHex}
                        fillOpacity={isSelected ? 0.35 : 0.22}
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? 7 : 5}
                        fill={meta.accentHex}
                        stroke="#060A13"
                        strokeWidth={1.5}
                        role="button"
                        tabIndex={0}
                        aria-label={`${st.station}, ${st.city}, AQI ${st.officialAqi ?? 'Unavailable'}`}
                        aria-pressed={isSelected}
                        className="cursor-pointer focus:outline-none focus:stroke-cyan-300 focus:stroke-2"
                        onClick={() => setSelectedStation(st)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedStation(st);
                          }
                        }}
                      />
                      {isSelected && (
                        <text
                          x={x + 12}
                          y={y + 4}
                          fill="#F1F5F9"
                          fontSize="12"
                          fontFamily="DM Sans, sans-serif"
                          fontWeight="600"
                        >
                          {st.city} ({st.officialAqi ?? 'N/A'})
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Selected Station Inspector + Scrollable Station List */}
          <div className="lg:col-span-5 space-y-4">
            {selectedStation ? (
              <section className="aeris-panel rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-cyan-400 font-medium">
                      Selected Station Telemetry
                    </p>
                    <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                      {selectedStation.station}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedStation.city}, {selectedStation.state} ·{' '}
                      <span className="font-mono tabular-nums">
                        {selectedStation.lat.toFixed(3)}°N,{' '}
                        {selectedStation.lng.toFixed(3)}°E
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold font-mono tabular-nums text-slate-50">
                      {selectedStation.officialAqi ?? 'N/A'}
                    </span>
                    <p className="text-[11px] text-slate-400">CPCB AQI</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-y border-slate-800/80 text-xs">
                  <AqiStatusText aqi={selectedStation.officialAqi} compact />
                  <span className="text-slate-400 font-mono tabular-nums">
                    {formatFreshnessLabel(selectedStation.lastUpdatedIso)} ·{' '}
                    {selectedStation.isStale ? 'Stale' : 'Fresh'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {selectedStation.pollutants.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-lg bg-[#080E1C] border border-slate-800/80"
                    >
                      <p className="text-[11px] text-slate-400">{p.label}</p>
                      <p className="text-sm font-mono font-semibold tabular-nums text-slate-100 mt-0.5">
                        {p.value ?? 'N/A'}{' '}
                        <span className="text-[10px] text-slate-500">{p.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-slate-400">
                    Source: {selectedStation.sourceLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectCity(selectedStation.city)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors whitespace-nowrap"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Set Active City</span>
                  </button>
                </div>
              </section>
            ) : (
              <div className="aeris-panel rounded-xl p-6 text-center text-sm text-slate-400">
                Select a station marker to inspect pollutant concentrations.
              </div>
            )}

            <section className="aeris-panel rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">
                Station Directory ({filtered.length})
              </h3>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/80 pr-1">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No stations match your search or category filter.
                  </p>
                ) : (
                  filtered.map((st) => {
                    const cat = classifyCpcbAqi(st.officialAqi);
                    const active = selectedStation?.id === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStation(st)}
                        className={`w-full text-left py-2.5 px-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                          active ? 'bg-cyan-500/10' : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-100 truncate">
                            {st.station}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {st.city} · {st.isDemo ? 'Demo' : 'CPCB'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-mono font-semibold tabular-nums text-slate-100">
                            {st.officialAqi ?? 'N/A'}
                          </span>
                          <p className={`text-[11px] ${cat.textClass}`}>
                            {cat.category}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
