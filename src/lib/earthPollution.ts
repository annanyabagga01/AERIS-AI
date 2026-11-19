import type { AqiCategory, StationReading } from './types.ts';

export interface PollutionVisualProfile {
  available: boolean;
  category: AqiCategory;
  aqi: number | null;
  /** 0.0 (disabled) to 1.0 (Severe peak) */
  glowIntensity: number;
  /** Angular radius on unit Earth sphere (radians) */
  haloAngularRadius: number;
  /** 0.0 (disabled) to 1.0 (Severe peak) */
  particleIntensity: number;
  /** Fraction of allocated urban plume particles active (0..1) */
  particleDensityFactor: number;
  /** Core hex color for halo & marker */
  coreHex: number;
  /** Outer atmospheric corona hex color */
  outerHex: number;
  /** Particle crimson/amber/emerald tint hex */
  particleCoreHex: number;
  particleOuterHex: number;
  /** UI accent classes & label */
  tierBadgeTextClass: string;
  tierBorderClass: string;
}

export interface OrbitalStationMarker {
  station: StationReading;
  displayLat: number;
  displayLng: number;
  pm25Value: number | null;
  pm25Unit: string;
  profile: PollutionVisualProfile;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Deterministic mapping from verified CPCB AQI readings and official categories
 * to physically restrained atmospheric halo & particle visualization parameters.
 *
 * When AQI data is unavailable (null, NaN, or category === 'Unavailable'), all
 * pollution glow and particle intensities are strictly 0 so decorative values
 * are never invented.
 */
export function resolvePollutionVisualProfile(
  aqi: number | null,
  category: AqiCategory,
): PollutionVisualProfile {
  if (
    aqi === null ||
    !Number.isFinite(aqi) ||
    aqi < 0 ||
    category === 'Unavailable'
  ) {
    return {
      available: false,
      category: 'Unavailable',
      aqi: null,
      glowIntensity: 0,
      haloAngularRadius: 0.04,
      particleIntensity: 0,
      particleDensityFactor: 0,
      coreHex: 0x94a3b8,
      outerHex: 0x64748b,
      particleCoreHex: 0x94a3b8,
      particleOuterHex: 0x64748b,
      tierBadgeTextClass: 'text-slate-300',
      tierBorderClass: 'border-slate-600/70',
    };
  }

  switch (category) {
    case 'Good': {
      const t = clamp01(aqi / 50);
      return {
        available: true,
        category,
        aqi,
        glowIntensity: lerp(0.11, 0.17, t),
        haloAngularRadius: lerp(0.048, 0.056, t),
        particleIntensity: lerp(0.06, 0.12, t),
        particleDensityFactor: lerp(0.18, 0.28, t),
        coreHex: 0x10b981,
        outerHex: 0x34d399,
        particleCoreHex: 0x34d399,
        particleOuterHex: 0x6ee7b7,
        tierBadgeTextClass: 'text-emerald-300',
        tierBorderClass: 'border-emerald-500/45',
      };
    }

    case 'Satisfactory': {
      const t = clamp01((aqi - 50) / 50);
      return {
        available: true,
        category,
        aqi,
        glowIntensity: lerp(0.20, 0.28, t),
        haloAngularRadius: lerp(0.058, 0.066, t),
        particleIntensity: lerp(0.14, 0.22, t),
        particleDensityFactor: lerp(0.30, 0.42, t),
        coreHex: 0x14b8a6,
        outerHex: 0x2dd4bf,
        particleCoreHex: 0x2dd4bf,
        particleOuterHex: 0x5eead4,
        tierBadgeTextClass: 'text-teal-300',
        tierBorderClass: 'border-teal-500/45',
      };
    }

    case 'Moderate': {
      const t = clamp01((aqi - 100) / 100);
      return {
        available: true,
        category,
        aqi,
        glowIntensity: lerp(0.35, 0.48, t),
        haloAngularRadius: lerp(0.070, 0.082, t),
        particleIntensity: lerp(0.28, 0.42, t),
        particleDensityFactor: lerp(0.48, 0.64, t),
        coreHex: 0xf59e0b,
        outerHex: 0xfbbf24,
        particleCoreHex: 0xf59e0b,
        particleOuterHex: 0xfcd34d,
        tierBadgeTextClass: 'text-amber-300',
        tierBorderClass: 'border-amber-500/45',
      };
    }

    case 'Poor': {
      const t = clamp01((aqi - 200) / 100);
      return {
        available: true,
        category,
        aqi,
        glowIntensity: lerp(0.56, 0.70, t),
        haloAngularRadius: lerp(0.086, 0.098, t),
        particleIntensity: lerp(0.48, 0.62, t),
        particleDensityFactor: lerp(0.68, 0.80, t),
        coreHex: 0xf97316,
        outerHex: 0xfb923c,
        particleCoreHex: 0xea580c,
        particleOuterHex: 0xf97316,
        tierBadgeTextClass: 'text-orange-300',
        tierBorderClass: 'border-orange-500/50',
      };
    }

    case 'Very Poor': {
      const t = clamp01((aqi - 300) / 100);
      return {
        available: true,
        category,
        aqi,
        glowIntensity: lerp(0.76, 0.89, t),
        haloAngularRadius: lerp(0.102, 0.114, t),
        particleIntensity: lerp(0.68, 0.82, t),
        particleDensityFactor: lerp(0.84, 0.94, t),
        coreHex: 0xef4444,
        outerHex: 0xf97316,
        particleCoreHex: 0xdc2626,
        particleOuterHex: 0xf97316,
        tierBadgeTextClass: 'text-rose-300',
        tierBorderClass: 'border-rose-500/55',
      };
    }

    case 'Severe': {
      const t = clamp01((aqi - 400) / 100);
      return {
        available: true,
        category,
        aqi,
        glowIntensity: lerp(0.92, 1.0, t),
        haloAngularRadius: lerp(0.118, 0.130, t),
        particleIntensity: lerp(0.88, 1.0, t),
        particleDensityFactor: 1.0,
        coreHex: 0xdc2626,
        outerHex: 0xef4444,
        particleCoreHex: 0xb91c1c,
        particleOuterHex: 0xef4444,
        tierBadgeTextClass: 'text-red-300',
        tierBorderClass: 'border-red-500/60',
      };
    }
  }
}

/**
 * Extracts PM2.5 reading from a StationReading cleanly without fabricating values.
 */
export function extractStationPm25(station: StationReading | null | undefined): {
  value: number | null;
  unit: string;
} {
  if (!station) {
    return { value: null, unit: 'µg/m³' };
  }
  const pm25 = station.pollutants.find((p) => p.id === 'PM2.5');
  return {
    value: pm25 && pm25.value !== null && Number.isFinite(pm25.value) ? pm25.value : null,
    unit: pm25?.unit ?? 'µg/m³',
  };
}

/**
 * Builds orbital-clickable station marker coordinates around a city center.
 *
 * Real urban stations within the same metro (e.g. Delhi NCR) sit ~8–25 km apart,
 * which subtends <0.2° on a planetary globe (~1–2 screen pixels). To make every
 * monitoring station individually visible and clickable on desktop & mobile while
 * preserving true relative compass bearings (e.g. East vs NW vs South), stations
 * tightly clustered around the city center are deterministically fanned out onto
 * an orbital micro-ring (~1.9° radius) aligned with their true bearing from the
 * city centroid.
 */
export function layoutOrbitalStationMarkers(
  stations: StationReading[],
  cityLat: number,
  cityLng: number,
): OrbitalStationMarker[] {
  if (stations.length === 0) return [];

  // Compute centroid of stations to preserve true relative compass bearings
  const centroidLat =
    stations.reduce((acc, s) => acc + s.lat, 0) / stations.length;
  const centroidLng =
    stations.reduce((acc, s) => acc + s.lng, 0) / stations.length;

  const minOrbitalSpreadDeg = stations.length > 1 ? 1.85 : 0;

  return stations.map((station, idx) => {
    const pm25 = extractStationPm25(station);
    const profile = resolvePollutionVisualProfile(
      station.officialAqi,
      station.category,
    );

    if (stations.length === 1) {
      return {
        station,
        displayLat: station.lat || cityLat,
        displayLng: station.lng || cityLng,
        pm25Value: pm25.value,
        pm25Unit: pm25.unit,
        profile,
      };
    }

    const dLat = station.lat - centroidLat;
    const dLng = station.lng - centroidLng;
    const rawDist = Math.hypot(dLat, dLng);

    // Preserve true compass angle; fall back to even angular spacing only if coords are identical
    const angle =
      rawDist > 0.002
        ? Math.atan2(dLat, dLng)
        : (idx / stations.length) * Math.PI * 2 + Math.PI * 0.25;

    // Only apply orbital fanning when stations are closer than 1.6° (intra-city scale)
    const effectiveRadius =
      rawDist < 1.6
        ? minOrbitalSpreadDeg * (0.85 + 0.25 * (idx % 2))
        : rawDist;

    const displayLat = Math.max(
      -82,
      Math.min(82, cityLat + Math.sin(angle) * effectiveRadius),
    );
    const displayLng = cityLng + Math.cos(angle) * effectiveRadius * 1.12;

    return {
      station,
      displayLat,
      displayLng,
      pm25Value: pm25.value,
      pm25Unit: pm25.unit,
      profile,
    };
  });
}
