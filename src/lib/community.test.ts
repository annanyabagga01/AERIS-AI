import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommunityAggregates,
  buildContributionFirestorePayload,
  buildParticipantFirestorePayload,
  containsSensitivePiiOrLocation,
  resolveContributionCo2,
  sanitizeCityName,
  VALID_ANONYMOUS_HANDLE_REGEX,
  VALID_CITY_NAME_REGEX,
  VALID_FIRESTORE_ID_REGEX,
} from './community.ts';
import type {
  ChallengeParticipantRecord,
  CommunityChallenge,
  CommunityContribution,
} from './types.ts';

const SAMPLE_CHALLENGES: CommunityChallenge[] = [
  {
    id: 'ncr-metro-week',
    title: '7-Day Metro & Bus Swap',
    description: 'Take Metro or bus instead of solo private vehicles.',
    cityScope: 'Delhi NCR',
    targetActions: 100,
    isDemo: true,
  },
  {
    id: 'zero-leaf-burning',
    title: 'Zero Leaf Burning Watch',
    description: 'Compost dry leaves instead of open burning.',
    cityScope: 'All Cities',
    targetActions: 50,
    isDemo: true,
  },
];

test('containsSensitivePiiOrLocation blocks emails, phone numbers, and GPS coordinates', () => {
  assert.ok(containsSensitivePiiOrLocation('Reach me at user@example.com'));
  assert.ok(containsSensitivePiiOrLocation('Home at 28.6139, 77.2090'));
  assert.ok(containsSensitivePiiOrLocation('Call 9811223344'));
  assert.equal(containsSensitivePiiOrLocation('Took Yellow Line Metro to CP'), null);
  assert.equal(sanitizeCityName('Delhi 28.61, 77.20'), 'Delhi');
});

test('resolveContributionCo2 keeps qualitative actions at 0 without inventing factors', () => {
  assert.deepEqual(resolveContributionCo2('no_burning'), {
    co2AvoidedKg: 0,
    isQualitative: true,
  });
  assert.deepEqual(resolveContributionCo2('metro_commute'), {
    co2AvoidedKg: 3.1,
    isQualitative: false,
  });
});

test('buildCommunityAggregates computes leaderboard, city participation, challenge progress, and achievements', () => {
  const contributions: CommunityContribution[] = [
    {
      id: '1',
      anonymousHandle: 'MetroRider_01',
      city: 'Delhi',
      actionType: 'metro_commute',
      co2AvoidedKg: 3.1,
      challengeId: 'ncr-metro-week',
      createdAtIso: '2026-11-17T08:00:00Z',
      isDemo: false,
      isMine: true,
    },
    {
      id: '2',
      anonymousHandle: 'MetroRider_01',
      city: 'Delhi',
      actionType: 'no_burning',
      co2AvoidedKg: 0,
      isQualitative: true,
      challengeId: 'zero-leaf-burning',
      createdAtIso: '2026-11-17T09:00:00Z',
      isDemo: false,
      isMine: true,
    },
    {
      id: '3',
      anonymousHandle: 'GreenCommuter',
      city: 'Mumbai',
      actionType: 'bus_commute',
      co2AvoidedKg: 2.8,
      challengeId: 'ncr-metro-week',
      createdAtIso: '2026-11-17T09:30:00Z',
      isDemo: false,
    },
    {
      id: '4',
      anonymousHandle: 'CleanHome_BLR',
      city: 'Bengaluru',
      actionType: 'hepa_maintenance',
      co2AvoidedKg: 0,
      isQualitative: true,
      createdAtIso: '2026-11-17T10:00:00Z',
      isDemo: false,
    },
  ];

  const participants: ChallengeParticipantRecord[] = [
    { challengeId: 'ncr-metro-week', city: 'Delhi', isMine: true },
    { challengeId: 'ncr-metro-week', city: 'Mumbai', isMine: false },
    { challengeId: 'zero-leaf-burning', city: 'Bengaluru', isMine: false },
  ];

  const agg = buildCommunityAggregates({
    contributions,
    challenges: SAMPLE_CHALLENGES,
    participants,
    selectedCity: 'Delhi',
  });

  assert.equal(agg.totalActions, 4);
  assert.equal(agg.quantifiedActions, 2);
  assert.equal(agg.qualitativeActions, 2);
  assert.equal(agg.totalCo2AvoidedKg, 5.9);
  assert.equal(agg.citiesCount, 3);
  assert.equal(agg.leaderboard[0].anonymousHandle, 'MetroRider_01');
  assert.equal(agg.leaderboard[0].totalActions, 2);
  assert.equal(agg.leaderboard[0].isCurrentUser, true);
  assert.equal(agg.cityParticipation[0].city, 'Delhi');
  assert.equal(agg.cityParticipation[0].isSelectedCity, true);

  const metroChallenge = agg.challengeProgress.find(
    (c) => c.challenge.id === 'ncr-metro-week'
  );
  assert.equal(metroChallenge?.joined, true);
  assert.equal(metroChallenge?.participantsCount, 2);
  assert.equal(metroChallenge?.actionsLogged, 2);

  const unlocked = agg.achievements.filter((a) => a.unlocked).map((a) => a.id);
  assert.ok(unlocked.includes('comm_first_spark'));
  assert.ok(unlocked.includes('comm_multi_city'));
  assert.ok(unlocked.includes('comm_smoke_free'));
  assert.ok(unlocked.includes('comm_mobilizers'));
});

test('buildCommunityAggregates produces clean zeroed state when community data is empty', () => {
  const agg = buildCommunityAggregates({
    contributions: [],
    challenges: SAMPLE_CHALLENGES,
    participants: [],
    selectedCity: 'Delhi',
  });

  assert.equal(agg.totalActions, 0);
  assert.equal(agg.totalCo2AvoidedKg, 0);
  assert.equal(agg.citiesCount, 0);
  assert.equal(agg.leaderboard.length, 0);
  assert.equal(agg.cityParticipation.length, 0);
  assert.ok(agg.achievements.every((a) => !a.unlocked));
});

test('buildContributionFirestorePayload enforces all firestore.rules schema, optInPublic, verification, and serverTimestamp requirements', () => {
  const SERVER_TS_SENTINEL = { _methodName: 'serverTimestamp' };
  const payload = buildContributionFirestorePayload({
    authorUid: '8GFDiOuZW8fpz18R0kULCtyuAh63',
    emailVerified: true,
    optInPublic: true,
    anonymousHandle: 'Delhi-Metro_01',
    city: 'New Delhi 110001',
    actionType: 'metro_commute',
    co2AvoidedKg: 3.1,
    note: 'Took Yellow Line instead of driving',
    challengeId: 'ncr-metro-week',
    createdAt: SERVER_TS_SENTINEL,
  });

  // Only allowed keys from isValidContribution in firestore.rules
  const allowedKeys = new Set([
    'authorUid',
    'anonymousHandle',
    'city',
    'actionType',
    'co2AvoidedKg',
    'note',
    'challengeId',
    'optInPublic',
    'createdAt',
  ]);
  for (const key of Object.keys(payload)) {
    assert.ok(allowedKeys.has(key), `Unexpected key: ${key}`);
  }
  assert.equal(payload.authorUid, '8GFDiOuZW8fpz18R0kULCtyuAh63');
  assert.equal(payload.optInPublic, true);
  assert.equal(payload.createdAt, SERVER_TS_SENTINEL);
  assert.match(String(payload.anonymousHandle), VALID_ANONYMOUS_HANDLE_REGEX);
  assert.match(String(payload.city), VALID_CITY_NAME_REGEX);
  assert.equal(payload.co2AvoidedKg, 3.1);

  // Qualitative habit must always send co2AvoidedKg === 0 (matching isValidCo2ForAction)
  const qualPayload = buildContributionFirestorePayload({
    authorUid: 'uid_abc123',
    emailVerified: true,
    optInPublic: true,
    anonymousHandle: 'CleanAirFan',
    city: 'Bengaluru',
    actionType: 'no_burning',
    co2AvoidedKg: 5,
    createdAt: SERVER_TS_SENTINEL,
  });
  assert.equal(qualPayload.co2AvoidedKg, 0);
  assert.equal('note' in qualPayload, false);
  assert.equal('challengeId' in qualPayload, false);

  // Reject unverified email or non-opt-in submissions before hitting Firestore
  assert.throws(
    () =>
      buildContributionFirestorePayload({
        authorUid: 'uid_abc123',
        emailVerified: false,
        optInPublic: true,
        anonymousHandle: 'CleanAirFan',
        city: 'Delhi',
        actionType: 'metro_commute',
        createdAt: SERVER_TS_SENTINEL,
      }),
    /verified/i
  );
  assert.throws(
    () =>
      buildContributionFirestorePayload({
        authorUid: 'uid_abc123',
        emailVerified: true,
        optInPublic: false,
        anonymousHandle: 'CleanAirFan',
        city: 'Delhi',
        actionType: 'metro_commute',
        createdAt: SERVER_TS_SENTINEL,
      }),
    /Opt-in/i
  );
});

test('buildParticipantFirestorePayload enforces challenge_participants firestore.rules schema and deterministic valid ID', () => {
  const SERVER_TS_SENTINEL = { _methodName: 'serverTimestamp' };
  const { participantId, payload } = buildParticipantFirestorePayload({
    challengeId: 'ncr-metro-week',
    userId: '8GFDiOuZW8fpz18R0kULCtyuAh63',
    emailVerified: true,
    optInPublic: true,
    city: 'Gurugram',
    joinedAt: SERVER_TS_SENTINEL,
  });

  assert.match(participantId, VALID_FIRESTORE_ID_REGEX);
  assert.deepEqual(Object.keys(payload).sort(), [
    'challengeId',
    'city',
    'joinedAt',
    'optInPublic',
    'userId',
  ]);
  assert.equal(payload.optInPublic, true);
  assert.equal(payload.userId, '8GFDiOuZW8fpz18R0kULCtyuAh63');
  assert.equal(payload.joinedAt, SERVER_TS_SENTINEL);

  assert.throws(
    () =>
      buildParticipantFirestorePayload({
        challengeId: 'x',
        userId: 'uid_abc123',
        emailVerified: true,
        optInPublic: true,
        city: 'Delhi',
        joinedAt: SERVER_TS_SENTINEL,
      }),
    /Invalid community challenge/i
  );
});

