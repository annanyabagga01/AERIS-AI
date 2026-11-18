import type { FamilyPreferences, ImpactLogEntry } from './types.ts';
import {
  DEFAULT_INDOOR_PROFILE,
  type IndoorOptimizerProfile,
} from './indoorOptimizer.ts';
import type {
  ActivityPreference,
  DailyRoutineChecklistState,
  ScheduleContextType,
} from './routines.ts';

const PREFS_KEY = 'aeris_ai_preferences_v1';
const IMPACT_LOG_KEY = 'aeris_ai_impact_log_v1';
const INDOOR_STATE_KEY = 'aeris_ai_indoor_optimizer_v1';
const ROUTINE_STATE_KEY = 'aeris_ai_routine_planner_v1';

export interface StoredIndoorState {
  profile: IndoorOptimizerProfile;
  checkedIds: string[];
}

export interface StoredRoutinePlannerState {
  scheduleType: ScheduleContextType;
  activityPreference: ActivityPreference;
  checklist: DailyRoutineChecklistState | null;
}

export const DEFAULT_PREFERENCES: FamilyPreferences = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
  hasOlderAdults: false,
  pollutionSensitiveHousehold: false,
  commuteMode: 'metro',
  workStartHour: '09:00',
  workEndHour: '18:00',
  preferredExerciseTime: 'morning',
  anonymousHandle: 'UrbanResident_01',
  communityOptIn: false,
};

export function loadPreferences(): FamilyPreferences {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<FamilyPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      householdSize: Math.max(1, Math.min(15, Number(parsed.householdSize) || 4)),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: FamilyPreferences): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadImpactLog(): ImpactLogEntry[] {
  try {
    const raw = window.localStorage.getItem(IMPACT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImpactLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveImpactLog(entries: ImpactLogEntry[]): void {
  try {
    window.localStorage.setItem(IMPACT_LOG_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadIndoorState(): StoredIndoorState {
  const defaultChecked = ['damp-mopping-protocol', 'kitchen-exhaust-tadka'];
  try {
    const raw = window.localStorage.getItem(INDOOR_STATE_KEY);
    if (!raw) {
      return { profile: DEFAULT_INDOOR_PROFILE, checkedIds: defaultChecked };
    }
    const parsed = JSON.parse(raw) as Partial<StoredIndoorState>;
    return {
      profile: {
        ...DEFAULT_INDOOR_PROFILE,
        ...(parsed.profile ?? {}),
        lengthFt: Math.max(5, Math.min(60, Number(parsed.profile?.lengthFt) || 14)),
        widthFt: Math.max(5, Math.min(60, Number(parsed.profile?.widthFt) || 12)),
        heightFt: Math.max(7, Math.min(20, Number(parsed.profile?.heightFt) || 10)),
      },
      checkedIds: Array.isArray(parsed.checkedIds)
        ? parsed.checkedIds.filter((x): x is string => typeof x === 'string')
        : defaultChecked,
    };
  } catch {
    return { profile: DEFAULT_INDOOR_PROFILE, checkedIds: defaultChecked };
  }
}

export function saveIndoorState(state: StoredIndoorState): void {
  try {
    window.localStorage.setItem(INDOOR_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadRoutinePlannerState(): StoredRoutinePlannerState {
  try {
    const raw = window.localStorage.getItem(ROUTINE_STATE_KEY);
    if (!raw) {
      return {
        scheduleType: 'office',
        activityPreference: 'walk_run',
        checklist: null,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredRoutinePlannerState>;
    return {
      scheduleType: parsed.scheduleType ?? 'office',
      activityPreference: parsed.activityPreference ?? 'walk_run',
      checklist: parsed.checklist ?? null,
    };
  } catch {
    return {
      scheduleType: 'office',
      activityPreference: 'walk_run',
      checklist: null,
    };
  }
}

export function saveRoutinePlannerState(state: StoredRoutinePlannerState): void {
  try {
    window.localStorage.setItem(ROUTINE_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
