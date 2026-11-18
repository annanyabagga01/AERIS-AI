import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_CATALOG,
  calculateCommuteImpact,
  computeImpactStats,
  EMISSION_FACTORS_KG_PER_KM,
  evaluateActiveMobilitySafety,
} from './emissions.ts';
import type { ImpactLogEntry } from './types.ts';

test('calculateCommuteImpact computes transparent CO2e avoided with publication dates and disclaimer', () => {
  const result = calculateCommuteImpact({
    baselineMode: 'solo_car',
    alternativeMode: 'metro',
    oneWayDistanceKm: 15,
    tripsPerWeek: 10,
    aqi: 320,
    pollutionSensitiveHousehold: true,
  });

  // 150 km/wk * 0.171 = 25.65 kg; 150 * 0.014 = 2.10 kg; avoided = 23.55 kg/wk
  assert.equal(result.isQualitativeOnly, false);
  assert.equal(result.baselineWeeklyKg, 25.65);
  assert.equal(result.alternativeWeeklyKg, 2.1);
  assert.equal(result.estimatedWeeklyCo2eAvoidedKg, 23.55);
  assert.equal(result.activeMobilitySafe, false);
  assert.ok(result.sources.some((s) => /2015|2023/.test(s)));
  assert.match(result.disclaimer, /not measured improvements in ambient urban AQI/i);
});

test('calculateCommuteImpact shows qualitative comparison when reliable factor is unavailable', () => {
  const result = calculateCommuteImpact({
    baselineMode: 'solo_car',
    alternativeMode: 'shared_e_rickshaw',
    oneWayDistanceKm: 8,
    tripsPerWeek: 10,
    aqi: 180,
    pollutionSensitiveHousehold: false,
  });

  assert.equal(result.isQualitativeOnly, true);
  assert.equal(result.alternativeFactorKgPerKm, null);
  assert.equal(result.alternativeWeeklyKg, null);
  assert.equal(result.estimatedWeeklyCo2eAvoidedKg, null);
  assert.equal(result.estimatedAnnualCo2eAvoidedKg, null);
  assert.match(result.qualitativeComparison ?? '', /qualitative comparison/i);
  assert.equal(EMISSION_FACTORS_KG_PER_KM.shared_e_rickshaw.hasReliableFactor, false);
});

test('evaluateActiveMobilitySafety permits walk/cycle only when air conditions allow', () => {
  assert.equal(evaluateActiveMobilitySafety(72, false).safe, true);
  assert.equal(evaluateActiveMobilitySafety(135, false).safe, true);
  assert.equal(evaluateActiveMobilitySafety(135, true).safe, false);
  assert.equal(evaluateActiveMobilitySafety(265, false).safe, false);
  assert.equal(evaluateActiveMobilitySafety(null, false).safe, false);
});

test('computeImpactStats excludes invented numbers for qualitative habits, tracks streaks, monthly buckets, and achievements', () => {
  const nowMs = Date.parse('2026-11-17T12:00:00Z');
  const entries: ImpactLogEntry[] = [
    {
      id: '1',
      dateIso: '2026-11-17T08:00:00Z',
      actionType: 'metro_commute',
      label: 'Metro Commute Swap',
      co2AvoidedKg: 3.1,
      city: 'Delhi',
    },
    {
      id: '2',
      dateIso: '2026-11-16T08:00:00Z',
      actionType: 'carpool',
      label: 'Shared Carpool Trip',
      co2AvoidedKg: 1.7,
      city: 'Delhi',
    },
    {
      id: '3',
      dateIso: '2026-11-15T08:00:00Z',
      actionType: 'no_burning',
      label: 'Zero Open Waste / Leaf Burning',
      co2AvoidedKg: 0,
      isQualitative: true,
      city: 'Delhi',
    },
    // Earlier 4-day streak in previous month-window
    {
      id: '4',
      dateIso: '2026-11-04T09:00:00Z',
      actionType: 'metro_commute',
      label: 'Metro Commute Swap',
      co2AvoidedKg: 3.1,
      city: 'Delhi',
    },
    {
      id: '5',
      dateIso: '2026-11-03T09:00:00Z',
      actionType: 'bus_commute',
      label: 'Public Bus Commute',
      co2AvoidedKg: 2.8,
      city: 'Delhi',
    },
    {
      id: '6',
      dateIso: '2026-11-02T09:00:00Z',
      actionType: 'hepa_maintenance',
      label: 'HEPA Pre-Filter & Door Seal Check',
      co2AvoidedKg: 0,
      isQualitative: true,
      city: 'Delhi',
    },
    {
      id: '7',
      dateIso: '2026-11-01T09:00:00Z',
      actionType: 'energy_saving',
      label: 'Off-Peak AC / Geyser Optimization',
      co2AvoidedKg: 1.8,
      city: 'Delhi',
    },
  ];

  const stats = computeImpactStats(entries, nowMs);
  assert.equal(stats.totalActions, 7);
  assert.equal(stats.quantifiedActions, 5);
  assert.equal(stats.qualitativeActions, 2);
  // 3.1 + 1.7 + 3.1 + 2.8 + 1.8 = 12.5 kg CO2e (no invented value for no_burning or hepa_maintenance)
  assert.equal(stats.totalCo2eAvoidedKg, 12.5);
  assert.equal(stats.currentStreakDays, 3);
  assert.equal(stats.longestStreakDays, 4);
  assert.equal(stats.weeklySeries.length, 7);
  assert.equal(stats.monthlySeries.length, 4);

  assert.equal(ACTION_CATALOG.no_burning.hasReliableFactor, false);
  assert.equal(ACTION_CATALOG.no_burning.defaultCo2Kg, 0);

  const unlockedIds = stats.achievements
    .filter((a) => a.unlocked)
    .map((a) => a.id);
  assert.ok(unlockedIds.includes('first_step'));
  assert.ok(unlockedIds.includes('streak_3'));
  assert.ok(unlockedIds.includes('co2_10kg'));
  assert.ok(unlockedIds.includes('qualitative_steward'));
});
