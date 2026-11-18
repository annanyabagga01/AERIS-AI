import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  MapPin,
  RefreshCw,
  Server,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import type {
  CityAqiResponse,
  FamilyPreferences,
  SourceHealthEntry,
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

function sourceStatusTextClass(status: SourceHealthEntry['status']): string {
  if (status === 'live') return 'text-emerald-300';
  if (status === 'error') return 'text-rose-300';
  if (status === 'demo' || status === 'unconfigured') return 'text-amber-300';
  return 'text-slate-400';
}

function sourceStatusLabel(entry: SourceHealthEntry): string {
  if (entry.status === 'live') {
    return entry.cacheHit ? 'Live (Cached)' : 'Live';
  }
  if (entry.status === 'error') return 'Error';
  if (entry.status === 'demo') return 'Demo Fallback';
  return entry.sourceId === 'cpcb' ? 'Unconfigured (Demo)' : 'Optional / Off';
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
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
      <p className="font-mono text-slate-300 mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-4 font-mono tabular-nums"
        >
          <span className="text-slate-400">{entry.name}</span>
          <span className="font-semibold text-slate-100">{entry.value}</span>
        </div>
      ))}
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
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);

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
          Unable to Load Air Quality Telemetry
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
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
      unitNote:
        pm25?.unitCompatibleWithCpcb === false ? 'Non-CPCB unit preserved' : null,
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
      unitNote:
        pm10?.unitCompatibleWithCpcb === false ? 'Non-CPCB unit preserved' : null,
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
      unitNote:
        no2?.unitCompatibleWithCpcb === false ? 'Non-CPCB unit preserved' : null,
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
      unitNote:
        ozone?.unitCompatibleWithCpcb === false
          ? 'Non-CPCB unit preserved'
          : null,
      accentBar: 'from-emerald-400 to-teal-300',
    },
  ];

  const cpcbHealth = data.sourceHealth?.cpcb;
  const openAqHealth = data.sourceHealth?.openAq;
  const showSetupPrompt = !cpcbHealth?.configured || cpcbHealth?.status === 'error';

  const aqiRatio =
    data.primaryAqi !== null
      ? Math.min(100, Math.round((data.primaryAqi / 500) * 100))
      : 0;

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
              Refresh failed ({error}). Showing last retrieved readings for{' '}
              {data.city}.
            </span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 font-medium text-rose-100 hover:bg-rose-500/25 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Data Source, Health & Freshness Banner */}
      <section
        aria-label="Data source health and mode"
        className="aeris-panel rounded-xl px-4 py-3.5 space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 text-xs text-slate-300">
            <Database className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span
                data-testid="data-mode-label"
                className={
                  data.dataMode === 'live'
                    ? 'font-semibold text-emerald-300'
                    : data.dataMode === 'partial'
                    ? 'font-semibold text-cyan-300'
                    : 'font-semibold text-amber-300'
                }
              >
                {data.dataMode === 'live'
                  ? 'Live Official CPCB Mode'
                  : data.dataMode === 'partial'
                  ? data.hasOfficialData
                    ? 'Live CPCB Mode (Incomplete AQI)'
                    : 'Demo Baseline + OpenAQ Sensor Feed'
                  : 'Demo Reference Mode (Not Live)'}
              </span>
              <span aria-hidden="true" className="mx-2 text-slate-600">
                ·
              </span>
              <span className="text-slate-400">{data.sourceDisclaimer}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {showSetupPrompt && (
              <button
                type="button"
                onClick={() => setSetupGuideOpen((v) => !v)}
                aria-expanded={setupGuideOpen}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Live Data Setup Guide</span>
                {setupGuideOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onRetry}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-[#070D1D] text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Source-Health Diagnostics Strip */}
        <div
          data-testid="source-health-strip"
          className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-400"
        >
          <span className="inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-300 font-medium">
              CPCB (data.gov.in):
            </span>
            <span
              className={
                cpcbHealth
                  ? sourceStatusTextClass(cpcbHealth.status)
                  : 'text-amber-300'
              }
            >
              {cpcbHealth ? sourceStatusLabel(cpcbHealth) : 'Demo Fallback'}
            </span>
            {cpcbHealth?.discoveredSchemaFields &&
              cpcbHealth.discoveredSchemaFields.length > 0 && (
                <span className="font-mono text-slate-500">
                  ({cpcbHealth.discoveredSchemaFields.length} schema fields)
                </span>
              )}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="text-slate-300 font-medium">OpenAQ v3:</span>
            <span
              className={
                openAqHealth
                  ? sourceStatusTextClass(openAqHealth.status)
                  : 'text-slate-400'
              }
            >
              {openAqHealth ? sourceStatusLabel(openAqHealth) : 'Optional / Off'}
            </span>
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="text-slate-300 font-medium">Freshness:</span>
            <span
              className={
                data.staleStationsCount > 0 ? 'text-amber-300' : 'text-emerald-300'
              }
            >
              {data.staleStationsCount > 0
                ? `${data.staleStationsCount} stale (>3h)`
                : 'Current (<3h)'}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              Updated {formatFreshnessLabel(data.lastUpdatedIso)}
            </span>
          </span>
        </div>

        {/* Collapsible Server-Side Credentials Setup Guide */}
        {setupGuideOpen && (
          <div
            data-testid="live-setup-guide"
            className="mt-2 p-4 rounded-lg aeris-subcard text-xs text-slate-300 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-100">
                Server-Side Live Air Quality Setup Guide
              </p>
              <span className="text-[11px] text-slate-400">
                Secrets stay on the Node.js server only
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              AERIS AI reads official credentials from server environment secrets
              (never in browser localStorage or UI forms). To switch from Demo
              Reference Mode to Live CPCB data:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>
                Register at{' '}
                <span className="font-mono text-cyan-300">data.gov.in</span> and
                locate the official CPCB Real-Time Air Quality Index resource ID.
              </li>
              <li>
                Add{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-900 font-mono text-cyan-300">
                  DATA_GOV_IN_API_KEY
                </code>{' '}
                and{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-900 font-mono text-cyan-300">
                  DATA_GOV_IN_RESOURCE_ID
                </code>{' '}
                to your server environment secrets.
              </li>
              <li>
                Optionally set{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-900 font-mono text-emerald-300">
                  OPENAQ_API_KEY
                </code>{' '}
                for supplementary sensor-level readings (displayed separately from
                CPCB National AQI).
              </li>
            </ol>
            {cpcbHealth?.error && (
              <p className="text-rose-300 font-mono text-[11px]">
                Last server error: {cpcbHealth.error}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Hero Split: Verified AQI Telemetry & Interactive 3D Earth */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-4 pb-5 border-b border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-cyan-400 mb-1">
                  Indian National AQI (CPCB Standard)
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
                  City
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
                  Monitoring Station
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
                <span className="text-xs text-slate-400 font-mono">
                  CPCB AQI {!data.hasOfficialData ? '(DEMO)' : ''}
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
                <span className="text-slate-400">Predominant Pollutant</span>
                <span className="font-mono text-cyan-300">
                  {data.predominantPollutant ?? 'Unavailable'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Last Updated</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {formatFreshnessLabel(data.lastUpdatedIso)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Data Source</span>
                <span className="text-slate-200 text-right whitespace-nowrap">
                  {activeStation?.isDemo ? 'Demo Reference' : 'CPCB / data.gov.in'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Station Freshness</span>
                <span
                  className={
                    activeStation?.isStale ? 'text-amber-300' : 'text-emerald-300'
                  }
                >
                  {activeStation?.isStale
                    ? 'Stale (>3h old)'
                    : 'Within 3h window'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              <span>Timestamp: </span>
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
            lat={data.lat}
            lng={data.lng}
            aqi={data.primaryAqi}
            category={data.category}
          />
        </div>
      </div>

      {/* 4-Column Pollutant KPI Strip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Pollutant Breakdown —{' '}
            <strong className="text-slate-200 font-medium">
              {activeStation?.station ?? data.city}
            </strong>
          </span>
          <span>
            {activeStation?.isDemo ? 'Demo Reference Units' : 'CPCB Verified Units'}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => {
            const pct =
              kpi.value !== null
                ? Math.min(100, Math.round((kpi.value / (kpi.naaqsLimit * 2.5)) * 100))
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
                    <span>24h std {kpi.naaqsLimit}</span>
                  </p>
                </div>
                {kpi.unitNote && (
                  <p className="text-[11px] text-amber-300">{kpi.unitNote}</p>
                )}
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

      {/* 24-Hour Observed / Reference Trend + Station Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                24-Hour Historical Reference Curve
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {data.dataMode === 'demo'
                  ? 'Sample winter diurnal profile (Demo Reference — no invented forecasts)'
                  : 'Observed station window (live CPCB feed provides current snapshots only)'}
              </p>
            </div>
          </div>

          {data.trend24h.length > 0 ? (
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
                    name="CPCB AQI"
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
          ) : (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-300 font-medium">
                No Multi-Hour History Series in Live Snapshot
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                The connected official CPCB endpoint returned point-in-time station
                averages. AERIS AI never fabricates historical curves or future
                forecasts.
              </p>
            </div>
          )}
        </section>

        <section className="lg:col-span-6 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Monitoring Stations in {data.city}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select any station to inspect its specific telemetry & pollutants
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
                  onClick={() =>
                    onStationChange(isSelected ? 'all' : st.id)
                  }
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
                      <span>{st.isDemo ? 'Demo Reference' : 'CPCB Official'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatFreshnessLabel(st.lastUpdatedIso)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          st.isStale ? 'text-amber-300' : 'text-emerald-400'
                        }
                      >
                        {st.isStale ? 'Stale (>3h)' : 'Fresh'}
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

      {/* Distinct OpenAQ v3 Sensor Section */}
      {data.openAqSensors.length > 0 && (
        <section className="aeris-panel rounded-xl p-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                OpenAQ v3 Sensor Measurements (Separate from Official National AQI)
              </h3>
              <p className="text-xs text-slate-400">
                Raw sensor concentrations reported via OpenAQ v3. Original sensor
                units are preserved and never converted into CPCB National AQI.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.openAqSensors.slice(0, 8).map((sensor) => (
              <div
                key={sensor.id}
                className="aeris-subcard p-3.5 rounded-lg hover:border-cyan-500/30 transition-colors"
              >
                <p className="text-xs text-slate-300 font-medium truncate">
                  {sensor.locationName}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-lg font-mono font-bold tabular-nums text-cyan-300">
                    {sensor.value}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {sensor.parameter} ({sensor.unit})
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatFreshnessLabel(sensor.lastUpdatedIso)} · OpenAQ v3 Sensor
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
