import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateOrLoopbackIp,
  resolveIndianCityFromIpPayload,
} from '../../server/location.ts';
import { INDIA_STATES_AND_UTS } from './indiaSimulation.ts';
import {
  ALL_INDIA_SEARCHABLE_CITIES,
  classifyGeolocationError,
  filterIndianCities,
  getLocationMethodLabel,
  getLocationStateBadge,
  isCoordinateWithinIndia,
} from './locationDetection.ts';

test('searchable city catalog covers all 28 Indian states and all 8 Union Territories', () => {
  const statesSet = new Set(ALL_INDIA_SEARCHABLE_CITIES.map((c) => c.state));
  assert.equal(INDIA_STATES_AND_UTS.length, 36);
  for (const stateOrUt of INDIA_STATES_AND_UTS) {
    assert.ok(
      statesSet.has(stateOrUt.name),
      `Missing state/UT in searchable city catalog: ${stateOrUt.name}`
    );
  }
});

test('filterIndianCities filters accurately by query, state name, state code, and UT', () => {
  const keralaCities = filterIndianCities({ stateFilter: 'Kerala' });
  assert.ok(keralaCities.length >= 2);
  assert.ok(keralaCities.some((c) => c.name === 'Kochi'));

  const portBlair = filterIndianCities({ query: 'Port Blair' });
  assert.equal(portBlair.length, 1);
  assert.equal(portBlair[0].stateCode, 'AN');
  assert.equal(portBlair[0].isUnionTerritory, true);

  const ladakhByCode = filterIndianCities({ stateFilter: 'LA' });
  assert.ok(ladakhByCode.some((c) => c.name === 'Leh'));

  const guwahati = filterIndianCities({ query: 'Guwahati' });
  assert.equal(guwahati[0].state, 'Assam');
});

test('classifyGeolocationError distinguishes permissions-policy blocks from user permission denial', () => {
  assert.equal(
    classifyGeolocationError({
      code: 1,
      message: 'Geolocation has been disabled in this document by permissions policy.',
    }),
    'blocked_by_policy'
  );
  assert.equal(
    classifyGeolocationError({
      code: 1,
      message: 'User denied Geolocation',
    }),
    'permission_denied'
  );
  assert.equal(
    classifyGeolocationError({
      code: 3,
      message: 'Timeout expired',
    }),
    'timeout'
  );
});

test('resolveIndianCityFromIpPayload maps valid Indian IP responses without storing coordinates and rejects non-Indian IPs honestly', () => {
  const aliasMatch = resolveIndianCityFromIpPayload({
    provider: 'ipwho.is',
    countryCode: 'IN',
    countryName: 'India',
    city: 'Bangalore',
    region: 'Karnataka',
    latitude: 12.9716,
    longitude: 77.5946,
  });
  assert.equal(aliasMatch.detected, true);
  assert.equal(aliasMatch.city, 'Bengaluru');
  assert.equal(aliasMatch.state, 'Karnataka');
  assert.equal(aliasMatch.stateCode, 'KA');
  assert.equal(aliasMatch.detectionMethod, 'ip_approximate');
  assert.equal(aliasMatch.isApproximate, true);
  assert.equal(aliasMatch.coordinatesStored, false);

  const coordNearest = resolveIndianCityFromIpPayload({
    provider: 'ipwho.is',
    countryCode: 'IN',
    countryName: 'India',
    city: 'Aluva',
    region: 'Kerala',
    latitude: 10.1004,
    longitude: 76.357,
  });
  assert.equal(coordNearest.detected, true);
  assert.equal(coordNearest.city, 'Kochi');
  assert.equal(coordNearest.state, 'Kerala');

  const outsideIndia = resolveIndianCityFromIpPayload({
    provider: 'ipwho.is',
    countryCode: 'US',
    countryName: 'United States',
    city: 'Mountain View',
    region: 'California',
    latitude: 37.386,
    longitude: -122.0838,
  });
  assert.equal(outsideIndia.detected, false);
  assert.equal(outsideIndia.reason, 'outside_india');
  assert.equal(outsideIndia.city, null);
});

test('private/loopback IP detection and India coordinate bounds work accurately', () => {
  assert.equal(isPrivateOrLoopbackIp('127.0.0.1'), true);
  assert.equal(isPrivateOrLoopbackIp('::1'), true);
  assert.equal(isPrivateOrLoopbackIp('10.0.0.4'), true);
  assert.equal(isPrivateOrLoopbackIp('192.168.1.12'), true);
  assert.equal(isPrivateOrLoopbackIp('49.36.120.15'), false);

  assert.equal(isCoordinateWithinIndia(28.6139, 77.209), true);
  assert.equal(isCoordinateWithinIndia(11.6234, 92.7265), true);
  assert.equal(isCoordinateWithinIndia(37.7749, -122.4194), false);

  assert.equal(getLocationStateBadge('detecting').label, 'Detecting location');
  assert.equal(getLocationStateBadge('gps_denied').label, 'GPS permission denied');
  assert.equal(getLocationStateBadge('gps_blocked').label, 'GPS blocked by browser');
  assert.equal(getLocationStateBadge('ip_approximate').label, 'Approximate city detected');
  assert.equal(getLocationStateBadge('manual_selection').label, 'Manual city selection');
  assert.match(getLocationMethodLabel('ip_approximate'), /Approximate IP/i);
});
