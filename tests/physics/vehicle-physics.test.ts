import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { yawFromQuat } from '../../src/shared/vector';
import { Car } from '../../src/vehicles/Car';
import { NEUTRAL_ACTIONS, type VehicleActions } from '../../src/vehicles/types';

/**
 * Headless vehicle physics checks.
 *
 * Rapier ships as WebAssembly, so the whole vehicle stack — world, raycasts, suspension, tire
 * forces, drivetrain — runs deterministically in Node with no browser and no renderer. These are
 * behavioural assertions ("does it accelerate, brake, turn, and slide"), not golden numbers,
 * because handling is meant to be retuned as the game is built.
 */

const FIXED_STEP = 1 / 60;

/**
 * Empty arena: the real arena's obstacles sit in the default test lane. The ground is enlarged so
 * long runs (top speed, gearbox sweeps) cannot drive off the edge.
 */
const OPEN_WORLD: WorldConfig = {
  ...WORLD_CONFIG,
  obstacles: [],
  ground: { ...WORLD_CONFIG.ground, size: 4000 },
};

interface Rig {
  readonly physics: PhysicsWorld;
  readonly car: Car;
}

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

function createRig(worldConfig: WorldConfig = OPEN_WORLD): Rig {
  const physics = new PhysicsWorld({ rapier, worldConfig });
  const car = new Car({ rapier, physics, spawnPosition: [0, 1, 0], spawnYaw: 0 });
  return { physics, car };
}

function actions(overrides: Partial<VehicleActions> = {}): VehicleActions {
  return { ...NEUTRAL_ACTIONS, ...overrides };
}

/** Advances the world by whole fixed steps with a constant driving intent. */
function drive({ physics, car }: Rig, seconds: number, intent: VehicleActions): void {
  car.setActions(intent);
  const steps = Math.max(1, Math.round(seconds / FIXED_STEP));
  for (let step = 0; step < steps; step += 1) {
    physics.update(FIXED_STEP);
  }
}

function heading({ car }: Rig): number {
  return yawFromQuat(car.rotation);
}

describe('vehicle physics (headless Rapier)', () => {
  it('settles on its suspension at spawn with all four wheels grounded', () => {
    const rig = createRig();
    drive(rig, 1.5, NEUTRAL_ACTIONS);

    const telemetry = rig.car.telemetry;
    expect(telemetry.contactCount).toBe(4);
    expect(telemetry.isGrounded).toBe(true);
    // 0.34 m wheel radius plus ~0.28 m of loaded suspension puts the chassis centre near 0.6 m,
    // safely below the 1 m drop height and well above the ground plane.
    expect(rig.car.position.y).toBeGreaterThan(0.45);
    expect(rig.car.position.y).toBeLessThan(0.9);
    expect(telemetry.speedMps).toBeLessThan(0.5);
    expect(telemetry.gear).toBe(1);
    // Static load is shared evenly by the four wheels.
    const loads = rig.car.wheels.map((wheel) => wheel.normalLoad);
    for (const load of loads) {
      expect(load).toBeGreaterThan(2000);
      expect(load).toBeLessThan(3600);
    }
  });

  it('accelerates forward under full throttle and upshifts automatically', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 4, actions({ throttle: 1 }));

    const telemetry = rig.car.telemetry;
    // A 1200 kg traction-limited rear-drive car clears 80 km/h within four seconds from rest
    // (measured 89 km/h; the rear tires run at ~98% of the friction limit off the line).
    expect(telemetry.speedKph).toBeGreaterThan(80);
    expect(telemetry.forwardSpeed).toBeGreaterThan(0);
    expect(telemetry.distanceTravelled).toBeGreaterThan(40);
    expect(telemetry.gear).toBeGreaterThan(1);
    expect(telemetry.rpm).toBeGreaterThan(1500);
    expect(telemetry.rpm).toBeLessThanOrEqual(7200);
    // Forward is -Z in body space, so the car must travel toward negative Z.
    expect(rig.car.position.z).toBeLessThan(-35);
    // Straight-line acceleration must not wander: the heading stays essentially fixed.
    expect(Math.abs(heading(rig))).toBeLessThan(0.02);
    expect(Math.abs(rig.car.position.x)).toBeLessThan(0.2);
  });

  it('increases higher-speed acceleration while the N₂O boost is active', () => {
    const standard = createRig();
    const boosted = createRig();
    drive(standard, 1, NEUTRAL_ACTIONS);
    drive(boosted, 1, NEUTRAL_ACTIONS);
    drive(standard, 20, actions({ throttle: 1 }));
    drive(boosted, 20, actions({ throttle: 1 }));

    drive(standard, 1.5, actions({ throttle: 1 }));
    drive(boosted, 1.5, actions({ throttle: 1, boost: true }));

    expect(boosted.car.telemetry.speedKph).toBeGreaterThan(standard.car.telemetry.speedKph);
  });

  it('reaches a plausible top speed limited by drag and gearing', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 25, actions({ throttle: 1 }));
    const telemetry = rig.car.telemetry;

    expect(telemetry.speedKph).toBeGreaterThan(150);
    expect(telemetry.speedKph).toBeLessThan(260);
    expect(telemetry.gear).toBeGreaterThanOrEqual(4);
  });

  it('slows to a crawl under brakes', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 4, actions({ throttle: 1 }));
    const peak = rig.car.telemetry.speedKph;
    drive(rig, 3, actions({ brake: 1 }));

    expect(peak).toBeGreaterThan(80);
    expect(rig.car.telemetry.speedKph).toBeLessThan(8);
  });

  it('turns when steering is applied, with the heading following the steering sign', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 2, actions({ throttle: 1 }));
    const before = heading(rig);
    drive(rig, 1.5, actions({ throttle: 0.35, steer: 1 }));
    const after = heading(rig);

    // Positive steering (right on the keyboard) yaws the car negative about +Y: right-hand rule
    // with +X right, +Y up, forward -Z.
    expect(after).toBeLessThan(before - 0.2);
    expect(Math.abs(rig.car.telemetry.lateralAcceleration)).toBeGreaterThan(2);
    expect(rig.car.telemetry.contactCount).toBeGreaterThanOrEqual(3);
  });

  it('steers back to the left when the steering input reverses', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 2, actions({ throttle: 1 }));
    drive(rig, 1, actions({ throttle: 0.35, steer: 1 }));
    const turnRight = heading(rig);
    drive(rig, 1.5, actions({ throttle: 0.35, steer: -1 }));

    expect(heading(rig)).toBeGreaterThan(turnRight + 0.1);
  });

  it('gives extra steering authority when the front tires need to catch a lateral slide', () => {
    const makeAuthority = (steer: number): number => {
      const rig = createRig();
      drive(rig, 1.5, NEUTRAL_ACTIONS);
      rig.car.body.setLinvel({ x: 6, y: 0, z: -20 }, true);
      rig.car.setActions(actions({ steer }));
      rig.physics.update(FIXED_STEP);
      const authority = Math.abs(rig.car.telemetry.steerAngle);
      rig.car.dispose();
      rig.physics.dispose();
      return authority;
    };

    // +X chassis slip needs right steering: align the front tires with the travel vector to catch
    // oversteer. This is the correct sign for the project's +X-right / +1-right convention.
    const catchSlide = makeAuthority(0.5);
    const steerAwayFromTravel = makeAuthority(-0.5);
    expect(catchSlide).toBeGreaterThan(steerAwayFromTravel + 0.05);
  });

  it('holds a planted line through a moderate corner', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 2, actions({ throttle: 1 }));
    const entry = rig.car.telemetry.speedKph;
    drive(rig, 1.2, actions({ throttle: 0.25, steer: 0.5 }));

    const telemetry = rig.car.telemetry;
    // Half steering at ~55 km/h is inside the tires' cornering budget: the car turns without
    // sliding (measured slip stayed under 0.02 rad throughout).
    expect(entry).toBeGreaterThan(40);
    expect(Math.abs(telemetry.slipAngle)).toBeLessThan(0.05);
    expect(telemetry.drifting).toBe(false);
    expect(telemetry.speedKph).toBeGreaterThan(30);
  });

  it('slides under handbrake where the gripped turn stays planted', () => {
    const sliding = createRig();
    drive(sliding, 1, NEUTRAL_ACTIONS);
    drive(sliding, 2, actions({ throttle: 1 }));
    drive(sliding, 1.2, actions({ steer: 0.5, handbrake: true }));

    // Pulling the handbrake drops rear lateral grip, so the car rotates well beyond the gripped
    // case (measured slip grows past 0.9 rad as the rear steps out).
    expect(Math.abs(sliding.car.telemetry.slipAngle)).toBeGreaterThan(0.4);
    expect(sliding.car.telemetry.drifting).toBe(true);
  });

  it('catches a handbrake slide with opposite lock', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 3, actions({ throttle: 1 }));
    drive(rig, 0.7, actions({ steer: 1, handbrake: true }));
    const peakSlip = Math.abs(rig.car.telemetry.slipAngle);

    // Opposite lock plus part throttle: the classic drift catch.
    drive(rig, 0.8, actions({ throttle: 0.5, steer: -1 }));

    const recovered = Math.abs(rig.car.telemetry.slipAngle);
    expect(peakSlip).toBeGreaterThan(0.4);
    expect(recovered).toBeLessThan(peakSlip * 0.5);
    // The car keeps its speed: this is a controlled slide, not a spin to a stop.
    expect(rig.car.telemetry.speedKph).toBeGreaterThan(40);
  });

  it('engages reverse while the brake is held at a standstill and backs up', () => {
    const rig = createRig();
    drive(rig, 1.5, NEUTRAL_ACTIONS);
    drive(rig, 2, actions({ brake: 1 }));

    expect(rig.car.telemetry.gear).toBe(-1);
    const zAfterEngage = rig.car.position.z;
    drive(rig, 2, actions({ brake: 1 }));
    expect(rig.car.telemetry.forwardSpeed).toBeLessThan(-1);
    expect(rig.car.position.z).toBeGreaterThan(zAfterEngage + 0.5);
  });

  it('returns to a forward gear when throttle is applied from reverse', () => {
    const rig = createRig();
    drive(rig, 1.5, NEUTRAL_ACTIONS);
    drive(rig, 2, actions({ brake: 1 }));
    expect(rig.car.telemetry.gear).toBe(-1);

    drive(rig, 0.5, actions({ throttle: 1 }));
    expect(rig.car.telemetry.gear).toBe(1);
  });

  it('decelerates on the handbrake without throttle', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 4, actions({ throttle: 1 }));
    const entry = rig.car.telemetry.speedKph;
    drive(rig, 1.5, actions({ handbrake: true }));

    expect(entry).toBeGreaterThan(80);
    expect(rig.car.telemetry.speedKph).toBeLessThan(entry * 0.85);
  });

  it('keeps rpm inside its operating range across the whole gearbox', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 30, actions({ throttle: 1 }));
    const telemetry = rig.car.telemetry;

    expect(telemetry.rpm).toBeGreaterThanOrEqual(900);
    expect(telemetry.rpm).toBeLessThanOrEqual(7200);
    expect(telemetry.gear).toBeLessThanOrEqual(6);
    expect(telemetry.contactCount).toBe(4);
  });

  it('collides with placed obstacle blocks instead of passing through them', () => {
    // Aim at a block at (-14, 1.5, -10), spanning z = -11.5..-8.5, from a clear
    // approach lane. The shipped world carries no obstacle blocks any more
    // (round 7), so this seam test places its own through the config list.
    const physics = new PhysicsWorld({
      rapier,
      worldConfig: {
        ...WORLD_CONFIG,
        obstacles: [
          {
            id: 'test-block',
            position: [-14, 1.5, -10],
            size: [3, 3, 3],
            color: 0xb6bec8,
            castShadow: true,
          },
        ],
      },
    });
    const car = new Car({ rapier, physics, spawnPosition: [-14, 1, 2], spawnYaw: 0 });
    const rig = { physics, car };

    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 4, actions({ throttle: 1 }));

    // The car must stop against the block rather than driving through it.
    expect(rig.car.position.z).toBeGreaterThan(-10);
    expect(rig.car.telemetry.speedKph).toBeLessThan(30);
    expect(rig.car.telemetry.contactCount).toBeGreaterThanOrEqual(2);
  });

  it('leaves the spawn lane clear so the car has a straight run', () => {
    const rig = createRig(WORLD_CONFIG);
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 4, actions({ throttle: 1 }));

    // Nothing may block the default heading: 60 m of clear road from the spawn point.
    expect(rig.car.position.z).toBeLessThan(-45);
    expect(rig.car.telemetry.speedKph).toBeGreaterThan(70);
  });

  it('is deterministic for identical input sequences', () => {
    const first = createRig();
    const second = createRig();
    const script: VehicleActions[] = [
      NEUTRAL_ACTIONS,
      actions({ throttle: 1 }),
      actions({ throttle: 1, steer: 1 }),
      actions({ brake: 1 }),
    ];
    for (const intent of script) {
      drive(first, 1, intent);
      drive(second, 1, intent);
    }
    expect(first.car.position).toEqual(second.car.position);
    expect(first.car.rotation).toEqual(second.car.rotation);
    expect(first.car.telemetry.speedMps).toBe(second.car.telemetry.speedMps);
  });

  it('resets to the spawn pose on demand', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 4, actions({ throttle: 1, steer: 0.5 }));
    // Steering curves the car, so assert displacement from spawn rather than progress along Z.
    expect(Math.hypot(rig.car.position.x, rig.car.position.z)).toBeGreaterThan(15);

    rig.car.reset();
    drive(rig, 1, NEUTRAL_ACTIONS);
    expect(Math.abs(rig.car.position.z)).toBeLessThan(1);
    expect(rig.car.telemetry.speedKph).toBeLessThan(1);
    expect(heading(rig)).toBeCloseTo(0, 1);
  });

  it('interpolates presentation poses between fixed steps', () => {
    const rig = createRig();
    drive(rig, 1, NEUTRAL_ACTIONS);
    drive(rig, 2, actions({ throttle: 1 }));

    const start = rig.car.getInterpolatedPose(0);
    const end = rig.car.getInterpolatedPose(1);
    const middle = rig.car.getInterpolatedPose(0.5);

    expect(middle.position.z).toBeLessThan(start.position.z);
    expect(middle.position.z).toBeGreaterThan(end.position.z);
    expect(middle.wheels).toHaveLength(4);
    for (const wheel of middle.wheels) {
      expect(Number.isFinite(wheel.spinAngle)).toBe(true);
      expect(wheel.suspensionLength).toBeGreaterThan(0);
    }
    // Camera-space consistency: every wheel of the front axle steers, the rear pair does not.
    expect(middle.wheels[0]?.steerAngle).toBe(middle.wheels[1]?.steerAngle);
    expect(middle.wheels[2]?.steerAngle).toBe(0);
  });

  it('stops applying growth beyond the fixed-step budget when frames stall', () => {
    const rig = createRig();
    rig.physics.update(2);
    const statistics = rig.physics.statistics;
    expect(statistics.stepsLastUpdate).toBeLessThanOrEqual(5);
    expect(statistics.stalledFrames).toBeGreaterThan(0);
    expect(statistics.accumulatorSeconds).toBeLessThan(FIXED_STEP);
  });

  it('owns its rigid body and releases it on dispose', () => {
    const rig = createRig();
    const before = rig.physics.world.bodies.len();
    expect(before).toBeGreaterThan(1);
    rig.car.dispose();
    expect(rig.physics.world.bodies.len()).toBe(before - 1);
    rig.physics.dispose();
  });

  it('exposes four wheels with two steering wheels and stable anchors', () => {
    const rig = createRig();
    expect(rig.car.wheels).toHaveLength(4);
    expect(rig.car.wheels.filter((wheel) => wheel.isFront)).toHaveLength(2);
    for (const wheel of rig.car.wheels) {
      expect(wheel.anchor.x).toBeCloseTo(wheel.side * 0.78, 6);
      expect(wheel.anchor.y).toBeCloseTo(0, 6);
      expect(Math.abs(wheel.anchor.z)).toBeCloseTo(1.35, 6);
    }
  });
});
