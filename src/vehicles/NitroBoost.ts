import { clamp } from '../shared/math';

/** Refillable N₂O timing and high-response arcade thrust. */
export const NITRO_BOOST_CONFIG = {
  /** Full tank lasts this long when held continuously. */
  useDurationSeconds: 3.5,
  /** Empty tank takes this long to refill after the boost control is released. */
  rechargeDurationSeconds: 8,
  /** Multiplies driven-wheel force while boost and throttle are both active. */
  driveForceMultiplier: 1.55,
  /** Standalone longitudinal acceleration; boost does not require the gas pedal. */
  accelerationMps2: 30,
  /** Speed toward which the standalone boost accelerates the car while held. */
  targetSpeedKph: 250,
} as const;

export interface NitroBoostState {
  /** Tank level, normalized to 0..1. */
  readonly charge: number;
  /** True only while a valid boost request is consuming charge. */
  readonly active: boolean;
}

/** A small deterministic resource controller shared by keyboard, touch, and gamepad input. */
export class NitroBoost {
  #charge = 1;
  #active = false;

  get state(): NitroBoostState {
    return { charge: this.#charge, active: this.#active };
  }

  update(deltaSeconds: number, requested: boolean, forwardGearAvailable = true): NitroBoostState {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const canBoost = requested && forwardGearAvailable;

    if (canBoost && this.#charge > 0) {
      this.#charge = clamp(this.#charge - delta / NITRO_BOOST_CONFIG.useDurationSeconds, 0, 1);
      this.#active = this.#charge > 0;
    } else {
      this.#active = false;
      // Boost only recharges once the player releases the control; holding an empty tank
      // (or holding boost while in reverse) cannot refill charge underneath their finger.
      if (!requested) {
        this.#charge = clamp(
          this.#charge + delta / NITRO_BOOST_CONFIG.rechargeDurationSeconds,
          0,
          1,
        );
      }
    }

    return this.state;
  }

  /** Pause/unfocus stops boost force immediately without changing the stored tank level. */
  deactivate(): NitroBoostState {
    this.#active = false;
    return this.state;
  }
}
