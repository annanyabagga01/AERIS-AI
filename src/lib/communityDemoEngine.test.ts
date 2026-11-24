import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityAggregates, containsSensitivePiiOrLocation } from './community.ts';
import {
  addDemoContribution,
  createInitialDemoCommunityState,
  hasSessionDemoChanges,
  removeDemoContribution,
  toggleDemoChallengeEnrollment,
} from './communityDemoEngine.ts';

test('createInitialDemoCommunityState returns deterministic sample data with zero PII', () => {
  const first = createInitialDemoCommunityState();
  const second = createInitialDemoCommunityState();

  assert.deepEqual(first, second);
  assert.equal(first.challenges.length, 3);
  assert.equal(first.contributions.length, 8);
  assert.equal(first.participants.length, 8);
  assert.equal(hasSessionDemoChanges(first), false);

  for (const ch of first.challenges) {
    assert.equal(ch.isDemo, true);
  }
  for (const item of first.contributions) {
    assert.equal(item.isDemo, true);
    assert.equal(item.isMine, false);
    assert.equal(
      containsSensitivePiiOrLocation(`${item.anonymousHandle} ${item.note ?? ''}`),
      null
    );
  }
  for (const p of first.participants) {
    assert.equal(p.isDemo, true);
    assert.equal(p.isMine, false);
  }

  const agg = buildCommunityAggregates({
    contributions: first.contributions,
    challenges: first.challenges,
    participants: first.participants,
    selectedCity: 'Delhi',
  });
  assert.equal(agg.totalActions, 8);
  assert.equal(agg.quantifiedActions, 6);
  assert.equal(agg.qualitativeActions, 2);
  assert.equal(agg.totalCo2AvoidedKg, 16);
  assert.equal(agg.citiesCount, 6);
});

test('addDemoContribution updates KPIs, leaderboard, challenge progress, and rejects PII', () => {
  const initial = createInitialDemoCommunityState();

  assert.throws(
    () =>
      addDemoContribution(initial, {
        anonymousHandle: 'test@example.com',
        city: 'Delhi',
        actionType: 'metro_commute',
      }),
    /email/i
  );

  const { state: afterMetro, contribution } = addDemoContribution(initial, {
    anonymousHandle: 'DemoVisitor_01',
    city: 'Delhi',
    actionType: 'metro_commute',
    challengeId: 'ncr-metro-week',
    note: 'Took Blue Line Metro instead of driving.',
    createdAtIso: '2026-11-24T10:00:00.000Z',
  });

  assert.equal(contribution.isDemo, true);
  assert.equal(contribution.isMine, true);
  assert.equal(contribution.co2AvoidedKg, 3.1);
  assert.equal(afterMetro.contributions.length, 9);
  assert.equal(hasSessionDemoChanges(afterMetro), true);

  const agg = buildCommunityAggregates({
    contributions: afterMetro.contributions,
    challenges: afterMetro.challenges,
    participants: afterMetro.participants,
    selectedCity: 'Delhi',
    currentHandle: 'DemoVisitor_01',
  });
  assert.equal(agg.totalActions, 9);
  assert.equal(agg.quantifiedActions, 7);
  assert.equal(agg.totalCo2AvoidedKg, 19.1);
  const metroChallenge = agg.challengeProgress.find(
    (c) => c.challenge.id === 'ncr-metro-week'
  );
  assert.equal(metroChallenge?.actionsLogged, 6);

  // Removing the visitor's own demo contribution restores the baseline
  const afterRemove = removeDemoContribution(afterMetro, contribution.id);
  assert.equal(afterRemove.contributions.length, 8);
  assert.equal(hasSessionDemoChanges(afterRemove), false);

  // Cannot remove built-in sample demo entries (isMine: false)
  const afterBlockedRemove = removeDemoContribution(afterRemove, 'demo_c_1');
  assert.equal(afterBlockedRemove.contributions.length, 8);
});

test('toggleDemoChallengeEnrollment locally joins and leaves challenges without Firestore', () => {
  const initial = createInitialDemoCommunityState();

  const joinedResult = toggleDemoChallengeEnrollment(initial, {
    challengeId: 'ncr-metro-week',
    city: 'Delhi',
  });
  assert.equal(joinedResult.joined, true);
  assert.equal(joinedResult.state.participants.length, 9);
  assert.equal(hasSessionDemoChanges(joinedResult.state), true);

  const aggJoined = buildCommunityAggregates({
    contributions: joinedResult.state.contributions,
    challenges: joinedResult.state.challenges,
    participants: joinedResult.state.participants,
    selectedCity: 'Delhi',
  });
  const chJoined = aggJoined.challengeProgress.find(
    (c) => c.challenge.id === 'ncr-metro-week'
  );
  assert.equal(chJoined?.joined, true);
  assert.equal(chJoined?.participantsCount, 5);

  const leftResult = toggleDemoChallengeEnrollment(joinedResult.state, {
    challengeId: 'ncr-metro-week',
    city: 'Delhi',
  });
  assert.equal(leftResult.joined, false);
  assert.equal(leftResult.state.participants.length, 8);
  assert.equal(hasSessionDemoChanges(leftResult.state), false);
});
