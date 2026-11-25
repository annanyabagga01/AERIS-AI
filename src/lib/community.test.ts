import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommunityAggregates,
  containsSensitivePiiOrLocation,
  resolveContributionCo2,
  sanitizeCityName,
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


