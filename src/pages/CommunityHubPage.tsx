import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  Building2,
  Database,
  Loader2,
  LogIn,
  LogOut,
  PlusCircle,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { buildApiUrl } from '../lib/apiClient.ts';
import {
  buildCommunityAggregates,
  containsSensitivePiiOrLocation,
  resolveContributionCo2,
} from '../lib/community.ts';
import { ACTION_CATALOG } from '../lib/emissions.ts';
import {
  deleteOptInContribution,
  formatFirestoreUiError,
  getFirebasePublicStatus,
  isFirebaseConfigured,
  joinCommunityChallenge,
  leaveCommunityChallenge,
  seedChallengesToFirestore,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  subscribeChallengeParticipants,
  subscribeLiveChallenges,
  subscribeLiveContributions,
  submitOptInContribution,
} from '../lib/firebase.ts';
import type {
  ActionType,
  ChallengeParticipantRecord,
  CommunityChallenge,
  CommunityContribution,
  FamilyPreferences,
} from '../lib/types.ts';

interface CommunityHubPageProps {
  preferences: FamilyPreferences;
  onUpdatePreferences: (next: FamilyPreferences) => void;
  authUser?: User | null;
  authReady?: boolean;
  authRedirectError?: string | null;
  onAuthUserChange?: (nextUser: User | null) => void;
}

const DEMO_PARTICIPANTS: ChallengeParticipantRecord[] = [
  { challengeId: 'ncr-metro-week', city: 'Delhi', isMine: false, isDemo: true },
  { challengeId: 'ncr-metro-week', city: 'Gurugram', isMine: false, isDemo: true },
  { challengeId: 'smoke-free-indoors', city: 'Mumbai', isMine: false, isDemo: true },
  { challengeId: 'zero-leaf-burning', city: 'Bengaluru', isMine: false, isDemo: true },
];

export function CommunityHubPage({
  preferences,
  onUpdatePreferences,
  authUser,
  authReady: authReadyProp,
  authRedirectError,
  onAuthUserChange,
}: CommunityHubPageProps) {
  const firebaseReady = isFirebaseConfigured();
  const firebaseStatus = getFirebasePublicStatus();
  const hasLiftedAuth = authReadyProp !== undefined;
  const [localUser, setLocalUser] = useState<User | null>(authUser ?? null);
  const [localAuthReady, setLocalAuthReady] = useState<boolean>(
    authReadyProp ?? !firebaseReady
  );
  const user = hasLiftedAuth ? authUser ?? null : localUser;
  const authReady = hasLiftedAuth ? Boolean(authReadyProp) : localAuthReady;
  const [authAction, setAuthAction] = useState<'idle' | 'signing_in' | 'signing_out'>('idle');
  const [demoChallenges, setDemoChallenges] = useState<CommunityChallenge[]>([]);
  const [demoContributions, setDemoContributions] = useState<
    CommunityContribution[]
  >([]);
  const [liveContributions, setLiveContributions] = useState<
    CommunityContribution[]
  >([]);
  const [liveChallenges, setLiveChallenges] = useState<CommunityChallenge[]>(
    []
  );
  const [liveParticipants, setLiveParticipants] = useState<
    ChallengeParticipantRecord[]
  >([]);

  const [demoJoined, setDemoJoined] = useState<string[]>([]);
  const [previewEmptyState, setPreviewEmptyState] = useState(false);
  const [leaderboardScope, setLeaderboardScope] = useState<'all' | 'city'>(
    'all'
  );

  const [actionType, setActionType] = useState<ActionType>('metro_commute');
  const [challengeId, setChallengeId] = useState('ncr-metro-week');
  const [note, setNote] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load Demo Community reference fallback from server
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(buildApiUrl('/api/community/demo'));
        if (res.ok) {
          const json = (await res.json()) as {
            challenges: CommunityChallenge[];
            contributions: CommunityContribution[];
          };
          setDemoChallenges(json.challenges);
          setDemoContributions(json.contributions);
        }
      } catch {
        // Keep safe empty state if offline
      }
    })();
  }, []);

  useEffect(() => {
    if (authRedirectError) {
      setErrorMessage(authRedirectError);
      setAuthAction('idle');
    }
  }, [authRedirectError]);

  useEffect(() => {
    if (user && authAction === 'signing_in') {
      setAuthAction('idle');
    }
  }, [user, authAction]);

  // Auth subscription fallback when rendered without lifted App auth state
  useEffect(() => {
    if (hasLiftedAuth) return () => {};
    if (!firebaseReady) {
      setLocalAuthReady(true);
      return () => {};
    }
    return subscribeAuth((u) => {
      setLocalUser(u);
      setLocalAuthReady(true);
    });
  }, [firebaseReady, hasLiftedAuth]);

  // Live Firestore subscriptions ONLY when auth is ready, configured, signed in, AND explicitly opted in
  const isLiveOptIn = Boolean(
    authReady && firebaseReady && user && preferences.communityOptIn
  );

  useEffect(() => {
    if (!isLiveOptIn) {
      setLiveContributions([]);
      setLiveChallenges([]);
      setLiveParticipants([]);
      return;
    }

    const unsubContrib = subscribeLiveContributions(
      (items) => {
        setLiveContributions(items);
        setErrorMessage(null);
      },
      (err) =>
        setErrorMessage(
          formatFirestoreUiError(err, {
            projectId: firebaseStatus.projectId,
            databaseId: firebaseStatus.databaseId,
          })
        )
    );

    const unsubChallenges = subscribeLiveChallenges(
      (items) => setLiveChallenges(items),
      (err) =>
        setErrorMessage(
          formatFirestoreUiError(err, {
            projectId: firebaseStatus.projectId,
            databaseId: firebaseStatus.databaseId,
          })
        )
    );

    const unsubEnroll = subscribeChallengeParticipants(
      (records) => setLiveParticipants(records),
      (err) =>
        setErrorMessage(
          formatFirestoreUiError(err, {
            projectId: firebaseStatus.projectId,
            databaseId: firebaseStatus.databaseId,
          })
        )
    );

    return () => {
      unsubContrib();
      unsubChallenges();
      unsubEnroll();
    };
  }, [isLiveOptIn, user?.uid, firebaseStatus.projectId, firebaseStatus.databaseId]);

  // Strict data separation: never mix Demo rows into Live mode
  const activeChallenges = useMemo(() => {
    if (isLiveOptIn && liveChallenges.length > 0) {
      return liveChallenges;
    }
    return demoChallenges;
  }, [isLiveOptIn, liveChallenges, demoChallenges]);

  useEffect(() => {
    if (
      activeChallenges.length > 0 &&
      !activeChallenges.some((c) => c.id === challengeId)
    ) {
      setChallengeId(activeChallenges[0].id);
    }
  }, [activeChallenges, challengeId]);

  const activeFeed = useMemo(() => {
    if (isLiveOptIn) return liveContributions;
    return previewEmptyState ? [] : demoContributions;
  }, [isLiveOptIn, liveContributions, previewEmptyState, demoContributions]);

  const activeParticipants = useMemo<ChallengeParticipantRecord[]>(() => {
    if (isLiveOptIn) return liveParticipants;
    if (previewEmptyState) return [];
    return [
      ...DEMO_PARTICIPANTS,
      ...demoJoined.map((id) => ({
        challengeId: id,
        city: preferences.city,
        isMine: true,
        isDemo: true,
      })),
    ];
  }, [
    isLiveOptIn,
    liveParticipants,
    previewEmptyState,
    demoJoined,
    preferences.city,
  ]);

  const aggregates = useMemo(
    () =>
      buildCommunityAggregates({
        contributions: activeFeed,
        challenges: activeChallenges,
        participants: activeParticipants,
        selectedCity: preferences.city,
        currentHandle: preferences.anonymousHandle,
        cityFilter: leaderboardScope === 'city' ? preferences.city : undefined,
      }),
    [
      activeFeed,
      activeChallenges,
      activeParticipants,
      preferences.city,
      preferences.anonymousHandle,
      leaderboardScope,
    ]
  );

  // Full community totals across all cities for header KPIs & achievements
  const globalAggregates = useMemo(
    () =>
      leaderboardScope === 'all'
        ? aggregates
        : buildCommunityAggregates({
            contributions: activeFeed,
            challenges: activeChallenges,
            participants: activeParticipants,
            selectedCity: preferences.city,
            currentHandle: preferences.anonymousHandle,
          }),
    [
      leaderboardScope,
      aggregates,
      activeFeed,
      activeChallenges,
      activeParticipants,
      preferences.city,
      preferences.anonymousHandle,
    ]
  );

  const unlockedAchievementsCount = useMemo(
    () => globalAggregates.achievements.filter((a) => a.unlocked).length,
    [globalAggregates.achievements]
  );

  const handleSignIn = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!firebaseReady) {
      const primaryWarning = firebaseStatus.warnings[0];
      const missingHint = primaryWarning
        ? ` ${primaryWarning}`
        : firebaseStatus.missingEnvVars.length > 0
        ? ` Missing environment variables: ${firebaseStatus.missingEnvVars.join(', ')}.`
        : '';
      setErrorMessage(
        `Firebase Authentication is not configured in this deployment.${missingHint}`
      );
      return;
    }
    setAuthAction('signing_in');
    try {
      const result = await signInWithGoogle();
      if (result.redirected) {
        setStatusMessage('Redirecting to Google Sign-In...');
        return;
      }
      if (result.user) {
        if (onAuthUserChange) {
          onAuthUserChange(result.user);
        } else {
          setLocalUser(result.user);
          setLocalAuthReady(true);
        }
      }
      setStatusMessage(
        preferences.communityOptIn
          ? `Signed in with Google. Connected to live Firestore anonymously as "${preferences.anonymousHandle}".`
          : 'Signed in with Google. Check "Opt-in to live community" above when you are ready to view and share live anonymous Firestore actions.'
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Google sign-in could not complete.'
      );
    } finally {
      setAuthAction('idle');
    }
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setAuthAction('signing_out');
    try {
      await signOutUser();
      if (onAuthUserChange) {
        onAuthUserChange(null);
      } else {
        setLocalUser(null);
      }
      setStatusMessage(
        'Signed out. Live Firestore sync disconnected; viewing Demo Community Preview.'
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to sign out right now.'
      );
    } finally {
      setAuthAction('idle');
    }
  };

  const handleToggleOptIn = (checked: boolean) => {
    setErrorMessage(null);
    onUpdatePreferences({
      ...preferences,
      communityOptIn: checked,
    });
    setStatusMessage(
      checked
        ? `Opted in to live Firestore community sharing anonymously as "${preferences.anonymousHandle}".`
        : 'Opted out of live community sync. Viewing Demo Community Preview (strictly separate from live Firestore totals).'
    );
  };

  const handleToggleChallenge = async (id: string, currentlyJoined: boolean) => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!isLiveOptIn) {
      setDemoJoined((prev) =>
        currentlyJoined
          ? prev.filter((item) => item !== id)
          : prev.includes(id)
          ? prev
          : [...prev, id]
      );
      setStatusMessage(
        currentlyJoined
          ? 'Removed Demo challenge preview enrollment.'
          : 'Joined in Demo preview mode. Sign in and opt in to persist to Firestore.'
      );
      return;
    }

    if (user && !user.emailVerified) {
      setErrorMessage(
        'Your Google account email must be verified before joining live community challenges.'
      );
      return;
    }

    try {
      if (currentlyJoined) {
        await leaveCommunityChallenge(id);
        setStatusMessage('Left community challenge.');
      } else {
        await joinCommunityChallenge(
          id,
          preferences.city,
          Boolean(preferences.communityOptIn)
        );
        setStatusMessage('Enrolled anonymously in community challenge.');
      }
    } catch (err) {
      setErrorMessage(
        formatFirestoreUiError(err, {
          projectId: firebaseStatus.projectId,
          databaseId: firebaseStatus.databaseId,
        })
      );
    }
  };

  const handleSeedLiveChallenges = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await seedChallengesToFirestore(demoChallenges);
      setStatusMessage('Published seasonal challenges to Firestore.');
    } catch (err) {
      setErrorMessage(
        formatFirestoreUiError(err, {
          projectId: firebaseStatus.projectId,
          databaseId: firebaseStatus.databaseId,
        })
      );
    }
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const piiWarning = containsSensitivePiiOrLocation(
      `${preferences.anonymousHandle} ${note}`
    );
    if (piiWarning) {
      setErrorMessage(piiWarning);
      return;
    }

    if (!isLiveOptIn) {
      setErrorMessage(
        'Sign in with Google and enable Anonymous Community Opt-In above to publish live contributions to Firestore.'
      );
      return;
    }

    if (user && !user.emailVerified) {
      setErrorMessage(
        'Your Google account email must be verified before publishing to the live Firestore community hub.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const { co2AvoidedKg } = resolveContributionCo2(actionType);
      await submitOptInContribution({
        anonymousHandle: preferences.anonymousHandle,
        city: preferences.city,
        actionType,
        co2AvoidedKg,
        optInPublic: Boolean(preferences.communityOptIn),
        note,
        challengeId,
      });
      setNote('');
      setStatusMessage(
        'Anonymous action published to live Firestore community hub.'
      );
    } catch (err) {
      setErrorMessage(
        formatFirestoreUiError(err, {
          projectId: firebaseStatus.projectId,
          databaseId: firebaseStatus.databaseId,
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMine = async (id: string) => {
    setErrorMessage(null);
    try {
      await deleteOptInContribution(id);
      setStatusMessage('Removed your contribution from Firestore.');
    } catch (err) {
      setErrorMessage(
        formatFirestoreUiError(err, {
          projectId: firebaseStatus.projectId,
          databaseId: firebaseStatus.databaseId,
        })
      );
    }
  };

  const isAdminUser = Boolean(
    user?.emailVerified && user.email === 'annanyabagga01@gmail.com'
  );

  return (
    <div className="space-y-6">
      {/* Mode, Auth & Zero-PII Privacy Banner */}
      <section className="aeris-panel rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Users className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="text-lg font-semibold text-slate-100">
              Community Sustainability Hub
            </h2>
            <span
              data-testid="community-mode-label"
              className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                isLiveOptIn
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
              }`}
            >
              {isLiveOptIn ? 'Live Firestore Data' : 'Demo Community Preview'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {isLiveOptIn
              ? `Connected to Firestore · Sharing anonymously as "${preferences.anonymousHandle}" in ${preferences.city}. Zero emails, real names, coordinates, street addresses, or health details are ever stored or displayed.`
              : user
              ? `Signed in with Google (identity kept private; never shown publicly). Demo Community Preview is shown separately until you check "Opt-in to live community" to view and submit live anonymous Firestore actions as "${preferences.anonymousHandle}".`
              : firebaseReady
              ? 'Demo Community Preview (strictly separated from live Firestore totals). Sign in with Google and explicitly opt in to view and submit live anonymous community actions.'
              : `Firebase Authentication is not yet configured in this deployment${
                  firebaseStatus.missingEnvVars.length > 0
                    ? ` (missing ${firebaseStatus.missingEnvVars.join(', ')})`
                    : ''
                }. Displaying labeled Demo Community Preview data only.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!isLiveOptIn && (
            <button
              type="button"
              data-testid="community-demo-empty-toggle"
              onClick={() => setPreviewEmptyState((prev) => !prev)}
              className="px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800/80 transition-colors whitespace-nowrap"
            >
              {previewEmptyState ? 'Show Demo Sample' : 'Preview Empty State'}
            </button>
          )}

          {!authReady ? (
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 whitespace-nowrap">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span>Checking sign-in...</span>
            </span>
          ) : user ? (
            <>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700/80 bg-[#080E1C]/80 text-xs text-slate-200 cursor-pointer hover:border-cyan-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={preferences.communityOptIn}
                  onChange={(e) => handleToggleOptIn(e.target.checked)}
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>Opt-in to live community</span>
              </label>
              <button
                type="button"
                disabled={authAction !== 'idle'}
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {authAction === 'signing_out' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                <span>{authAction === 'signing_out' ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={authAction !== 'idle' || !firebaseReady}
              onClick={() => void handleSignIn()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {authAction === 'signing_in' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>
                {authAction === 'signing_in'
                  ? 'Signing in with Google...'
                  : 'Sign in with Google to Join Live Community'}
              </span>
            </button>
          )}
        </div>
      </section>

      {statusMessage && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* 4-Card Collective KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">
            {isLiveOptIn ? 'Live Recorded Actions' : 'Demo Sample Actions'}
          </p>
          <p
            data-testid="community-total-actions"
            className="text-3xl font-bold font-mono tabular-nums text-cyan-300 mt-1.5"
          >
            {globalAggregates.totalActions}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
            {globalAggregates.quantifiedActions} quantified ·{' '}
            {globalAggregates.qualitativeActions} qualitative
          </p>
        </div>

        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">
            {isLiveOptIn
              ? 'Live Est. CO2e Avoided'
              : 'Demo Est. CO2e Avoided'}
          </p>
          <p
            data-testid="community-total-co2"
            className="text-3xl font-bold font-mono tabular-nums text-emerald-300 mt-1.5"
          >
            {globalAggregates.totalCo2AvoidedKg}{' '}
            <span className="text-sm font-normal text-slate-400">kg</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Personal mode swaps; not city AQI reduction
          </p>
        </div>

        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">Cities &amp; Participants</p>
          <p
            data-testid="community-cities-count"
            className="text-3xl font-bold font-mono tabular-nums text-slate-100 mt-1.5"
          >
            {globalAggregates.citiesCount}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
            {globalAggregates.uniqueContributorsCount} handle(s) ·{' '}
            {globalAggregates.totalEnrolledCount} enrolled
          </p>
        </div>

        <div className="aeris-panel-interactive rounded-xl p-5">
          <p className="text-xs text-slate-400">Collective Achievements</p>
          <p className="text-3xl font-bold font-mono tabular-nums text-amber-300 mt-1.5">
            {unlockedAchievementsCount}/{globalAggregates.achievements.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {isLiveOptIn ? 'Live Firestore milestones' : 'Demo milestone preview'}
          </p>
        </div>
      </div>

      {/* Community Challenges */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Seasonal Community Challenges
            </h3>
            <p className="text-xs text-slate-400">
              {isLiveOptIn && liveChallenges.length > 0
                ? 'Live challenges synced from Firestore'
                : 'Reference seasonal challenge templates (anonymous enrollment & action counts reflect active mode)'}
            </p>
          </div>
          {isLiveOptIn && isAdminUser && liveChallenges.length === 0 && (
            <button
              type="button"
              onClick={() => void handleSeedLiveChallenges()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 transition-colors self-start"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Seed Challenges to Firestore</span>
            </button>
          )}
        </div>

        {globalAggregates.challengeProgress.length === 0 ? (
          <div className="aeris-panel rounded-xl py-10 text-center text-xs text-slate-400">
            No active seasonal challenges available right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {globalAggregates.challengeProgress.map(
              ({
                challenge: ch,
                joined,
                participantsCount,
                actionsLogged,
                progressPct,
              }) => (
                <article
                  key={ch.id}
                  data-testid={`challenge-card-${ch.id}`}
                  className="aeris-panel-interactive rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-cyan-400 font-medium">
                        {ch.cityScope}
                      </span>
                      <span className="font-mono text-slate-400">
                        {ch.isDemo ? 'Template' : 'Firestore Live'}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100">
                      {ch.title}
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {ch.description}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300">
                        <span>
                          {actionsLogged}/{ch.targetActions} actions
                        </span>
                        <span>{participantsCount} joined</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleChallenge(ch.id, joined)}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                        joined
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/25'
                          : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                      }`}
                    >
                      {joined ? 'Joined Anonymously (Leave)' : 'Join Anonymously'}
                    </button>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </section>

      {/* Leaderboard + City-Level Participation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sustainable Habit Leaderboard */}
        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Sustainable Habit Leaderboard
                </h3>
                <p className="text-xs text-slate-400">
                  {isLiveOptIn
                    ? 'Live anonymous handles ranked by verified actions'
                    : 'Demo reference ranking (sign in & opt in for live rankings)'}
                </p>
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Leaderboard city scope"
              className="inline-flex rounded-lg bg-[#070D1D] border border-slate-800 p-1 self-start sm:self-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={leaderboardScope === 'all'}
                onClick={() => setLeaderboardScope('all')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  leaderboardScope === 'all'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Cities
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={leaderboardScope === 'city'}
                onClick={() => setLeaderboardScope('city')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  leaderboardScope === 'city'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {preferences.city} Only
              </button>
            </div>
          </div>

          {aggregates.leaderboard.length === 0 ? (
            <div
              data-testid="leaderboard-empty"
              className="py-10 px-5 text-center border border-dashed border-cyan-500/25 bg-[#060C1A]/60 rounded-xl space-y-2"
            >
              <p className="text-sm font-medium text-slate-200">
                No leaderboard entries yet
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {leaderboardScope === 'city'
                  ? `No opt-in actions recorded for ${preferences.city} yet. Switch to All Cities or log the first habit below.`
                  : 'No opt-in community contributions recorded yet. Share the first anonymous sustainable action to appear here.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {aggregates.leaderboard.map((row) => (
                <div
                  key={`${row.rank}-${row.anonymousHandle}`}
                  className={`py-3 px-2.5 rounded-lg flex items-center justify-between gap-3 ${
                    row.isCurrentUser ? 'bg-emerald-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 text-xs font-mono tabular-nums font-bold text-cyan-300 shrink-0">
                      #{row.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">
                        {row.anonymousHandle}{' '}
                        {row.isCurrentUser && (
                          <span className="text-[11px] font-mono text-emerald-300">
                            (You)
                          </span>
                        )}
                        {row.isDemo && (
                          <span className="text-[11px] font-mono text-amber-300">
                            (Demo)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {row.primaryCity} · {row.quantifiedActions} quantified
                        {row.qualitativeActions > 0
                          ? ` · ${row.qualitativeActions} qualitative`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono tabular-nums font-semibold text-slate-100">
                      {row.totalActions} action(s)
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-emerald-300">
                      {row.totalCo2AvoidedKg > 0
                        ? `${row.totalCo2AvoidedKg} kg CO2e`
                        : 'Qualitative'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* City-Level Participation */}
        <section className="lg:col-span-5 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                City-Level Participation
              </h3>
              <p className="text-xs text-slate-400">
                Aggregated by city name only — zero GPS or street coordinates
              </p>
            </div>
          </div>

          {aggregates.cityParticipation.length === 0 ? (
            <div
              data-testid="city-participation-empty"
              className="py-10 px-5 text-center border border-dashed border-cyan-500/25 bg-[#060C1A]/60 rounded-xl space-y-2"
            >
              <p className="text-sm font-medium text-slate-200">
                No city participation data yet
              </p>
              <p className="text-xs text-slate-400">
                City-level totals appear once opt-in actions or challenge
                enrollments are recorded.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {aggregates.cityParticipation.map((cp) => (
                <div
                  key={cp.city}
                  className={`p-3 rounded-lg border space-y-2 ${
                    cp.isSelectedCity
                      ? 'bg-cyan-500/10 border-cyan-500/35'
                      : 'aeris-subcard'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-100">
                      {cp.city}{' '}
                      {cp.isSelectedCity && (
                        <span className="text-[11px] font-mono text-cyan-300">
                          (Selected)
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-300">
                      {cp.totalActions} action(s) · {cp.totalCo2AvoidedKg} kg
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-300"
                      style={{ width: `${Math.max(4, cp.sharePct)}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono tabular-nums text-slate-400">
                    {cp.contributorsCount} contributor(s) ·{' '}
                    {cp.enrolledParticipants} challenge enrollment(s) ·{' '}
                    {cp.sharePct}% share
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Aggregated Community Achievements */}
      <section className="aeris-panel rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Aggregated Community Achievements
              </h3>
              <p className="text-xs text-slate-400">
                {isLiveOptIn
                  ? 'Computed strictly from live Firestore opt-in community data'
                  : 'Demo reference preview (does not include live Firestore counts)'}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-emerald-300">
            {unlockedAchievementsCount} / {globalAggregates.achievements.length}{' '}
            unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {globalAggregates.achievements.map((ach) => {
            const pct = Math.min(
              100,
              Math.round((ach.current / Math.max(1, ach.target)) * 100)
            );
            return (
              <div
                key={ach.id}
                data-testid={`community-ach-${ach.id}`}
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

      {/* Submit Anonymous Contribution + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Share Anonymous Eco-Action
            </h3>
          </div>
          <form onSubmit={handleSubmitContribution} className="space-y-4 text-sm">
            <div>
              <label
                htmlFor="comm-action"
                className="block text-xs text-slate-400 mb-1"
              >
                Action Type
              </label>
              <select
                id="comm-action"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
              >
                {Object.entries(ACTION_CATALOG).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}{' '}
                    {val.hasReliableFactor
                      ? `(~${val.defaultCo2Kg} kg CO2e)`
                      : '(Qualitative Only)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="comm-challenge"
                className="block text-xs text-slate-400 mb-1"
              >
                Linked Challenge
              </label>
              <select
                id="comm-challenge"
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
              >
                {activeChallenges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="comm-note"
                className="block text-xs text-slate-400 mb-1"
              >
                Public Tip / Note (City-level only — no PII or coordinates)
              </label>
              <input
                id="comm-note"
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., Switched morning commute to Metro..."
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Publishes only handle{' '}
              <strong className="text-slate-200 font-mono">
                {preferences.anonymousHandle}
              </strong>{' '}
              and city{' '}
              <strong className="text-slate-200">{preferences.city}</strong>.
              Household sensitivity flags and exact locations stay strictly on
              your device.
            </p>

            <button
              type="submit"
              disabled={submitting || !isLiveOptIn}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 disabled:opacity-45 transition-colors"
            >
              {submitting
                ? 'Publishing...'
                : 'Publish Anonymously to Firestore'}
            </button>
          </form>
        </section>

        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                {isLiveOptIn
                  ? 'Live Anonymous Feed (Firestore)'
                  : 'Demo Community Feed (Reference Sample Only)'}
              </h3>
              <p className="text-xs text-slate-400">
                {isLiveOptIn
                  ? 'Real verified opt-in community contributions'
                  : 'Sample entries clearly tagged as Demo'}
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {activeFeed.length} entries
            </span>
          </div>

          {activeFeed.length === 0 ? (
            <div
              data-testid="community-feed-empty"
              className="py-12 px-6 text-center border border-dashed border-cyan-500/25 bg-[#060C1A]/60 rounded-xl space-y-2"
            >
              <p className="text-sm font-medium text-slate-200">
                No community contributions yet
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {isLiveOptIn
                  ? 'Live Firestore feed is currently empty. Share the first anonymous sustainable habit on the left to kick off the city totals and leaderboard.'
                  : 'Empty state preview active. Toggle Demo Sample above or sign in with Google to view and publish live Firestore entries.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {activeFeed.map((item) => {
                const isQual =
                  Boolean(item.isQualitative) || item.co2AvoidedKg <= 0;
                return (
                  <div key={item.id} className="py-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-200">
                        {item.anonymousHandle}{' '}
                        <span className="font-normal text-slate-400">
                          · {item.city} ·{' '}
                          {new Date(item.createdAtIso).toLocaleDateString(
                            'en-IN',
                            { dateStyle: 'medium' }
                          )}
                        </span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono tabular-nums ${
                            isQual ? 'text-cyan-300' : 'text-emerald-300'
                          }`}
                        >
                          {isQual
                            ? 'Qualitative Benefit'
                            : `+${item.co2AvoidedKg} kg CO2e`}{' '}
                          {item.isDemo ? '(Demo)' : '(Live)'}
                        </span>
                        {item.isMine && !item.isDemo && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteMine(item.id)}
                            aria-label={`Delete my entry ${item.id}`}
                            className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-cyan-300">
                      {ACTION_CATALOG[item.actionType]?.label ?? item.actionType}
                    </p>
                    {item.note && (
                      <p className="text-xs text-slate-400">{item.note}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
