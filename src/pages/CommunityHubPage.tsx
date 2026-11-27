import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Award,
  Building2,
  CheckCircle2,
  Flame,
  Info,
  Leaf,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  buildCommunityAggregates,
  resolveContributionCo2,
  sanitizeAnonymousHandle,
  sanitizeCityName,
} from '../lib/community.ts';
import {
  addDemoContribution,
  clearDemoCommunityState,
  DEMO_QUICK_PRESETS,
  hasSessionDemoChanges,
  loadDemoCommunityState,
  removeDemoContribution,
  saveDemoCommunityState,
  toggleDemoChallengeEnrollment,
  type DemoCommunityState,
  type DemoQuickPreset,
} from '../lib/communityDemoEngine.ts';
import { ACTION_CATALOG } from '../lib/emissions.ts';
import type { ActionType, FamilyPreferences } from '../lib/types.ts';

interface CommunityHubPageProps {
  preferences: FamilyPreferences;
  onUpdatePreferences: (next: FamilyPreferences) => void;
}

const ACTION_TYPES: ActionType[] = [
  'metro_commute',
  'bus_commute',
  'carpool',
  'energy_saving',
  'no_burning',
  'hepa_maintenance',
];

export function CommunityHubPage({
  preferences,
  onUpdatePreferences,
}: CommunityHubPageProps) {
  const [demoState, setDemoState] = useState<DemoCommunityState>(() =>
    loadDemoCommunityState()
  );

  // Interactive form & filter state
  const [handleInput, setHandleInput] = useState<string>(
    preferences.anonymousHandle || 'UrbanResident'
  );
  const [cityInput, setCityInput] = useState<string>(
    sanitizeCityName(preferences.city || 'Delhi')
  );
  const [actionType, setActionType] = useState<ActionType>('metro_commute');
  const [challengeId, setChallengeId] = useState<string>('ncr-metro-week');
  const [note, setNote] = useState<string>('');
  const [scopeTab, setScopeTab] = useState<'all' | 'city'>('all');

  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  useEffect(() => {
    saveDemoCommunityState(demoState);
  }, [demoState]);

  useEffect(() => {
    setCityInput(sanitizeCityName(preferences.city || 'Delhi'));
  }, [preferences.city]);

  const effectiveHandle = sanitizeAnonymousHandle(
    handleInput || preferences.anonymousHandle || 'UrbanResident'
  );
  const effectiveCity = sanitizeCityName(cityInput || preferences.city || 'Delhi');
  const selectedActionMeta = ACTION_CATALOG[actionType];
  const selectedCo2Preview = resolveContributionCo2(actionType);

  const aggregates = useMemo(
    () =>
      buildCommunityAggregates({
        contributions: demoState.contributions,
        challenges: demoState.challenges,
        participants: demoState.participants,
        selectedCity: preferences.city,
        currentHandle: effectiveHandle,
        cityFilter: scopeTab === 'city' ? preferences.city : undefined,
      }),
    [demoState, preferences.city, effectiveHandle, scopeTab]
  );

  const challengeTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ch of demoState.challenges) {
      map.set(ch.id, ch.title);
    }
    return map;
  }, [demoState.challenges]);

  const visibleContributions = useMemo(() => {
    if (scopeTab === 'city') {
      const target = sanitizeCityName(preferences.city).toLowerCase();
      return demoState.contributions.filter(
        (c) => sanitizeCityName(c.city).toLowerCase() === target
      );
    }
    return demoState.contributions;
  }, [demoState.contributions, scopeTab, preferences.city]);

  const unlockedCount = aggregates.achievements.filter((a) => a.unlocked).length;
  const sessionModified = hasSessionDemoChanges(demoState);

  const handleToggleChallenge = (targetChallengeId: string, title: string) => {
    setFormError(null);
    const result = toggleDemoChallengeEnrollment(demoState, {
      challengeId: targetChallengeId,
      city: effectiveCity,
    });
    setDemoState(result.state);
    setFeedbackNotice(
      result.joined
        ? `DEMO ACTION: Joined "${title}" in Demo Mode (${effectiveCity}). Participation counts updated locally.`
        : `DEMO ACTION: Left "${title}" in Demo Mode. Participation counts updated locally.`
    );
  };

  const handleLogAction = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFeedbackNotice(null);

    try {
      const { state: nextState, contribution } = addDemoContribution(demoState, {
        anonymousHandle: handleInput,
        city: effectiveCity,
        actionType,
        co2AvoidedKg: selectedCo2Preview.co2AvoidedKg,
        note: note.trim() || undefined,
        challengeId: challengeId || undefined,
      });

      setDemoState(nextState);
      setNote('');

      if (
        contribution.anonymousHandle !== preferences.anonymousHandle &&
        contribution.anonymousHandle.length >= 2
      ) {
        onUpdatePreferences({
          ...preferences,
          anonymousHandle: contribution.anonymousHandle,
        });
      }

      const co2Summary = contribution.isQualitative
        ? 'qualitative habit (0 kg CO2e estimate)'
        : `${contribution.co2AvoidedKg.toFixed(1)} kg illustrative CO2e estimate`;

      setFeedbackNotice(
        `DEMO ACTION: Logged "${ACTION_CATALOG[contribution.actionType].label}" as ${contribution.anonymousHandle} in ${contribution.city} (${co2Summary}). Stored locally for this demonstration session only.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Could not log this demo sustainability action.'
      );
    }
  };

  const handleQuickPreset = (preset: DemoQuickPreset) => {
    setFormError(null);
    setFeedbackNotice(null);
    try {
      const { state: nextState, contribution } = addDemoContribution(demoState, {
        anonymousHandle: handleInput || preferences.anonymousHandle || 'UrbanResident',
        city: effectiveCity,
        actionType: preset.actionType,
        challengeId: preset.challengeId,
        note: preset.note,
      });
      setDemoState(nextState);
      setFeedbackNotice(
        `DEMO ACTION: Added sample "${ACTION_CATALOG[contribution.actionType].label}" (${contribution.city}) to your interactive demo session.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not add sample demo action.'
      );
    }
  };

  const handleRemoveDemoAction = (contributionId: string) => {
    setFormError(null);
    setDemoState((prev) => removeDemoContribution(prev, contributionId));
    setFeedbackNotice(
      'DEMO ACTION: Removed your demonstration action from this session.'
    );
  };

  const handleResetDemo = () => {
    setFormError(null);
    const reset = clearDemoCommunityState();
    setDemoState(reset);
    setFeedbackNotice(
      'DEMO ACTION: Demonstration data restored to deterministic initial sample values.'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner — Login-Free Interactive Demo Mode */}
      <section className="aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <Users className="w-5 h-5 text-cyan-400 shrink-0" />
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-50 tracking-tight">
                Community Sustainability Hub
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-200 border border-amber-400/40">
                <Sparkles className="w-3 h-3 text-amber-300" />
                DEMO MODE
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Explore sustainability challenges, track sample community actions
              and discover ways to build a cleaner future.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-slate-700/80 bg-[#080E1C] p-0.5 text-xs"
              role="tablist"
              aria-label="Community City Scope"
            >
              <button
                type="button"
                role="tab"
                aria-selected={scopeTab === 'all'}
                onClick={() => setScopeTab('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  scopeTab === 'all'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Cities
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scopeTab === 'city'}
                onClick={() => setScopeTab('city')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  scopeTab === 'city'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sanitizeCityName(preferences.city)}
              </button>
            </div>

            {sessionModified && (
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:border-amber-400/45 hover:text-amber-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>
            )}
          </div>
        </div>

        {/* Mandatory Visible Demo Mode Disclaimer */}
        <div
          role="note"
          className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex items-start gap-3 text-xs text-amber-100"
        >
          <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-100">
              This is an interactive demonstration. Community statistics and
              participation records are simulated and are not live community
              submissions.
            </p>
            <p className="text-amber-200/80">
              No sign-in is required. Any actions you log or challenges you join
              update this interactive preview locally in your browser session
              using fictional anonymous handles and illustrative CO2e estimates.
            </p>
          </div>
        </div>

        {feedbackNotice && (
          <div
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-200"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{feedbackNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackNotice(null)}
              className="text-emerald-300/80 hover:text-emerald-100 text-[11px] underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* 4-Card Demo KPI Overview Strip */}
      <section
        aria-label="Demo Community Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="aeris-panel rounded-xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">
              Demo Sample Actions
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              DEMO DATA
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-slate-50">
            {aggregates.totalActions}
          </p>
          <p className="text-xs text-slate-400">
            {aggregates.quantifiedActions} quantified ·{' '}
            {aggregates.qualitativeActions} qualitative habits
          </p>
        </div>

        <div className="aeris-panel rounded-xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">
              Demo Est. CO2e Avoided
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              DEMO DATA
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-emerald-300">
            {aggregates.totalCo2AvoidedKg.toFixed(1)}{' '}
            <span className="text-sm font-normal text-slate-400">kg</span>
          </p>
          <p className="text-xs text-slate-400">
            Illustrative per-action estimate · not city AQI reduction
          </p>
        </div>

        <div className="aeris-panel rounded-xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">
              Demo Cities &amp; Participants
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              DEMO DATA
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-cyan-300">
            {aggregates.citiesCount}{' '}
            <span className="text-sm font-normal text-slate-400">cities</span>
          </p>
          <p className="text-xs text-slate-400">
            {aggregates.uniqueContributorsCount} fictional handles ·{' '}
            {aggregates.totalEnrolledCount} challenge joins
          </p>
        </div>

        <div className="aeris-panel rounded-xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">
              Demo Collective Milestones
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              DEMO DATA
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-amber-300">
            {unlockedCount} / {aggregates.achievements.length}
          </p>
          <p className="text-xs text-slate-400">
            Updates live as you log demo actions &amp; join challenges
          </p>
        </div>
      </section>

      {/* Seasonal Community Challenges */}
      <section className="aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Seasonal Community Challenges
              </h3>
              <p className="text-xs text-slate-400">
                Join or leave sample challenges to test interactive community
                participation counts.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            SIMULATED CHALLENGES
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {aggregates.challengeProgress.map((item) => {
            const { challenge } = item;
            return (
              <article
                key={challenge.id}
                className="aeris-subcard rounded-xl p-4 flex flex-col justify-between gap-4 border border-slate-800/90 hover:border-cyan-500/35 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-cyan-300 font-medium">
                      <MapPin className="w-3.5 h-3.5" />
                      {challenge.cityScope}
                    </span>
                    <span className="font-mono text-amber-300/90">
                      DEMO DATA
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-slate-100">
                    {challenge.title}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {challenge.description}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                      <span>
                        {item.actionsLogged} / {challenge.targetActions} demo
                        actions
                      </span>
                      <span className="text-cyan-300">{item.progressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                        style={{ width: `${Math.max(4, item.progressPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {item.participantsCount} demo{' '}
                      {item.participantsCount === 1
                        ? 'participant'
                        : 'participants'}
                    </span>
                    <span className="font-mono text-emerald-300/90">
                      ~{item.co2AvoidedKg.toFixed(1)} kg est.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleToggleChallenge(challenge.id, challenge.title)
                    }
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      item.joined
                        ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/45 hover:bg-rose-500/15 hover:text-rose-200 hover:border-rose-500/40'
                        : 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/25'
                    }`}
                  >
                    {item.joined ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Joined (Leave Demo)</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Join Challenge</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Main Split: Log Demo Sustainability Action + Leaderboard & City Participation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Log Demo Action Form */}
        <section className="lg:col-span-5 aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Log a Demo Sustainability Action
                </h3>
                <p className="text-xs text-slate-400">
                  Try submitting an anonymous demo habit — updates charts &amp;
                  milestones immediately with zero login.
                </p>
              </div>
            </div>
          </div>

          {/* 1-Click Sample Demo Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Quick Demo Actions
            </span>
            <div className="flex flex-wrap gap-2">
              {DEMO_QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleQuickPreset(preset)}
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 text-xs font-medium hover:bg-cyan-500/20 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleLogAction} className="space-y-3.5 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="demo-handle"
                  className="block text-xs text-slate-400 mb-1"
                >
                  Anonymous Demo Handle
                </label>
                <input
                  id="demo-handle"
                  type="text"
                  maxLength={36}
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  placeholder="UrbanResident"
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="demo-city"
                  className="block text-xs text-slate-400 mb-1"
                >
                  City (City-Level Only)
                </label>
                <input
                  id="demo-city"
                  type="text"
                  maxLength={40}
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="Delhi"
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 text-xs"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="demo-action-type"
                className="block text-xs text-slate-400 mb-1"
              >
                Sustainability Action
              </label>
              <select
                id="demo-action-type"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 text-xs"
              >
                {ACTION_TYPES.map((t) => {
                  const meta = ACTION_CATALOG[t];
                  const labelSuffix = meta.hasReliableFactor
                    ? ` (~${meta.defaultCo2Kg} kg est. CO2e)`
                    : ' (Qualitative habit)';
                  return (
                    <option key={t} value={t}>
                      {meta.label}
                      {labelSuffix}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                {selectedCo2Preview.isQualitative
                  ? `${selectedActionMeta.description} Counted as a qualitative habit (0 kg CO2e estimate).`
                  : `${selectedActionMeta.description} Illustrative factor estimate: ~${selectedCo2Preview.co2AvoidedKg} kg CO2e per action.`}
              </p>
            </div>

            <div>
              <label
                htmlFor="demo-challenge"
                className="block text-xs text-slate-400 mb-1"
              >
                Link to Seasonal Challenge (Optional)
              </label>
              <select
                id="demo-challenge"
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 text-xs"
              >
                <option value="">General Community Habit (No Challenge)</option>
                {demoState.challenges.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.title} ({ch.cityScope})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="demo-note"
                className="block text-xs text-slate-400 mb-1"
              >
                Short Demo Note (Optional · No Personal Info)
              </label>
              <textarea
                id="demo-note"
                rows={2}
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., Swapped evening solo car trip for Metro rail."
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 text-xs resize-none"
              />
            </div>

            {formError && (
              <p
                role="alert"
                className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/35 rounded-lg px-3 py-2"
              >
                {formError}
              </p>
            )}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs sm:text-sm hover:bg-cyan-400 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>Log Demo Action</span>
            </button>

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Local Demo Mode only — no account required and demo actions stay
                strictly in your browser.
              </span>
            </p>
          </form>
        </section>

        {/* Sustainable Habit Leaderboard & City-Level Participation */}
        <section className="lg:col-span-7 space-y-6">
          {/* Leaderboard */}
          <div className="aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    Demo Participant Leaderboard
                  </h3>
                  <p className="text-xs text-slate-400">
                    Fictional anonymous handles only · ranked by demo actions
                    logged
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                DEMO DATA
              </span>
            </div>

            {aggregates.leaderboard.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No demo actions recorded for {sanitizeCityName(preferences.city)}{' '}
                yet. Log a demo action on the left to appear here!
              </p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {aggregates.leaderboard.map((entry) => (
                  <div
                    key={entry.anonymousHandle}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-md font-mono font-bold flex items-center justify-center shrink-0 ${
                          entry.rank === 1
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                            : entry.rank === 2
                            ? 'bg-slate-400/15 text-slate-200 border border-slate-500/40'
                            : entry.rank === 3
                            ? 'bg-orange-500/15 text-orange-300 border border-orange-500/40'
                            : 'bg-slate-800/80 text-slate-400'
                        }`}
                      >
                        {entry.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-100 truncate">
                            {entry.anonymousHandle}
                          </span>
                          {entry.isCurrentUser ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                              YOU (DEMO)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                              SAMPLE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {entry.primaryCity} · {entry.quantifiedActions}{' '}
                          quantified, {entry.qualitativeActions} qualitative
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <p className="text-slate-100 font-semibold">
                        {entry.totalActions}{' '}
                        {entry.totalActions === 1 ? 'action' : 'actions'}
                      </p>
                      <p className="text-[11px] text-emerald-300/90">
                        {entry.totalCo2AvoidedKg > 0
                          ? `~${entry.totalCo2AvoidedKg.toFixed(1)} kg est.`
                          : 'Qualitative'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* City-Level Participation */}
          <div className="aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    City-Level Demo Participation
                  </h3>
                  <p className="text-xs text-slate-400">
                    Simulated action share &amp; challenge enrollments by Indian
                    city
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                DEMO DATA
              </span>
            </div>

            {aggregates.cityParticipation.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                No city demo participation records match this filter yet.
              </p>
            ) : (
              <div className="space-y-3">
                {aggregates.cityParticipation.slice(0, 6).map((row) => (
                  <div key={row.city} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-100 truncate">
                          {row.city}
                        </span>
                        {row.isSelectedCity && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
                            YOUR CITY
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-300 shrink-0">
                        {row.totalActions} actions · {row.enrolledParticipants}{' '}
                        enrolled · ~{row.totalCo2AvoidedKg.toFixed(1)} kg
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                        style={{ width: `${Math.max(6, row.sharePct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Collective Achievements */}
      <section className="aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Collective Demo Achievements
              </h3>
              <p className="text-xs text-slate-400">
                Milestones unlock dynamically as sample and session demo habits
                accumulate.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-300">
            {unlockedCount} / {aggregates.achievements.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {aggregates.achievements.map((ach) => {
            const pct = Math.min(
              100,
              Math.round((ach.current / Math.max(1, ach.target)) * 100)
            );
            return (
              <div
                key={ach.id}
                className={`rounded-xl p-4 border space-y-2.5 transition-colors ${
                  ach.unlocked
                    ? 'bg-emerald-500/10 border-emerald-500/35'
                    : 'aeris-subcard border-slate-800/90'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">
                    {ach.title}
                  </h4>
                  <span
                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                      ach.unlocked
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {ach.unlocked ? 'UNLOCKED' : 'IN PROGRESS'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {ach.description}
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span>
                      {ach.current} / {ach.target} {ach.unit}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        ach.unlocked ? 'bg-emerald-400' : 'bg-cyan-400'
                      }`}
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Demo Community Activity Feed */}
      <section className="aeris-panel rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Demo Community Actions Feed
            </h3>
            <p className="text-xs text-slate-400">
              Simulated anonymous habits and your local session demo entries.
            </p>
          </div>
          <span className="text-[11px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded">
            {visibleContributions.length} DEMO ENTRIES
          </span>
        </div>

        {visibleContributions.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            No demo actions found for {sanitizeCityName(preferences.city)} yet.
            Switch to &ldquo;All Cities&rdquo; or log a new demo action above.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {visibleContributions.map((item) => {
              const meta = ACTION_CATALOG[item.actionType];
              const linkedChallenge = item.challengeId
                ? challengeTitleMap.get(item.challengeId)
                : undefined;

              return (
                <article
                  key={item.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-100">
                        {item.anonymousHandle}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-cyan-300">{item.city}</span>
                      {item.isMine ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                          YOUR DEMO ACTION
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          DEMO DATA
                        </span>
                      )}
                      {linkedChallenge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800/90 text-slate-300 border border-slate-700/80">
                          {linkedChallenge}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-200 font-medium">
                      {meta?.label ?? item.actionType}
                    </p>
                    {item.note && (
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {item.note}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right font-mono">
                      {item.isQualitative || item.co2AvoidedKg <= 0 ? (
                        <span className="text-xs text-cyan-300">
                          Qualitative habit
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-300 font-semibold">
                          ~{item.co2AvoidedKg.toFixed(1)} kg est. CO2e
                        </span>
                      )}
                      <p className="text-[10px] text-slate-500">
                        {new Date(item.createdAtIso).toLocaleDateString(
                          'en-IN',
                          {
                            day: '2-digit',
                            month: 'short',
                          }
                        )}
                      </p>
                    </div>

                    {item.isMine && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDemoAction(item.id)}
                        title="Remove your demo action"
                        className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 leading-relaxed">
          Methodology note: CO2e figures shown in Demo Mode are illustrative
          per-action estimates based on standard Indian commute and household
          factors. Qualitative habits (zero burning, HEPA filter care) are
          tracked as action counts without invented CO2e values. Individual
          habits do not represent measured city-level AQI reductions.
        </p>
      </section>
    </div>
  );
}
