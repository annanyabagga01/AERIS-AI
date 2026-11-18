import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Clock,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { AqiStatusText } from '../components/AqiBadge.tsx';
import { evaluateAqiVerificationStatus } from '../lib/aiContext.ts';
import {
  ACTIVITY_PREFERENCE_OPTIONS,
  buildPersonalizedRoutine,
  computeChecklistStats,
  ensureDailyChecklistFresh,
  generateDailyChecklistTasks,
  getLocalDateKey,
  SCHEDULE_CONTEXT_OPTIONS,
  type ActivityPreference,
  type DailyRoutineChecklistState,
  type RoutinePeriod,
  type RoutineTask,
  type ScheduleContextType,
} from '../lib/routines.ts';
import {
  loadRoutinePlannerState,
  saveRoutinePlannerState,
} from '../lib/storage.ts';
import type {
  CityAqiResponse,
  CommuteMode,
  FamilyPreferences,
} from '../lib/types.ts';

interface RoutinePlannerPageProps {
  aqi: number | null;
  aqiData?: CityAqiResponse | null;
  preferences: FamilyPreferences;
  onUpdatePreferences: (next: FamilyPreferences) => void;
}

type PeriodFilter = 'All' | RoutinePeriod;

export function RoutinePlannerPage({
  aqi,
  aqiData = null,
  preferences,
  onUpdatePreferences,
}: RoutinePlannerPageProps) {
  const [savedState] = useState(() => loadRoutinePlannerState());
  const [localPrefs, setLocalPrefs] = useState<FamilyPreferences>(preferences);
  const [scheduleType, setScheduleType] = useState<ScheduleContextType>(
    savedState.scheduleType
  );
  const [activityPreference, setActivityPreference] =
    useState<ActivityPreference>(savedState.activityPreference);
  const [prefsSavedFeedback, setPrefsSavedFeedback] = useState(false);

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  const verification = useMemo(() => {
    if (aqiData) return evaluateAqiVerificationStatus(aqiData);
    return {
      isLiveVerified: false,
      isStale: false,
      isMissing: aqi === null,
      isDemo: false,
      verificationNotice:
        'Current live CPCB verification context unavailable; outdoor windows remain conservative.',
    };
  }, [aqiData, aqi]);

  const plan = useMemo(
    () =>
      buildPersonalizedRoutine(aqi, localPrefs, {
        scheduleType,
        activityPreference,
        isVerifiedCurrent: verification.isLiveVerified,
        verificationNotice: verification.verificationNotice,
      }),
    [
      aqi,
      localPrefs,
      scheduleType,
      activityPreference,
      verification.isLiveVerified,
      verification.verificationNotice,
    ]
  );

  const [initialFresh] = useState(() =>
    ensureDailyChecklistFresh(savedState.checklist, plan, localPrefs)
  );
  const [checklist, setChecklist] = useState<DailyRoutineChecklistState>(
    initialFresh.state
  );
  const [autoRefreshedNotice, setAutoRefreshedNotice] = useState(
    initialFresh.wasAutoRefreshed
  );

  // Add / edit / filter task state
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('All');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPeriod, setNewTaskPeriod] = useState<RoutinePeriod>('Morning');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    saveRoutinePlannerState({
      scheduleType,
      activityPreference,
      checklist,
    });
  }, [scheduleType, activityPreference, checklist]);

  // Automatic date rollover check if the tab stays open past midnight
  useEffect(() => {
    const today = getLocalDateKey();
    if (checklist.dateKey !== today) {
      const next = ensureDailyChecklistFresh(checklist, plan, localPrefs);
      setChecklist(next.state);
      setAutoRefreshedNotice(next.wasAutoRefreshed);
    }
  }, [checklist, plan, localPrefs]);

  const stats = useMemo(
    () => computeChecklistStats(checklist.tasks),
    [checklist.tasks]
  );

  const visibleTasks = useMemo(() => {
    if (periodFilter === 'All') return checklist.tasks;
    return checklist.tasks.filter((t) => t.period === periodFilter);
  }, [checklist.tasks, periodFilter]);

  const applyToSaved = () => {
    onUpdatePreferences(localPrefs);
    setPrefsSavedFeedback(true);
    window.setTimeout(() => setPrefsSavedFeedback(false), 2000);
  };

  const handleDailyRefresh = () => {
    const now = new Date();
    setChecklist({
      dateKey: getLocalDateKey(now),
      lastRefreshedIso: now.toISOString(),
      tasks: generateDailyChecklistTasks(plan, localPrefs),
    });
    setEditingTaskId(null);
    setAutoRefreshedNotice(false);
  };

  const handleResetCompletion = () => {
    setChecklist((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => ({ ...t, completed: false })),
    }));
  };

  const handleToggleTask = (id: string) => {
    setChecklist((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    }));
  };

  const handleAddTask = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    const task: RoutineTask = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      period: newTaskPeriod,
      title: trimmed,
      completed: false,
      isCustom: true,
    };
    setChecklist((prev) => ({
      ...prev,
      tasks: [...prev.tasks, task],
    }));
    setNewTaskTitle('');
  };

  const startEditingTask = (task: RoutineTask) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const saveEditedTask = (id: string) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) return;
    setChecklist((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
    }));
    setEditingTaskId(null);
    setEditingTitle('');
  };

  const handleDeleteTask = (id: string) => {
    setChecklist((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }));
    if (editingTaskId === id) {
      setEditingTaskId(null);
      setEditingTitle('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <section
        aria-label="Daily schedule configuration"
        className="aeris-panel rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Personalized Daily Routine Planner · {localPrefs.city}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
              <span>CPCB AQI:</span>
              <span className="font-mono font-semibold text-slate-100 tabular-nums">
                {aqi ?? 'N/A'}
              </span>
              <AqiStatusText aqi={aqi} compact />
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span
                data-testid="routine-verification-state"
                className={
                  verification.isLiveVerified
                    ? 'text-emerald-300 font-medium'
                    : 'text-amber-300 font-medium'
                }
              >
                {verification.isLiveVerified
                  ? 'Verified Live Data'
                  : verification.isDemo
                  ? 'Demo Reference (Not Live)'
                  : verification.isStale
                  ? 'Stale Reading (>3h)'
                  : 'AQI Unavailable'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleDailyRefresh}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Daily Refresh</span>
            </button>
            <button
              type="button"
              onClick={applyToSaved}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors whitespace-nowrap"
            >
              {prefsSavedFeedback ? 'Scenario Saved' : 'Save Scenario to Preferences'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs">
          <div>
            <label
              htmlFor="routine-schedule-type"
              className="block text-slate-400 mb-1.5"
            >
              Schedule Type
            </label>
            <select
              id="routine-schedule-type"
              value={scheduleType}
              onChange={(e) =>
                setScheduleType(e.target.value as ScheduleContextType)
              }
              className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
            >
              {SCHEDULE_CONTEXT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="routine-start-time"
              className="block text-slate-400 mb-1.5"
            >
              {scheduleType === 'college' ? 'College Start' : 'Work Start'}
            </label>
            <input
              id="routine-start-time"
              type="time"
              value={localPrefs.workStartHour}
              onChange={(e) =>
                setLocalPrefs({
                  ...localPrefs,
                  workStartHour: e.target.value || '09:00',
                })
              }
              className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="routine-end-time"
              className="block text-slate-400 mb-1.5"
            >
              {scheduleType === 'college' ? 'College End' : 'Work End'}
            </label>
            <input
              id="routine-end-time"
              type="time"
              value={localPrefs.workEndHour}
              onChange={(e) =>
                setLocalPrefs({
                  ...localPrefs,
                  workEndHour: e.target.value || '18:00',
                })
              }
              className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="routine-commute"
              className="block text-slate-400 mb-1.5"
            >
              Commute Mode
            </label>
            <select
              id="routine-commute"
              value={localPrefs.commuteMode}
              onChange={(e) =>
                setLocalPrefs({
                  ...localPrefs,
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
              htmlFor="routine-exercise"
              className="block text-slate-400 mb-1.5"
            >
              Preferred Time
            </label>
            <select
              id="routine-exercise"
              value={localPrefs.preferredExerciseTime}
              onChange={(e) =>
                setLocalPrefs({
                  ...localPrefs,
                  preferredExerciseTime: e.target.value as
                    | 'morning'
                    | 'afternoon'
                    | 'evening',
                })
              }
              className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="routine-activity"
              className="block text-slate-400 mb-1.5"
            >
              Activity Preference
            </label>
            <select
              id="routine-activity"
              value={activityPreference}
              onChange={(e) =>
                setActivityPreference(e.target.value as ActivityPreference)
              }
              className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
            >
              {ACTIVITY_PREFERENCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-2 text-xs">
          <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={localPrefs.hasChildren}
              onChange={(e) =>
                setLocalPrefs({ ...localPrefs, hasChildren: e.target.checked })
              }
              className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
            />
            <span>School-age children</span>
          </label>
          <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={localPrefs.hasOlderAdults}
              onChange={(e) =>
                setLocalPrefs({
                  ...localPrefs,
                  hasOlderAdults: e.target.checked,
                })
              }
              className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
            />
            <span>Older adults in household</span>
          </label>
          <label className="inline-flex items-center gap-2 text-amber-200 cursor-pointer">
            <input
              type="checkbox"
              checked={localPrefs.pollutionSensitiveHousehold}
              onChange={(e) =>
                setLocalPrefs({
                  ...localPrefs,
                  pollutionSensitiveHousehold: e.target.checked,
                })
              }
              className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
            />
            <span>Pollution-sensitive household</span>
          </label>
        </div>
      </section>

      {/* Safer Outdoor Window, Commute Suggestions & Indoor Exercise Alternatives */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section
          aria-label="Verified safer outdoor window status"
          className="aeris-panel rounded-xl p-5 space-y-2.5"
        >
          <p className="text-[11px] font-mono text-slate-400">
            Safer Outdoor Window Check
          </p>
          <h3
            data-testid="outdoor-window-status"
            className={`text-sm font-semibold ${
              plan.saferOutdoorWindow.supportedByCurrentData
                ? 'text-emerald-300'
                : 'text-amber-300'
            }`}
          >
            {plan.saferOutdoorWindow.statusLabel}
          </h3>
          <p className="text-xs font-medium text-slate-100">
            {plan.saferOutdoorWindow.windowLabel}
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {plan.saferOutdoorWindow.rationale}
          </p>
        </section>

        <section
          aria-label="Commute recommendations"
          className="aeris-panel rounded-xl p-5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
            <span className="text-slate-400">Commute Strategy</span>
            <span
              className={
                plan.commuteSuggestion.upgradeSuggested
                  ? 'text-amber-300'
                  : 'text-cyan-300'
              }
            >
              {plan.commuteSuggestion.upgradeSuggested
                ? 'Swap Suggested'
                : 'Current Mode Supported'}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-100 leading-relaxed">
            {plan.commuteSuggestion.recommendation}
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {plan.commuteSuggestion.precautions}
          </p>
        </section>

        <section
          aria-label="Indoor exercise alternatives"
          className="aeris-panel rounded-xl p-5 space-y-2.5"
        >
          <p className="text-[11px] font-mono text-emerald-300">
            Indoor Exercise Alternatives
          </p>
          <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed list-disc list-inside">
            {plan.indoorAlternatives.map((alt, i) => (
              <li key={i}>{alt}</li>
            ))}
          </ul>
        </section>
      </div>

      {/* Morning / Afternoon / Evening Blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {plan.blocks.map((block) => (
          <article
            key={block.period}
            className="aeris-panel-interactive rounded-xl p-6 flex flex-col gap-4"
          >
            <div className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-cyan-300 font-mono">
                <span>{block.period}</span>
                <span className="inline-flex items-center gap-1 text-slate-400 tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  {block.timeWindow}
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-100 mt-1.5">
                {block.headline}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                {block.saferWindowNote}
              </p>
            </div>

            <div className="space-y-3.5 text-xs leading-relaxed">
              <div>
                <p className="font-semibold text-slate-200">
                  {scheduleType === 'college'
                    ? 'College & Commute'
                    : scheduleType === 'hybrid_home'
                    ? 'Workday & Errands'
                    : 'Work & Commute'}
                </p>
                <p className="text-slate-400 mt-0.5">{block.workAndCommute}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-200">
                  Exercise & Outdoor Activity
                </p>
                <p className="text-slate-400 mt-0.5">
                  {block.exerciseAndOutdoors}
                </p>
              </div>
              {localPrefs.hasChildren && (
                <div>
                  <p className="font-semibold text-emerald-300">
                    School & Children
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    {block.schoolAndChildren}
                  </p>
                </div>
              )}
              {(localPrefs.hasOlderAdults ||
                localPrefs.pollutionSensitiveHousehold) && (
                <div>
                  <p className="font-semibold text-amber-300">
                    Older Adults & Sensitive Members
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    {block.olderAdultsAndSensitive}
                  </p>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Editable Checklist, Completion Tracking & Daily Refresh */}
      <section
        aria-label="Editable daily routine checklist"
        className="aeris-panel rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Daily Checklist & Completion Tracker
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono tabular-nums text-cyan-300">
                Date: {checklist.dateKey}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Refreshed{' '}
                {new Date(checklist.lastRefreshedIso).toLocaleTimeString(
                  'en-IN',
                  { hour: '2-digit', minute: '2-digit' }
                )}
              </span>
              {autoRefreshedNotice && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300">
                    Auto-refreshed for new day
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleResetCompletion}
              className="px-3 py-1.5 rounded-lg border border-slate-700/90 bg-slate-900/70 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors whitespace-nowrap"
            >
              Reset Checkboxes
            </button>
            <button
              type="button"
              onClick={handleDailyRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate Daily Tasks</span>
            </button>
          </div>
        </div>

        {/* Completion Progress Bar & Period Counters */}
        <div className="p-4 rounded-lg aeris-subcard space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              data-testid="routine-completion-summary"
              className="font-mono tabular-nums text-slate-100 font-semibold"
            >
              {stats.completed} / {stats.total} completed ({stats.percent}%)
            </span>
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px] text-slate-400">
              <span>
                Morning {stats.byPeriod.Morning.completed}/
                {stats.byPeriod.Morning.total}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Afternoon {stats.byPeriod.Afternoon.completed}/
                {stats.byPeriod.Afternoon.total}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Evening {stats.byPeriod.Evening.completed}/
                {stats.byPeriod.Evening.total}
              </span>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-900/90 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
        </div>

        {/* Add Custom Task + Period Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <form
            onSubmit={handleAddTask}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1"
          >
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add custom schedule action (e.g., Pack spare N95 mask)..."
              aria-label="New daily task title"
              className="flex-1 px-3 py-2 rounded-lg aeris-input text-xs text-slate-100 placeholder:text-slate-500"
            />
            <select
              value={newTaskPeriod}
              onChange={(e) =>
                setNewTaskPeriod(e.target.value as RoutinePeriod)
              }
              aria-label="New task time period"
              className="px-3 py-2 rounded-lg aeris-input text-xs text-slate-100"
            >
              <option value="Morning">Morning</option>
              <option value="Afternoon">Afternoon</option>
              <option value="Evening">Evening</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </form>

          <div
            role="group"
            aria-label="Filter checklist by period"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#060B18] border border-slate-800/90 shrink-0"
          >
            {(['All', 'Morning', 'Afternoon', 'Evening'] as PeriodFilter[]).map(
              (period) => {
                const active = periodFilter === period;
                return (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPeriodFilter(period)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/35'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {period}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Checklist Items */}
        {visibleTasks.length === 0 ? (
          <div className="p-8 rounded-lg border border-dashed border-slate-800 text-center space-y-2.5">
            <p className="text-sm font-medium text-slate-200">
              No tasks in this view
            </p>
            <p className="text-xs text-slate-400">
              Add a custom action above or regenerate today&apos;s personalized
              schedule tasks.
            </p>
            <button
              type="button"
              onClick={handleDailyRefresh}
              className="px-3.5 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 transition-colors"
            >
              Generate Today&apos;s Tasks
            </button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visibleTasks.map((task) => {
              const isEditing = editingTaskId === task.id;
              return (
                <li
                  key={task.id}
                  className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                    task.completed
                      ? 'border-emerald-500/35 bg-emerald-500/[0.05]'
                      : 'border-slate-800/90 bg-[#080F1F]/65'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditedTask(task.id);
                          if (e.key === 'Escape') setEditingTaskId(null);
                        }}
                        aria-label={`Edit task '${task.title}'`}
                        className="flex-1 px-3 py-1.5 rounded-lg aeris-input text-xs text-slate-100"
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => saveEditedTask(task.id)}
                          aria-label="Save edited task"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTaskId(null)}
                          aria-label="Cancel editing task"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:text-slate-100"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-pressed={task.completed}
                        onClick={() => handleToggleTask(task.id)}
                        className="flex-1 text-left flex items-start gap-3 min-w-0"
                      >
                        {task.completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-medium leading-relaxed ${
                              task.completed
                                ? 'line-through text-slate-400'
                                : 'text-slate-100'
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {task.period}
                            {task.isCustom ? ' · Custom' : ''}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditingTask(task)}
                          aria-label={`Edit '${task.title}'`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800/70 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          aria-label={`Delete '${task.title}'`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800/70 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Non-Medical Disclaimer */}
      <div className="aeris-panel rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-slate-400">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p>{plan.disclaimer}</p>
      </div>
    </div>
  );
}
