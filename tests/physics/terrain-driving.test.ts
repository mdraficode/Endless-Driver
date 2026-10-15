import { beforeAll, describe, expect, it } from 'vitest';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { Car } from '../../src/vehicles/Car';
import { NEUTRAL_ACTIONS, type VehicleActions } from '../../src/vehicles/types';

/**
 * Surface-dependent driving: the generator's surface query reaches the tire model.
 * Grass must hold the car less than the asphalt the model is tuned on — measurably, in
 * the only currency that matters (speed and distance after identical inputs).
 */

const FIXED_STEP = 1 / 60;
const OPEN_WORLD: WorldConfig = {
  ...WORLD_CONFIG,
  obstacles: [],
  ground: { ...WORLD_CONFIG.ground, size: 4000 },
};

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

function drive(physics: PhysicsWorld, car: Car, seconds: number, intent: VehicleActions): void {
  car.setActions(intent);
  const steps = Math.max(1, Math.round(seconds / FIXED_STEP));
  for (let step = 0; step < steps; step += 1) {
    physics.update(FIXED_STEP);
  }
}

function asphaltRig(): { physics: PhysicsWorld; car: Car } {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const car = new Car({ rapier, physics, spawnPosition: [0, 1, 0], spawnYaw: 0 });
  return { physics, car };
}

function grassRig(): { physics: PhysicsWorld; car: Car } {
  const physics = new PhysicsWorld({ rapier });
  physics.enableTerrain(createTerrainSampler(TERRAIN_CONFIG));
  physics.syncTerrain({ x: 0, y: 0, z: 0 });
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [0, 1, 0],
    spawnYaw: 0,
    surfaceProvider: (x, z) => physics.surfaceAt(x, z),
  });
  return { physics, car };
}

describe('terrain surface driving', () => {
  it('reports grass under every wheel on the plateau', () => {
    const { physics, car } = grassRig();
    drive(physics, car, 1.5, NEUTRAL_ACTIONS);
    expect(car.telemetry.contactCount).toBe(4);
    for (const wheel of car.wheels) {
      expect(wheel.surfaceId).toBe('grass');
      expect(wheel.surfaceGripModifier).toBeGreaterThan(0.7);
      expect(wheel.surfaceGripModifier).toBeLessThan(0.9);
      expect(wheel.surfaceRollingResistance).toBeGreaterThan(0.025);
    }
    physics.dispose();
  });

  it('accelerates slower on grass than on asphalt under identical inputs', () => {
    const grass = grassRig();
    const asphalt = asphaltRig();
    drive(grass.physics, grass.car, 1, NEUTRAL_ACTIONS);
    drive(asphalt.physics, asphalt.car, 1, NEUTRAL_ACTIONS);
    const throttle: VehicleActions = { ...NEUTRAL_ACTIONS, throttle: 1 };
    drive(grass.physics, grass.car, 2.5, throttle);
    drive(asphalt.physics, asphalt.car, 2.5, throttle);
    expect(grass.car.telemetry.speedKph).toBeGreaterThan(25);
    expect(grass.car.telemetry.speedKph).toBeLessThan(asphalt.car.telemetry.speedKph);
    expect(grass.car.telemetry.distanceTravelled).toBeLessThan(
      asphalt.car.telemetry.distanceTravelled,
    );
    grass.physics.dispose();
    asphalt.physics.dispose();
  });
});
