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
    spacingMeters: 40,
    sidewalkWidthMeters: 3.2,
    sideXMeters: 13.5,
    heightMeters: 7.4,
    pointLightIntensity: 28,
    pointLightDistanceMeters: 26,
    haloScaleMeters: 2.5,
    /** Keep dynamic point lights around the player inside the bounded city, then fade them out. */
    activeLightFadeStartMeters: 500,
    activeLightRangeMeters: 620,
    activeLightRefreshDistanceMeters: 12,
  },
  wetRoad: {
    /** Art-directed Aohara-only wet look; this is not weather, standing water, or traction state. */
    wetnessDay: 0.12,
    wetnessNight: 0.9,
    dryRoughness: 0.58,
    wetRoughness: 0.17,
    dryClearcoat: 0.16,
    wetClearcoat: 0.78,
    dryClearcoatRoughness: 0.28,
    wetClearcoatRoughness: 0.075,
  },
  optics: {
    gaussianHaloStrength: 0.16,
    broadHaloStrength: 0.022,
    apertureRingStrength: 0.009,
    coreStrength: 0.13,
    maximumOpacity: 0.38,
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
    /** Matches the central avenue's crosswalk plus stop-bar offsets in RoadWorld. */
    stopLineOffsetMeters: 19,
    queueGapMeters: 8,
    brakingDistanceMeters: 18,
    amberCommitDistanceMeters: 12,
  },
  camera: {
    fovDegrees: 47,
    position: [3, 9, 53] as const,
    target: [0, 7, -14] as const,
  },
} as const;

export interface UrbanNightTierBudget {
  /** Total active, unshadowed point lights from streets and local architecture. */
  readonly pointLights: number;
  /** The street-side share of `pointLights`, selected around the driving focus. */
  readonly streetPointLights: number;
  /** The building, billboard, venue and decorative share of `pointLights`. */
  readonly architecturalPointLights: number;
  readonly litWindowInstances: number;
  /** Static tinted facade panes/frames; separate from the small night-emission window cap. */
  readonly facadeWindowInstances: number;
  /** Structural facade/roof-detail instances, excluding building shells and light emitters. */
  readonly facadeDetailInstances: number;
  /** Cardinal (horizontal/vertical) Gaussian streak weight. */
  readonly cardinalStarburst: number;
  /** Diagonal streak weight; kept off on tier C. */
  readonly diagonalStarburst: number;
}

/**
 * Explicit active-light/window caps, not claims of measured FPS. City-wide pole and emitter meshes
 * are instanced; only this small tier-capped subset casts local illumination. Tier C retains the faint
 * cross-shaped diffraction cue, while higher tiers add diagonal rays and architectural light pools.
 */
export const URBAN_NIGHT_TIER_BUDGET: Readonly<Record<TierId, UrbanNightTierBudget>> = {
  C: {
    pointLights: 6,
    streetPointLights: 4,
    architecturalPointLights: 2,
    litWindowInstances: 160,
    facadeWindowInstances: 2_400,
    facadeDetailInstances: 512,
    cardinalStarburst: 0.035,
    diagonalStarburst: 0,
  },
  B: {
    pointLights: 8,
    streetPointLights: 6,
    architecturalPointLights: 2,
    litWindowInstances: 320,
    facadeWindowInstances: 4_800,
    facadeDetailInstances: 1_024,
    cardinalStarburst: 0.05,
    diagonalStarburst: 0.018,
  },
  A: {
    pointLights: 12,
    streetPointLights: 8,
    architecturalPointLights: 4,
    litWindowInstances: 512,
    facadeWindowInstances: 7_200,
    facadeDetailInstances: 1_600,
    cardinalStarburst: 0.06,
    diagonalStarburst: 0.026,
  },
};

export interface UrbanActivityTierBudget {
  /** Deterministic low-rise Aohara infill buildings added to existing street blocks. */
  readonly infillBuildings: number;
  /** Instanced, visual-only vehicle actors; they do not participate in physics. */
  readonly trafficVehicles: number;
  /** Instanced pedestrians kept on sidewalks; crossings and right-of-way are not simulated. */
  readonly pedestrians: number;
}

/** Conservative, fixed city-activity budgets; these are caps, not device-FPS measurements. */
export const URBAN_ACTIVITY_TIER_BUDGET: Readonly<Record<TierId, UrbanActivityTierBudget>> = {
  C: { infillBuildings: 6, trafficVehicles: 6, pedestrians: 12 },
  B: { infillBuildings: 9, trafficVehicles: 12, pedestrians: 24 },
  A: { infillBuildings: 12, trafficVehicles: 18, pedestrians: 36 },
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

/**
 * Aohara-only art direction for a damp-looking road finish. It has no weather/physics coupling;
 * the city becomes glossier toward night, while the rural road material remains unchanged.
 */
export function resolveUrbanWetness(sunElevationDegrees: number): number {
  const night = resolveUrbanNightGain(sunElevationDegrees);
  return (
    URBAN_CITY_CONFIG.wetRoad.wetnessDay * (1 - night) +
    URBAN_CITY_CONFIG.wetRoad.wetnessNight * night
  );
}

/** Smoothly fade expensive local streetlights as the car leaves Aohara's bounded footprint. */
export function resolveUrbanStreetLightCoverage(distanceFromCenterMeters: number): number {
  if (!Number.isFinite(distanceFromCenterMeters) || distanceFromCenterMeters < 0) {
    return 0;
  }
  const { activeLightFadeStartMeters: fadeStart, activeLightRangeMeters: range } =
    URBAN_CITY_CONFIG.streetLamp;
  if (distanceFromCenterMeters <= fadeStart) {
    return 1;
  }
  if (distanceFromCenterMeters >= range) {
    return 0;
  }
  const t = (range - distanceFromCenterMeters) / (range - fadeStart);
  return t * t * (3 - 2 * t);
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
