import { classifyCpcbAqi } from './aqi.ts';
import type { AqiCategory, FamilyPreferences } from './types.ts';

export type ScheduleContextType = 'office' | 'college' | 'hybrid_home';

export type ActivityPreference =
  | 'walk_run'
  | 'cycling_sports'
  | 'yoga_mobility'
  | 'strength_home'
  | 'errands_stroll';

export type RoutinePeriod = 'Morning' | 'Afternoon' | 'Evening';

export interface RoutineExtraOptions {
  scheduleType?: ScheduleContextType;
  activityPreference?: ActivityPreference;
  isVerifiedCurrent?: boolean;
  verificationNotice?: string;
}

export interface RoutineBlock {
  period: RoutinePeriod;
  timeWindow: string;
  headline: string;
  saferWindowNote: string;
  schoolAndChildren: string;
  workAndCommute: string;
  exerciseAndOutdoors: string;
  olderAdultsAndSensitive: string;
}

export interface SaferOutdoorWindowVerdict {
  supportedByCurrentData: boolean;
  statusLabel: string;
  windowLabel: string;
  rationale: string;
}

export interface CommuteSuggestionSummary {
  currentModeLabel: string;
  upgradeSuggested: boolean;
  recommendation: string;
  precautions: string;
}

export interface PersonalizedRoutinePlan {
  city: string;
  aqi: number | null;
  category: AqiCategory;
  isVerifiedCurrent: boolean;
  verificationNotice: string;
  scheduleType: ScheduleContextType;
  activityPreference: ActivityPreference;
  saferOutdoorWindow: SaferOutdoorWindowVerdict;
  commuteSuggestion: CommuteSuggestionSummary;
  indoorAlternatives: string[];
  disclaimer: string;
  blocks: RoutineBlock[];
}

export interface RoutineTask {
  id: string;
  period: RoutinePeriod;
  title: string;
  completed: boolean;
  isCustom: boolean;
}

export interface DailyRoutineChecklistState {
  dateKey: string;
  lastRefreshedIso: string;
  tasks: RoutineTask[];
}

export interface ChecklistStats {
  total: number;
  completed: number;
  percent: number;
  byPeriod: Record<RoutinePeriod, { total: number; completed: number }>;
}

export const SCHEDULE_CONTEXT_OPTIONS: {
  id: ScheduleContextType;
  label: string;
}[] = [
  { id: 'office', label: 'Office / Work' },
  { id: 'college', label: 'College / University' },
  { id: 'hybrid_home', label: 'Hybrid / Home Study' },
];

export const ACTIVITY_PREFERENCE_OPTIONS: {
  id: ActivityPreference;
  label: string;
}[] = [
  { id: 'walk_run', label: 'Brisk Walk / Jog' },
  { id: 'cycling_sports', label: 'Cycling / Outdoor Sports' },
  { id: 'yoga_mobility', label: 'Yoga / Breathwork' },
  { id: 'strength_home', label: 'Strength / Cardio Circuit' },
  { id: 'errands_stroll', label: 'Park Stroll / Errands' },
];

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getIndoorAlternatives(
  activity: ActivityPreference,
  highSmog: boolean
): string[] {
  switch (activity) {
    case 'walk_run':
      return [
        highSmog
          ? '20–25 min indoor corridor brisk walking or gentle marching intervals near filtered air.'
          : '25 min treadmill walk/jog or low-impact step-ups indoors if morning haze persists.',
        '3 rounds of 10-minute stair climbs or slow-tempo bodyweight warmups (keep breathing nasal when possible).',
        'Post-session ankle, hip-flexor & thoracic mobility routine (10 min).',
      ];
    case 'cycling_sports':
      return [
        '25–35 min stationary bike / indoor trainer ride in a closed, filtered room.',
        'Dynamic agility & shadow footwork drills (4 × 4 min blocks with 90s rest).',
        'Core stability circuit (planks, dead-bugs, glute bridges) replacing outdoor road intervals.',
      ];
    case 'yoga_mobility':
      return [
        '30 min Hatha / Vinyasa mobility flow inside a closed room (no agarbatti, dhoop, or scented candles).',
        'Gentle nasal-breathing recovery & diaphragm stretches after sealing window gaps.',
        '20 min evening neck, shoulder & hamstring decompression sequence.',
      ];
    case 'strength_home':
      return [
        '30 min resistance-band or bodyweight strength circuit (squats, push-ups, rows, lunges).',
        'Controlled tempo hypertrophy sets with longer 90s rests to keep ventilation demand moderate.',
        'Foam rolling and thoracic extension cool-down.',
      ];
    case 'errands_stroll':
    default:
      return [
        'Consolidate essential grocery/errand trips into one midday window or order delivery during spikes.',
        '15–20 min indoor walking while taking calls instead of evening roadside strolls.',
        'Light stretching & posture resets every 90 minutes during work or study hours.',
      ];
  }
}

function getCommuteModeLabel(mode: FamilyPreferences['commuteMode']): string {
  switch (mode) {
    case 'metro':
      return 'Metro rail';
    case 'bus':
      return 'closed-window AC bus';
    case 'carpool':
      return 'shared carpool (recirculation mode)';
    case 'ev_cab':
      return 'EV cab (windows up)';
    case 'two_wheeler':
      return 'two-wheeler';
    case 'walk_cycle':
      return 'walking / cycling';
    case 'solo_car':
    default:
      return 'private car';
  }
}

export function buildPersonalizedRoutine(
  aqi: number | null,
  prefs: FamilyPreferences,
  options?: RoutineExtraOptions
): PersonalizedRoutinePlan {
  const meta = classifyCpcbAqi(aqi);
  const category = meta.category;
  const scheduleType: ScheduleContextType = options?.scheduleType ?? 'office';
  const activityPreference: ActivityPreference =
    options?.activityPreference ?? 'walk_run';
  const isVerifiedCurrent =
    options?.isVerifiedCurrent !== undefined
      ? options.isVerifiedCurrent
      : aqi !== null && category !== 'Unavailable';

  const highSmog =
    category === 'Poor' || category === 'Very Poor' || category === 'Severe';
  const moderate = category === 'Moderate';
  const cleanOutside = category === 'Good' || category === 'Satisfactory';
  const sensitive =
    prefs.pollutionSensitiveHousehold || prefs.hasChildren || prefs.hasOlderAdults;

  const verificationNotice =
    options?.verificationNotice ??
    (isVerifiedCurrent
      ? 'Verified current official CPCB AQI data supports timing guidance below.'
      : 'Live current CPCB AQI is unavailable, stale, or in demo fallback mode—outdoor window recommendations remain conservative.');

  // Recommend safer outdoor windows ONLY when supported by current verified data
  let saferOutdoorWindow: SaferOutdoorWindowVerdict;
  if (!isVerifiedCurrent || category === 'Unavailable' || aqi === null) {
    saferOutdoorWindow = {
      supportedByCurrentData: false,
      statusLabel: 'Not Confirmed by Current Data',
      windowLabel: 'Prefer Indoor Alternatives (Demo Mode)',
      rationale:
        'Current readings come from the AERIS AI Simulation Engine (Demo Mode) rather than live environmental monitors. Treat outdoor exercise guidance as a demonstration and verify local conditions before vigorous outdoor activity.',
    };
  } else if (highSmog) {
    saferOutdoorWindow = {
      supportedByCurrentData: false,
      statusLabel: `Outdoor Exertion Unsafe (${category})`,
      windowLabel: 'No Safe Prolonged Outdoor Exercise Window Today',
      rationale: `Current simulated AQI is ${aqi} (${category}). Elevated PM2.5 increases inhaled dose sharply during outdoor cardio; move workouts indoors and limit outdoor errands to brief 13:00–15:30 windows if necessary.`,
    };
  } else if (moderate) {
    if (sensitive) {
      saferOutdoorWindow = {
        supportedByCurrentData: false,
        statusLabel: 'Restricted for Sensitive Households (Moderate)',
        windowLabel: 'Indoor Preferred · Brief 15m Midday Only (13:00–15:30)',
        rationale: `Current simulated AQI is ${aqi} (Moderate), with household sensitivity active. Skip strenuous outdoor sessions; only short, gentle low-exertion outdoor movement around midday solar mixing is advised.`,
      };
    } else {
      saferOutdoorWindow = {
        supportedByCurrentData: true,
        statusLabel: 'Bounded Midday Window Supported',
        windowLabel: '13:00 – 15:30 (Max 25 min, Away From Traffic)',
        rationale: `Current simulated AQI is ${aqi} (Moderate). Midday solar warming typically improves vertical dispersion compared to 06:00–09:30 or post-sunset peaks; keep intensity light to moderate.`,
      };
    }
  } else {
    const preferredWindow =
      prefs.preferredExerciseTime === 'morning'
        ? '07:00 – 09:30 (or 13:00 – 16:00)'
        : prefs.preferredExerciseTime === 'afternoon'
        ? '13:00 – 16:00'
        : '16:30 – 19:00 (away from heavy traffic)';
    saferOutdoorWindow = {
      supportedByCurrentData: true,
      statusLabel: `Outdoor Activity Supported (${category})`,
      windowLabel: preferredWindow,
      rationale: `Current simulated AQI is ${aqi} (${category}), supporting normal outdoor exercise and campus/work walking away from congested intersections.`,
    };
  }

  const commuteLabel = getCommuteModeLabel(prefs.commuteMode);
  const openAirCommuter =
    prefs.commuteMode === 'walk_cycle' || prefs.commuteMode === 'two_wheeler';
  const contextNoun =
    scheduleType === 'college'
      ? 'campus/college schedule'
      : scheduleType === 'hybrid_home'
      ? 'hybrid workday & errands'
      : 'office commute';

  const upgradeSuggested = openAirCommuter && (!isVerifiedCurrent || highSmog || (moderate && sensitive));
  const commuteSuggestion: CommuteSuggestionSummary = upgradeSuggested
    ? {
        currentModeLabel: commuteLabel,
        upgradeSuggested: true,
        recommendation: `Switch temporarily from ${commuteLabel} to Metro rail, closed-window AC bus, or shared EV/carpool for your ${contextNoun} (${prefs.workStartHour}–${prefs.workEndHour}).`,
        precautions:
          'When walking last-mile connectors or waiting on exposed platforms, wear a snug N95/KF94 respirator and avoid lingering behind idling diesel buses.',
      }
    : {
        currentModeLabel: commuteLabel,
        upgradeSuggested: false,
        recommendation:
          scheduleType === 'hybrid_home'
            ? `Stay home-based during ${prefs.workStartHour}–${prefs.workEndHour} rush hours; schedule essential ${commuteLabel} trips cleanly between 12:30 and 15:30.`
            : `Continue via ${commuteLabel} (${prefs.workStartHour} departure / ${prefs.workEndHour} return).`,
        precautions:
          prefs.commuteMode === 'solo_car' || prefs.commuteMode === 'carpool' || prefs.commuteMode === 'ev_cab'
            ? 'Keep cabin AC set to Recirculate on high-traffic stretches to block tailpipe plumes; briefly purge stale cabin CO2 on clear segments.'
            : cleanOutside && isVerifiedCurrent
            ? 'Current verified air supports standard transit; prefer shaded internal lanes when walking to stations.'
            : 'Choose enclosed transit carriages where possible and avoid peak-hour roadside intersections.',
      };

  const indoorAlternatives = getIndoorAlternatives(activityPreference, highSmog);

  const scheduleMorningTag =
    scheduleType === 'college'
      ? `Campus classes / commute (${prefs.workStartHour})`
      : scheduleType === 'hybrid_home'
      ? `Remote start (${prefs.workStartHour})`
      : `Office departure (${prefs.workStartHour})`;

  const scheduleEveningTag =
    scheduleType === 'college'
      ? `Post-lecture return (${prefs.workEndHour})`
      : scheduleType === 'hybrid_home'
      ? `Workday wrap-up (${prefs.workEndHour})`
      : `Return commute (${prefs.workEndHour})`;

  const morning: RoutineBlock = {
    period: 'Morning',
    timeWindow: `06:00 – ${prefs.workStartHour}`,
    headline: !isVerifiedCurrent
      ? 'Unverified current AQI — keep early morning routine indoors until live confirmation'
      : highSmog
      ? 'Winter inversion peak — keep windows sealed and move morning movement indoors'
      : moderate
      ? 'Moderate morning haze — avoid dawn traffic corridors & keep exposure brief'
      : 'Verified cleaner morning air — brief ventilation and outdoor start supported',
    saferWindowNote:
      cleanOutside && isVerifiedCurrent && prefs.preferredExerciseTime === 'morning'
        ? 'Morning outdoor window supported by current verified AQI.'
        : 'Avoid early-morning outdoor cardio during cold street-level inversions.',
    schoolAndChildren: highSmog || !isVerifiedCurrent
      ? 'Skip early-morning playground warmups; send children with a properly fitted N95/KF94 mask for bus/drop-off.'
      : moderate
      ? 'Limit high-intensity morning sports; prefer indoor assembly if visibility looks hazy.'
      : 'Normal outdoor school walk and morning play supported by current air quality.',
    workAndCommute:
      scheduleType === 'hybrid_home'
        ? `${scheduleMorningTag}: avoid peak traffic outdoors, keep windows latched before 10:30, and set up workspace away from kitchen fumes.`
        : upgradeSuggested
        ? `${scheduleMorningTag}: swap ${commuteLabel} for enclosed Metro rail or closed-window AC transit; use a fitted N95 mask on open connectors.`
        : `${scheduleMorningTag}: travel via ${commuteLabel}; keep cabin air recirculation active through congested junctions.`,
    exerciseAndOutdoors:
      prefs.preferredExerciseTime === 'morning'
        ? cleanOutside && isVerifiedCurrent
          ? 'Current verified readings support your morning outdoor session away from main roads.'
          : `Indoor replacement recommended: ${indoorAlternatives[0]}`
        : 'Reserve structured movement for your preferred afternoon or indoor slot.',
    olderAdultsAndSensitive: highSmog || !isVerifiedCurrent
      ? 'Postpone early-morning park walks; keep bedroom doors closed and run mechanical HEPA filtration if available.'
      : 'Prefer sunlit indoor space or wait until after 10:00 AM if morning mist lingers.',
  };

  const afternoon: RoutineBlock = {
    period: 'Afternoon',
    timeWindow: '12:00 – 16:30',
    headline: !isVerifiedCurrent
      ? 'Awaiting verified live reading — keep intense workouts indoors'
      : highSmog
      ? 'Brief afternoon mixing — limit outdoor errands & inspect live visibility first'
      : 'Peak solar mixing hours — optimal window for controlled ventilation & midday tasks',
    saferWindowNote:
      saferOutdoorWindow.supportedByCurrentData
        ? `Supported window: ${saferOutdoorWindow.windowLabel}.`
        : 'Current data does not confirm a safe prolonged outdoor workout window.',
    schoolAndChildren: highSmog || !isVerifiedCurrent
      ? 'During school or college afternoon pickup, minimize idling time near gates; transition promptly indoors.'
      : 'Afternoon campus walks and pickups carry lower particulate buildup than dawn or dusk.',
    workAndCommute:
      scheduleType === 'college'
        ? 'Schedule campus walks between blocks or short library/canteen transitions during 13:00–15:30 rather than late evening.'
        : 'Group essential outdoor errands cleanly inside 13:00–15:30 when vertical mixing typically lowers street-level smog.',
    exerciseAndOutdoors:
      prefs.preferredExerciseTime === 'afternoon'
        ? saferOutdoorWindow.supportedByCurrentData
          ? `Verified midday window supported (${saferOutdoorWindow.windowLabel}). Keep pacing controlled.`
          : `Use indoor alternative: ${indoorAlternatives[0]}`
        : cleanOutside && isVerifiedCurrent
        ? 'Cross-ventilate occupied rooms for 30 minutes cleanly at zero energy cost.'
        : 'Ventilate briefly (max 15 min) only if outdoor haze visibly lifts, then re-seal rooms.',
    olderAdultsAndSensitive: highSmog || !isVerifiedCurrent
      ? 'Keep floors clean via damp microfiber mopping (no dry sweeping) and avoid midday arterial-road walks.'
      : 'Short 15–20 minute midday sun walk supported on quiet internal paths.',
  };

  const evening: RoutineBlock = {
    period: 'Evening',
    timeWindow: `${prefs.workEndHour} – 22:30`,
    headline: !isVerifiedCurrent || highSmog
      ? 'Post-sunset boundary drop — seal rooms, run exhaust & exercise indoors'
      : 'Evening return & indoor air reset before nightfall',
    saferWindowNote:
      cleanOutside && isVerifiedCurrent && prefs.preferredExerciseTime === 'evening'
        ? 'Supported away from congested rush-hour roads.'
        : 'Close exterior windows before 18:00 dusk cooling traps rush-hour emissions.',
    schoolAndChildren: highSmog || !isVerifiedCurrent
      ? 'Keep evening play and homework indoors; prohibit agarbatti, dhoop, scented candles, or mosquito coils in closed rooms.'
      : 'Normal evening indoor reset; wash hands and face after returning from traffic corridors.',
    workAndCommute:
      scheduleType === 'hybrid_home'
        ? `${scheduleEveningTag}: shut exterior balcony gaps before evening rush and turn on kitchen chimney during dinner prep.`
        : `${scheduleEveningTag}: leave promptly via ${upgradeSuggested ? 'Metro / closed-window transit' : commuteLabel}; avoid waiting beside idling intersection traffic.`,
    exerciseAndOutdoors:
      prefs.preferredExerciseTime === 'evening'
        ? cleanOutside && isVerifiedCurrent && !sensitive
          ? 'Light evening outdoor movement away from busy junctions is supported by current verified readings.'
          : `Skip post-sunset outdoor runs; switch indoors: ${indoorAlternatives[1]}`
        : 'Complete light indoor mobility/stretching and run kitchen exhaust during dinner cooking.',
    olderAdultsAndSensitive: highSmog || !isVerifiedCurrent
      ? 'Latch windows before 18:00, run bedroom HEPA unit on medium/sleep mode overnight, and keep indoor air smoke-free.'
      : 'Vent kitchen exhaust outdoors throughout dinner preparation and keep bedrooms clutter-free.',
  };

  return {
    city: prefs.city,
    aqi,
    category,
    isVerifiedCurrent,
    verificationNotice,
    scheduleType,
    activityPreference,
    saferOutdoorWindow,
    commuteSuggestion,
    indoorAlternatives,
    disclaimer:
      'General environmental exposure guidance based on CPCB air quality tiers. Not medical advice or diagnosis; follow your physician’s guidance for personal health conditions.',
    blocks: [morning, afternoon, evening],
  };
}

export function generateDailyChecklistTasks(
  plan: PersonalizedRoutinePlan,
  prefs: FamilyPreferences
): RoutineTask[] {
  const highSmog =
    plan.category === 'Poor' ||
    plan.category === 'Very Poor' ||
    plan.category === 'Severe';
  const morning = plan.blocks[0];
  const afternoon = plan.blocks[1];
  const evening = plan.blocks[2];

  const tasks: RoutineTask[] = [
    {
      id: 'task-morning-commute',
      period: 'Morning',
      title: plan.commuteSuggestion.upgradeSuggested
        ? `Morning travel (${prefs.workStartHour}): use Metro or closed-window transit instead of ${plan.commuteSuggestion.currentModeLabel}`
        : `Morning travel (${prefs.workStartHour}): ${plan.commuteSuggestion.currentModeLabel} with recirculation/protection`,
      completed: false,
      isCustom: false,
    },
    {
      id: 'task-morning-seal',
      period: 'Morning',
      title:
        highSmog || !plan.isVerifiedCurrent
          ? 'Keep exterior windows sealed through 10:30 morning inversion'
          : morning.saferWindowNote,
      completed: false,
      isCustom: false,
    },
    {
      id: 'task-afternoon-window',
      period: 'Afternoon',
      title: plan.saferOutdoorWindow.supportedByCurrentData
        ? `Midday window (${plan.saferOutdoorWindow.windowLabel}): complete outdoor movement or 30m room cross-ventilation`
        : 'Midday check (13:00–15:30): group short errands cleanly and verify live AQI before opening windows',
      completed: false,
      isCustom: false,
    },
    {
      id: 'task-afternoon-workout',
      period: 'Afternoon',
      title: plan.saferOutdoorWindow.supportedByCurrentData
        ? afternoon.exerciseAndOutdoors
        : `Indoor workout alternative: ${plan.indoorAlternatives[0]}`,
      completed: false,
      isCustom: false,
    },
    {
      id: 'task-evening-return',
      period: 'Evening',
      title: `Return by ${prefs.workEndHour} and seal balcony/window gaps before dusk smog buildup`,
      completed: false,
      isCustom: false,
    },
    {
      id: 'task-evening-kitchen',
      period: 'Evening',
      title:
        'Run kitchen exhaust/chimney during dinner prep; avoid incense, candles & mosquito coils indoors',
      completed: false,
      isCustom: false,
    },
  ];

  if (prefs.hasChildren) {
    tasks.push({
      id: 'task-morning-school',
      period: 'Morning',
      title:
        highSmog || !plan.isVerifiedCurrent
          ? 'Check N95/KF94 mask fit for school commute and skip early outdoor drills'
          : 'Confirm water bottle and light sun-safe school transition',
      completed: false,
      isCustom: false,
    });
  }

  if (prefs.hasOlderAdults || prefs.pollutionSensitiveHousehold) {
    tasks.push({
      id: 'task-evening-sleep',
      period: 'Evening',
      title:
        highSmog || !plan.isVerifiedCurrent
          ? 'Switch bedroom HEPA purifier to sleep/auto mode and complete damp floor wiping before nightfall'
          : evening.olderAdultsAndSensitive,
      completed: false,
      isCustom: false,
    });
  }

  return tasks;
}

export function ensureDailyChecklistFresh(
  stored: DailyRoutineChecklistState | null,
  plan: PersonalizedRoutinePlan,
  prefs: FamilyPreferences,
  now: Date = new Date()
): { state: DailyRoutineChecklistState; wasAutoRefreshed: boolean } {
  const todayKey = getLocalDateKey(now);
  if (!stored || stored.dateKey !== todayKey || stored.tasks.length === 0) {
    return {
      state: {
        dateKey: todayKey,
        lastRefreshedIso: now.toISOString(),
        tasks: generateDailyChecklistTasks(plan, prefs),
      },
      wasAutoRefreshed: Boolean(stored && stored.dateKey !== todayKey),
    };
  }
  return { state: stored, wasAutoRefreshed: false };
}

export function computeChecklistStats(tasks: RoutineTask[]): ChecklistStats {
  const byPeriod: Record<RoutinePeriod, { total: number; completed: number }> = {
    Morning: { total: 0, completed: 0 },
    Afternoon: { total: 0, completed: 0 },
    Evening: { total: 0, completed: 0 },
  };

  let completed = 0;
  for (const t of tasks) {
    byPeriod[t.period].total += 1;
    if (t.completed) {
      completed += 1;
      byPeriod[t.period].completed += 1;
    }
  }

  const total = tasks.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percent, byPeriod };
}
