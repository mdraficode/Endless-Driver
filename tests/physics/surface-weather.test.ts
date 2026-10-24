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
