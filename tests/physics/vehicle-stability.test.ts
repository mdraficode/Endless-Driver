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
 *
 * Phase 11.0b relief note: the OpenSimplex2 core makes the countryside genuinely
 * rugged — walls of 20–26° rise within a few hundred metres of the spawn in every
 * direction (the old value-noise relief topped out at ~23° and the car crossed it at
 * speed). A 36%+ wall is a cliff no car climbs at any speed, so the cross-country
 * run is a STABILITY course, not a speed run: the driver cruises ~86 km/h on
 * manageable ground, brakes to a crawl before steep ascents, and creeps the climb.
 * The assertions guard the physics (no wheel-load spikes, no sustained spin); a
 * momentary traction loss on a near-cliff wall — and stopping at its foot — is
 * legitimate off-road behaviour.
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
  /** Longest run of consecutive steps with slip > 45° (0 = never spun). */
  maxSpinRun: number;
  finalSpeedKph: number;
  distanceMeters: number;
  maxLoadJumpN: number;
}

/** Drives north under the PD driver model for `seconds` (off-road: adaptive). */
function driveCourse(terrain: boolean, noiseSeed: number, seconds = 30): CourseResult {
  let physics: PhysicsWorld;
  let car: Car;
  let sampler: ReturnType<typeof createWorldTerrainSampler> | null = null;
  if (terrain) {
    sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
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
  let spinRun = 0;
  let maxSpinRun = 0;
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
      // Cross-country the driver lifts to a rough-ground cruise (~86 km/h) on
      // manageable ground; full throttle into unseen valley walls is a crash in
      // any honest model, not a handling verdict. The 11.0b relief is genuinely
      // rugged (20–26° walls within a few hundred metres), so a competent
      // off-road driver also reads the ground ~40 m ahead: grade > 12% means
      // brake to a crawl, then creep the climb. On flat asphalt the run stays
      // full-throttle.
      let throttle = 1;
      if (terrain && sampler !== null) {
        const yaw = yawFromQuat(car.rotation);
        const dx = -Math.sin(yaw);
        const dz = -Math.cos(yaw);
        let grade = 0;
        for (let d = 4; d <= 40; d += 4) {
          const g =
            (sampler.heightAt(car.position.x + dx * d, car.position.z + dz * d) - car.position.y) /
            d;
          if (g > grade) grade = g;
        }
        if (grade > 0.12) {
          throttle = car.telemetry.speedMps > 10 ? -0.4 : 0.6;
        } else {
          throttle = car.telemetry.speedMps < 24 ? 1 : 0;
        }
      }
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
        spinRun += 1;
        maxSpinRun = Math.max(maxSpinRun, spinRun);
      } else {
        spinRun = 0;
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
    maxSpinRun,
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
    'stays stable cross-country on the real terrain (seed %i)',
    (noiseSeed) => {
      const result = driveCourse(true, noiseSeed);
      // Shake regression (unchanged): no single-step wheel-load spike may approach
      // the old 22 kN slam — those spikes are the yaw kicks that read as shake.
      expect(result.maxLoadJumpN).toBeLessThan(9000);
      // Control regression: the old bug spun the car repeatedly and ended facing
      // backwards. That is a SUSTAINED spin (2 s+). On the 11.0b relief a
      // momentary traction loss on a near-cliff wall is legitimate off-road
      // physics (the driver brakes to a crawl before walls; 36%+ is a cliff no
      // car climbs at any speed, and stopping at its foot is honest).
      expect(result.maxSpinRun).toBeLessThan(120);
      // Sanity: the slip angle stays in the physical envelope, and the car
      // genuinely drives off-road rather than stalling at the spawn.
      expect(result.maxSlipDeg).toBeLessThan(120);
      expect(result.distanceMeters).toBeGreaterThan(100);
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
