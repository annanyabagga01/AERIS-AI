import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractStationPm25,
  layoutOrbitalStationMarkers,
  resolvePollutionVisualProfile,
} from './earthPollution.ts';
import type { StationReading } from './types.ts';

function makeStation(
  id: string,
  lat: number,
  lng: number,
  aqi: number | null,
  category: StationReading['category'],
  pm25: number | null = 120,
): StationReading {
  return {
    id,
    station: `Station ${id}`,
    city: 'Delhi',
    state: 'Delhi',
    lat,
    lng,
    officialAqi: aqi,
    category,
    predominantPollutant: pm25 !== null ? 'PM2.5' : null,
    pollutants: [
      {
        id: 'PM2.5',
        label: 'PM2.5',
        value: pm25,
        min: pm25,
        max: pm25,
        unit: 'µg/m³',
      },
    ],
    lastUpdatedIso: '2026-11-18T12:00:00.000Z',
    source: 'AERIS_SIMULATION_ENGINE',
    sourceLabel: 'AERIS AI Simulation Engine',
    dataType: 'SIMULATED',
    isOfficialNationalAqi: false,
    isDemo: true,
    isStale: false,
    staleNote: 'Simulated',
  };
}

test('resolvePollutionVisualProfile disables glow and particles when data is unavailable', () => {
  const nullProfile = resolvePollutionVisualProfile(null, 'Unavailable');
  assert.equal(nullProfile.available, false);
  assert.equal(nullProfile.glowIntensity, 0);
  assert.equal(nullProfile.particleIntensity, 0);
  assert.equal(nullProfile.particleDensityFactor, 0);

  const mismatchedProfile = resolvePollutionVisualProfile(250, 'Unavailable');
  assert.equal(mismatchedProfile.available, false);
  assert.equal(mismatchedProfile.glowIntensity, 0);
  assert.equal(mismatchedProfile.particleIntensity, 0);
});

test('resolvePollutionVisualProfile monotonically scales glow and particles across CPCB categories', () => {
  const good = resolvePollutionVisualProfile(30, 'Good');
  const satisfactory = resolvePollutionVisualProfile(78, 'Satisfactory');
  const moderate = resolvePollutionVisualProfile(150, 'Moderate');
  const poor = resolvePollutionVisualProfile(255, 'Poor');
  const veryPoor = resolvePollutionVisualProfile(342, 'Very Poor');
  const severe = resolvePollutionVisualProfile(445, 'Severe');

  const ordered = [good, satisfactory, moderate, poor, veryPoor, severe];
  for (const p of ordered) {
    assert.equal(p.available, true);
    assert.ok(p.glowIntensity > 0);
    assert.ok(p.particleIntensity > 0);
  }

  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      ordered[i].glowIntensity > ordered[i - 1].glowIntensity,
      `Expected ${ordered[i].category} glow > ${ordered[i - 1].category} glow`,
    );
    assert.ok(
      ordered[i].particleIntensity > ordered[i - 1].particleIntensity,
      `Expected ${ordered[i].category} particles > ${ordered[i - 1].category} particles`,
    );
    assert.ok(
      ordered[i].haloAngularRadius > ordered[i - 1].haloAngularRadius,
      `Expected ${ordered[i].category} halo radius > ${ordered[i - 1].category} radius`,
    );
  }

  // Very Poor & Severe use red/orange hues while Good uses emerald
  assert.equal(veryPoor.coreHex, 0xef4444);
  assert.equal(veryPoor.outerHex, 0xf97316);
  assert.equal(severe.coreHex, 0xdc2626);
  assert.equal(good.coreHex, 0x10b981);
});

test('layoutOrbitalStationMarkers separates closely clustered metro stations for reliable 3D clicking', () => {
  const stations = [
    makeStation('anand-vihar', 28.6469, 77.3164, 342, 'Very Poor', 193),
    makeStation('rk-puram', 28.5633, 77.1869, 312, 'Very Poor', 168),
    makeStation('punjabi-bagh', 28.674, 77.131, 328, 'Very Poor', 175),
    makeStation('mandir-marg', 28.6364, 77.201, 294, 'Poor', 142),
  ];

  const laidOut = layoutOrbitalStationMarkers(stations, 28.6139, 77.209);
  assert.equal(laidOut.length, 4);

  // Anand Vihar (east of Delhi centroid) remains east of Punjabi Bagh (west)
  assert.ok(laidOut[0].displayLng > laidOut[2].displayLng);
  // Punjabi Bagh (north) remains north of R.K. Puram (south)
  assert.ok(laidOut[2].displayLat > laidOut[1].displayLat);
  // Extract PM2.5 faithfully
  assert.equal(extractStationPm25(stations[0]).value, 193);
  assert.equal(extractStationPm25(null).value, null);
});
