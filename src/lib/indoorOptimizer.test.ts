import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndoorOptimizationPlan,
  DEFAULT_INDOOR_PROFILE,
  PLANT_SCIENCE_NOTE,
} from './indoorOptimizer';

test('calculates room area, volume, higher ACH during severe smog, and CADR correctly', () => {
  const cleanPlan = buildIndoorOptimizationPlan(
    DEFAULT_INDOOR_PROFILE,
    'Mumbai',
    45,
    'Good',
    false
  );
  const smogPlan = buildIndoorOptimizationPlan(
    DEFAULT_INDOOR_PROFILE,
    'Delhi',
    350,
    'Very Poor',
    false
  );

  assert.equal(cleanPlan.areaSqFt, 168);
  assert.equal(cleanPlan.targetAch, 4.0);
  assert.equal(smogPlan.targetAch, 5.0);
  assert.ok(smogPlan.recommendedCadrM3Hr > cleanPlan.recommendedCadrM3Hr);
  assert.ok(smogPlan.recommendedCadrCfm > 0);
});

test('adapts ventilation schedule dynamically by ventilation availability and outdoor AQI', () => {
  const sealedSmog = buildIndoorOptimizationPlan(
    { ...DEFAULT_INDOOR_PROFILE, ventilation: 'sealed_ac' },
    'Delhi',
    380,
    'Very Poor'
  );
  assert.match(sealedSmog.ventilationSummary, /recirculation/i);
  assert.equal(sealedSmog.ventilationWindows.length, 4);

  const crossClean = buildIndoorOptimizationPlan(
    { ...DEFAULT_INDOOR_PROFILE, ventilation: 'cross_ventilation' },
    'Mumbai',
    42,
    'Good'
  );
  assert.match(crossClean.ventilationSummary, /30–45 minutes/i);
  assert.equal(crossClean.ventilationWindows[1].tone, 'emerald');

  const exhaustSmog = buildIndoorOptimizationPlan(
    { ...DEFAULT_INDOOR_PROFILE, roomType: 'kitchen', ventilation: 'exhaust_only' },
    'Kolkata',
    245,
    'Poor'
  );
  assert.match(exhaustSmog.ventilationSummary, /negative pressure/i);
});

test('adapts filtration strategy for True HEPA, DIY box fan, and no purifier states', () => {
  const hepa = buildIndoorOptimizationPlan(
    { ...DEFAULT_INDOOR_PROFILE, purifier: 'true_hepa' },
    'Delhi',
    320,
    'Very Poor'
  );
  const diy = buildIndoorOptimizationPlan(
    { ...DEFAULT_INDOOR_PROFILE, purifier: 'diy_box_fan' },
    'Delhi',
    320,
    'Very Poor'
  );
  const none = buildIndoorOptimizationPlan(
    { ...DEFAULT_INDOOR_PROFILE, purifier: 'none' },
    'Delhi',
    320,
    'Very Poor'
  );

  assert.match(hepa.purifierStrategyTitle, /True HEPA/i);
  assert.match(diy.purifierStrategyTitle, /DIY Box-Fan/i);
  assert.match(none.purifierStrategyTitle, /Zero-Purifier/i);
  assert.ok(none.recommendations.some((r) => r.id === 'no-purifier-diy-upgrade'));
});

test('includes all 5 domains, reasoning, known costs, low-cost & advanced tiers, and rejects plant myths', () => {
  const plan = buildIndoorOptimizationPlan(
    DEFAULT_INDOOR_PROFILE,
    'Delhi',
    310,
    'Very Poor'
  );

  const domains = new Set(plan.recommendations.map((r) => r.domain));
  assert.equal(domains.has('dust_reduction'), true);
  assert.equal(domains.has('damp_mopping'), true);
  assert.equal(domains.has('kitchen_exhaust'), true);
  assert.equal(domains.has('filtration'), true);
  assert.equal(domains.has('ventilation'), true);

  const tiers = new Set(plan.recommendations.map((r) => r.tier));
  assert.equal(tiers.has('low_cost'), true);
  assert.equal(tiers.has('advanced'), true);

  for (const rec of plan.recommendations) {
    assert.ok(rec.reasoning.length > 20);
    assert.ok(rec.costEstimate.length > 0);
  }

  assert.match(PLANT_SCIENCE_NOTE, /do not meaningfully remove PM2\.5/i);
  assert.match(plan.plantScienceNote, /Do not rely on houseplants/i);
});
