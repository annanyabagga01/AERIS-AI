import type {
  ActionType,
  EmissionsInput,
  EmissionsResult,
  ImpactLogEntry,
} from './types.ts';

export interface EmissionFactorMetadata {
  factor: number | null;
  hasReliableFactor: boolean;
  label: string;
  note: string;
  source: string;
  publicationDate: string;
  assumption: string;
  qualitativeComparison: string;
}

/**
 * Transparent India-specific transport emission factors (kg CO2e per passenger-km).
 * If a reliable standardized factor is unavailable (hasReliableFactor: false),
 * factor is null and callers must surface a qualitative comparison rather than
 * inventing a numerical CO2e figure.
 */
export const EMISSION_FACTORS_KG_PER_KM: Record<
  string,
  EmissionFactorMetadata
> = {
  solo_car: {
    factor: 0.171,
    hasReliableFactor: true,
    label: 'Solo Petrol/Diesel Car',
    note: 'Average Indian mid-size passenger car, single occupancy (0.171 kg CO2e/pkm)',
    source: 'India GHG Program (WRI India / TERI / CII) Road Transport Guidance',
    publicationDate: 'Aug 2015',
    assumption:
      'Assumes 1.0 occupant per mid-size petrol/diesel passenger car under mixed Indian urban driving.',
    qualitativeComparison:
      'Highest per-passenger road fuel burn and tailpipe emissions among private daily commute options.',
  },
  two_wheeler: {
    factor: 0.049,
    hasReliableFactor: true,
    label: 'Petrol Two-Wheeler',
    note: 'Average 110–150cc motorcycle/scooter, single rider (0.049 kg CO2e/pkm)',
    source: 'India GHG Program (WRI India / TERI / CII) Road Transport Guidance',
    publicationDate: 'Aug 2015',
    assumption:
      'Assumes single rider on a 110–150cc four-stroke petrol two-wheeler.',
    qualitativeComparison:
      'Lower CO2e per km than a solo four-wheeler, though rider faces elevated roadside PM2.5 inhalation exposure.',
  },
  carpool: {
    factor: 0.0855,
    hasReliableFactor: true,
    label: '2-Person Carpool',
    note: 'Solo car factor split across 2 passengers (0.0855 kg CO2e/pkm)',
    source: 'India GHG Program (WRI India / TERI / CII) — derived occupancy split',
    publicationDate: 'Aug 2015 (2-occupant derivation)',
    assumption:
      'Divides mid-size petrol/diesel passenger car emissions (0.171 kg CO2e/km) evenly across 2 commuters with negligible detour.',
    qualitativeComparison:
      'Halves per-person vehicle emissions and congestion footprint compared to two separate solo car commutes.',
  },
  ev_cab: {
    factor: 0.072,
    hasReliableFactor: true,
    label: 'Electric Cab / Auto',
    note: 'Charged on Indian grid mix (0.716 kg CO2/kWh; ~0.072 kg CO2e/pkm)',
    source: 'Central Electricity Authority (CEA) CO2 Baseline Database v19.0 + EV 4W benchmark',
    publicationDate: 'Dec 2023',
    assumption:
      'Assumes ~0.10 kWh/km operational electricity draw (including charging losses) using CEA India weighted average grid intensity (0.716 kg CO2/kWh), single passenger.',
    qualitativeComparison:
      'Eliminates direct tailpipe exhaust along urban corridors; lifecycle CO2 depends on regional coal vs. renewable grid charging mix.',
  },
  bus: {
    factor: 0.029,
    hasReliableFactor: true,
    label: 'City / Electric Bus',
    note: 'Urban public bus average occupancy factor (0.029 kg CO2e/pkm)',
    source: 'India GHG Program (WRI India / TERI / CII) Public Bus Guidance',
    publicationDate: 'Aug 2015',
    assumption:
      'Reflects average Indian urban public bus occupancy; actual emissions vary with route load factor and CNG/diesel/electric fleet share.',
    qualitativeComparison:
      'Substantially lowers per-commuter road space and fuel intensity compared to private cars.',
  },
  metro: {
    factor: 0.014,
    hasReliableFactor: true,
    label: 'Urban Metro Rail',
    note: 'Urban metro rail traction share on Indian grid mix (0.014 kg CO2e/pkm)',
    source: 'CEEW / Urban Rail Traction Intensity adjusted to CEA Baseline v19.0',
    publicationDate: 'Dec 2023',
    assumption:
      'Per-passenger-km operational rail traction during typical metro occupancy; excludes station civil construction and last-mile feeder.',
    qualitativeComparison:
      'Lowest motorized per-km operational footprint and provides enclosed filtered transit during winter smog episodes.',
  },
  walk_cycle: {
    factor: 0,
    hasReliableFactor: true,
    label: 'Walking / Cycling',
    note: 'Zero tailpipe and grid operational emissions (0.000 kg CO2e/pkm)',
    source: 'Physical zero-combustion operational basis',
    publicationDate: 'N/A (Zero operational combustion)',
    assumption:
      'Zero operational CO2e emissions; personal exposure safety is gated by current verified AQI and household sensitivity.',
    qualitativeComparison:
      'Zero operational emissions and zero congestion impact; recommended only when outdoor AQI is safe for active exertion.',
  },
  shared_e_rickshaw: {
    factor: null,
    hasReliableFactor: false,
    label: 'Shared E-Rickshaw / Variable Feeder (Qualitative)',
    note: 'Standardized national per-km factor unavailable across informal fleets',
    source: 'No standardized CEA/WRI India per-pkm factor verified',
    publicationDate: 'Unavailable',
    assumption:
      'Diverse lead-acid vs. lithium batteries, unregulated un-metered charging, and fluctuating 2–5 passenger occupancy prevent an accurate universal kg CO2e/km constant.',
    qualitativeComparison:
      'Qualitative comparison: Avoids direct street-level tailpipe exhaust compared to petrol/diesel three-wheelers and solo cars, while grid charging intensity cannot be reliably quantified as a single national number.',
  },
};

export interface HabitActionMeta {
  label: string;
  hasReliableFactor: boolean;
  defaultCo2Kg: number;
  description: string;
  source: string;
  publicationDate: string;
  assumption: string;
  qualitativeBenefit: string;
}

export const ACTION_CATALOG: Record<ActionType, HabitActionMeta> = {
  metro_commute: {
    label: 'Metro Commute Swap',
    hasReliableFactor: true,
    defaultCo2Kg: 3.1,
    description: 'Replaced a 20 km round-trip solo car drive with Metro rail.',
    source: 'India GHG Program (WRI India) & CEA Baseline v19.0',
    publicationDate: 'Aug 2015 / Dec 2023',
    assumption:
      '20 km round-trip × (0.171 solo car − 0.014 Metro) ≈ 3.14 kg CO2e (rounded conservatively to 3.1 kg).',
    qualitativeBenefit:
      'Avoids peak road congestion and reduces personal exposure inside enclosed Metro coaches.',
  },
  bus_commute: {
    label: 'Public Bus Commute',
    hasReliableFactor: true,
    defaultCo2Kg: 2.8,
    description: 'Took city bus instead of personal four-wheeler (20 km round-trip).',
    source: 'India GHG Program (WRI India / TERI)',
    publicationDate: 'Aug 2015',
    assumption:
      '20 km round-trip × (0.171 solo car − 0.029 city bus) = 2.84 kg CO2e (rounded to 2.8 kg).',
    qualitativeBenefit:
      'Consolidates road trips into shared public transit rather than single-occupant driving.',
  },
  carpool: {
    label: 'Shared Carpool Trip',
    hasReliableFactor: true,
    defaultCo2Kg: 1.7,
    description: 'Shared a 20 km trip with at least one colleague or family member.',
    source: 'India GHG Program (WRI India / TERI) derived 2-occupant split',
    publicationDate: 'Aug 2015',
    assumption:
      '20 km round-trip × (0.171 solo car − 0.0855 2-person carpool) = 1.71 kg CO2e.',
    qualitativeBenefit:
      'Removes one duplicate passenger vehicle trip along busy urban corridors.',
  },
  energy_saving: {
    label: 'Off-Peak AC / Geyser Optimization',
    hasReliableFactor: true,
    defaultCo2Kg: 1.8,
    description: 'Avoided ~2.5 kWh of high-load household electricity draw.',
    source: 'Central Electricity Authority (CEA) CO2 Baseline Database v19.0',
    publicationDate: 'Dec 2023',
    assumption:
      '2.5 kWh reduced × 0.716 kg CO2/kWh weighted average Indian grid factor = 1.79 kg (displayed as 1.8 kg CO2e).',
    qualitativeBenefit:
      'Lowers household peak grid electricity demand and monthly utility usage.',
  },
  no_burning: {
    label: 'Zero Open Waste / Leaf Burning',
    hasReliableFactor: false,
    defaultCo2Kg: 0,
    description:
      'Composted or bagged dry garden leaves instead of burning outdoors.',
    source: 'No standardized per-incident household factor available',
    publicationDate: 'N/A — Qualitative Only',
    assumption:
      'Biomass moisture, pile mass, and combustion smoldering vary too widely to assign an honest numerical CO2e figure.',
    qualitativeBenefit:
      'Qualitative benefit: Eliminates direct neighborhood smoke, fine PM2.5 plumes, and black carbon hazard compared to open leaf or trash burning.',
  },
  hepa_maintenance: {
    label: 'HEPA Pre-Filter & Door Seal Check',
    hasReliableFactor: false,
    defaultCo2Kg: 0,
    description:
      'Vacuumed purifier pre-filter mesh and checked window weather-stripping.',
    source: 'No standardized per-maintenance household CO2e factor available',
    publicationDate: 'N/A — Qualitative Only',
    assumption:
      'Energy savings depend on purifier wattage, CADR setting, and infiltration rate; no unverified numerical CO2e is invented.',
    qualitativeBenefit:
      'Qualitative benefit: Maintains cleaner indoor air delivery without overworking fan motors or leaking smoky outdoor air indoors.',
  },
};

export function evaluateActiveMobilitySafety(
  aqi: number | null,
  pollutionSensitiveHousehold: boolean
): { safe: boolean; advisory: string } {
  if (aqi === null || !Number.isFinite(aqi)) {
    return {
      safe: false,
      advisory:
        'Official AQI is currently unavailable. Verify local air quality before choosing extended outdoor walking or cycling.',
    };
  }
  if (aqi <= 100) {
    return {
      safe: true,
      advisory:
        'AQI is Good to Satisfactory (<= 100). Walking and cycling are safe and zero-emission options.',
    };
  }
  if (aqi <= 150 && !pollutionSensitiveHousehold) {
    return {
      safe: true,
      advisory:
        'AQI is Moderate (101–150). Short, low-effort walking/cycling commutes are acceptable for non-sensitive adults; avoid busy highway corridors.',
    };
  }
  return {
    safe: false,
    advisory:
      aqi > 200
        ? `AQI is ${Math.round(aqi)} (Poor or worse). Avoid walking/cycling exertion outdoors; prefer enclosed Metro or bus transit.`
        : `AQI is ${Math.round(aqi)} with sensitive household members enabled. Prefer enclosed Metro or bus transit instead of outdoor cycling/walking.`,
  };
}

export function calculateCommuteImpact(input: EmissionsInput): EmissionsResult {
  const distance = Math.max(0, Math.min(250, input.oneWayDistanceKm));
  const trips = Math.max(0, Math.min(28, input.tripsPerWeek));

  const baselineMeta = EMISSION_FACTORS_KG_PER_KM[input.baselineMode];
  const altMeta = EMISSION_FACTORS_KG_PER_KM[input.alternativeMode];

  const safety = evaluateActiveMobilitySafety(
    input.aqi,
    input.pollutionSensitiveHousehold
  );

  const weeklyKm = distance * trips;

  if (
    !baselineMeta ||
    !altMeta ||
    !baselineMeta.hasReliableFactor ||
    !altMeta.hasReliableFactor ||
    baselineMeta.factor === null ||
    altMeta.factor === null
  ) {
    const activeAlt = altMeta ?? EMISSION_FACTORS_KG_PER_KM.shared_e_rickshaw;
    return {
      baselineFactorKgPerKm: baselineMeta?.factor ?? null,
      alternativeFactorKgPerKm: null,
      baselineWeeklyKg:
        baselineMeta && baselineMeta.factor !== null
          ? Number((weeklyKm * baselineMeta.factor).toFixed(2))
          : null,
      alternativeWeeklyKg: null,
      estimatedWeeklyCo2eAvoidedKg: null,
      estimatedAnnualCo2eAvoidedKg: null,
      isQualitativeOnly: true,
      qualitativeComparison: activeAlt.qualitativeComparison,
      activeMobilitySafe: safety.safe,
      activeMobilityAdvisory: safety.advisory,
      assumptions: [
        `Weekly distance evaluated: ${distance} km/trip × ${trips} trips/week = ${weeklyKm.toFixed(1)} km/week.`,
        `Reliable national per-km factor unavailable for ${activeAlt.label}; numerical CO2e avoided is omitted rather than estimated without a verified source.`,
        activeAlt.assumption,
      ],
      sources: [
        `${baselineMeta?.source ?? 'WRI India GHG Program'} (${baselineMeta?.publicationDate ?? 'Aug 2015'})`,
        `${activeAlt.source} (${activeAlt.publicationDate})`,
      ],
      disclaimer:
        'Qualitative comparison shown because a standardized factor is unavailable; neither personal CO2e swaps nor qualitative modes imply direct local AQI reduction.',
    };
  }

  const baselineWeeklyKg = Number((weeklyKm * baselineMeta.factor).toFixed(2));
  const alternativeWeeklyKg = Number((weeklyKm * altMeta.factor).toFixed(2));
  const estimatedWeeklyCo2eAvoidedKg = Number(
    Math.max(0, baselineWeeklyKg - alternativeWeeklyKg).toFixed(2)
  );
  const estimatedAnnualCo2eAvoidedKg = Number(
    (estimatedWeeklyCo2eAvoidedKg * 50).toFixed(1)
  );

  return {
    baselineFactorKgPerKm: baselineMeta.factor,
    alternativeFactorKgPerKm: altMeta.factor,
    baselineWeeklyKg,
    alternativeWeeklyKg,
    estimatedWeeklyCo2eAvoidedKg,
    estimatedAnnualCo2eAvoidedKg,
    isQualitativeOnly: false,
    qualitativeComparison: altMeta.qualitativeComparison,
    activeMobilitySafe: safety.safe,
    activeMobilityAdvisory: safety.advisory,
    assumptions: [
      `Weekly distance: ${distance} km/trip × ${trips} trips/week = ${weeklyKm.toFixed(1)} km/week.`,
      `Annualized estimate assumes 50 commuting weeks per year.`,
      `Baseline (${baselineMeta.label}): ${baselineMeta.factor} kg CO2e/pkm — ${baselineMeta.assumption}`,
      `Alternative (${altMeta.label}): ${altMeta.factor} kg CO2e/pkm — ${altMeta.assumption}`,
    ],
    sources: [
      `${baselineMeta.source} (Published ${baselineMeta.publicationDate})`,
      `${altMeta.source} (Published ${altMeta.publicationDate})`,
    ],
    disclaimer:
      'Outputs are estimates of CO2e avoided based on mode substitution, not measured improvements in ambient urban AQI.',
  };
}

export interface ImpactAchievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  current: number;
  target: number;
  unit: string;
}

export interface ImpactSummary {
  totalActions: number;
  quantifiedActions: number;
  qualitativeActions: number;
  totalCo2eAvoidedKg: number;
  currentStreakDays: number;
  longestStreakDays: number;
  weeklySeries: {
    day: string;
    dateKey: string;
    co2Kg: number;
    actions: number;
    qualitativeActions: number;
  }[];
  monthlySeries: {
    weekLabel: string;
    rangeLabel: string;
    co2Kg: number;
    actions: number;
    qualitativeActions: number;
  }[];
  achievements: ImpactAchievement[];
}

function formatShortDateUtc(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function computeImpactStats(
  entries: ImpactLogEntry[],
  nowMs: number = Date.now()
): ImpactSummary {
  const totalActions = entries.length;
  let quantifiedActions = 0;
  let qualitativeActions = 0;
  let rawCo2Sum = 0;

  const dayMap = new Map<
    string,
    { co2Kg: number; actions: number; qualitativeActions: number }
  >();

  for (const entry of entries) {
    const isQualitative =
      Boolean(entry.isQualitative) ||
      entry.co2AvoidedKg <= 0 ||
      !ACTION_CATALOG[entry.actionType]?.hasReliableFactor;

    const effectiveCo2 = isQualitative ? 0 : Math.max(0, entry.co2AvoidedKg);
    if (isQualitative) {
      qualitativeActions += 1;
    } else {
      quantifiedActions += 1;
      rawCo2Sum += effectiveCo2;
    }

    const key = entry.dateIso.slice(0, 10);
    const cur = dayMap.get(key) ?? {
      co2Kg: 0,
      actions: 0,
      qualitativeActions: 0,
    };
    cur.co2Kg = Number((cur.co2Kg + effectiveCo2).toFixed(2));
    cur.actions += 1;
    if (isQualitative) cur.qualitativeActions += 1;
    dayMap.set(key, cur);
  }

  const totalCo2eAvoidedKg = Number(rawCo2Sum.toFixed(2));

  // Last 7 days daily series
  const weeklySeries: ImpactSummary['weeklySeries'] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowMs - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const data = dayMap.get(key) ?? {
      co2Kg: 0,
      actions: 0,
      qualitativeActions: 0,
    };
    weeklySeries.push({
      day: dayNames[d.getUTCDay()],
      dateKey: key,
      co2Kg: data.co2Kg,
      actions: data.actions,
      qualitativeActions: data.qualitativeActions,
    });
  }

  // Last 4 rolling 7-day buckets (28 days monthly trend)
  const monthlySeries: ImpactSummary['monthlySeries'] = [];
  for (let w = 3; w >= 0; w--) {
    const bucketEndMs = nowMs - w * 7 * 86400000;
    const bucketStartMs = bucketEndMs - 6 * 86400000;
    let weekCo2 = 0;
    let weekActions = 0;
    let weekQual = 0;

    for (let dOffset = 0; dOffset < 7; dOffset++) {
      const dayKey = new Date(bucketStartMs + dOffset * 86400000)
        .toISOString()
        .slice(0, 10);
      const dayData = dayMap.get(dayKey);
      if (dayData) {
        weekCo2 += dayData.co2Kg;
        weekActions += dayData.actions;
        weekQual += dayData.qualitativeActions;
      }
    }

    const weekIndex = 4 - w;
    monthlySeries.push({
      weekLabel: `Wk ${weekIndex}`,
      rangeLabel: `${formatShortDateUtc(bucketStartMs)}–${formatShortDateUtc(bucketEndMs)}`,
      co2Kg: Number(weekCo2.toFixed(2)),
      actions: weekActions,
      qualitativeActions: weekQual,
    });
  }

  // Current consecutive day streak ending today or yesterday
  let streak = 0;
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const yesterdayKey = new Date(nowMs - 86400000).toISOString().slice(0, 10);
  let cursorMs = dayMap.has(todayKey)
    ? nowMs
    : dayMap.has(yesterdayKey)
    ? nowMs - 86400000
    : -1;

  if (cursorMs > 0) {
    while (true) {
      const k = new Date(cursorMs).toISOString().slice(0, 10);
      if (dayMap.has(k)) {
        streak += 1;
        cursorMs -= 86400000;
      } else {
        break;
      }
    }
  }

  // Longest historical consecutive day streak
  const sortedDays = Array.from(dayMap.keys()).sort();
  let longestStreakDays = 0;
  let running = 0;
  let prevDayMs: number | null = null;
  for (const dayKey of sortedDays) {
    const dayMs = Date.parse(`${dayKey}T00:00:00Z`);
    if (prevDayMs !== null && dayMs - prevDayMs === 86400000) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longestStreakDays) {
      longestStreakDays = running;
    }
    prevDayMs = dayMs;
  }

  const achievements: ImpactAchievement[] = [
    {
      id: 'first_step',
      title: 'First Logged Habit',
      description: 'Record your first clean commute or smoke-free household habit.',
      unlocked: totalActions >= 1,
      current: Math.min(1, totalActions),
      target: 1,
      unit: 'action',
    },
    {
      id: 'streak_3',
      title: '3-Day Consistency',
      description: 'Log at least one sustainable action for 3 consecutive days.',
      unlocked: longestStreakDays >= 3,
      current: Math.min(3, longestStreakDays),
      target: 3,
      unit: 'days',
    },
    {
      id: 'streak_7',
      title: '7-Day Clean Streak',
      description: 'Sustain a full 7-day consecutive habit logging streak.',
      unlocked: longestStreakDays >= 7,
      current: Math.min(7, longestStreakDays),
      target: 7,
      unit: 'days',
    },
    {
      id: 'co2_10kg',
      title: '10 kg CO2e Milestone',
      description:
        'Accumulate 10 kg in sourced estimated CO2e avoided from factor-backed swaps.',
      unlocked: totalCo2eAvoidedKg >= 10,
      current: Number(Math.min(10, totalCo2eAvoidedKg).toFixed(1)),
      target: 10,
      unit: 'kg CO2e',
    },
    {
      id: 'qualitative_steward',
      title: 'Smoke-Free Home Steward',
      description:
        'Complete 2 qualitative dust, filter-seal, or zero-burning household habits.',
      unlocked: qualitativeActions >= 2,
      current: Math.min(2, qualitativeActions),
      target: 2,
      unit: 'actions',
    },
    {
      id: 'actions_10',
      title: '10 Clean Habit Logs',
      description: 'Reach 10 total sustainable actions tracked on your device.',
      unlocked: totalActions >= 10,
      current: Math.min(10, totalActions),
      target: 10,
      unit: 'actions',
    },
  ];

  return {
    totalActions,
    quantifiedActions,
    qualitativeActions,
    totalCo2eAvoidedKg,
    currentStreakDays: streak,
    longestStreakDays,
    weeklySeries,
    monthlySeries,
    achievements,
  };
}
