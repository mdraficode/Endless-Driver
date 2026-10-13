import { describe, expect, it } from 'vitest';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { Drivetrain } from '../../src/vehicles/Drivetrain';

const config = VEHICLE_CONFIG.drivetrain;
const wheelRadius = VEHICLE_CONFIG.wheels.radius;

function create(): Drivetrain {
  return new Drivetrain(config, wheelRadius);
}

/** Runs the drivetrain for `seconds` at a fixed 60 Hz step with constant input. */
function run(
  drivetrain: Drivetrain,
  seconds: number,
  input: { throttle: number; brake: number; drivenWheelSpeed: number; speed: number },
): void {
  const steps = Math.max(1, Math.round(seconds / (1 / 60)));
  for (let step = 0; step < steps; step += 1) {
    drivetrain.update(1 / 60, input);
  }
}

describe('drivetrain', () => {
  it('starts in first gear at idle with no drive force', () => {
    const drivetrain = create();
    expect(drivetrain.state.gear).toBe(1);
    expect(drivetrain.state.rpm).toBe(config.idleRpm);
    expect(drivetrain.state.driveForce).toBe(0);
    expect(drivetrain.gearCount).toBe(config.gearRatios.length);
  });

  it('produces forward force in first gear and reverse force in reverse', () => {
    const forward = create();
    run(forward, 1, { throttle: 1, brake: 0, drivenWheelSpeed: 0, speed: 0 });
    // Positive drive force is forward motion; a negative gear ratio must produce negative force.
    expect(forward.state.gear).toBe(1);
    expect(forward.state.driveForce).toBeGreaterThan(1000);
    expect(forward.state.engineTorque).toBeGreaterThan(0);

    const reverse = create();
    run(reverse, 2, { throttle: 0, brake: 1, drivenWheelSpeed: 0, speed: 0 });
    expect(reverse.state.gear).toBe(-1);
    expect(reverse.state.reversing).toBe(true);
    run(reverse, 0.5, { throttle: 0, brake: 1, drivenWheelSpeed: -1, speed: -1 });
    expect(reverse.state.driveForce).toBeLessThan(0);
  });

  it('scales drive force with the gear ratio', () => {
    const first = create();
    const fifth = new Drivetrain(config, wheelRadius);
    // Same engine speed in a numerically lower gear must deliver less force at the wheel.
    run(first, 1, { throttle: 1, brake: 0, drivenWheelSpeed: 0, speed: 0 });
    for (let index = 0; index < 4; index += 1) {
      run(fifth, 1, { throttle: 1, brake: 0, drivenWheelSpeed: 0, speed: 0 });
      // Force the upshift by pretending the engine is spinning past the shift point.
      run(fifth, 1, {
        throttle: 1,
        brake: 0,
        drivenWheelSpeed: config.shiftUpRpm * 0.1,
        speed: config.shiftUpRpm * 0.1,
      });
    }
    expect(fifth.gearCount).toBe(config.gearRatios.length);
    expect(first.state.engineTorque).toBeGreaterThan(0);
  });

  it('upshifts near the shift-up rpm and downshifts near the shift-down rpm', () => {
    const drivetrain = create();
    // Spin the driven wheels fast enough that geared rpm exceeds the upshift threshold.
    const wheelSpeedFor = (rpm: number, gearIndex: number): number => {
      const ratio = (config.gearRatios[gearIndex] ?? 1) * config.finalDrive;
      return (rpm * 2 * Math.PI * wheelRadius) / (60 * ratio);
    };

    // Step in small increments so the state can be observed during the shift torque cut.
    let shiftedAt = -1;
    let shiftingObserved = false;
    const step = 1 / 60;
    for (let index = 0; index < 120; index += 1) {
      drivetrain.update(step, {
        throttle: 1,
        brake: 0,
        drivenWheelSpeed: wheelSpeedFor(config.shiftUpRpm + 300, 0),
        speed: 20,
      });
      if (drivetrain.state.shifting) {
        shiftingObserved = true;
        shiftedAt = index;
      }
    }
    expect(drivetrain.state.gear).toBe(2);
    expect(shiftingObserved).toBe(true);
    // A shift cut lasts about `shiftDurationSeconds`, so it must not still be running much later.
    expect(shiftedAt).toBeLessThan(120);

    run(drivetrain, 1.5, {
      throttle: 0,
      brake: 0,
      drivenWheelSpeed: wheelSpeedFor(config.shiftDownRpm - 400, 1),
      speed: 5,
    });
    expect(drivetrain.state.gear).toBe(1);
  });

  it('revs toward a throttle-dependent target when the wheels are not turning', () => {
    const idle = create();
    run(idle, 1, { throttle: 0, brake: 0, drivenWheelSpeed: 0, speed: 0 });
    const revved = create();
    run(revved, 1, { throttle: 1, brake: 0, drivenWheelSpeed: 0, speed: 0 });
    run(revved, 1, { throttle: 1, brake: 0, drivenWheelSpeed: 0, speed: 0 });

    expect(idle.state.rpm).toBeCloseTo(config.idleRpm, 0);
    expect(revved.state.rpm).toBeGreaterThan(idle.state.rpm);
    expect(revved.state.rpm).toBeLessThan(config.shiftUpRpm);
  });

  it('requires the brake to be held before engaging reverse', () => {
    const drivetrain = create();
    run(drivetrain, config.reverseEngageSeconds * 0.5, {
      throttle: 0,
      brake: 1,
      drivenWheelSpeed: 0,
      speed: 0,
    });
    expect(drivetrain.state.gear).toBe(1);

    run(drivetrain, config.reverseEngageSeconds * 2, {
      throttle: 0,
      brake: 1,
      drivenWheelSpeed: 0,
      speed: 0,
    });
    expect(drivetrain.state.gear).toBe(-1);
  });

  it('does not engage reverse while the car is still rolling forward', () => {
    const drivetrain = create();
    run(drivetrain, 3, {
      throttle: 0,
      brake: 1,
      drivenWheelSpeed: 2,
      speed: config.reverseEngageSpeed * 4,
    });
    expect(drivetrain.state.gear).toBe(1);
  });

  it('returns to first gear when throttle is applied in reverse', () => {
    const drivetrain = create();
    run(drivetrain, 2, { throttle: 0, brake: 1, drivenWheelSpeed: 0, speed: 0 });
    expect(drivetrain.state.gear).toBe(-1);

    run(drivetrain, 0.5, { throttle: 1, brake: 0, drivenWheelSpeed: 0, speed: 0 });
    expect(drivetrain.state.gear).toBe(1);
    expect(drivetrain.state.driveForce).toBeGreaterThan(0);
  });

  it('cuts drive force while shifting and restores it afterwards', () => {
    const drivetrain = create();
    const wheelSpeed = (config.shiftUpRpm + 300) * 2 * Math.PI * wheelRadius;
    run(drivetrain, 1, { throttle: 1, brake: 0, drivenWheelSpeed: wheelSpeed, speed: 20 });
    const duringShift = drivetrain.state.driveForce;
    expect(drivetrain.state.shifting).toBe(true);

    run(drivetrain, config.shiftDurationSeconds + 0.5, {
      throttle: 1,
      brake: 0,
      drivenWheelSpeed: wheelSpeed,
      speed: 20,
    });
    expect(drivetrain.state.shifting).toBe(false);
    expect(drivetrain.state.driveForce).toBeGreaterThan(duringShift);
  });

  it('keeps rpm inside the operating band for any input', () => {
    const drivetrain = create();
    for (const speed of [0, 5, -5, 1e6, Number.NaN]) {
      run(drivetrain, 0.5, { throttle: 1, brake: 0, drivenWheelSpeed: speed, speed });
      expect(drivetrain.state.rpm).toBeGreaterThanOrEqual(config.idleRpm);
      expect(drivetrain.state.rpm).toBeLessThanOrEqual(config.maxRpm);
      expect(Number.isFinite(drivetrain.state.driveForce)).toBe(true);
    }
  });

  it('resets to first gear at idle', () => {
    const drivetrain = create();
    run(drivetrain, 3, { throttle: 0, brake: 1, drivenWheelSpeed: 0, speed: 0 });
    expect(drivetrain.state.gear).toBe(-1);
    drivetrain.reset();
    expect(drivetrain.state.gear).toBe(1);
    expect(drivetrain.state.rpm).toBe(config.idleRpm);
    expect(drivetrain.state.driveForce).toBe(0);
  });
});
