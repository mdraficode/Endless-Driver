import { beforeAll, describe, expect, it } from 'vitest';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { yawFromQuat } from '../../src/shared/vector';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { Car } from '../../src/vehicles/Car';
import { NEUTRAL_ACTIONS, type VehicleActions } from '../../src/vehicles/types';

/**
 * Stability regression suite (owner report: "the car loses control after driving for
 * some time" + screen shake). The shipped car must hold a course under a competent
 * driver model on BOTH the flat arena and the real terrain, survive a full-lock
 * slalom at speed, and keep per-step wheel-load spikes small — those spikes are the
 * yaw kicks that read as shake and, unfiltered, used to end in spins.
 *
 * The driver model is a PD controller holding heading north with seeded 10 Hz thumb
 * noise: it stands in for a player correcting with a joystick, which open-loop input
 * scripts cannot represent.
 */

const FIXED_STEP = 1 / 60;
const OPEN_WORLD: WorldConfig = {
  ...WORLD_CONFIG,
  obstacles: [],
  ground: { ...WORLD_CONFIG.ground, size: 20000 },
};

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

function intent(overrides: Partial<VehicleActions> = {}): VehicleActions {
  return { ...NEUTRAL_ACTIONS, ...overrides };
}

interface CourseResult {
  maxSlipDeg: number;
  spinFraction: number;
  finalSpeedKph: number;
  distanceMeters: number;
  maxLoadJumpN: number;
}

/** Drives north at full throttle under the PD driver model for `seconds`. */
function driveCourse(terrain: boolean, noiseSeed: number, seconds = 30): CourseResult {
  let physics: PhysicsWorld;
  let car: Car;
  if (terrain) {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(sampler);
    physics.syncTerrain({ x: 0, y: 0, z: 0 });
    car = new Car({
      rapier,
      physics,
      spawnPosition: [0, 1, 0],
      spawnYaw: 0,
      surfaceProvider: (x, z) => physics.surfaceAt(x, z),
    });
  } else {
    physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
    car = new Car({ rapier, physics, spawnPosition: [0, 1, 0], spawnYaw: 0 });
  }

  let seed = noiseSeed;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  let noise = 0;
  let maxSlipDeg = 0;
  let spinSteps = 0;
  let totalSteps = 0;
  let maxLoadJumpN = 0;
  const previousLoads: number[] = [];
  const steps = Math.round(seconds / FIXED_STEP);
  for (let step = 0; step < steps; step += 1) {
    const t = step * FIXED_STEP;
    if (t < 1.5) {
      car.setActions(NEUTRAL_ACTIONS);
    } else {
      if (step % 6 === 0) {
        noise = rand() * 0.35;
      }
      const steer = Math.max(
        -1,
        Math.min(1, yawFromQuat(car.rotation) * 1.6 + car.body.angvel().y * 0.55 + noise),
      );
      // Cross-country the driver lifts to a rough-ground cruise (~86 km/h): full
      // throttle into unseen valley walls at 140+ is a crash in any honest model,
      // not a handling verdict. On flat asphalt the run stays full-throttle.
      const throttle = terrain ? (car.telemetry.speedMps < 24 ? 1 : 0) : 1;
      car.setActions(intent({ throttle, steer }));
    }
    if (terrain) {
      physics.syncTerrain(car.position);
    }
    physics.update(FIXED_STEP);
    if (t > 3) {
      totalSteps += 1;
      const slipDeg = Math.abs((car.telemetry.slipAngle * 180) / Math.PI);
      maxSlipDeg = Math.max(maxSlipDeg, slipDeg);
      if (slipDeg > 45) {
        spinSteps += 1;
      }
      car.wheels.forEach((wheel, index) => {
        const previous = previousLoads[index];
        if (previous !== undefined) {
          maxLoadJumpN = Math.max(maxLoadJumpN, Math.abs(wheel.normalLoad - previous));
        }
        previousLoads[index] = wheel.normalLoad;
      });
    }
  }
  const result = {
    maxSlipDeg,
    spinFraction: spinSteps / Math.max(1, totalSteps),
    finalSpeedKph: car.telemetry.speedKph,
    distanceMeters: car.telemetry.distanceTravelled,
    maxLoadJumpN,
  };
  physics.dispose();
  return result;
}

describe('vehicle stability (driver-model course keeping)', () => {
  it('holds a straight course at full throttle on flat asphalt', () => {
    const result = driveCourse(false, 7);
    expect(result.spinFraction).toBe(0);
    expect(result.maxSlipDeg).toBeLessThan(10);
    expect(result.finalSpeedKph).toBeGreaterThan(150);
  });

  it.each([7, 123, 2026])(
    'holds its course cross-country on the real terrain (seed %i)',
    (noiseSeed) => {
      const result = driveCourse(true, noiseSeed);
      // The regression: this used to spin out repeatedly and end facing backwards.
      expect(result.spinFraction).toBe(0);
      expect(result.maxSlipDeg).toBeLessThan(35);
      expect(result.finalSpeedKph).toBeGreaterThan(50);
      expect(result.distanceMeters).toBeGreaterThan(500);
      // Shake budget: no single-step wheel-load spike may approach the old 22 kN slam.
      expect(result.maxLoadJumpN).toBeLessThan(9000);
    },
  );

  it('survives a full-lock slalom at speed without spinning', () => {
    const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
    const car = new Car({ rapier, physics, spawnPosition: [0, 1, 0], spawnYaw: 0 });
    const run = (seconds: number, at: (t: number) => VehicleActions): void => {
      car.setActions(NEUTRAL_ACTIONS);
      const steps = Math.round(seconds / FIXED_STEP);
      for (let step = 0; step < steps; step += 1) {
        car.setActions(at(step * FIXED_STEP));
        physics.update(FIXED_STEP);
      }
    };
    run(1.5, () => NEUTRAL_ACTIONS);
    run(8, () => intent({ throttle: 1 }));
    let maxSlipDeg = 0;
    run(14, (t) => {
      const slipDeg = Math.abs((car.telemetry.slipAngle * 180) / Math.PI);
      maxSlipDeg = Math.max(maxSlipDeg, slipDeg);
      return intent({ throttle: 1, steer: Math.floor(t / 1.1) % 2 === 0 ? 1 : -1 });
    });
    expect(maxSlipDeg).toBeLessThan(30);
    expect(car.telemetry.speedKph).toBeGreaterThan(100);
    physics.dispose();
  });
});
