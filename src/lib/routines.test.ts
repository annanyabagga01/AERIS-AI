import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalizedRoutine,
  computeChecklistStats,
  ensureDailyChecklistFresh,
  generateDailyChecklistTasks,
  getLocalDateKey,
} from './routines.ts';
import type { FamilyPreferences } from './types.ts';

const basePrefs: FamilyPreferences = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
  hasOlderAdults: true,
  pollutionSensitiveHousehold: true,
  commuteMode: 'two_wheeler',
  workStartHour: '09:00',
  workEndHour: '18:00',
  preferredExerciseTime: 'morning',
  anonymousHandle: 'DelhiFamily_1',
  communityOptIn: false,
};

test('buildPersonalizedRoutine adapts morning exercise indoors under Very Poor AQI', () => {
  const plan = buildPersonalizedRoutine(342, basePrefs, {
    isVerifiedCurrent: true,
    scheduleType: 'college',
    activityPreference: 'cycling_sports',
  });
  assert.equal(plan.category, 'Very Poor');
  assert.equal(plan.blocks.length, 3);
  assert.equal(plan.saferOutdoorWindow.supportedByCurrentData, false);
  assert.equal(plan.commuteSuggestion.upgradeSuggested, true);
  assert.match(plan.blocks[0].exerciseAndOutdoors, /Indoor replacement|stationary bike/i);
  assert.match(plan.blocks[0].workAndCommute, /Metro|closed-window/i);
  assert.match(plan.disclaimer, /Not medical advice/i);
});

test('buildPersonalizedRoutine permits outdoor activity under Good verified AQI', () => {
  const plan = buildPersonalizedRoutine(42, basePrefs, {
    isVerifiedCurrent: true,
    scheduleType: 'office',
    activityPreference: 'walk_run',
  });
  assert.equal(plan.category, 'Good');
  assert.equal(plan.saferOutdoorWindow.supportedByCurrentData, true);
  assert.match(plan.blocks[0].exerciseAndOutdoors, /support/i);
});

test('refuses to confirm safer outdoor windows when data is unverified, demo, or stale', () => {
  const plan = buildPersonalizedRoutine(45, basePrefs, {
    isVerifiedCurrent: false,
  });
  assert.equal(plan.isVerifiedCurrent, false);
  assert.equal(plan.saferOutdoorWindow.supportedByCurrentData, false);
  assert.match(plan.saferOutdoorWindow.statusLabel, /Not Confirmed/i);
});

test('checklist completion stats and daily refresh rollover work accurately', () => {
  const plan = buildPersonalizedRoutine(342, basePrefs, { isVerifiedCurrent: true });
  const tasks = generateDailyChecklistTasks(plan, basePrefs);
  assert.ok(tasks.length >= 6);

  tasks[0].completed = true;
  tasks[1].completed = true;
  const stats = computeChecklistStats(tasks);
  assert.equal(stats.completed, 2);
  assert.equal(stats.total, tasks.length);
  assert.equal(stats.percent, Math.round((2 / tasks.length) * 100));

  const today = new Date('2026-11-17T08:00:00');
  const staleCheck = ensureDailyChecklistFresh(
    {
      dateKey: '2026-11-16',
      lastRefreshedIso: '2026-11-16T08:00:00.000Z',
      tasks,
    },
    plan,
    basePrefs,
    today
  );
  assert.equal(staleCheck.wasAutoRefreshed, true);
  assert.equal(staleCheck.state.dateKey, getLocalDateKey(today));
  assert.equal(
    staleCheck.state.tasks.every((t) => t.completed === false),
    true
  );
});
