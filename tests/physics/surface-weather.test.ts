import { beforeAll, describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import {
  applySurfaceState,
  resolveSurfaceState,
  type WeatherPreset,
} from '../../src/environment/SurfaceState';
import {
  applySeasonSurface,
  resolveSeasonPresentation,
  type SeasonId,
} from '../../src/environment/seasons';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { Car } from '../../src/vehicles/Car';
import { NEUTRAL_ACTIONS, type SurfaceResponse } from '../../src/vehicles/types';

const FIXED_STEP = 1 / 60;
const OPEN_WORLD: WorldConfig = {
  ...WORLD_CONFIG,
  obstacles: [],
  ground: { ...WORLD_CONFIG.ground, size: 2000 },
};
const DRY_ASPHALT: SurfaceResponse = {
  id: 'asphalt',
  gripModifier: 1,
  rollingResistance: 0.015,
};
/**
 * Stable gameplay calibration point at Aohara's central-avenue crossing. This is not one of the
 * camera bookmarks in `config/route.ts`.
 */
const AOHARA_CALIBRATION_BOOKMARK = {
  position: [AOHARA_DISTRICT_CONFIG.centerX, AOHARA_DISTRICT_CONFIG.centerZ] as const,
  heading: 0,
  speedMetersPerSecond: 20,
  steer: 1,
};

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

interface CornerResponse {
  readonly speedKph: number;
  readonly lateralForce: number;
  readonly contactCount: number;
  readonly averageSurfaceGripModifier: number | null;
  readonly averageSurfaceRollingResistance: number | null;
  readonly wheelSurfaceIds: readonly string[];
}

function measureCornerResponse(
  physics: PhysicsWorld,
  car: Car,
  speedMetersPerSecond = 20,
  steer = 1,
): CornerResponse {
  for (let step = 0; step < 90; step += 1) {
    car.setActions(NEUTRAL_ACTIONS);
    physics.update(FIXED_STEP);
  }
  // Match both runs at the same straight-line speed, then apply an identical one-step corner input.
  car.body.setLinvel({ x: 0, y: 0, z: -speedMetersPerSecond }, true);
  car.setActions(NEUTRAL_ACTIONS);
  physics.update(FIXED_STEP);
  car.setActions({ ...NEUTRAL_ACTIONS, steer });
  physics.update(FIXED_STEP);

  return {
    speedKph: car.telemetry.speedKph,
    lateralForce: car.wheels.reduce((total, wheel) => total + Math.abs(wheel.lateralForce), 0),
    contactCount: car.telemetry.contactCount,
    averageSurfaceGripModifier: car.telemetry.averageSurfaceGripModifier,
    averageSurfaceRollingResistance: car.telemetry.averageSurfaceRollingResistance,
    wheelSurfaceIds: car.wheels.map((wheel) => wheel.surfaceId),
  };
}

function cornerResponse(weather: WeatherPreset): CornerResponse {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const state = resolveSurfaceState(weather);
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [0, 1, 0],
    spawnYaw: 0,
    surfaceProvider: () => applySurfaceState(DRY_ASPHALT, state),
  });
  const response = measureCornerResponse(physics, car);
  car.dispose();
  physics.dispose();
  return response;
}

function fixedAoharaCornerResponse(weather: WeatherPreset): CornerResponse {
  const terrainSampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
  const [x, z] = AOHARA_CALIBRATION_BOOKMARK.position;
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  physics.enableTerrain(terrainSampler);
  physics.syncTerrain({ x, y: 0, z });
  const state = resolveSurfaceState(weather);
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [x, terrainSampler.heightAt(x, z) + 0.7, z],
    spawnYaw: AOHARA_CALIBRATION_BOOKMARK.heading,
    surfaceProvider: (surfaceX, surfaceZ) => {
      const surface = physics.surfaceAt(surfaceX, surfaceZ);
      return surface === null ? null : applySurfaceState(surface, state);
    },
  });
  const response = measureCornerResponse(
    physics,
    car,
    AOHARA_CALIBRATION_BOOKMARK.speedMetersPerSecond,
    AOHARA_CALIBRATION_BOOKMARK.steer,
  );
  car.dispose();
  physics.dispose();
  return response;
}

describe('Phase 7 wet-surface vehicle coupling', () => {
  it('produces less lateral tire force in a matched-speed wet-asphalt corner', () => {
    const dry = cornerResponse('clear');
    const wet = cornerResponse('rain');

    expect(dry.speedKph).toBeCloseTo(wet.speedKph, 1);
    expect(dry.contactCount).toBe(4);
    expect(wet.contactCount).toBe(4);
    expect(dry.averageSurfaceGripModifier).toBeCloseTo(1, 3);
    expect(wet.averageSurfaceGripModifier).toBeCloseTo(0.813, 3);
    expect(dry.averageSurfaceRollingResistance).toBeCloseTo(0.015, 4);
    expect(wet.averageSurfaceRollingResistance).toBeCloseTo(0.0184, 4);
    expect(dry.lateralForce).toBeGreaterThan(0);
    expect(wet.lateralForce).toBeLessThan(dry.lateralForce * 0.95);
  });

  it('calibrates matched clear/rain telemetry on the actual fixed Aohara asphalt junction', () => {
    const dry = fixedAoharaCornerResponse('clear');
    const wet = fixedAoharaCornerResponse('rain');

    expect(dry.speedKph).toBeCloseTo(wet.speedKph, 1);
    expect(dry.contactCount).toBe(4);
    expect(wet.contactCount).toBe(4);
    expect(dry.wheelSurfaceIds).toEqual(['asphalt', 'asphalt', 'asphalt', 'asphalt']);
    expect(wet.wheelSurfaceIds).toEqual(['asphalt', 'asphalt', 'asphalt', 'asphalt']);
    expect(dry.averageSurfaceGripModifier).toBeCloseTo(1, 3);
    expect(wet.averageSurfaceGripModifier).toBeCloseTo(0.813, 3);
    expect(dry.averageSurfaceRollingResistance).toBeCloseTo(0.015, 4);
    expect(wet.averageSurfaceRollingResistance).toBeCloseTo(0.0184, 4);
    expect(dry.lateralForce).toBeGreaterThan(0);
    expect(wet.lateralForce).toBeLessThan(dry.lateralForce * 0.95);
  });
});

const DRY_SOIL: SurfaceResponse = {
  id: 'soil',
  gripModifier: 1,
  rollingResistance: 0.02,
};

function seasonCornerResponse(surface: SurfaceResponse, season: SeasonId): CornerResponse {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const presentation = resolveSeasonPresentation(season);
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [0, 1, 0],
    spawnYaw: 0,
    surfaceProvider: () => applySeasonSurface(surface, presentation),
  });
  const response = measureCornerResponse(physics, car);
  car.dispose();
  physics.dispose();
  return response;
}

function fixedAoharaSeasonCornerResponse(season: SeasonId): CornerResponse {
  const terrainSampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
  const [x, z] = AOHARA_CALIBRATION_BOOKMARK.position;
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  physics.enableTerrain(terrainSampler);
  physics.syncTerrain({ x, y: 0, z });
  const presentation = resolveSeasonPresentation(season);
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [x, terrainSampler.heightAt(x, z) + 0.7, z],
    spawnYaw: AOHARA_CALIBRATION_BOOKMARK.heading,
    surfaceProvider: (surfaceX, surfaceZ) => {
      const surface = physics.surfaceAt(surfaceX, surfaceZ);
      return surface === null ? null : applySeasonSurface(surface, presentation);
    },
  });
  const response = measureCornerResponse(
    physics,
    car,
    AOHARA_CALIBRATION_BOOKMARK.speedMetersPerSecond,
    AOHARA_CALIBRATION_BOOKMARK.steer,
  );
  car.dispose();
  physics.dispose();
  return response;
}

describe('Phase 7 weather-preset vehicle coupling', () => {
  it('orders clear / rain / storm grip at the same speed on the same asphalt', () => {
    const clear = cornerResponse('clear');
    const rain = cornerResponse('rain');
    const storm = cornerResponse('storm');

    // The storm saturates the surface (wetness 1) where rain stops at 0.85, so the
    // matched-speed corner must read strictly looser: clear > rain > storm.
    expect(clear.averageSurfaceGripModifier).toBeCloseTo(1, 3);
    expect(rain.averageSurfaceGripModifier).toBeCloseTo(0.813, 3);
    expect(storm.averageSurfaceGripModifier).toBeCloseTo(0.78, 3);
    expect(clear.averageSurfaceRollingResistance).toBeCloseTo(0.015, 4);
    expect(rain.averageSurfaceRollingResistance).toBeCloseTo(0.0184, 4);
    expect(storm.averageSurfaceRollingResistance).toBeCloseTo(0.019, 4);
    expect(clear.lateralForce).toBeGreaterThan(rain.lateralForce);
    expect(rain.lateralForce).toBeGreaterThan(storm.lateralForce);
  });
});

describe('Phase 7 season-surface vehicle coupling', () => {
  it('produces measurably less lateral tire force in the same autumn mud corner', () => {
    const summer = seasonCornerResponse(DRY_SOIL, 'summer');
    const autumn = seasonCornerResponse(DRY_SOIL, 'autumn');

    expect(summer.speedKph).toBeCloseTo(autumn.speedKph, 1);
    expect(summer.contactCount).toBe(4);
    expect(autumn.contactCount).toBe(4);
    expect(summer.averageSurfaceGripModifier).toBeCloseTo(1, 3);
    expect(autumn.averageSurfaceGripModifier).toBeCloseTo(0.85, 3);
    expect(summer.averageSurfaceRollingResistance).toBeCloseTo(0.02, 4);
    expect(autumn.averageSurfaceRollingResistance).toBeCloseTo(0.025, 4);
    expect(summer.lateralForce).toBeGreaterThan(0);
    expect(autumn.lateralForce).toBeLessThan(summer.lateralForce * 0.95);
  });

  it('keeps the same winter corner gripier than autumn mud but looser than summer asphalt', () => {
    const summer = seasonCornerResponse(DRY_ASPHALT, 'summer');
    const winter = seasonCornerResponse(DRY_ASPHALT, 'winter');
    const autumnSoil = seasonCornerResponse(DRY_SOIL, 'autumn');

    expect(summer.averageSurfaceGripModifier).toBeGreaterThan(
      winter.averageSurfaceGripModifier ?? 0,
    );
    expect(winter.averageSurfaceGripModifier).toBeGreaterThan(0.94);
    expect(winter.averageSurfaceGripModifier).toBeLessThan(1);
    // The seasons are physically distinct at matched speed: cold damp asphalt still
    // grips better than autumn mud, and winter loses more lateral force than summer.
    expect(winter.lateralForce).toBeLessThan(summer.lateralForce);
    expect(winter.lateralForce).toBeGreaterThan(autumnSoil.lateralForce);
  });

  it('calibrates the same fixed Aohara junction distinct across seasons', () => {
    const summer = fixedAoharaSeasonCornerResponse('summer');
    const winter = fixedAoharaSeasonCornerResponse('winter');

    expect(summer.wheelSurfaceIds).toEqual(['asphalt', 'asphalt', 'asphalt', 'asphalt']);
    expect(winter.wheelSurfaceIds).toEqual(['asphalt', 'asphalt', 'asphalt', 'asphalt']);
    expect(summer.speedKph).toBeCloseTo(winter.speedKph, 1);
    // Summer is the baseline (1.0); the world's winter damp scales the same asphalt
    // by 0.96 — the telemetry must show it at the same corner, same speed.
    expect(summer.averageSurfaceGripModifier).toBeCloseTo(1, 3);
    expect(winter.averageSurfaceGripModifier).toBeCloseTo(0.96, 3);
    expect(summer.lateralForce).toBeGreaterThan(0);
    expect(winter.lateralForce).toBeLessThan(summer.lateralForce * 0.99);
  });
});
