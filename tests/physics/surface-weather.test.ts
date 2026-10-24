import { beforeAll, describe, expect, it } from 'vitest';

import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import {
  applySurfaceState,
  resolveSurfaceState,
  type WeatherPreset,
} from '../../src/environment/SurfaceState';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
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

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

function cornerResponse(weather: WeatherPreset): {
  readonly speedKph: number;
  readonly lateralForce: number;
  readonly contactCount: number;
  readonly averageSurfaceGripModifier: number | null;
  readonly averageSurfaceRollingResistance: number | null;
} {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const state = resolveSurfaceState(weather);
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [0, 1, 0],
    spawnYaw: 0,
    surfaceProvider: () => applySurfaceState(DRY_ASPHALT, state),
  });

  for (let step = 0; step < 90; step += 1) {
    car.setActions(NEUTRAL_ACTIONS);
    physics.update(FIXED_STEP);
  }
  // Match both runs at the same straight-line speed, then apply an identical one-step corner input.
  car.body.setLinvel({ x: 0, y: 0, z: -20 }, true);
  car.setActions(NEUTRAL_ACTIONS);
  physics.update(FIXED_STEP);
  car.setActions({ ...NEUTRAL_ACTIONS, steer: 1 });
  physics.update(FIXED_STEP);

  const response = {
    speedKph: car.telemetry.speedKph,
    lateralForce: car.wheels.reduce((total, wheel) => total + Math.abs(wheel.lateralForce), 0),
    contactCount: car.telemetry.contactCount,
    averageSurfaceGripModifier: car.telemetry.averageSurfaceGripModifier,
    averageSurfaceRollingResistance: car.telemetry.averageSurfaceRollingResistance,
  };
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
});
