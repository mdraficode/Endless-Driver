import type { DrivetrainConfig } from '../config/vehicle';
import { clamp } from '../shared/math';
import { torqueAtRpm } from './TireModel';

export interface DrivetrainInput {
  readonly throttle: number;
  readonly brake: number;
  /** Average longitudinal speed of the driven wheels in m/s. */
  readonly drivenWheelSpeed: number;
  /** Car speed magnitude in m/s (used only for the reverse-engagement rule). */
  readonly speed: number;
}

export interface DrivetrainState {
  /** 0 is neutral, 1..n are forward gears, -1 is reverse. */
  readonly gear: number;
  readonly rpm: number;
  /** Requested drive force at the driven axle in newtons (negative drives backwards). */
  readonly driveForce: number;
  readonly shifting: boolean;
  /** True while reverse is engaged; the brake input is then used as reverse throttle. */
  readonly reversing: boolean;
  /** Torque currently delivered at the crank, for telemetry. */
  readonly engineTorque: number;
}

/**
 * Engine and transmission model: torque curve, gear ratios, automatic shifting, and reverse.
 *
 * This is intentionally a "sim-cade" drivetrain — no clutch state machine and no torque converter.
 * RPM is derived from driven-wheel speed once the car is moving and revs toward a target when it is
 * not, which gives believable gearing and engine response without the instability of a fully
 * coupled clutch at 60 Hz.
 */
export class Drivetrain {
  readonly #config: DrivetrainConfig;
  readonly #wheelRadius: number;
  #gear = 1;
  #rpm: number;
  #driveForce = 0;
  #engineTorque = 0;
  #shiftTimer = 0;
  #brakeHeldSeconds = 0;

  constructor(config: DrivetrainConfig, wheelRadius: number) {
    this.#config = config;
    this.#wheelRadius = wheelRadius;
    this.#rpm = config.idleRpm;
  }

  get state(): DrivetrainState {
    return {
      gear: this.#gear,
      rpm: this.#rpm,
      driveForce: this.#driveForce,
      shifting: this.#shiftTimer > 0,
      reversing: this.#gear < 0,
      engineTorque: this.#engineTorque,
    };
  }

  /** Highest forward gear index. */
  get gearCount(): number {
    return this.#config.gearRatios.length;
  }

  reset(): void {
    this.#gear = 1;
    this.#rpm = this.#config.idleRpm;
    this.#driveForce = 0;
    this.#engineTorque = 0;
    this.#shiftTimer = 0;
    this.#brakeHeldSeconds = 0;
  }

  update(delta: number, input: DrivetrainInput): DrivetrainState {
    const config = this.#config;
    const dt = Math.max(delta, 0);
    const throttle = clamp(input.throttle, 0, 1);
    const brake = clamp(input.brake, 0, 1);

    this.#updateDirection(dt, input, brake);

    // While reverse is engaged the brake key acts as reverse throttle, which is what keyboard
    // players expect: hold S to stop, keep holding to back up.
    const engineThrottle = this.#gear < 0 ? brake : throttle;

    // Engine speed: geared to the driven wheels when moving, otherwise revving toward a
    // throttle-dependent target like a car in neutral.
    const ratio = this.#totalRatio();
    const wheelAngularSpeed = Math.abs(input.drivenWheelSpeed) / this.#wheelRadius;
    const gearedRpm = (wheelAngularSpeed * Math.abs(ratio) * 60) / (2 * Math.PI);
    const revTarget = config.idleRpm + engineThrottle * (config.maxRpm - config.idleRpm) * 0.35;
    const targetRpm =
      Math.abs(input.drivenWheelSpeed) > 1.5
        ? clamp(gearedRpm, config.idleRpm, config.maxRpm)
        : Math.max(revTarget, config.idleRpm);
    const rpmLag = Math.max(config.responseSeconds, 0.01);
    this.#rpm += (targetRpm - this.#rpm) * (1 - Math.exp(-dt / rpmLag));
    this.#rpm = clamp(this.#rpm, config.idleRpm, config.maxRpm);

    this.#updateShifts(dt);

    const torque = torqueAtRpm(this.#rpm, config.torqueCurve);
    const shiftingFactor = this.#shiftTimer > 0 ? config.shiftTorqueFactor : 1;
    // The gear ratio is signed, so the resulting force is already signed for reverse.
    const requestedForce =
      (torque * ratio * engineThrottle * shiftingFactor * config.efficiency) / this.#wheelRadius;

    const forceLag = Math.max(config.responseSeconds, 0.01);
    this.#driveForce += (requestedForce - this.#driveForce) * (1 - Math.exp(-dt / forceLag));
    this.#engineTorque = torque * engineThrottle * shiftingFactor;

    return this.state;
  }

  #updateDirection(delta: number, input: DrivetrainInput, brake: number): void {
    const config = this.#config;
    const nearlyStill = Math.abs(input.speed) < config.reverseEngageSpeed;

    if (this.#gear > 0) {
      // Holding the brake at a standstill engages reverse.
      if (brake > 0.5 && nearlyStill) {
        this.#brakeHeldSeconds += delta;
        if (this.#brakeHeldSeconds >= config.reverseEngageSeconds) {
          this.#gear = -1;
          this.#driveForce = 0;
          this.#brakeHeldSeconds = 0;
        }
      } else {
        this.#brakeHeldSeconds = 0;
      }
      return;
    }

    // In reverse: releasing the brake and applying throttle returns to first forward gear.
    if (input.throttle > 0.3 && input.speed > -config.reverseEngageSpeed) {
      this.#gear = 1;
      this.#driveForce = 0;
      this.#brakeHeldSeconds = 0;
    }
  }

  #updateShifts(delta: number): void {
    const config = this.#config;
    if (this.#shiftTimer > 0) {
      this.#shiftTimer = Math.max(0, this.#shiftTimer - delta);
      return;
    }
    if (this.#gear < 0) {
      return;
    }

    if (this.#rpm >= config.shiftUpRpm && this.#gear < config.gearRatios.length) {
      this.#gear += 1;
      this.#shiftTimer = config.shiftDurationSeconds;
      return;
    }
    if (this.#rpm <= config.shiftDownRpm && this.#gear > 1) {
      this.#gear -= 1;
      this.#shiftTimer = config.shiftDurationSeconds;
    }
  }

  #totalRatio(): number {
    const config = this.#config;
    if (this.#gear < 0) {
      return -config.reverseRatio * config.finalDrive;
    }
    const gearRatio = config.gearRatios[this.#gear - 1] ?? config.gearRatios[0] ?? 1;
    return gearRatio * config.finalDrive;
  }
}
