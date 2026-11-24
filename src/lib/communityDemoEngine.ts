import {
  containsSensitivePiiOrLocation,
  resolveContributionCo2,
  sanitizeAnonymousHandle,
  sanitizeCityName,
} from './community.ts';
import type {
  ActionType,
  ChallengeParticipantRecord,
  CommunityChallenge,
  CommunityContribution,
} from './types.ts';

export interface DemoCommunityState {
  challenges: CommunityChallenge[];
  contributions: CommunityContribution[];
  participants: ChallengeParticipantRecord[];
  nextActionSeq: number;
}

export interface AddDemoContributionInput {
  anonymousHandle: string;
  city: string;
  actionType: ActionType;
  co2AvoidedKg?: number;
  note?: string;
  challengeId?: string;
  createdAtIso?: string;
}

export interface DemoQuickPreset {
  id: string;
  label: string;
  actionType: ActionType;
  challengeId: string;
  note: string;
}

export const DEMO_SESSION_STORAGE_KEY = 'aeris_community_demo_state_v1';

export const DEMO_QUICK_PRESETS: DemoQuickPreset[] = [
  {
    id: 'preset_metro',
    label: '+ Metro Commute Swap',
    actionType: 'metro_commute',
    challengeId: 'ncr-metro-week',
    note: 'Demo action: Took Metro rail instead of a solo private car commute.',
  },
  {
    id: 'preset_no_burning',
    label: '+ Zero Leaf Burning',
    actionType: 'no_burning',
    challengeId: 'zero-leaf-burning',
    note: 'Demo action: Composted garden dry leaves instead of open burning.',
  },
  {
    id: 'preset_hepa',
    label: '+ HEPA Filter Care',
    actionType: 'hepa_maintenance',
    challengeId: 'smoke-free-indoors',
    note: 'Demo action: Cleaned purifier pre-filter and sealed indoor window gaps.',
  },
];

export const INITIAL_DEMO_CHALLENGES: readonly CommunityChallenge[] = [
  {
    id: 'ncr-metro-week',
    title: '7-Day Metro & Bus Swap',
    description:
      'Replace solo car or two-wheeler commutes with Metro rail, city bus, or shared carpools for one week.',
    cityScope: 'Delhi NCR',
    targetActions: 25,
    isDemo: true,
  },
  {
    id: 'smoke-free-indoors',
    title: 'Smoke-Free Indoor Week',
    description:
      'Avoid incense, indoor smoking, and open-flame soot while maintaining clean HEPA pre-filters and energy-efficient cooling.',
    cityScope: 'All India',
    targetActions: 20,
    isDemo: true,
  },
  {
    id: 'zero-leaf-burning',
    title: 'Zero Leaf & Trash Burning Pledge',
    description:
      'Compost dry garden waste and report local biomass burning to civic clean-air helplines.',
    cityScope: 'All India',
    targetActions: 15,
    isDemo: true,
  },
];

export const INITIAL_DEMO_CONTRIBUTIONS: readonly CommunityContribution[] = [
  {
    id: 'demo_c_1',
    anonymousHandle: 'MetroRider_NCR',
    city: 'Delhi',
    actionType: 'metro_commute',
    co2AvoidedKg: 3.1,
    isQualitative: false,
    note: 'Swapped morning solo car commute for Metro rail during peak smog hours.',
    challengeId: 'ncr-metro-week',
    createdAtIso: '2026-11-24T08:15:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_2',
    anonymousHandle: 'CleanAir_Gurgaon',
    city: 'Gurugram',
    actionType: 'carpool',
    co2AvoidedKg: 2.6,
    isQualitative: false,
    note: 'Shared a 16 km office carpool with 3 neighbours instead of separate vehicles.',
    challengeId: 'ncr-metro-week',
    createdAtIso: '2026-11-24T07:45:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_3',
    anonymousHandle: 'BreatheBetter_MUM',
    city: 'Mumbai',
    actionType: 'bus_commute',
    co2AvoidedKg: 2.8,
    isQualitative: false,
    note: 'Took electric city bus corridor instead of an individual cab ride.',
    challengeId: 'ncr-metro-week',
    createdAtIso: '2026-11-24T07:10:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_4',
    anonymousHandle: 'ZeroSmoke_BLR',
    city: 'Bengaluru',
    actionType: 'no_burning',
    co2AvoidedKg: 0,
    isQualitative: true,
    note: 'Composted apartment garden dry leaves rather than burning yard waste.',
    challengeId: 'zero-leaf-burning',
    createdAtIso: '2026-11-24T06:40:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_5',
    anonymousHandle: 'FreshHome_DEL',
    city: 'Delhi',
    actionType: 'hepa_maintenance',
    co2AvoidedKg: 0,
    isQualitative: true,
    note: 'Vacuumed HEPA pre-filter and sealed balcony door gaps before evening haze.',
    challengeId: 'smoke-free-indoors',
    createdAtIso: '2026-11-24T06:05:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_6',
    anonymousHandle: 'GreenGrid_PUN',
    city: 'Pune',
    actionType: 'energy_saving',
    co2AvoidedKg: 1.8,
    isQualitative: false,
    note: 'Switched home workspace to LED lighting and raised cooling setpoint by 2°C.',
    challengeId: 'smoke-free-indoors',
    createdAtIso: '2026-11-23T18:30:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_7',
    anonymousHandle: 'MetroRider_NCR',
    city: 'Delhi',
    actionType: 'metro_commute',
    co2AvoidedKg: 3.1,
    isQualitative: false,
    note: 'Used Metro feeder shuttle and rail line for evening return trip.',
    challengeId: 'ncr-metro-week',
    createdAtIso: '2026-11-23T17:20:00.000Z',
    isDemo: true,
    isMine: false,
  },
  {
    id: 'demo_c_8',
    anonymousHandle: 'CleanPulse_HYD',
    city: 'Hyderabad',
    actionType: 'carpool',
    co2AvoidedKg: 2.6,
    isQualitative: false,
    note: 'Coordinated a 3-person shared commute to the tech park corridor.',
    challengeId: 'ncr-metro-week',
    createdAtIso: '2026-11-23T16:10:00.000Z',
    isDemo: true,
    isMine: false,
  },
];

export const INITIAL_DEMO_PARTICIPANTS: readonly ChallengeParticipantRecord[] = [
  { challengeId: 'ncr-metro-week', city: 'Delhi', isMine: false, isDemo: true },
  { challengeId: 'ncr-metro-week', city: 'Gurugram', isMine: false, isDemo: true },
  { challengeId: 'ncr-metro-week', city: 'Mumbai', isMine: false, isDemo: true },
  { challengeId: 'ncr-metro-week', city: 'Hyderabad', isMine: false, isDemo: true },
  { challengeId: 'smoke-free-indoors', city: 'Delhi', isMine: false, isDemo: true },
  { challengeId: 'smoke-free-indoors', city: 'Pune', isMine: false, isDemo: true },
  { challengeId: 'zero-leaf-burning', city: 'Bengaluru', isMine: false, isDemo: true },
  { challengeId: 'zero-leaf-burning', city: 'Delhi', isMine: false, isDemo: true },
];

export function createInitialDemoCommunityState(): DemoCommunityState {
  return {
    challenges: INITIAL_DEMO_CHALLENGES.map((ch) => ({ ...ch, isDemo: true })),
    contributions: INITIAL_DEMO_CONTRIBUTIONS.map((item) => ({
      ...item,
      isDemo: true,
    })),
    participants: INITIAL_DEMO_PARTICIPANTS.map((p) => ({
      ...p,
      isDemo: true,
    })),
    nextActionSeq: INITIAL_DEMO_CONTRIBUTIONS.length + 1,
  };
}

export function addDemoContribution(
  state: DemoCommunityState,
  input: AddDemoContributionInput
): { state: DemoCommunityState; contribution: CommunityContribution } {
  const combinedText = `${input.anonymousHandle} ${input.note ?? ''}`;
  const piiError = containsSensitivePiiOrLocation(combinedText);
  if (piiError) {
    throw new Error(piiError);
  }

  const anonymousHandle = sanitizeAnonymousHandle(input.anonymousHandle);
  const city = sanitizeCityName(input.city);
  const { co2AvoidedKg, isQualitative } = resolveContributionCo2(
    input.actionType,
    input.co2AvoidedKg
  );

  const trimmedNote = input.note?.trim().slice(0, 240);
  const validChallengeIds = new Set(state.challenges.map((ch) => ch.id));
  const challengeId =
    input.challengeId && validChallengeIds.has(input.challengeId)
      ? input.challengeId
      : undefined;

  const seq = state.nextActionSeq;
  const contribution: CommunityContribution = {
    id: `demo_user_${seq}`,
    anonymousHandle,
    city,
    actionType: input.actionType,
    co2AvoidedKg,
    isQualitative,
    note: trimmedNote || undefined,
    challengeId,
    createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    isDemo: true,
    isMine: true,
  };

  return {
    contribution,
    state: {
      ...state,
      contributions: [contribution, ...state.contributions],
      nextActionSeq: seq + 1,
    },
  };
}

export function removeDemoContribution(
  state: DemoCommunityState,
  contributionId: string
): DemoCommunityState {
  const target = state.contributions.find((item) => item.id === contributionId);
  if (!target || !target.isMine) {
    return state;
  }
  return {
    ...state,
    contributions: state.contributions.filter(
      (item) => item.id !== contributionId
    ),
  };
}

export function toggleDemoChallengeEnrollment(
  state: DemoCommunityState,
  params: { challengeId: string; city: string }
): { state: DemoCommunityState; joined: boolean } {
  const challengeExists = state.challenges.some(
    (ch) => ch.id === params.challengeId
  );
  if (!challengeExists) {
    return { state, joined: false };
  }

  const alreadyJoined = state.participants.some(
    (p) => p.challengeId === params.challengeId && p.isMine
  );

  if (alreadyJoined) {
    return {
      joined: false,
      state: {
        ...state,
        participants: state.participants.filter(
          (p) => !(p.challengeId === params.challengeId && p.isMine)
        ),
      },
    };
  }

  const record: ChallengeParticipantRecord = {
    challengeId: params.challengeId,
    city: sanitizeCityName(params.city),
    isMine: true,
    isDemo: true,
  };

  return {
    joined: true,
    state: {
      ...state,
      participants: [...state.participants, record],
    },
  };
}

export function hasSessionDemoChanges(state: DemoCommunityState): boolean {
  return (
    state.contributions.some((c) => c.isMine) ||
    state.participants.some((p) => p.isMine)
  );
}

export function loadDemoCommunityState(): DemoCommunityState {
  const initial = createInitialDemoCommunityState();
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return initial;
  }
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<DemoCommunityState>;
    if (
      !Array.isArray(parsed.challenges) ||
      !Array.isArray(parsed.contributions) ||
      !Array.isArray(parsed.participants) ||
      typeof parsed.nextActionSeq !== 'number'
    ) {
      return initial;
    }
    return {
      challenges: parsed.challenges.map((ch) => ({ ...ch, isDemo: true })),
      contributions: parsed.contributions.map((c) => ({ ...c, isDemo: true })),
      participants: parsed.participants.map((p) => ({ ...p, isDemo: true })),
      nextActionSeq: Math.max(
        initial.nextActionSeq,
        Math.floor(parsed.nextActionSeq)
      ),
    };
  } catch {
    return initial;
  }
}

export function saveDemoCommunityState(state: DemoCommunityState): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      DEMO_SESSION_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota or private browsing errors cleanly
  }
}

export function clearDemoCommunityState(): DemoCommunityState {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors cleanly
    }
  }
  return createInitialDemoCommunityState();
}
