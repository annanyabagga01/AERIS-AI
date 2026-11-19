import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Database,
  Globe2,
  MapPin,
  RefreshCw,
  Search,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AqiStatusText } from '../components/AqiBadge.tsx';
import { CpcbHealthEnginePanel } from '../components/CpcbHealthEnginePanel.tsx';
import { EarthScene } from '../components/EarthScene.tsx';
import { DashboardSkeleton } from '../components/SkeletonCards.tsx';
import {
  classifyCpcbAqi,
  formatFreshnessLabel,
  INDIAN_CITIES,
} from '../lib/aqi.ts';
import {
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
  SIMULATION_DISCLAIMER_TEXT,
} from '../lib/indiaSimulation.ts';
import { MAP_CPCB_MARKER_SPECS } from '../lib/mapUtils.ts';
import type {
  CityAqiResponse,
  FamilyPreferences,
  IndiaAqiApiResponse,
  IndiaAqiSummary,
} from '../lib/types.ts';

interface DashboardPageProps {
  city: string;
  selectedStation: string;
  preferences: FamilyPreferences;
  onCityChange: (city: string) => void;
  onStationChange: (stationId: string) => void;
  data: CityAqiResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenAi: () => void;
  onOpenRoutines: () => void;
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: {
    state?: string;
    category?: string;
    stationCount?: number;
  };
}

function AqiChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg bg-[#060C1A]/95 border border-cyan-500/30 px-3 py-2 text-xs shadow-xl">
      <p className="font-mono text-slate-300 mb-1">
        {payload[0]?.payload?.state ?? label}
      </p>
      {payload.map((entry, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-4 font-mono tabular-nums"
        >
          <span className="text-slate-400">{entry.name}</span>
          <span className="font-semibold text-slate-100">{entry.value}</span>
        </div>
      ))}
      {payload[0]?.payload?.category && (
        <p className="text-[11px] text-slate-400 mt-1">
          Category: {payload[0].payload.category}
          {payload[0].payload.stationCount
            ? ` · ${payload[0].payload.stationCount} stn`
            : ''}
        </p>
      )}
    </div>
  );
}

export function DashboardPage({
  city,
  selectedStation,
  preferences,
  onCityChange,
  onStationChange,
  data,
  loading,
  error,
  onRetry,
  onOpenAi,
  onOpenRoutines,
}: DashboardPageProps) {
  const [indiaSummary, setIndiaSummary] = useState<IndiaAqiSummary | null>(null);
  const [indiaLoading, setIndiaLoading] = useState(true);
  const [indiaError, setIndiaError] = useState<string | null>(null);
  const [stateScope, setStateScope] = useState<'all' | 'states' | 'uts'>('all');
  const [stateSearch, setStateSearch] = useState('');

  const loadIndiaOverview = useCallback(async () => {
    setIndiaLoading(true);
    setIndiaError(null);
    try {
      const res = await fetch('/api/india/aqi');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as IndiaAqiApiResponse;
      setIndiaSummary(json.summary ?? null);
    } catch (err) {
      setIndiaError(
        err instanceof Error
          ? err.message
          : 'Unable to load India-wide simulated overview.'
      );
    } finally {
      setIndiaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIndiaOverview();
  }, [loadIndiaOverview]);

  const handleRefreshAll = () => {
    onRetry();
    void loadIndiaOverview();
  };

  const filteredStateComparison = useMemo(() => {
    const list = indiaSummary?.stateComparison ?? [];
    const q = stateSearch.trim().toLowerCase();
    return list.filter((item) => {
      if (stateScope === 'states' && item.isUnionTerritory) return false;
      if (stateScope === 'uts' && !item.isUnionTerritory) return false;
      if (!q) return true;
      return (
        item.state.toLowerCase().includes(q) ||
        item.state_code.toLowerCase().includes(q) ||
        item.region.toLowerCase().includes(q) ||
        item.representativeCity.toLowerCase().includes(q)
      );
    });
  }, [indiaSummary, stateScope, stateSearch]);

  const chartStates = useMemo(() => {
    // Show top 12 highest-AQI states/UTs + lowest 4 for balanced national comparison
    const all = indiaSummary?.stateComparison ?? [];
    if (all.length <= 16) return all;
    return [...all.slice(0, 12), ...all.slice(-4)];
  }, [indiaSummary]);

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="aeris-panel rounded-xl p-10 text-center space-y-4 max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-100">
          Unable to Load Simulated Air Quality Data
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          {error}
        </p>
        <button
          type="button"
          onClick={handleRefreshAll}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Fetch</span>
        </button>
      </div>
    );
  }

  if (!data) return null;

  const activeStation =
    (data.selectedStationId
      ? data.stations.find((s) => s.id === data.selectedStationId)
      : undefined) ?? data.stations[0];

  const getPollutant = (id: string) =>
    activeStation?.pollutants.find((p) => p.id === id);

  const pm25 = getPollutant('PM2.5');
  const pm10 = getPollutant('PM10');
  const no2 = getPollutant('NO2');
  const ozone = getPollutant('OZONE');

  const kpiCards = [
    {
      label: 'PM2.5 Fine Particulate',
      value: pm25?.value ?? null,
      unit: pm25?.unit ?? 'µg/m³',
      naaqsLimit: 60,
      range:
        pm25 && pm25.min !== null && pm25.max !== null
          ? `${pm25.min}–${pm25.max}`
          : 'N/A',
      accentBar: 'from-cyan-400 to-amber-400',
    },
    {
      label: 'PM10 Coarse Particulate',
      value: pm10?.value ?? null,
      unit: pm10?.unit ?? 'µg/m³',
      naaqsLimit: 100,
      range:
        pm10 && pm10.min !== null && pm10.max !== null
          ? `${pm10.min}–${pm10.max}`
          : 'N/A',
      accentBar: 'from-cyan-400 to-emerald-400',
    },
    {
      label: 'Nitrogen Dioxide (NO2)',
      value: no2?.value ?? null,
      unit: no2?.unit ?? 'µg/m³',
      naaqsLimit: 80,
      range:
        no2 && no2.min !== null && no2.max !== null
          ? `${no2.min}–${no2.max}`
          : 'N/A',
      accentBar: 'from-sky-400 to-cyan-300',
    },
    {
      label: 'Surface Ozone (O3)',
      value: ozone?.value ?? null,
      unit: ozone?.unit ?? 'µg/m³',
      naaqsLimit: 100,
      range:
        ozone && ozone.min !== null && ozone.max !== null
          ? `${ozone.min}–${ozone.max}`
          : 'N/A',
      accentBar: 'from-emerald-400 to-teal-300',
    },
  ];

  const aqiRatio =
    data.primaryAqi !== null
      ? Math.min(100, Math.round((data.primaryAqi / 500) * 100))
      : 0;

  const avgNationalMeta = indiaSummary
    ? classifyCpcbAqi(indiaSummary.averageAqi)
    : null;

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          data-testid="dashboard-inline-error"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-200"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Refresh failed ({error}). Showing last loaded simulated readings for{' '}
              {data.city}.
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 font-medium text-rose-100 hover:bg-rose-500/25 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Mandatory Transparent Simulation Notice Banner */}
      <section
        aria-label="Simulated data mode notice"
        data-testid="simulation-transparency-banner"
        className="rounded-xl border border-amber-500/35 bg-amber-500/8 px-4 py-3.5 space-y-2.5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 text-xs text-slate-200">
            <Database className="w-4 h-4 text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
            <div className="space-y-1 sm:space-y-0">
              <span
                data-testid="data-mode-label"
                className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 font-mono text-[11px] font-semibold text-amber-200 mr-2"
              >
                {SIMULATION_BADGE_TEXT}
              </span>
              <span className="text-slate-200">
                {SIMULATION_DISCLAIMER_TEXT}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={loading || indiaLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-[#070D1D] text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loading || indiaLoading ? 'animate-spin' : ''
                }`}
              />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        <div
          data-testid="source-health-strip"
          className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-300"
        >
          <span>
            <strong className="text-slate-200 font-medium">Data Source:</strong>{' '}
            {SIMULATION_DATA_SOURCE}
          </span>
          <span>
            <strong className="text-slate-200 font-medium">Data Type:</strong>{' '}
            <span className="font-mono text-amber-300">{SIMULATION_DATA_TYPE}</span>
          </span>
          <span className="font-mono tabular-nums text-slate-300">
            Snapshot: {formatFreshnessLabel(data.lastUpdatedIso)} (15-min deterministic interval)
          </span>
        </div>
      </section>

      {/* India-Wide Simulated Overview (Calculated strictly from GET /api/india/aqi) */}
      <section
        aria-label="India-wide simulated air quality overview"
        data-testid="india-national-overview"
        className="aeris-panel rounded-xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-800/80">
          <div>
            <p className="text-xs font-medium text-cyan-400 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 shrink-0" />
              <span>National Environmental Simulation Overview</span>
            </p>
            <h2 className="text-lg font-semibold text-slate-100 mt-0.5">
              All-India Simulated AQI Analytics (28 States &amp; 8 Union Territories)
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-amber-300">
            {SIMULATION_BADGE_TEXT}
          </span>
        </div>

        {indiaError && !indiaSummary ? (
          <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-200 flex items-center justify-between gap-3">
            <span>Unable to load national summary ({indiaError}).</span>
            <button
              type="button"
              onClick={() => void loadIndiaOverview()}
              className="px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 text-rose-100 font-medium"
            >
              Retry
            </button>
          </div>
        ) : indiaSummary ? (
          <>
            {/* 6 National KPI Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div
                data-testid="stat-total-stations"
                className="aeris-subcard rounded-lg p-3.5 space-y-1"
              >
                <p className="text-[11px] text-slate-400">Simulated Stations</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-50">
                  {indiaSummary.totalStations}
                </p>
                <p className="text-[11px] text-slate-500">Nationwide grid</p>
              </div>

              <div
                data-testid="stat-states-covered"
                className="aeris-subcard rounded-lg p-3.5 space-y-1"
              >
                <p className="text-[11px] text-slate-400">States Covered</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-cyan-300">
                  {indiaSummary.statesCovered}
                </p>
                <p className="text-[11px] text-slate-500">All 28 Indian states</p>
              </div>

              <div
                data-testid="stat-uts-covered"
                className="aeris-subcard rounded-lg p-3.5 space-y-1"
              >
                <p className="text-[11px] text-slate-400">Union Territories</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
                  {indiaSummary.unionTerritoriesCovered}
                </p>
                <p className="text-[11px] text-slate-500">All 8 UTs covered</p>
              </div>

              <div
                data-testid="stat-average-aqi"
                className="aeris-subcard rounded-lg p-3.5 space-y-1"
              >
                <p className="text-[11px] text-slate-400">Average Simulated AQI</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-50">
                  {indiaSummary.averageAqi}
                </p>
                <p
                  className={`text-[11px] font-medium ${
                    avgNationalMeta?.textClass ?? 'text-slate-400'
                  }`}
                >
                  {avgNationalMeta?.category ?? 'N/A'} (Demo)
                </p>
              </div>

              <button
                type="button"
                data-testid="stat-highest-aqi"
                onClick={() => {
                  if (indiaSummary.highestStation) {
                    onCityChange(indiaSummary.highestStation.city);
                  }
                }}
                className="aeris-subcard rounded-lg p-3.5 space-y-1 text-left hover:border-rose-500/45 transition-colors"
              >
                <p className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                  <span>Highest AQI</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-rose-300">
                  {indiaSummary.highestStation?.aqi ?? 'N/A'}
                </p>
                <p className="text-[11px] text-slate-300 truncate">
                  {indiaSummary.highestStation
                    ? `${indiaSummary.highestStation.city}, ${indiaSummary.highestStation.state_code}`
                    : '—'}
                </p>
              </button>

              <button
                type="button"
                data-testid="stat-lowest-aqi"
                onClick={() => {
                  if (indiaSummary.lowestStation) {
                    onCityChange(indiaSummary.lowestStation.city);
                  }
                }}
                className="aeris-subcard rounded-lg p-3.5 space-y-1 text-left hover:border-emerald-500/45 transition-colors"
              >
                <p className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                  <span>Lowest AQI</span>
                  <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
                  {indiaSummary.lowestStation?.aqi ?? 'N/A'}
                </p>
                <p className="text-[11px] text-slate-300 truncate">
                  {indiaSummary.lowestStation
                    ? `${indiaSummary.lowestStation.city}, ${indiaSummary.lowestStation.state_code}`
                    : '—'}
                </p>
              </button>
            </div>

            {/* Category Distribution + State-Wise Comparison Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
              {/* AQI Category Distribution */}
              <div
                data-testid="category-distribution-card"
                className="lg:col-span-5 aeris-subcard rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    AQI Category Distribution
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {indiaSummary.totalStations} stations
                  </span>
                </div>
                <div className="space-y-2.5">
                  {indiaSummary.categoryDistribution.map((item) => {
                    const spec = MAP_CPCB_MARKER_SPECS[item.category];
                    return (
                      <div key={item.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2 text-slate-200">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: spec.fillHex }}
                              aria-hidden="true"
                            />
                            <span>{item.category}</span>
                            <span className="text-[11px] font-mono text-slate-500">
                              ({spec.rangeLabel})
                            </span>
                          </span>
                          <span className="font-mono tabular-nums text-slate-300">
                            {item.count}{' '}
                            <span className="text-slate-500">
                              ({item.percentage}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(item.count > 0 ? 4 : 0, item.percentage)}%`,
                              backgroundColor: spec.fillHex,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* State-Wise AQI Comparison Bar Chart */}
              <div
                data-testid="state-comparison-chart"
                className="lg:col-span-7 aeris-subcard rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>State &amp; UT Simulated AQI Comparison</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Highest &amp; cleanest states/UTs across India (click any state row below to inspect)
                    </p>
                  </div>
                </div>
                <div className="h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" debounce={50}>
                    <BarChart
                      data={chartStates}
                      margin={{ top: 6, right: 6, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(148,163,184,0.1)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="state_code"
                        stroke="#94A3B8"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#64748B"
                        fontSize={11}
                        tickLine={false}
                        domain={[0, 500]}
                      />
                      <Tooltip content={<AqiChartTooltip />} />
                      <Bar
                        dataKey="averageAqi"
                        name="Avg Simulated AQI"
                        radius={[4, 4, 0, 0]}
                      >
                        {chartStates.map((entry) => (
                          <Cell
                            key={entry.state_code}
                            fill={
                              MAP_CPCB_MARKER_SPECS[entry.category]?.fillHex ??
                              '#22D3EE'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Filterable All-36 State & UT Comparison Table */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: `All (${indiaSummary.stateComparison.length})` },
                      { id: 'states', label: `States (${indiaSummary.statesCovered})` },
                      {
                        id: 'uts',
                        label: `UTs (${indiaSummary.unionTerritoriesCovered})`,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStateScope(tab.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        stateScope === tab.id
                          ? 'bg-cyan-500/18 border-cyan-400/50 text-cyan-100'
                          : 'bg-[#070D1D] border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={stateSearch}
                    onChange={(e) => setStateSearch(e.target.value)}
                    placeholder="Filter state, UT, region..."
                    aria-label="Filter state or Union Territory"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg aeris-input text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-slate-800/80 bg-[#060C1A]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#070D1D] border-b border-slate-800 text-[11px] text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">State / UT</th>
                      <th className="py-2.5 px-3">Region</th>
                      <th className="py-2.5 px-3 text-right">Stations</th>
                      <th className="py-2.5 px-3 text-right">Avg AQI</th>
                      <th className="py-2.5 px-3 text-right">Min–Max</th>
                      <th className="py-2.5 px-3">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredStateComparison.map((row) => {
                      const spec = MAP_CPCB_MARKER_SPECS[row.category];
                      return (
                        <tr
                          key={row.state_code}
                          onClick={() => onCityChange(row.representativeCity)}
                          className="cursor-pointer hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-2 px-3 font-medium text-slate-100 whitespace-nowrap">
                            {row.state}{' '}
                            <span className="font-mono text-[10px] text-slate-400">
                              ({row.state_code})
                            </span>
                            {row.isUnionTerritory && (
                              <span className="ml-1.5 text-[10px] text-cyan-300">
                                UT
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                            {row.region}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                            {row.stationCount}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-100">
                            {row.averageAqi}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                            {row.minAqi}–{row.maxAqi}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-slate-200">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: spec.fillHex }}
                                aria-hidden="true"
                              />
                              <span>{row.category}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            Loading nationwide simulated analytics...
          </div>
        )}
      </section>

      {/* Hero Split: City Telemetry & Interactive 3D Earth */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-4 pb-5 border-b border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-300 mb-1">
                  Simulated AQI · CPCB Category Scale (Demo)
                </p>
                <h2 className="text-2xl font-semibold text-slate-100 flex items-center gap-2 tracking-tight">
                  <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>
                    {data.city}, {data.state}
                  </span>
                </h2>
              </div>

              <div className="text-[11px] font-medium text-slate-400">
                {data.selectedStationName
                  ? `Focused Station: ${data.selectedStationName}`
                  : `City Aggregate (${data.stations.length} stations)`}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="dashboard-city-select"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Indian City ({INDIAN_CITIES.length} cities across 28 States &amp; 8 UTs)
                </label>
                <select
                  id="dashboard-city-select"
                  value={city}
                  onChange={(e) => onCityChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg aeris-input text-sm text-slate-100"
                >
                  {INDIAN_CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.state})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="dashboard-station-select"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Simulated Monitoring Station
                </label>
                <select
                  id="dashboard-station-select"
                  value={selectedStation}
                  onChange={(e) => onStationChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg aeris-input text-sm text-slate-100"
                >
                  <option value="all">
                    All City Stations ({data.stations.length})
                  </option>
                  {data.stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.station} — AQI {st.officialAqi ?? 'N/A'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div>
              <div className="flex items-baseline gap-3">
                <span
                  data-testid="primary-aqi-value"
                  className="text-5xl sm:text-6xl font-bold font-mono tabular-nums tracking-tight text-slate-50"
                >
                  {data.primaryAqi !== null ? data.primaryAqi : 'N/A'}
                </span>
                <span className="text-xs text-amber-300 font-mono">
                  SIMULATED AQI
                </span>
              </div>
              <div className="mt-2">
                <AqiStatusText aqi={data.primaryAqi} />
              </div>

              {/* CPCB 0–500 Scale Meter */}
              <div className="mt-3 space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${aqiRatio}%`,
                      backgroundColor: data.categoryMeta.accentHex,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500">
                  <span>0 Good</span>
                  <span>200 Mod</span>
                  <span>500 Severe</span>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                {data.categoryMeta.advisorySummary}
              </p>
            </div>

            <div className="space-y-3 text-xs border-t sm:border-t-0 sm:border-l border-slate-800/80 pt-4 sm:pt-0 sm:pl-6">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">
                  {data.selectedStationName ? 'Selected Station' : 'Primary Station'}
                </span>
                <span
                  data-testid="active-station-label"
                  className="text-slate-200 font-medium text-right truncate max-w-[210px]"
                >
                  {activeStation?.station ?? 'Unavailable'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">District / State</span>
                <span className="text-slate-200 text-right truncate max-w-[210px]">
                  {data.district ? `${data.district}, ` : ''}
                  {data.stateCode ?? data.state}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Predominant Pollutant</span>
                <span className="font-mono text-cyan-300">
                  {data.predominantPollutant ?? 'Unavailable'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Data Source</span>
                <span className="text-slate-200 text-right whitespace-nowrap">
                  {SIMULATION_DATA_SOURCE}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Data Type</span>
                <span className="font-mono text-amber-300">
                  {SIMULATION_DATA_TYPE}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              <span>Simulated Snapshot: </span>
              <span className="font-mono tabular-nums text-slate-300">
                {new Date(data.lastUpdatedIso).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenAi}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors whitespace-nowrap"
            >
              <Wind className="w-4 h-4" />
              <span>Ask Gemini Smog Advisor</span>
            </button>
          </div>
        </section>

        <div className="lg:col-span-5 min-h-[320px]">
          <EarthScene
            city={data.city}
            state={data.state}
            lat={data.lat}
            lng={data.lng}
            aqi={data.primaryAqi}
            category={data.category}
            pm25={pm25?.value ?? null}
            pm25Unit={pm25?.unit ?? 'µg/m³'}
            lastUpdatedIso={data.lastUpdatedIso}
            hasOfficialData={false}
            dataMode="demo"
            stations={data.stations}
            selectedStationId={selectedStation === 'all' ? null : selectedStation}
            onSelectStation={onStationChange}
            onSelectCity={onCityChange}
          />
        </div>
      </div>

      {/* 4-Column Pollutant KPI Strip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Simulated Pollutant Breakdown —{' '}
            <strong className="text-slate-200 font-medium">
              {activeStation?.station ?? data.city}
            </strong>
          </span>
          <span className="font-mono text-amber-300">
            Simulated Demonstration Units
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => {
            const pct =
              kpi.value !== null
                ? Math.min(
                    100,
                    Math.round((kpi.value / (kpi.naaqsLimit * 2.5)) * 100)
                  )
                : 0;
            return (
              <div
                key={kpi.label}
                className="aeris-panel-interactive rounded-xl p-5 flex flex-col justify-between gap-2.5"
              >
                <p className="text-xs text-slate-400 truncate">{kpi.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-50">
                    {kpi.value !== null ? kpi.value : 'N/A'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {kpi.unit}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-1 w-full rounded-full bg-slate-800/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${kpi.accentBar} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono tabular-nums flex justify-between gap-2">
                    <span>Min–Max: {kpi.range}</span>
                    <span>Ref std {kpi.naaqsLimit}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* India-Specific CPCB Health Recommendation Engine */}
      <CpcbHealthEnginePanel
        aqiData={data}
        preferences={preferences}
        onOpenAi={onOpenAi}
        onOpenRoutines={onOpenRoutines}
      />

      {/* 24-Hour Simulated Diurnal Curve + City Stations Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 aeris-panel rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              24-Hour Simulated Diurnal Curve
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Deterministic diurnal demonstration curve for {data.city} (not actual sensor history or forecasts)
            </p>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <AreaChart data={data.trend24h}>
                <defs>
                  <linearGradient id="aqiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pm25Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.1)"
                />
                <XAxis
                  dataKey="label"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip content={<AqiChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="aqi"
                  name="Simulated AQI"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  fill="url(#aqiGrad)"
                  isAnimationActive={true}
                  animationDuration={650}
                  animationEasing="ease-out"
                />
                <Area
                  type="monotone"
                  dataKey="pm25"
                  name="PM2.5 (µg/m³)"
                  stroke="#10B981"
                  strokeWidth={1.75}
                  fill="url(#pm25Grad)"
                  isAnimationActive={true}
                  animationDuration={750}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-6 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Simulated Stations in {data.city}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select any station to inspect its simulated pollutant telemetry
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {data.stations.length} station(s)
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {data.stations.map((st) => {
              const cat = classifyCpcbAqi(st.officialAqi);
              const isSelected = data.selectedStationId === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onStationChange(isSelected ? 'all' : st.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left py-3.5 px-3 -mx-1 rounded-lg flex items-center justify-between gap-4 transition-all ${
                    isSelected
                      ? 'bg-cyan-500/12 border border-cyan-500/35 shadow-[inset_0_1px_0_rgba(103,232,249,0.12)]'
                      : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {st.station}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span className="text-amber-300 font-mono">SIMULATED</span>
                      <span aria-hidden="true">·</span>
                      <span>{st.district ?? st.city}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatFreshnessLabel(st.lastUpdatedIso)}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold font-mono tabular-nums text-slate-100">
                      {st.officialAqi !== null ? st.officialAqi : 'N/A'}
                    </p>
                    <p className={`text-xs font-medium ${cat.textClass}`}>
                      {cat.category}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
