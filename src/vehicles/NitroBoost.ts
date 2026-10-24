import { clamp } from '../shared/math';

/** Bounded N₂O timing and force assistance, tuned as a brief refillable arcade boost. */
export const NITRO_BOOST_CONFIG = {
  /** Full tank lasts this long when held continuously. */
  useDurationSeconds: 3.5,
  /** Empty tank takes this long to refill while boost is released. */
  rechargeDurationSeconds: 8,
  /** Multiplies driven-wheel force while boost is active. */
  driveForceMultiplier: 1.55,
  /** Boost only fires when there is enough throttle to make it useful. */
  minimumThrottle: 0.08,
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

  update(deltaSeconds: number, requested: boolean, throttle: number): NitroBoostState {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const usableRequest = requested && throttle >= NITRO_BOOST_CONFIG.minimumThrottle;

    if (usableRequest && this.#charge > 0) {
      this.#charge = clamp(this.#charge - delta / NITRO_BOOST_CONFIG.useDurationSeconds, 0, 1);
      this.#active = true;
    } else {
      this.#active = false;
      // Holding the boost input on an empty tank does not allow it to refill underneath the
      // player's finger; release the control to let the tank recharge.
      if (!usableRequest) {
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
