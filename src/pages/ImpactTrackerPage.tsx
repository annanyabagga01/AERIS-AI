import { useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Flame,
  Info,
  PlusCircle,
  Route,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ACTION_CATALOG,
  calculateCommuteImpact,
  computeImpactStats,
  EMISSION_FACTORS_KG_PER_KM,
} from '../lib/emissions.ts';
import type {
  ActionType,
  EmissionsInput,
  ImpactLogEntry,
} from '../lib/types.ts';

interface ImpactTrackerPageProps {
  city: string;
  aqi?: number | null;
  pollutionSensitiveHousehold?: boolean;
  entries: ImpactLogEntry[];
  onAddEntry: (entry: ImpactLogEntry) => void;
  onDeleteEntry: (id: string) => void;
}

type ChartWindow = 'weekly' | 'monthly';

function ImpactTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: { actions?: number; qualitativeActions?: number; rangeLabel?: string };
  }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const meta = payload[0]?.payload;
  return (
    <div className="rounded-lg bg-[#060C1A]/95 border border-emerald-500/35 px-3 py-2 text-xs shadow-xl">
      <p className="font-mono text-slate-200">
        {label}
        {meta?.rangeLabel ? ` (${meta.rangeLabel})` : ''}
      </p>
      <p className="font-mono tabular-nums font-semibold text-emerald-300 mt-1">
        {payload[0].value ?? 0} kg CO2e avoided
      </p>
      <p className="font-mono tabular-nums text-slate-400 mt-0.5">
        {meta?.actions ?? 0} action(s) logged
        {meta?.qualitativeActions ? ` · ${meta.qualitativeActions} qualitative` : ''}
      </p>
    </div>
  );
}

function mapAlternativeToActionType(
  mode: EmissionsInput['alternativeMode']
): ActionType {
  switch (mode) {
    case 'metro':
      return 'metro_commute';
    case 'bus':
      return 'bus_commute';
    case 'carpool':
      return 'carpool';
    default:
      return 'metro_commute';
  }
}

export function ImpactTrackerPage({
  city,
  aqi = null,
  pollutionSensitiveHousehold = false,
  entries,
  onAddEntry,
  onDeleteEntry,
}: ImpactTrackerPageProps) {
  const [selectedAction, setSelectedAction] =
    useState<ActionType>('metro_commute');
  const [customNote, setCustomNote] = useState('');
  const [chartWindow, setChartWindow] = useState<ChartWindow>('weekly');

  const [compareInput, setCompareInput] = useState<EmissionsInput>({
    baselineMode: 'solo_car',
    alternativeMode: 'metro',
    oneWayDistanceKm: 12,
    tripsPerWeek: 10,
    aqi,
    pollutionSensitiveHousehold,
  });

  const stats = useMemo(() => computeImpactStats(entries), [entries]);
  const selectedActionMeta = ACTION_CATALOG[selectedAction];

  const commuteResult = useMemo(
    () =>
      calculateCommuteImpact({
        ...compareInput,
        aqi,
        pollutionSensitiveHousehold,
      }),
    [compareInput, aqi, pollutionSensitiveHousehold]
  );

  const singleTripAvoidedKg = useMemo(() => {
    if (
      commuteResult.isQualitativeOnly ||
      commuteResult.estimatedWeeklyCo2eAvoidedKg === null
    ) {
      return 0;
    }
    return Number(
      (
        commuteResult.estimatedWeeklyCo2eAvoidedKg /
        Math.max(1, compareInput.tripsPerWeek)
      ).toFixed(2)
    );
  }, [commuteResult, compareInput.tripsPerWeek]);

  const unlockedCount = useMemo(
    () => stats.achievements.filter((a) => a.unlocked).length,
    [stats.achievements]
  );

  const handleLogAction = (e: React.FormEvent) => {
    e.preventDefault();
    const meta = ACTION_CATALOG[selectedAction];
    const isQualitative = !meta.hasReliableFactor;
    const newEntry: ImpactLogEntry = {
      id: `imp-${Date.now()}`,
      dateIso: new Date().toISOString(),
      actionType: selectedAction,
      label: meta.label,
      co2AvoidedKg: isQualitative ? 0 : meta.defaultCo2Kg,
      isQualitative,
      qualitativeNote: isQualitative ? meta.qualitativeBenefit : undefined,
      city,
      note: customNote.trim() || undefined,
    };
    onAddEntry(newEntry);
    setCustomNote('');
  };

  const handleLogComparedSwap = () => {
    const baselineLabel =
      EMISSION_FACTORS_KG_PER_KM[compareInput.baselineMode]?.label ??
      compareInput.baselineMode;
    const altLabel =
      EMISSION_FACTORS_KG_PER_KM[compareInput.alternativeMode]?.label ??
      compareInput.alternativeMode;
    const isQualitative = commuteResult.isQualitativeOnly;

    const newEntry: ImpactLogEntry = {
      id: `imp-swap-${Date.now()}`,
      dateIso: new Date().toISOString(),
      actionType: mapAlternativeToActionType(compareInput.alternativeMode),
      label: `${altLabel} Swap (${compareInput.oneWayDistanceKm} km)`,
      co2AvoidedKg: isQualitative ? 0 : singleTripAvoidedKg,
      isQualitative,
      qualitativeNote: isQualitative
        ? commuteResult.qualitativeComparison
        : undefined,
      city,
      note: `Compared vs. ${baselineLabel}`,
    };
    onAddEntry(newEntry);
  };

  const chartData = useMemo(() => {
    if (chartWindow === 'weekly') {
      return stats.weeklySeries.map((d) => ({
        label: d.day,
        rangeLabel: d.dateKey,
        co2Kg: d.co2Kg,
        actions: d.actions,
        qualitativeActions: d.qualitativeActions,
      }));
    }
    return stats.monthlySeries.map((w) => ({
      label: w.weekLabel,
      rangeLabel: w.rangeLabel,
      co2Kg: w.co2Kg,
      actions: w.actions,
      qualitativeActions: w.qualitativeActions,
    }));
  }, [chartWindow, stats.weeklySeries, stats.monthlySeries]);

  return (
    <div className="space-y-6">
      {/* Methodology Honesty Banner */}
      <section className="aeris-panel rounded-xl px-5 py-3.5 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          All CO2e estimates use published Indian transport &amp; grid factors
          with explicit publication dates and assumptions. Personal habit tracking
          estimates mode or energy substitution only — it{' '}
          <strong className="text-slate-100 font-semibold">
            never claims direct local city AQI reduction
          </strong>
          . Where reliable emission factors are unavailable, qualitative comparisons
          are displayed instead of invented numbers.
        </p>
      </section>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">
            Cumulative Estimated CO2e Avoided
          </p>
          <p
            data-testid="impact-total-co2"
            className="text-3xl font-bold font-mono tabular-nums text-emerald-300 mt-2"
          >
            {stats.totalCo2eAvoidedKg}{' '}
            <span className="text-sm font-normal text-slate-400">kg CO2e</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Factor-backed swaps only; not measured AQI change
          </p>
        </div>

        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">Logged Sustainable Actions</p>
          <p
            data-testid="impact-total-actions"
            className="text-3xl font-bold font-mono tabular-nums text-cyan-300 mt-2"
          >
            {stats.totalActions}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
            {stats.quantifiedActions} quantified · {stats.qualitativeActions}{' '}
            qualitative
          </p>
        </div>

        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">Current Habit Streak</p>
          <p
            data-testid="impact-current-streak"
            className="text-3xl font-bold font-mono tabular-nums text-slate-100 mt-2 flex items-center gap-2"
          >
            <Flame className="w-6 h-6 text-amber-400" />
            <span>{stats.currentStreakDays} day(s)</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Consecutive active days ending today/yesterday
          </p>
        </div>

        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">Best Streak &amp; Milestones</p>
          <p
            data-testid="impact-best-streak"
            className="text-3xl font-bold font-mono tabular-nums text-slate-100 mt-2 flex items-center gap-2"
          >
            <Award className="w-6 h-6 text-emerald-400" />
            <span>{stats.longestStreakDays} day(s)</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
            {unlockedCount}/{stats.achievements.length} achievements unlocked
          </p>
        </div>
      </div>

      {/* Log Habit + Interactive Commute Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sustainable Habit Logger */}
        <section className="lg:col-span-5 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              Log Sustainable Habit
            </h2>
          </div>

          <form onSubmit={handleLogAction} className="space-y-4 text-sm">
            <div>
              <label
                htmlFor="impact-action-select"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Action Category
              </label>
              <select
                id="impact-action-select"
                value={selectedAction}
                onChange={(e) =>
                  setSelectedAction(e.target.value as ActionType)
                }
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
              >
                {Object.entries(ACTION_CATALOG).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}{' '}
                    {item.hasReliableFactor
                      ? `(~${item.defaultCo2Kg} kg CO2e)`
                      : '(Qualitative Only)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Methodology / Qualitative Box */}
            <div
              data-testid="habit-factor-preview"
              className={`rounded-lg p-3.5 border text-xs space-y-1.5 ${
                selectedActionMeta.hasReliableFactor
                  ? 'aeris-subcard'
                  : 'bg-cyan-500/10 border-cyan-500/30'
              }`}
            >
              <p className="font-semibold text-slate-100">
                {selectedActionMeta.hasReliableFactor
                  ? `Factor Estimate: ~${selectedActionMeta.defaultCo2Kg} kg CO2e`
                  : 'Qualitative Comparison Only (No CO2e Invented)'}
              </p>
              <p className="text-slate-300 leading-relaxed">
                {selectedActionMeta.hasReliableFactor
                  ? selectedActionMeta.assumption
                  : selectedActionMeta.qualitativeBenefit}
              </p>
              <p className="text-[11px] text-slate-400">
                Source: {selectedActionMeta.source} · Published:{' '}
                <span className="font-mono text-slate-300">
                  {selectedActionMeta.publicationDate}
                </span>
              </p>
            </div>

            <div>
              <label
                htmlFor="impact-note"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Optional Note
              </label>
              <input
                id="impact-note"
                type="text"
                maxLength={140}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g., Took Blue Line Metro to Noida..."
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              data-testid="impact-log-submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>
                {selectedActionMeta.hasReliableFactor
                  ? `Log Habit (+${selectedActionMeta.defaultCo2Kg} kg CO2e)`
                  : 'Log Qualitative Habit'}
              </span>
            </button>
          </form>
        </section>

        {/* Commute Comparison Calculator */}
        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Route className="w-5 h-5 text-cyan-400" />
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Commute Comparison
                </h2>
                <p className="text-xs text-slate-400">
                  Compare weekly impact and log verified or qualitative mode swaps
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label
                htmlFor="impact-baseline-mode"
                className="block text-slate-400 mb-1"
              >
                Baseline Mode
              </label>
              <select
                id="impact-baseline-mode"
                value={compareInput.baselineMode}
                onChange={(e) =>
                  setCompareInput((prev) => ({
                    ...prev,
                    baselineMode: e.target.value as 'solo_car' | 'two_wheeler',
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg aeris-input text-slate-100"
              >
                <option value="solo_car">Solo Car (0.171)</option>
                <option value="two_wheeler">Two-Wheeler (0.049)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="impact-alt-mode"
                className="block text-slate-400 mb-1"
              >
                Alternative Mode
              </label>
              <select
                id="impact-alt-mode"
                value={compareInput.alternativeMode}
                onChange={(e) =>
                  setCompareInput((prev) => ({
                    ...prev,
                    alternativeMode: e.target
                      .value as EmissionsInput['alternativeMode'],
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg aeris-input text-slate-100"
              >
                <option value="metro">Metro Rail (0.014)</option>
                <option value="bus">City Bus (0.029)</option>
                <option value="carpool">Carpool (0.0855)</option>
                <option value="ev_cab">EV Cab/Auto (0.072)</option>
                <option value="walk_cycle">Walk / Cycle (0.000)</option>
                <option value="shared_e_rickshaw">
                  Shared E-Rickshaw (Qualitative)
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="impact-distance"
                className="block text-slate-400 mb-1"
              >
                One-Way (km)
              </label>
              <input
                id="impact-distance"
                type="number"
                min={1}
                max={200}
                value={compareInput.oneWayDistanceKm}
                onChange={(e) =>
                  setCompareInput((prev) => ({
                    ...prev,
                    oneWayDistanceKm: Math.max(
                      1,
                      Math.min(200, Number(e.target.value) || 1)
                    ),
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg aeris-input font-mono text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="impact-trips"
                className="block text-slate-400 mb-1"
              >
                Trips / Week
              </label>
              <input
                id="impact-trips"
                type="number"
                min={1}
                max={28}
                value={compareInput.tripsPerWeek}
                onChange={(e) =>
                  setCompareInput((prev) => ({
                    ...prev,
                    tripsPerWeek: Math.max(
                      1,
                      Math.min(28, Number(e.target.value) || 1)
                    ),
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg aeris-input font-mono text-slate-100"
              />
            </div>
          </div>

          {/* Comparison Output */}
          {commuteResult.isQualitativeOnly ? (
            <div
              data-testid="commute-qualitative-card"
              className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 space-y-2"
            >
              <p className="text-sm font-semibold text-cyan-200">
                Qualitative Comparison Only (Factor Unavailable)
              </p>
              <p className="text-xs text-slate-200 leading-relaxed">
                {commuteResult.qualitativeComparison}
              </p>
              {commuteResult.baselineWeeklyKg !== null && (
                <p className="text-[11px] font-mono tabular-nums text-slate-400">
                  Reference baseline footprint: {commuteResult.baselineWeeklyKg}{' '}
                  kg CO2e/week
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg aeris-subcard">
                <p className="text-[11px] text-slate-400">Baseline / Week</p>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-200 mt-1">
                  {commuteResult.baselineWeeklyKg}{' '}
                  <span className="text-xs font-normal text-slate-400">kg</span>
                </p>
              </div>
              <div className="p-3.5 rounded-lg aeris-subcard">
                <p className="text-[11px] text-slate-400">Alternative / Week</p>
                <p className="text-xl font-bold font-mono tabular-nums text-cyan-300 mt-1">
                  {commuteResult.alternativeWeeklyKg}{' '}
                  <span className="text-xs font-normal text-slate-400">kg</span>
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/35">
                <p className="text-[11px] text-emerald-200">
                  Est. Avoided / Week
                </p>
                <p
                  data-testid="commute-compare-avoided"
                  className="text-xl font-bold font-mono tabular-nums text-emerald-300 mt-1"
                >
                  {commuteResult.estimatedWeeklyCo2eAvoidedKg}{' '}
                  <span className="text-xs font-normal">kg</span>
                </p>
                <p className="text-[11px] font-mono tabular-nums text-emerald-200/80">
                  ~{commuteResult.estimatedAnnualCo2eAvoidedKg} kg/yr (50 wks)
                </p>
              </div>
            </div>
          )}

          {/* Active Mobility AQI Gate */}
          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
              commuteResult.activeMobilitySafe
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
            }`}
          >
            {commuteResult.activeMobilitySafe ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <p className="leading-relaxed">
              <strong className="font-semibold">
                {city} Mobility Gate (AQI: {aqi ?? 'Unavailable'}):{' '}
              </strong>
              {commuteResult.activeMobilityAdvisory}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-400">
              {commuteResult.sources.join(' · ')}
            </p>
            <button
              type="button"
              data-testid="log-commute-swap-btn"
              onClick={handleLogComparedSwap}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              {commuteResult.isQualitativeOnly
                ? 'Log Qualitative Swap'
                : `Log 1 Trip Swap (+${singleTripAvoidedKg} kg CO2e)`}
            </button>
          </div>
        </section>
      </div>

      {/* Weekly & Monthly Charts */}
      <section className="aeris-panel rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                {chartWindow === 'weekly'
                  ? 'Weekly Estimated CO2e Avoided (Last 7 Days)'
                  : 'Monthly Estimated CO2e Avoided (Last 4 Weeks)'}
              </h3>
              <p className="text-xs text-slate-400">
                Tracks quantified CO2e avoided alongside action counts — does not
                measure ambient AQI change
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Chart timeframe"
            className="inline-flex rounded-lg bg-[#070D1D] border border-slate-800 p-1 self-start sm:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartWindow === 'weekly'}
              onClick={() => setChartWindow('weekly')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                chartWindow === 'weekly'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Weekly (7 Days)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartWindow === 'monthly'}
              onClick={() => setChartWindow('monthly')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                chartWindow === 'monthly'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly (4 Weeks)
            </button>
          </div>
        </div>

        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" debounce={50}>
            <BarChart data={chartData}>
              <defs>
                <linearGradient id="impactBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.1)"
              />
              <XAxis
                dataKey="label"
                stroke="#64748B"
                fontSize={12}
                tickLine={false}
              />
              <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
              <Tooltip
                content={<ImpactTooltip />}
                cursor={{ fill: 'rgba(6, 182, 212, 0.08)' }}
              />
              <Bar
                dataKey="co2Kg"
                name="Est. CO2e Avoided (kg)"
                fill="url(#impactBarGrad)"
                radius={[5, 5, 0, 0]}
                maxBarSize={56}
                isAnimationActive={true}
                animationDuration={550}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Achievements & Streaks */}
      <section className="aeris-panel rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Habit Milestones &amp; Achievements
              </h3>
              <p className="text-xs text-slate-400">
                Earned strictly from verified habit entries stored on your device
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-emerald-300">
            {unlockedCount} / {stats.achievements.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.achievements.map((ach) => {
            const pct = Math.min(
              100,
              Math.round((ach.current / Math.max(1, ach.target)) * 100)
            );
            return (
              <div
                key={ach.id}
                data-testid={`achievement-${ach.id}`}
                className={`rounded-xl p-4 border transition-colors ${
                  ach.unlocked
                    ? 'bg-emerald-500/10 border-emerald-500/35'
                    : 'aeris-subcard'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">
                    {ach.title}
                  </h4>
                  <span
                    className={`text-[11px] font-mono whitespace-nowrap ${
                      ach.unlocked ? 'text-emerald-300' : 'text-slate-400'
                    }`}
                  >
                    {ach.unlocked ? 'Unlocked' : `${ach.current}/${ach.target}`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {ach.description}
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      ach.unlocked ? 'bg-emerald-400' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Transparent Sourced Emission Factors & Publication Dates */}
      <section className="aeris-panel rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Sourced Emission Factors, Publication Dates &amp; Assumptions
            </h3>
            <p className="text-xs text-slate-400">
              Auditable reference factors; entries without a verified factor
              default to qualitative comparison
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Mode / Action</th>
                <th className="py-2.5 pr-4 font-medium text-right">
                  Factor (kg CO2e)
                </th>
                <th className="py-2.5 pr-4 font-medium">Published</th>
                <th className="py-2.5 font-medium">Source &amp; Assumptions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {Object.entries(EMISSION_FACTORS_KG_PER_KM).map(([key, item]) => (
                <tr key={key} className="hover:bg-slate-800/35 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-slate-200 whitespace-nowrap">
                    {item.label}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                    {item.hasReliableFactor && item.factor !== null
                      ? `${item.factor.toFixed(4)} /pkm`
                      : 'Qualitative Only'}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-slate-300 whitespace-nowrap">
                    {item.publicationDate}
                  </td>
                  <td className="py-2.5 text-slate-400">
                    <span className="text-slate-300">{item.source}:</span>{' '}
                    {item.assumption}
                  </td>
                </tr>
              ))}
              <tr className="hover:bg-slate-800/35 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-slate-200 whitespace-nowrap">
                  India Grid Electricity (AC/Geyser)
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                  0.7160 /kWh
                </td>
                <td className="py-2.5 pr-4 font-mono text-slate-300 whitespace-nowrap">
                  Dec 2023
                </td>
                <td className="py-2.5 text-slate-400">
                  <span className="text-slate-300">
                    Central Electricity Authority (CEA) Baseline v19.0:
                  </span>{' '}
                  Weighted average Indian grid CO2 intensity used for off-peak
                  household kWh savings.
                </td>
              </tr>
              <tr className="hover:bg-slate-800/35 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-slate-200 whitespace-nowrap">
                  Zero Open Burning / HEPA Seal Check
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                  Qualitative Only
                </td>
                <td className="py-2.5 pr-4 font-mono text-slate-300 whitespace-nowrap">
                  N/A
                </td>
                <td className="py-2.5 text-slate-400">
                  Biomass moisture, pile mass, and purifier wattage vary too
                  widely for an honest fixed CO2e constant; tracked qualitatively.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Personal Action History List */}
      <section className="aeris-panel rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-100">
          Personal Action History
        </h3>
        {entries.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-cyan-500/25 bg-[#060C1A]/60 rounded-xl space-y-2.5 px-6">
            <p className="text-sm font-medium text-slate-100">
              No sustainable actions logged yet
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Log your first clean commute, commute swap comparison, or smoke-free
              household habit above to start tracking weekly &amp; monthly trends,
              streaks, and achievements.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {entries.map((entry) => {
              const isQual =
                Boolean(entry.isQualitative) ||
                !ACTION_CATALOG[entry.actionType]?.hasReliableFactor;
              return (
                <div
                  key={entry.id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">
                      {entry.label}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {entry.city} ·{' '}
                      <span className="font-mono tabular-nums">
                        {new Date(entry.dateIso).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                    {isQual && entry.qualitativeNote && (
                      <p className="text-[11px] text-cyan-300/90 mt-1">
                        {entry.qualitativeNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-mono tabular-nums text-sm font-semibold ${
                        isQual
                          ? 'text-cyan-300'
                          : entry.co2AvoidedKg > 0
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {isQual
                        ? 'Qualitative Only'
                        : entry.co2AvoidedKg > 0
                        ? `+${entry.co2AvoidedKg} kg CO2e`
                        : '0 kg CO2e (No Net Reduction)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label={`Delete '${entry.label}'`}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
