import type { TierId } from './tiers';

/** Shared Aohara lighting, crossing and sidewalk tuning for the look-dev block and driving district. */
export const URBAN_CITY_CONFIG = {
  districtName: 'Aohara Metropolis',
  avenue: {
    widthMeters: 20,
    lengthMeters: 180,
    centerZ: -20,
  },
  crossStreet: {
    widthMeters: 100,
    depthMeters: 20,
  },
  sidewalk: {
    widthMeters: 3.2,
    centerOffsetXMeters: 13.8,
    lengthMeters: 180,
  },
  cityDeck: {
    widthMeters: 170,
    lengthMeters: 210,
    centerZ: -20,
  },
  streetLamp: {
    /** Legacy look-dev block placements; driving-world lamps follow every Aohara road edge. */
    spacingPositionsZ: [-48, -16, 20, 54] as const,
    /** Lamp posts sit in the city sidewalks, repeated along the urban road graph. */
    spacingMeters: 64,
    sidewalkWidthMeters: 3.2,
    sideXMeters: 13.5,
    heightMeters: 7.4,
    pointLightIntensity: 28,
    pointLightDistanceMeters: 26,
    haloScaleMeters: 2.5,
  },
  window: {
    floorSpacingMeters: 3.35,
    widthMeters: 1.3,
    heightMeters: 1.35,
    facadeMarginMeters: 2.4,
    columnSpacingMeters: 3.3,
  },
  trafficSignal: {
    cycleSeconds: 26,
    greenSeconds: 10,
    amberSeconds: 2,
    opposingPhaseOffsetSeconds: 13,
  },
  camera: {
    fovDegrees: 47,
    position: [3, 9, 53] as const,
    target: [0, 7, -14] as const,
  },
} as const;

export interface UrbanNightTierBudget {
  readonly pointLights: number;
  readonly litWindowInstances: number;
  /** Cardinal (horizontal/vertical) Gaussian streak weight. */
  readonly cardinalStarburst: number;
  /** Diagonal streak weight; kept off on tier C. */
  readonly diagonalStarburst: number;
}

/**
 * A small, explicit first-slice budget. These are counts/optical weights, not claims of measured FPS.
 * Tier C keeps a faint cross-shaped diffraction cue; higher tiers add the diagonal rays and more lights.
 */
export const URBAN_NIGHT_TIER_BUDGET: Readonly<Record<TierId, UrbanNightTierBudget>> = {
  C: {
    pointLights: 4,
    litWindowInstances: 120,
    cardinalStarburst: 0.035,
    diagonalStarburst: 0,
  },
  B: {
    pointLights: 6,
    litWindowInstances: 240,
    cardinalStarburst: 0.05,
    diagonalStarburst: 0.018,
  },
  A: {
    pointLights: 8,
    litWindowInstances: 384,
    cardinalStarburst: 0.06,
    diagonalStarburst: 0.026,
  },
};

export type TrafficSignalAspect = 'red' | 'amber' | 'green';

/** Darkness gate for city-owned lamps; the fade spans −4° through +4° solar elevation. */
export function resolveUrbanNightGain(sunElevationDegrees: number): number {
  if (!Number.isFinite(sunElevationDegrees)) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, (sunElevationDegrees + 4) / 8));
  const daylight = t * t * (3 - 2 * t);
  return 1 - daylight;
}

/** Deterministic fixed-cycle demo signal; phase offset makes the cross street oppose the avenue. */
export function resolveTrafficSignalAspect(
  elapsedSeconds: number,
  phaseOffsetSeconds = 0,
): TrafficSignalAspect {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(phaseOffsetSeconds)) {
    return 'red';
  }
  const { cycleSeconds, greenSeconds, amberSeconds } = URBAN_CITY_CONFIG.trafficSignal;
  const phase =
    (((elapsedSeconds + phaseOffsetSeconds) % cycleSeconds) + cycleSeconds) % cycleSeconds;
  if (phase < greenSeconds) {
    return 'green';
  }
  if (phase < greenSeconds + amberSeconds) {
    return 'amber';
  }
  return 'red';
}
