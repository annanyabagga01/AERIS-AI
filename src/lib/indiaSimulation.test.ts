import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSimulatedCityAqiResponse,
  classifySimulatedCpcbCategory,
  clearIndiaSimulationCache,
  DEFAULT_SIMULATION_INTERVAL_MS,
  getIndiaSimulatedSnapshot,
  INDIA_STATES_AND_UTS,
  INDIA_STATION_TEMPLATES,
  queryIndiaSimulatedApi,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
} from './indiaSimulation.ts';
import { classifyCpcbAqi } from './aqi.ts';
import { hasValidIndianCoordinates } from './mapUtils.ts';

const REQUIRED_CITIES = [
  'Delhi',
  'Gurugram',
  'Noida',
  'Chandigarh',
  'Jaipur',
  'Lucknow',
  'Dehradun',
  'Shimla',
  'Srinagar',
  'Jammu',
  'Amritsar',
  'Ludhiana',
  'Mumbai',
  'Pune',
  'Ahmedabad',
  'Surat',
  'Bhopal',
  'Indore',
  'Raipur',
  'Nagpur',
  'Kolkata',
  'Patna',
  'Ranchi',
  'Bhubaneswar',
  'Guwahati',
  'Shillong',
  'Imphal',
  'Aizawl',
  'Agartala',
  'Kohima',
  'Itanagar',
  'Bengaluru',
  'Chennai',
  'Hyderabad',
  'Kochi',
  'Thiruvananthapuram',
  'Coimbatore',
  'Mysuru',
  'Visakhapatnam',
  'Vijayawada',
  'Panaji',
  'Port Blair',
];

test('covers all 28 Indian states and all 8 Union Territories with valid Indian coordinates', () => {
  const states = INDIA_STATES_AND_UTS.filter((s) => !s.isUnionTerritory);
  const uts = INDIA_STATES_AND_UTS.filter((s) => s.isUnionTerritory);
  assert.equal(states.length, 28);
  assert.equal(uts.length, 8);

  const snapshot = getIndiaSimulatedSnapshot(Date.parse('2026-11-19T06:00:00Z'));
  assert.equal(snapshot.summary.statesCovered, 28);
  assert.equal(snapshot.summary.unionTerritoriesCovered, 8);
  assert.equal(snapshot.summary.totalStations, INDIA_STATION_TEMPLATES.length);

  for (const st of snapshot.stations) {
    assert.equal(
      hasValidIndianCoordinates(st.latitude, st.longitude),
      true,
      `Invalid Indian coords for ${st.station_name}: ${st.latitude}, ${st.longitude}`
    );
  }
});

test('includes all required cities across North, South, East, West, Central, Northeast & Islands', () => {
  const snapshot = getIndiaSimulatedSnapshot(Date.parse('2026-11-19T06:00:00Z'));
  const presentCities = new Set(snapshot.stations.map((s) => s.city));
  for (const city of REQUIRED_CITIES) {
    assert.ok(presentCities.has(city), `Missing required city: ${city}`);
  }
});

test('every simulated station strictly conforms to the required API schema and CPCB category thresholds', () => {
  const res = queryIndiaSimulatedApi({
    nowMs: Date.parse('2026-11-19T06:00:00Z'),
  });
  assert.ok(res.stations.length >= 90);

  for (const st of res.stations) {
    assert.equal(typeof st.id, 'string');
    assert.ok(st.id.length > 0);
    assert.equal(typeof st.station_name, 'string');
    assert.equal(typeof st.city, 'string');
    assert.equal(typeof st.district, 'string');
    assert.equal(typeof st.state, 'string');
    assert.equal(typeof st.state_code, 'string');
    assert.equal(st.state_code.length, 2);
    assert.equal(typeof st.latitude, 'number');
    assert.equal(typeof st.longitude, 'number');
    assert.ok(st.aqi >= 0 && st.aqi <= 500, `Out-of-range AQI: ${st.aqi}`);
    assert.equal(st.aqi_category, classifySimulatedCpcbCategory(st.aqi));
    assert.equal(st.aqi_category, classifyCpcbAqi(st.aqi).category);
    assert.ok(st.pm25 > 0 && st.pm10 > 0 && st.no2 > 0 && st.so2 > 0 && st.co > 0 && st.o3 > 0);
    assert.ok(!Number.isNaN(Date.parse(st.timestamp)));
    assert.equal(st.data_source, SIMULATION_DATA_SOURCE);
    assert.equal(st.data_type, SIMULATION_DATA_TYPE);
  }
});

test('produces consistent deterministic readings within an interval and updates cleanly across intervals', () => {
  clearIndiaSimulationCache();
  const baseMs = Date.parse('2026-11-19T06:00:00Z');
  const first = getIndiaSimulatedSnapshot(baseMs, DEFAULT_SIMULATION_INTERVAL_MS);
  const second = getIndiaSimulatedSnapshot(
    baseMs + 5 * 60 * 1000,
    DEFAULT_SIMULATION_INTERVAL_MS
  );
  assert.deepEqual(first.stations, second.stations);
  assert.equal(first.generatedAt, second.generatedAt);

  const nextBucket = getIndiaSimulatedSnapshot(
    baseMs + DEFAULT_SIMULATION_INTERVAL_MS + 1000,
    DEFAULT_SIMULATION_INTERVAL_MS
  );
  assert.notEqual(first.generatedAt, nextBucket.generatedAt);
  const changedCount = first.stations.filter(
    (s, idx) => s.aqi !== nextBucket.stations[idx].aqi
  ).length;
  assert.ok(changedCount > 0, 'Expected simulated values to evolve on next interval');
});

test('supports state, city, category, and search query filters and accurate summary math', () => {
  const nowMs = Date.parse('2026-11-19T06:00:00Z');
  const full = queryIndiaSimulatedApi({ nowMs });
  const sumDistribution = full.summary.categoryDistribution.reduce(
    (acc, item) => acc + item.count,
    0
  );
  assert.equal(sumDistribution, full.summary.totalStations);
  assert.ok(full.summary.highestStation && full.summary.lowestStation);
  assert.ok(full.summary.highestStation.aqi >= full.summary.averageAqi);
  assert.ok(full.summary.lowestStation.aqi <= full.summary.averageAqi);

  const kerala = queryIndiaSimulatedApi({ state: 'Kerala', nowMs });
  assert.ok(kerala.stations.length >= 3);
  assert.ok(kerala.stations.every((s) => s.state === 'Kerala' && s.state_code === 'KL'));

  const byStateCode = queryIndiaSimulatedApi({ state: 'AN', nowMs });
  assert.equal(byStateCode.stations.length, 1);
  assert.equal(byStateCode.stations[0].city, 'Port Blair');

  const kochiResponse = buildSimulatedCityAqiResponse('Kochi', classifyCpcbAqi, { nowMs });
  assert.ok(kochiResponse);
  assert.equal(kochiResponse.city, 'Kochi');
  assert.equal(kochiResponse.state, 'Kerala');
  assert.equal(kochiResponse.dataSource, SIMULATION_DATA_SOURCE);
  assert.equal(kochiResponse.dataType, SIMULATION_DATA_TYPE);
  assert.equal(kochiResponse.hasOfficialData, false);
  assert.equal(kochiResponse.trend24h.length, 8);
});
