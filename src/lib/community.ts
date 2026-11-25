import { ACTION_CATALOG } from './emissions.ts';
import type {
  ActionType,
  ChallengeParticipantRecord,
  CommunityChallenge,
  CommunityContribution,
} from './types.ts';

export interface LeaderboardEntry {
  rank: number;
  anonymousHandle: string;
  primaryCity: string;
  totalActions: number;
  quantifiedActions: number;
  qualitativeActions: number;
  totalCo2AvoidedKg: number;
  isCurrentUser: boolean;
  isDemo: boolean;
}

export interface CityParticipationStat {
  city: string;
  totalActions: number;
  contributorsCount: number;
  enrolledParticipants: number;
  totalCo2AvoidedKg: number;
  sharePct: number;
  isSelectedCity: boolean;
}

export interface ChallengeProgressStat {
  challenge: CommunityChallenge;
  joined: boolean;
  participantsCount: number;
  actionsLogged: number;
  co2AvoidedKg: number;
  progressPct: number;
}

export interface CommunityAchievement {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unit: string;
  unlocked: boolean;
}

export interface CommunityAggregates {
  totalActions: number;
  quantifiedActions: number;
  qualitativeActions: number;
  totalCo2AvoidedKg: number;
  citiesCount: number;
  uniqueContributorsCount: number;
  totalEnrolledCount: number;
  leaderboard: LeaderboardEntry[];
  cityParticipation: CityParticipationStat[];
  challengeProgress: ChallengeProgressStat[];
  achievements: CommunityAchievement[];
}

const COORDINATE_REGEX = /\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /\b(?:\+?\d[\d\s\-]{8,}\d)\b/;

export function containsSensitivePiiOrLocation(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (EMAIL_REGEX.test(trimmed)) {
    return 'Please remove email addresses before posting to the anonymous community feed.';
  }
  if (COORDINATE_REGEX.test(trimmed)) {
    return 'Please remove GPS coordinates — only city-level names are permitted.';
  }
  if (PHONE_REGEX.test(trimmed)) {
    return 'Please remove phone numbers or personal IDs before sharing anonymously.';
  }
  return null;
}

export function sanitizeCityName(rawCity: string): string {
  const lettersOnly = rawCity.replace(/[^a-zA-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (lettersOnly.length < 2) return 'Delhi';
  return lettersOnly.slice(0, 60);
}

export function sanitizeAnonymousHandle(rawHandle: string): string {
  const cleaned = rawHandle.replace(/[^a-zA-Z0-9_\- ]+/g, '').trim().slice(0, 40);
  return cleaned.length >= 2 ? cleaned : 'UrbanResident';
}

export function resolveContributionCo2(
  actionType: ActionType,
  rawCo2?: number
): { co2AvoidedKg: number; isQualitative: boolean } {
  const meta = ACTION_CATALOG[actionType];
  if (!meta || !meta.hasReliableFactor || meta.defaultCo2Kg <= 0) {
    return { co2AvoidedKg: 0, isQualitative: true };
  }
  const value =
    typeof rawCo2 === 'number' && Number.isFinite(rawCo2) && rawCo2 > 0
      ? Math.min(500, Number(rawCo2.toFixed(2)))
      : meta.defaultCo2Kg;
  return { co2AvoidedKg: value, isQualitative: false };
}

export function buildCommunityAggregates(params: {
  contributions: CommunityContribution[];
  challenges: CommunityChallenge[];
  participants: ChallengeParticipantRecord[];
  selectedCity: string;
  currentHandle?: string;
  cityFilter?: string;
}): CommunityAggregates {
  const {
    contributions,
    challenges,
    participants,
    selectedCity,
    currentHandle,
    cityFilter,
  } = params;

  const filteredContributions = cityFilter
    ? contributions.filter(
        (c) => c.city.toLowerCase() === cityFilter.toLowerCase()
      )
    : contributions;

  let quantifiedActions = 0;
  let qualitativeActions = 0;
  let co2Sum = 0;

  const handleBuckets = new Map<
    string,
    {
      anonymousHandle: string;
      cityCounts: Map<string, number>;
      totalActions: number;
      quantifiedActions: number;
      qualitativeActions: number;
      totalCo2AvoidedKg: number;
      isCurrentUser: boolean;
      isDemo: boolean;
    }
  >();

  const cityBuckets = new Map<
    string,
    {
      city: string;
      totalActions: number;
      contributors: Set<string>;
      enrolledParticipants: number;
      totalCo2AvoidedKg: number;
    }
  >();

  const ensureCityBucket = (rawCity: string) => {
    const cityName = sanitizeCityName(rawCity);
    const key = cityName.toLowerCase();
    let bucket = cityBuckets.get(key);
    if (!bucket) {
      bucket = {
        city: cityName,
        totalActions: 0,
        contributors: new Set<string>(),
        enrolledParticipants: 0,
        totalCo2AvoidedKg: 0,
      };
      cityBuckets.set(key, bucket);
    }
    return bucket;
  };

  for (const item of filteredContributions) {
    const meta = ACTION_CATALOG[item.actionType];
    const isQual =
      Boolean(item.isQualitative) ||
      item.co2AvoidedKg <= 0 ||
      !meta?.hasReliableFactor;
    const effectiveCo2 = isQual ? 0 : Math.max(0, item.co2AvoidedKg);

    if (isQual) {
      qualitativeActions += 1;
    } else {
      quantifiedActions += 1;
      co2Sum += effectiveCo2;
    }

    const handleKey = item.anonymousHandle.trim().toLowerCase();
    let hb = handleBuckets.get(handleKey);
    if (!hb) {
      hb = {
        anonymousHandle: item.anonymousHandle,
        cityCounts: new Map<string, number>(),
        totalActions: 0,
        quantifiedActions: 0,
        qualitativeActions: 0,
        totalCo2AvoidedKg: 0,
        isCurrentUser:
          Boolean(item.isMine) ||
          (Boolean(currentHandle) &&
            item.anonymousHandle.toLowerCase() ===
              currentHandle!.trim().toLowerCase()),
        isDemo: item.isDemo,
      };
      handleBuckets.set(handleKey, hb);
    } else if (item.isMine) {
      hb.isCurrentUser = true;
    }

    hb.totalActions += 1;
    if (isQual) {
      hb.qualitativeActions += 1;
    } else {
      hb.quantifiedActions += 1;
      hb.totalCo2AvoidedKg = Number(
        (hb.totalCo2AvoidedKg + effectiveCo2).toFixed(2)
      );
    }
    const cityLabel = sanitizeCityName(item.city);
    hb.cityCounts.set(cityLabel, (hb.cityCounts.get(cityLabel) ?? 0) + 1);

    const cb = ensureCityBucket(item.city);
    cb.totalActions += 1;
    cb.contributors.add(handleKey);
    cb.totalCo2AvoidedKg = Number((cb.totalCo2AvoidedKg + effectiveCo2).toFixed(2));
  }

  // Merge challenge participant counts into city participation (respecting city filter if set)
  for (const p of participants) {
    const cityName = sanitizeCityName(p.city);
    if (cityFilter && cityName.toLowerCase() !== cityFilter.toLowerCase()) {
      continue;
    }
    const cb = ensureCityBucket(cityName);
    cb.enrolledParticipants += 1;
  }

  const leaderboard: LeaderboardEntry[] = Array.from(handleBuckets.values())
    .map((hb) => {
      let primaryCity = selectedCity;
      let bestCount = -1;
      for (const [cName, cnt] of hb.cityCounts.entries()) {
        if (cnt > bestCount) {
          bestCount = cnt;
          primaryCity = cName;
        }
      }
      return {
        rank: 0,
        anonymousHandle: hb.anonymousHandle,
        primaryCity,
        totalActions: hb.totalActions,
        quantifiedActions: hb.quantifiedActions,
        qualitativeActions: hb.qualitativeActions,
        totalCo2AvoidedKg: hb.totalCo2AvoidedKg,
        isCurrentUser: hb.isCurrentUser,
        isDemo: hb.isDemo,
      };
    })
    .sort((a, b) => {
      if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
      if (b.totalCo2AvoidedKg !== a.totalCo2AvoidedKg) {
        return b.totalCo2AvoidedKg - a.totalCo2AvoidedKg;
      }
      return a.anonymousHandle.localeCompare(b.anonymousHandle);
    })
    .slice(0, 10)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  const totalActions = filteredContributions.length;
  const totalCo2AvoidedKg = Number(co2Sum.toFixed(2));

  const cityParticipation: CityParticipationStat[] = Array.from(
    cityBuckets.values()
  )
    .map((cb) => ({
      city: cb.city,
      totalActions: cb.totalActions,
      contributorsCount: cb.contributors.size,
      enrolledParticipants: cb.enrolledParticipants,
      totalCo2AvoidedKg: cb.totalCo2AvoidedKg,
      sharePct:
        totalActions > 0
          ? Math.round((cb.totalActions / totalActions) * 100)
          : 0,
      isSelectedCity:
        cb.city.toLowerCase() === sanitizeCityName(selectedCity).toLowerCase(),
    }))
    .sort((a, b) => {
      if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
      if (b.enrolledParticipants !== a.enrolledParticipants) {
        return b.enrolledParticipants - a.enrolledParticipants;
      }
      return b.totalCo2AvoidedKg - a.totalCo2AvoidedKg;
    });

  const challengeProgress: ChallengeProgressStat[] = challenges.map((ch) => {
    const chParticipants = participants.filter((p) => p.challengeId === ch.id);
    const chActions = contributions.filter((c) => c.challengeId === ch.id);
    const chCo2 = Number(
      chActions
        .reduce((sum, c) => sum + (c.co2AvoidedKg > 0 ? c.co2AvoidedKg : 0), 0)
        .toFixed(2)
    );
    const joined = chParticipants.some((p) => p.isMine);
    const progressPct = Math.min(
      100,
      Math.round((chActions.length / Math.max(1, ch.targetActions)) * 100)
    );
    return {
      challenge: ch,
      joined,
      participantsCount: chParticipants.length,
      actionsLogged: chActions.length,
      co2AvoidedKg: chCo2,
      progressPct,
    };
  });

  const activeCitiesCount = cityParticipation.filter(
    (c) => c.totalActions > 0 || c.enrolledParticipants > 0
  ).length;
  const totalEnrolledCount = participants.length;

  const achievements: CommunityAchievement[] = [
    {
      id: 'comm_first_spark',
      title: 'Community Spark',
      description: 'First verified opt-in clean habit recorded by the community.',
      current: Math.min(1, totalActions),
      target: 1,
      unit: 'action',
      unlocked: totalActions >= 1,
    },
    {
      id: 'comm_10_actions',
      title: '10 Collective Habits',
      description: 'Reach 10 opt-in community actions across active residents.',
      current: Math.min(10, totalActions),
      target: 10,
      unit: 'actions',
      unlocked: totalActions >= 10,
    },
    {
      id: 'comm_25kg_co2',
      title: '25 kg Community CO2e',
      description: 'Accumulate 25 kg in factor-backed estimated CO2e avoided.',
      current: Number(Math.min(25, totalCo2AvoidedKg).toFixed(1)),
      target: 25,
      unit: 'kg CO2e',
      unlocked: totalCo2AvoidedKg >= 25,
    },
    {
      id: 'comm_multi_city',
      title: 'Multi-City Coalition',
      description: 'Reach active participation across at least 3 Indian cities.',
      current: Math.min(3, activeCitiesCount),
      target: 3,
      unit: 'cities',
      unlocked: activeCitiesCount >= 3,
    },
    {
      id: 'comm_smoke_free',
      title: 'Smoke-Free Home Circle',
      description:
        'Log 2 qualitative zero-burning or purifier-seal community habits.',
      current: Math.min(2, qualitativeActions),
      target: 2,
      unit: 'actions',
      unlocked: qualitativeActions >= 2,
    },
    {
      id: 'comm_mobilizers',
      title: 'Challenge Mobilizers',
      description: 'Enroll 3 anonymous participants across seasonal challenges.',
      current: Math.min(3, totalEnrolledCount),
      target: 3,
      unit: 'participants',
      unlocked: totalEnrolledCount >= 3,
    },
  ];

  return {
    totalActions,
    quantifiedActions,
    qualitativeActions,
    totalCo2AvoidedKg,
    citiesCount: activeCitiesCount,
    uniqueContributorsCount: handleBuckets.size,
    totalEnrolledCount,
    leaderboard,
    cityParticipation,
    challengeProgress,
    achievements,
  };
}
