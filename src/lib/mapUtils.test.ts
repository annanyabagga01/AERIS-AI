import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeStationsBounds,
  filterMapStations,
  getWorstCategory,
  hasValidIndianCoordinates,
  isRecentlyUpdatedStation,
  MAP_CPCB_MARKER_SPECS,
} from './mapUtils.ts';
import type { StationReading } from './types.ts';

function makeStation(overrides: Partial<StationReading> = {}): StationReading {
  return {
    id: 'st-1',
    station: 'Anand Vihar Transit Hub',
    city: 'Delhi',
    district: 'East Delhi',
    state: 'Delhi',
    stateCode: 'DL',
    lat: 28.6469,
    lng: 77.316,
    officialAqi: 245,
    category: 'Poor',
    predominantPollutant: 'PM2.5',
    pollutants: [],
    lastUpdatedIso: new Date().toISOString(),
    source: 'AERIS_SIMULATION_ENGINE',
    sourceLabel: 'AERIS AI Simulation Engine (SIMULATED)',
    dataType: 'SIMULATED',
    isOfficialNationalAqi: false,
    isDemo: true,
    isStale: false,
    staleNote: 'Simulated interval snapshot (Demo Mode)',
    ...overrides,
  };
}

test('MAP_CPCB_MARKER_SPECS defines all six CPCB bands with distinct colors', () => {
  const colors = new Set([
    MAP_CPCB_MARKER_SPECS.Good.fillHex,
    MAP_CPCB_MARKER_SPECS.Satisfactory.fillHex,
    MAP_CPCB_MARKER_SPECS.Moderate.fillHex,
    MAP_CPCB_MARKER_SPECS.Poor.fillHex,
    MAP_CPCB_MARKER_SPECS['Very Poor'].fillHex,
    MAP_CPCB_MARKER_SPECS.Severe.fillHex,
  ]);
  assert.equal(colors.size, 6);
  assert.equal(getWorstCategory(['Good', 'Moderate', 'Severe']), 'Severe');
  assert.equal(getWorstCategory(['Unavailable', 'Satisfactory']), 'Satisfactory');
});

test('filterMapStations validates Indian coordinates and filters by query, state, category, and city', () => {
  const stations = [
    makeStation({ id: 'd1', city: 'Delhi', state: 'Delhi', stateCode: 'DL', category: 'Very Poor', officialAqi: 340 }),
    makeStation({
      id: 'm1',
      station: 'Worli Seaface Coastal Monitor',
      city: 'Mumbai',
      district: 'Mumbai City',
      state: 'Maharashtra',
      stateCode: 'MH',
      lat: 19.0096,
      lng: 72.8157,
      category: 'Moderate',
      officialAqi: 130,
    }),
    makeStation({
      id: 'bad-coord',
      station: 'Zero Coord Station',
      city: 'Delhi',
      lat: 0,
      lng: 0,
    }),
  ];

  assert.equal(hasValidIndianCoordinates(28.61, 77.2), true);
  assert.equal(hasValidIndianCoordinates(0, 0), false);

  const allValid = filterMapStations(stations, {});
  assert.equal(allValid.length, 2);

  const mhOnly = filterMapStations(stations, { state: 'Maharashtra' });
  assert.equal(mhOnly.length, 1);
  assert.equal(mhOnly[0].id, 'm1');

  const mumbaiOnly = filterMapStations(stations, { cityOnly: 'Mumbai' });
  assert.equal(mumbaiOnly.length, 1);
  assert.equal(mumbaiOnly[0].id, 'm1');

  const searchWorli = filterMapStations(stations, { query: 'worli' });
  assert.equal(searchWorli.length, 1);
  assert.equal(searchWorli[0].id, 'm1');

  const veryPoorOnly = filterMapStations(stations, { category: 'Very Poor' });
  assert.equal(veryPoorOnly.length, 1);
  assert.equal(veryPoorOnly[0].id, 'd1');

  const bounds = computeStationsBounds(allValid);
  assert.ok(bounds);
  assert.equal(bounds[0][0], 19.0096);
  assert.equal(bounds[1][0], 28.6469);
});

test('isRecentlyUpdatedStation checks freshness window cleanly', () => {
  const now = Date.parse('2026-11-19T06:00:00Z');
  const fresh = makeStation({
    lastUpdatedIso: '2026-11-19T05:30:00Z',
    isStale: false,
  });
  const old = makeStation({
    lastUpdatedIso: '2026-11-19T03:00:00Z',
    isStale: false,
  });

  assert.equal(isRecentlyUpdatedStation(fresh, now), true);
  assert.equal(isRecentlyUpdatedStation(old, now), false);
});
