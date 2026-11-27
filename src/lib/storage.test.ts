import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PREFERENCES,
  loadImpactLog,
  loadIndoorState,
  loadPreferences,
  loadRoutinePlannerState,
  saveImpactLog,
  saveIndoorState,
  savePreferences,
  saveRoutinePlannerState,
} from './storage.ts';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function withMockWindow(fn: (storage: Storage) => void): void {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const storage = createMemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  try {
    fn(storage);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  }
}

test('loadPreferences returns defaults, persists updates, clamps householdSize, and recovers from corrupt JSON', () => {
  withMockWindow((storage) => {
    assert.deepEqual(loadPreferences(), DEFAULT_PREFERENCES);

    savePreferences({
      ...DEFAULT_PREFERENCES,
      city: 'Bengaluru',
      householdSize: 99,
      pollutionSensitiveHousehold: true,
    });
    const loaded = loadPreferences();
    assert.equal(loaded.city, 'Bengaluru');
    assert.equal(loaded.householdSize, 15);
    assert.equal(loaded.pollutionSensitiveHousehold, true);

    storage.setItem('aeris_ai_preferences_v1', '{broken-json');
    assert.deepEqual(loadPreferences(), DEFAULT_PREFERENCES);
  });
});

test('loadImpactLog and saveImpactLog round-trip entries and reject non-array corrupt data', () => {
  withMockWindow((storage) => {
    assert.deepEqual(loadImpactLog(), []);
    const entries = [
      {
        id: 'log-1',
        dateIso: '2026-11-27T08:00:00.000Z',
        actionType: 'metro_commute' as const,
        label: 'Metro commute',
        city: 'Delhi',
        co2AvoidedKg: 1.88,
        isQualitative: false,
      },
    ];
    saveImpactLog(entries);
    assert.equal(loadImpactLog().length, 1);
    assert.equal(loadImpactLog()[0].city, 'Delhi');

    storage.setItem('aeris_ai_impact_log_v1', '{"not":"an-array"}');
    assert.deepEqual(loadImpactLog(), []);
  });
});

test('loadIndoorState and loadRoutinePlannerState clamp room dimensions and recover safely', () => {
  withMockWindow((storage) => {
    const initialIndoor = loadIndoorState();
    assert.equal(initialIndoor.profile.lengthFt, 14);
    assert.ok(initialIndoor.checkedIds.length >= 1);

    saveIndoorState({
      profile: {
        ...initialIndoor.profile,
        lengthFt: 999,
        widthFt: 1,
        heightFt: 50,
      },
      checkedIds: ['damp-mopping-protocol'],
    });
    const clamped = loadIndoorState();
    assert.equal(clamped.profile.lengthFt, 60);
    assert.equal(clamped.profile.widthFt, 5);
    assert.equal(clamped.profile.heightFt, 20);
    assert.deepEqual(clamped.checkedIds, ['damp-mopping-protocol']);

    const initialRoutine = loadRoutinePlannerState();
    assert.equal(initialRoutine.scheduleType, 'office');
    saveRoutinePlannerState({
      scheduleType: 'college',
      activityPreference: 'yoga_mobility',
      checklist: null,
    });
    assert.equal(loadRoutinePlannerState().scheduleType, 'college');

    storage.setItem('aeris_ai_routine_planner_v1', 'not-json');
    assert.equal(loadRoutinePlannerState().scheduleType, 'office');
  });
});
