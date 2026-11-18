import { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Fan,
  Info,
  RotateCcw,
  ShieldCheck,
  Square,
  Wind,
} from 'lucide-react';
import {
  buildIndoorOptimizationPlan,
  DEFAULT_INDOOR_PROFILE,
  PURIFIER_OPTIONS,
  ROOM_SIZE_PRESETS,
  ROOM_TYPE_OPTIONS,
  VENTILATION_OPTIONS,
  type CostTier,
  type IndoorOptimizerProfile,
  type RecommendationDomain,
} from '../lib/indoorOptimizer.ts';
import { loadIndoorState, saveIndoorState } from '../lib/storage.ts';
import type { AqiCategory } from '../lib/types.ts';

interface IndoorOptimizerPageProps {
  city: string;
  aqi: number | null;
  category: AqiCategory;
  pollutionSensitiveHousehold?: boolean;
}

type DomainFilter = 'all' | RecommendationDomain;
type TierFilter = 'all' | CostTier;

const DOMAIN_FILTER_TABS: { id: DomainFilter; label: string }[] = [
  { id: 'all', label: 'All Actions' },
  { id: 'dust_reduction', label: 'Dust Reduction' },
  { id: 'damp_mopping', label: 'Damp Mopping' },
  { id: 'kitchen_exhaust', label: 'Kitchen Exhaust' },
  { id: 'filtration', label: 'Filtration' },
  { id: 'ventilation', label: 'Ventilation Timing' },
];

const TIER_FILTER_TABS: { id: TierFilter; label: string }[] = [
  { id: 'all', label: 'All Budgets' },
  { id: 'low_cost', label: 'Low-Cost & Free' },
  { id: 'advanced', label: 'Advanced Equipment' },
];

const WINDOW_TONE_CLASSES = {
  emerald: 'text-emerald-300',
  cyan: 'text-cyan-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
} as const;

export function IndoorOptimizerPage({
  city,
  aqi,
  category,
  pollutionSensitiveHousehold = false,
}: IndoorOptimizerPageProps) {
  const [initialState] = useState(() => loadIndoorState());
  const [profile, setProfile] = useState<IndoorOptimizerProfile>(
    initialState.profile
  );
  const [checkedIds, setCheckedIds] = useState<string[]>(
    initialState.checkedIds
  );
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  useEffect(() => {
    saveIndoorState({ profile, checkedIds });
  }, [profile, checkedIds]);

  const plan = useMemo(
    () =>
      buildIndoorOptimizationPlan(
        profile,
        city,
        aqi,
        category,
        pollutionSensitiveHousehold
      ),
    [profile, city, aqi, category, pollutionSensitiveHousehold]
  );

  const filteredRecommendations = useMemo(() => {
    return plan.recommendations.filter((rec) => {
      if (domainFilter !== 'all' && rec.domain !== domainFilter) return false;
      if (tierFilter !== 'all' && rec.tier !== tierFilter) return false;
      return true;
    });
  }, [plan.recommendations, domainFilter, tierFilter]);

  const activeCountInPlan = useMemo(
    () =>
      plan.recommendations.filter((rec) => checkedIds.includes(rec.id)).length,
    [plan.recommendations, checkedIds]
  );

  const toggleItem = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyAllLowCost = () => {
    const lowCostIds = plan.recommendations
      .filter((r) => r.tier === 'low_cost')
      .map((r) => r.id);
    setCheckedIds((prev) => Array.from(new Set([...prev, ...lowCostIds])));
  };

  const resetRoomPlan = () => {
    setProfile(DEFAULT_INDOOR_PROFILE);
    setCheckedIds(['damp-mopping-protocol', 'kitchen-exhaust-tadka']);
    setDomainFilter('all');
    setTierFilter('all');
  };

  const selectPreset = (presetId: string) => {
    const preset = ROOM_SIZE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setProfile((prev) => ({
      ...prev,
      lengthFt: preset.lengthFt,
      widthFt: preset.widthFt,
      heightFt: preset.heightFt,
    }));
  };

  const matchedPresetId = ROOM_SIZE_PRESETS.find(
    (p) =>
      p.lengthFt === profile.lengthFt &&
      p.widthFt === profile.widthFt &&
      p.heightFt === profile.heightFt
  )?.id;

  return (
    <div className="space-y-6">
      {/* Top Row: Room Profile Controls + Real-Time Sizing & Filtration Strategy */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Room Profile Configurator */}
        <section
          aria-label="Room and ventilation profile configurator"
          className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                Room Profile & Equipment Setup
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure room type, dimensions, ventilation, and purifier availability
                for tailored indoor smog protection
              </p>
            </div>
            <button
              type="button"
              onClick={resetRoomPlan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/90 bg-slate-900/70 text-xs font-medium text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          {/* 1. Room Type */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-300">1. Room Type</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {ROOM_TYPE_OPTIONS.map((opt) => {
                const active = profile.roomType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setProfile((prev) => ({ ...prev, roomType: opt.id }))
                    }
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? 'border-cyan-400/55 bg-cyan-500/10 text-slate-100'
                        : 'border-slate-800/90 bg-[#080F1F]/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-semibold truncate">{opt.label}</p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      {opt.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Approximate Room Size Presets + Exact Dimensions */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-300">
                2. Approximate Room Size
              </p>
              <span className="text-[11px] font-mono tabular-nums text-cyan-300">
                {plan.areaSqFt} sq ft · {plan.volumeM3} m³
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ROOM_SIZE_PRESETS.map((preset) => {
                const active = matchedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectPreset(preset.id)}
                    className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
                        : 'border-slate-800/90 bg-[#080F1F]/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-medium truncate">
                      {preset.label.replace(/\s*\([^)]*\)$/, '')}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                      {preset.summary}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label
                  htmlFor="room-length"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Length (ft)
                </label>
                <input
                  id="room-length"
                  type="number"
                  min={5}
                  max={60}
                  value={profile.lengthFt}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      lengthFt: Math.max(
                        5,
                        Math.min(60, Number(e.target.value) || 10)
                      ),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="room-width"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Width (ft)
                </label>
                <input
                  id="room-width"
                  type="number"
                  min={5}
                  max={60}
                  value={profile.widthFt}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      widthFt: Math.max(
                        5,
                        Math.min(60, Number(e.target.value) || 10)
                      ),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-sm text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="room-height"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Ceiling (ft)
                </label>
                <input
                  id="room-height"
                  type="number"
                  min={7}
                  max={20}
                  value={profile.heightFt}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      heightFt: Math.max(
                        7,
                        Math.min(20, Number(e.target.value) || 10)
                      ),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-sm text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* 3. Ventilation Availability */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-300">
              3. Ventilation Availability
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VENTILATION_OPTIONS.map((opt) => {
                const active = profile.ventilation === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setProfile((prev) => ({ ...prev, ventilation: opt.id }))
                    }
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? 'border-cyan-400/55 bg-cyan-500/10 text-slate-100'
                        : 'border-slate-800/90 bg-[#080F1F]/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {opt.detail}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Purifier Availability */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-300">
              4. Air Purifier Availability
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PURIFIER_OPTIONS.map((opt) => {
                const active = profile.purifier === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setProfile((prev) => ({ ...prev, purifier: opt.id }))
                    }
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/10 text-slate-100'
                        : 'border-slate-800/90 bg-[#080F1F]/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {opt.detail}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Calculated CADR, Operating Strategy & Science Guidance */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <section
            aria-label="Filtration sizing and strategy summary"
            className="aeris-panel rounded-xl p-6 space-y-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                <span className="text-cyan-300 font-medium">{city}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-200">
                  AQI {aqi ?? 'N/A'} ({category})
                </span>
                {pollutionSensitiveHousehold && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-300">Sensitive Household</span>
                  </>
                )}
              </div>
              <h2 className="text-lg font-semibold text-slate-100">
                {plan.aqiModeLabel}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg aeris-subcard">
                <p className="text-[11px] text-slate-400">Required CADR</p>
                <p
                  data-testid="recommended-cadr"
                  className="text-2xl font-bold font-mono tabular-nums text-cyan-300 mt-1"
                >
                  {plan.recommendedCadrM3Hr}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    m³/hr
                  </span>
                </p>
                <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                  ~{plan.recommendedCadrCfm} CFM
                </p>
              </div>

              <div className="p-3.5 rounded-lg aeris-subcard">
                <p className="text-[11px] text-slate-400">Target Turnover</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300 mt-1">
                  {plan.targetAch.toFixed(1)}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    ACH
                  </span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {plan.targetAch >= 5
                    ? 'Elevated for smog / sensitivity'
                    : 'Standard baseline turnover'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg aeris-subcard space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <Fan className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{plan.purifierStrategyTitle}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {plan.purifierStrategyDetail}
              </p>
              <p className="text-[11px] font-mono text-slate-400 pt-1.5 border-t border-slate-800/80">
                {plan.purifierOperatingCostNote}
              </p>
            </div>
          </section>

          <section
            aria-label="Indoor air science and cost overview"
            className="aeris-panel rounded-xl p-6 space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg aeris-subcard">
                <p className="text-slate-400">Low-Cost & Free Steps</p>
                <p className="font-mono tabular-nums text-sm font-semibold text-emerald-300 mt-1">
                  {plan.recommendations.filter((r) => r.tier === 'low_cost').length}{' '}
                  actions · ₹0–₹3.2k
                </p>
              </div>
              <div className="p-3 rounded-lg aeris-subcard">
                <p className="text-slate-400">Advanced Upgrades</p>
                <p className="font-mono tabular-nums text-sm font-semibold text-cyan-300 mt-1">
                  {plan.recommendations.filter((r) => r.tier === 'advanced').length}{' '}
                  options · ₹3.5k+
                </p>
              </div>
            </div>

            <div
              data-testid="plant-science-note"
              className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-100"
            >
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{plan.plantScienceNote}</p>
            </div>
          </section>
        </div>
      </div>

      {/* Ventilation Timing Schedule Adapted to Room & Outdoor AQI */}
      <section
        aria-label="Ventilation timing based on outdoor AQI"
        className="aeris-panel rounded-xl p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Wind className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Ventilation Timing Window · {city}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Adjusted for {city} ambient AQI ({aqi ?? 'Unavailable'} ·{' '}
              {category}) and selected ventilation setup
            </p>
          </div>
          <span className="text-xs font-mono text-cyan-300">
            4 daily control windows
          </span>
        </div>

        <p
          data-testid="ventilation-summary"
          className="text-sm text-slate-300 leading-relaxed"
        >
          {plan.ventilationSummary}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {plan.ventilationWindows.map((win) => (
            <div
              key={win.period}
              className="p-4 rounded-lg aeris-subcard aeris-panel-interactive space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="font-mono tabular-nums">{win.period}</span>
                <span>{win.label}</span>
              </div>
              <p
                className={`text-sm font-semibold ${
                  WINDOW_TONE_CLASSES[win.tone]
                }`}
              >
                {win.status}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {win.instruction}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Practical Actions Checklist: Low-Cost & Advanced Recommendations */}
      <section
        aria-label="Practical indoor air interventions"
        className="aeris-panel rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Actionable Indoor Air Plan — Reasoning & Cost Estimates
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Covers dust reduction, damp mopping, kitchen exhaust, mechanical
              filtration, and timed ventilation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono tabular-nums text-xs text-emerald-300">
              {activeCountInPlan} / {plan.recommendations.length} active
            </span>
            <button
              type="button"
              onClick={applyAllLowCost}
              className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0"
            >
              Activate All Low-Cost
            </button>
            <button
              type="button"
              onClick={() => setCheckedIds([])}
              className="px-3 py-1.5 rounded-lg border border-slate-700/90 bg-slate-900/70 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Clear Completed
            </button>
          </div>
        </div>

        {/* Budget Track & Domain Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div
            role="group"
            aria-label="Filter by budget tier"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#060B18] border border-slate-800/90"
          >
            {TIER_FILTER_TABS.map((tab) => {
              const active = tierFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTierFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Filter by intervention category"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#060B18] border border-slate-800/90"
          >
            {DOMAIN_FILTER_TABS.map((tab) => {
              const active = domainFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDomainFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recommendations List */}
        {filteredRecommendations.length === 0 ? (
          <div className="p-8 rounded-lg border border-dashed border-slate-800 text-center space-y-2.5">
            <p className="text-sm font-medium text-slate-200">
              No actions match the selected filter combination
            </p>
            <p className="text-xs text-slate-400">
              Reset the budget or category filter to view all indoor air
              recommendations.
            </p>
            <button
              type="button"
              onClick={() => {
                setDomainFilter('all');
                setTierFilter('all');
              }}
              className="px-3.5 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 transition-colors"
            >
              Show All Recommendations
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecommendations.map((item) => {
              const done = checkedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={done}
                  onClick={() => toggleItem(item.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 ${
                    done
                      ? 'border-emerald-500/35 bg-emerald-500/[0.05]'
                      : 'border-slate-800/90 bg-[#080F1F]/65 hover:border-slate-700'
                  }`}
                >
                  {done ? (
                    <CheckSquare className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        {item.title}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span
                          className={
                            item.priority === 'Essential'
                              ? 'text-rose-300'
                              : item.priority === 'High'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                          }
                        >
                          {item.priority}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span
                          className={
                            item.tier === 'advanced'
                              ? 'text-cyan-300'
                              : 'text-emerald-300'
                          }
                        >
                          {item.tierLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="text-slate-300 font-medium">
                        {item.domainLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-300">
                        Cost: {item.costEstimate}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed">
                      {item.actionStep}
                    </p>

                    <p className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-slate-800/70">
                      <span className="text-slate-300 font-medium">
                        Why it works:{' '}
                      </span>
                      {item.reasoning}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
