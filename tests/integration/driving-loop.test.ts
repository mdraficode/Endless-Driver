import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import { InputManager, type InputTarget } from '../../src/input/InputManager';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { Car } from '../../src/vehicles/Car';

/**
 * Phase 2 driving-loop integration without a renderer.
 *
 * This exercises the exact chain the application uses every frame — keyboard events, input
 * smoothing, the action contract, the fixed-step physics update, and the telemetry the HUD reads —
 * minus WebGL. It is the closest thing to an end-to-end test that can run headlessly.
 */

const FIXED_STEP = 1 / 60;

const OPEN_WORLD: WorldConfig = {
  ...WORLD_CONFIG,
  obstacles: [],
  ground: { ...WORLD_CONFIG.ground, size: 4000 },
};

class FakeTarget implements InputTarget {
  readonly #listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.#listeners.get(type) ?? new Set();
    set.add(listener);
    this.#listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  press(code: string): void {
    this.#emit('keydown', code);
  }

  release(code: string): void {
    this.#emit('keyup', code);
  }

  #emit(type: string, code: string): void {
    const event = { code, repeat: false, preventDefault: () => {} } as unknown as Event;
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

interface Harness {
  readonly input: InputManager;
  readonly target: FakeTarget;
  readonly car: Car;
  readonly physics: PhysicsWorld;
  /** Runs `seconds` of the application's per-frame order of operations. */
  run(seconds: number): void;
}

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

function createHarness(): Harness {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const car = new Car({ rapier, physics, spawnPosition: [0, 1, 0], spawnYaw: 0 });
  const target = new FakeTarget();
  const input = new InputManager({ target });
  input.attach();

  return {
    input,
    target,
    car,
    physics,
    run(seconds: number): void {
      const steps = Math.max(1, Math.round(seconds / FIXED_STEP));
      for (let step = 0; step < steps; step += 1) {
        // 1. input smoothing, 2. intent, 3. commands, 4. fixed-step physics.
        input.update(FIXED_STEP);
        car.setActions(input.actions);
        const commands = input.consumeCommands();
        if (commands.reset) {
          car.reset();
        }
        physics.update(FIXED_STEP);
      }
    },
  };
}

describe('driving loop (input to vehicle)', () => {
  it('accelerates from a single W press through the smoothed input path', () => {
    const harness = createHarness();
    harness.run(1);
    expect(harness.car.telemetry.speedKph).toBeLessThan(1);

    harness.target.press('KeyW');
    harness.run(0.1);
    // The throttle axis is still ramping in, so the car is barely moving yet but already pulling.
    expect(harness.input.actions.throttle).toBeGreaterThan(0.2);
    expect(harness.input.actions.throttle).toBeLessThan(1);

    harness.run(4);
    expect(harness.car.telemetry.speedKph).toBeGreaterThan(70);
    expect(harness.car.telemetry.gear).toBeGreaterThan(1);
    expect(harness.car.telemetry.contactCount).toBe(4);
  });

  it('coasts down gently when the throttle is released without braking', () => {
    const harness = createHarness();
    harness.run(1);
    harness.target.press('KeyW');
    harness.run(4);
    const entry = harness.car.telemetry.speedKph;

    harness.target.release('KeyW');
    // The drive force has a short lag, so the car keeps pulling for a fraction of a second before
    // drag and rolling resistance take over; measure over a window that covers both.
    harness.run(3);
    const coasting = harness.car.telemetry.speedKph;
    expect(coasting).toBeLessThan(entry - 1);
    // No brake input, so most of the speed survives.
    expect(coasting).toBeGreaterThan(entry * 0.9);
    expect(harness.input.actions.throttle).toBeLessThan(0.05);
  });

  it('brakes to a stop and then reverses while S stays held', () => {
    const harness = createHarness();
    harness.run(1);
    harness.target.press('KeyW');
    harness.run(4);
    harness.target.release('KeyW');
    harness.target.press('KeyS');

    harness.run(3);
    expect(harness.car.telemetry.speedKph).toBeLessThan(8);

    harness.run(2);
    expect(harness.car.telemetry.gear).toBe(-1);
    expect(harness.car.telemetry.forwardSpeed).toBeLessThan(-1);
  });

  it('steers with the A and D keys and keeps the sign convention', () => {
    const right = createHarness();
    right.run(1);
    right.target.press('KeyW');
    right.run(2);
    right.target.press('KeyD');
    right.run(1.2);
    // Positive input is a right-hand turn, which is negative yaw about +Y.
    expect(right.car.rotation.y).toBeLessThan(0);

    const left = createHarness();
    left.run(1);
    left.target.press('KeyW');
    left.run(2);
    left.target.press('KeyA');
    left.run(1.2);
    expect(left.car.rotation.y).toBeGreaterThan(0);
  });

  it('drifts when the handbrake is pulled mid-corner', () => {
    const harness = createHarness();
    harness.run(1);
    harness.target.press('KeyW');
    harness.run(3);
    harness.target.press('ArrowRight');
    harness.run(1);
    const grippedSlip = Math.abs(harness.car.telemetry.slipAngle);

    harness.target.press('Space');
    harness.run(1);
    expect(harness.car.telemetry.handbrake).toBe(true);
    expect(Math.abs(harness.car.telemetry.slipAngle)).toBeGreaterThan(grippedSlip);
    expect(harness.car.telemetry.drifting).toBe(true);
  });

  it('resets the car when the reset command is consumed', () => {
    const harness = createHarness();
    harness.run(1);
    harness.target.press('KeyW');
    harness.run(5);
    expect(harness.car.position.z).toBeLessThan(-40);

    harness.target.release('KeyW');
    harness.target.press('KeyR');
    harness.run(1);
    expect(Math.abs(harness.car.position.z)).toBeLessThan(2);
    expect(harness.car.telemetry.speedKph).toBeLessThan(3);
  });

  it('stops driving after the input manager is detached', () => {
    const harness = createHarness();
    harness.run(1);
    harness.target.press('KeyW');
    harness.run(5);
    const moving = harness.car.telemetry.speedKph;
    expect(moving).toBeGreaterThan(70);

    harness.input.detach();
    harness.run(3);
    // Detaching clears the held keys, so the car coasts down instead of accelerating.
    expect(harness.car.telemetry.speedKph).toBeLessThan(moving - 1);
    expect(harness.input.actions.throttle).toBe(0);
  });

  it('keeps telemetry fields the HUD reads finite through a full drive cycle', () => {
    const harness = createHarness();
    harness.run(1);
    harness.target.press('KeyW');
    harness.target.press('KeyD');
    harness.run(3);
    harness.target.press('Space');
    harness.run(2);
    harness.target.release('Space');
    harness.target.release('KeyW');
    harness.target.press('KeyS');
    harness.run(2);

    const telemetry = harness.car.telemetry;
    for (const value of [
      telemetry.speedMps,
      telemetry.speedKph,
      telemetry.forwardSpeed,
      telemetry.rpm,
      telemetry.steerAngle,
      telemetry.slipAngle,
      telemetry.lateralAcceleration,
      telemetry.longitudinalAcceleration,
      telemetry.distanceTravelled,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(telemetry.contactCount).toBeGreaterThanOrEqual(0);
    expect(telemetry.contactCount).toBeLessThanOrEqual(4);
    expect(telemetry.gear).toBeGreaterThanOrEqual(-1);
    expect(telemetry.gear).toBeLessThanOrEqual(6);

    const pose = harness.car.getInterpolatedPose(0.5);
    expect(pose.wheels).toHaveLength(4);
    expect(Number.isFinite(pose.position.x)).toBe(true);
    expect(Number.isFinite(pose.rotation.w)).toBe(true);
  });
});
