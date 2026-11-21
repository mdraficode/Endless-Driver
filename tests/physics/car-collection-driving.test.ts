import { beforeAll, describe, expect, it } from 'vitest';

import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import type { VehicleConfig } from '../../src/config/vehicle';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { NEUTRAL_ACTIONS, type VehicleActions } from '../../src/vehicles/types';
import { Car } from '../../src/vehicles/Car';
import { bodyConfig, carById, CAR_ROSTER } from '../../src/cars/carRoster';
import type { CarBody } from '../../src/cars/types';

/**
 * Phase 14 — the collection cars are not just data: each body archetype must be genuinely
 * drivable in the real (headless Rapier) vehicle stack, and the cars must actually drive
 * differently. Behavioural assertions, matching the rest of the physics suite (no golden numbers).
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

interface Rig {
  readonly physics: PhysicsWorld;
  readonly car: Car;
}

function createRig(config?: VehicleConfig): Rig {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const car = new Car({
    rapier,
    physics,
    spawnPosition: [0, 1, 0],
    spawnYaw: 0,
    ...(config === undefined ? {} : { config }),
  });
  return { physics, car };
}

function actions(overrides: Partial<VehicleActions> = {}): VehicleActions {
  return { ...NEUTRAL_ACTIONS, ...overrides };
}

function drive(rig: Rig, seconds: number, intent: VehicleActions): void {
  rig.car.setActions(intent);
  const steps = Math.max(1, Math.round(seconds / FIXED_STEP));
  for (let step = 0; step < steps; step += 1) {
    rig.physics.update(FIXED_STEP);
  }
}

describe('Phase 14 — collection cars are drivable and distinct (headless Rapier)', () => {
  it('every body archetype settles grounded, accelerates, and stays numerically stable', () => {
    const bodies: readonly CarBody[] = ['sport', 'muscle', 'supercar', 'sedan', 'suv'];
    for (const body of bodies) {
      const rig = createRig(bodyConfig(body));
      // Settle on the suspension.
      drive(rig, 1, NEUTRAL_ACTIONS);
      expect(rig.car.telemetry.contactCount, `${body}: grounded`).toBeGreaterThan(0);
      expect(Number.isFinite(rig.car.position.y), `${body}: finite height`).toBe(true);
      // Full-throttle run: it moves, and no state goes NaN.
      drive(rig, 4, actions({ throttle: 1 }));
      const t = rig.car.telemetry;
      expect(t.speedKph, `${body}: reaches speed`).toBeGreaterThan(50);
      expect(Number.isFinite(t.speedMps), `${body}: finite speed`).toBe(true);
      expect(Number.isFinite(rig.car.position.z), `${body}: finite travel`).toBe(true);
      for (const wheel of rig.car.wheels) {
        expect(Number.isFinite(wheel.normalLoad), `${body}: finite wheel load`).toBe(true);
      }
    }
  });

  it('a high-power car out-accelerates a low-power one off the line (distinct handling)', () => {
    const fast = createRig(carById('falcon-s')!.config); // supercar body, ~520 N·m peak
    const slow = createRig(carById('meridian-4door')!.config); // sedan body, ~300 N·m peak
    for (const rig of [fast, slow]) {
      drive(rig, 1, NEUTRAL_ACTIONS);
      drive(rig, 3, actions({ throttle: 1 }));
    }
    expect(fast.car.telemetry.speedKph).toBeGreaterThan(slow.car.telemetry.speedKph);
    expect(fast.car.telemetry.speedKph).toBeGreaterThan(60);
  });

  it('the heavy all-wheel-drive SUV is stable and distinct from the light sport base', () => {
    const suv = CAR_ROSTER.find((car) => car.body === 'suv')!;
    const sport = CAR_ROSTER.find((car) => car.body === 'sport')!;
    expect(suv.config.drivetrain.drivenWheels).toBe('all');
    expect(suv.config.chassis.mass).toBeGreaterThan(sport.config.chassis.mass);

    const suvRig = createRig(suv.config);
    drive(suvRig, 1, NEUTRAL_ACTIONS);
    expect(suvRig.car.telemetry.contactCount).toBeGreaterThan(0);
    // A hard full-lock slalom: the heavy, stable SUV must not spin out or diverge.
    drive(suvRig, 1.5, actions({ throttle: 1, steer: 1 }));
    drive(suvRig, 1.5, actions({ throttle: 1, steer: -1 }));
    drive(suvRig, 1, actions({ throttle: 0 }));
    const t = suvRig.car.telemetry;
    expect(Number.isFinite(t.speedMps)).toBe(true);
    expect(Number.isFinite(suvRig.car.position.x)).toBe(true);
  });
});
