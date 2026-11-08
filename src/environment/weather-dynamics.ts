import type { WeatherPreset } from './SurfaceState';

/**
 * The one live sample of the weather this frame. `wetness` is the physics input (the
 * surface response and the wet-road sheen read it), `rainIntensity` drives the
 * precipitation field, and `overcast` drives the sky darkening and light reduction.
 *
 * All channels are continuous 0..1 values that ease towards the active preset's target,
 * so a preset change is a transition, never a pop: the car is never touched (it keeps
 * its body, velocity and contact state), and nothing in the scene swaps instantaneously.
 */
export interface WeatherSample {
  readonly wetness: number;
  readonly rainIntensity: number;
  readonly overcast: number;
  /** Live lightning flash level, 0..1 (storm only; see `lightningEnvelope`). */
  readonly lightning: number;
}

/** What each preset eases towards (lightning is a live storm channel, not a preset target). */
const WEATHER_TARGETS: Readonly<Record<WeatherPreset, Omit<WeatherSample, 'lightning'>>> = {
  clear: { wetness: 0, rainIntensity: 0, overcast: 0 },
  rain: { wetness: 0.85, rainIntensity: 1, overcast: 0.55 },
  storm: { wetness: 1, rainIntensity: 1, overcast: 1 },
};

/** Channel ramp rates (per second): rain stops in ~2 s, a storm builds in ~3 s, roads dry in ~2.7 s. */
const WETNESS_RATE = 0.37;
const RAIN_RATE = 0.5;
const OVERCAST_RATE = 0.35;

/** The mutable storage behind the live sample (the public interface stays readonly). */
interface MutableWeatherSample {
  wetness: number;
  rainIntensity: number;
  overcast: number;
  lightning: number;
}

function moveTowards(current: number, target: number, step: number): number {
  if (current === target) return current;
  if (step <= 0) return current;
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/**
 * The lightning flash envelope: a fast rise, an exponential decay, and (for the common
 * double strike) a second weaker pulse a beat later. `tSeconds` is time since the flash
 * began; the result is 0..1. Pure — the kernel of the storm's flash shape, unit-tested.
 */
export function lightningEnvelope(tSeconds: number, amp: number, secondFlash: boolean): number {
  if (tSeconds <= 0) return 0;
  const RISE = 0.05;
  const TAU = 0.15;
  let v: number;
  if (tSeconds < RISE) {
    v = amp * (tSeconds / RISE);
  } else {
    // Exponential decay to the budget edge (the schedule cuts the flash at 1.1 s).
    v = amp * Math.exp(-(tSeconds - RISE) / TAU);
  }
  if (secondFlash && tSeconds >= 0.42) {
    const t2 = tSeconds - 0.42;
    const a2 = amp * 0.55;
    const v2 = t2 < RISE ? a2 * (t2 / RISE) : a2 * Math.exp(-(t2 - RISE) / (TAU * 1.4));
    v = Math.max(v, v2);
  }
  return Math.min(1, v);
}

/** Overcast at or above this the storm is allowed to flash (the rain preset is near the gate). */
const LIGHTNING_MIN_OVERCAST = 0.5;
/** Flash interval bounds (s) once the storm gate is open. */
const LIGHTNING_FLASH_MIN_SECONDS = 5;
const LIGHTNING_FLASH_MAX_SECONDS = 18;
/** Total envelope budget (s), second flash included. */
const LIGHTNING_FLASH_BUDGET_SECONDS = 1.1;

/** Infallible hash PRNG in [0, 1) (the project's mulberry32 pattern). */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Advances the weather towards its preset at a fixed rate. Deterministic in the delta:
 * the same input sequence produces the same wetness curve, so telemetry comparisons
 * (and the no-pop contract) are testable without a renderer. The lightning schedule is
 * deterministic in (seed, delta sequence) the same way: a seeded PRNG and a countdown.
 */
export class WeatherDynamics {
  #preset: WeatherPreset;
  readonly #current: MutableWeatherSample;
  readonly #rng: () => number;
  #flashElapsed = -1; // seconds since the flash began; -1 while idle
  #flashAmp = 0;
  #flashSecond = false;
  #nextFlashIn: number;

  constructor(preset: WeatherPreset, seed = 0x5eed) {
    this.#preset = preset;
    // A world starts in equilibrium for its preset: the first frame shows the weather
    // it was launched with, not a ramp from clear.
    this.#current = { ...WEATHER_TARGETS[preset], lightning: 0 };
    this.#rng = mulberry32(seed);
    this.#nextFlashIn =
      LIGHTNING_FLASH_MIN_SECONDS +
      this.#rng() * (LIGHTNING_FLASH_MAX_SECONDS - LIGHTNING_FLASH_MIN_SECONDS);
  }

  get preset(): WeatherPreset {
    return this.#preset;
  }

  /** Switches the target weather. The current sample keeps ramping from where it is. */
  setPreset(preset: WeatherPreset): void {
    this.#preset = preset;
  }

  /** Advances one frame and returns the live sample. */
  update(deltaSeconds: number): WeatherSample {
    const target = WEATHER_TARGETS[this.#preset];
    const delta = deltaSeconds > 0 ? Math.min(deltaSeconds, 0.1) : 0;
    this.#current.wetness = moveTowards(
      this.#current.wetness,
      target.wetness,
      delta * WETNESS_RATE,
    );
    this.#current.rainIntensity = moveTowards(
      this.#current.rainIntensity,
      target.rainIntensity,
      delta * RAIN_RATE,
    );
    this.#current.overcast = moveTowards(
      this.#current.overcast,
      target.overcast,
      delta * OVERCAST_RATE,
    );
    this.#advanceLightning(delta, this.#current.overcast);
    return this.#current;
  }

  /**
   * The storm's flash schedule: a countdown while the overcast gate is open, then a
   * seeded double-flash envelope. The flash amplitude scales with the live overcast so
   * the gate edge (the rain preset) flashes a little softer than a full storm.
   */
  #advanceLightning(delta: number, overcast: number): void {
    if (delta <= 0) return;
    if (this.#flashElapsed >= 0) {
      this.#flashElapsed += delta;
      if (this.#flashElapsed >= LIGHTNING_FLASH_BUDGET_SECONDS) {
        this.#flashElapsed = -1;
        this.#nextFlashIn =
          LIGHTNING_FLASH_MIN_SECONDS +
          this.#rng() * (LIGHTNING_FLASH_MAX_SECONDS - LIGHTNING_FLASH_MIN_SECONDS);
        this.#current.lightning = 0;
        return;
      }
      this.#current.lightning =
        lightningEnvelope(this.#flashElapsed, this.#flashAmp, this.#flashSecond) *
        (0.4 + 0.6 * overcast);
      return;
    }
    this.#current.lightning = 0;
    if (overcast < LIGHTNING_MIN_OVERCAST) return;
    this.#nextFlashIn -= delta;
    if (this.#nextFlashIn <= 0) {
      this.#flashElapsed = 0;
      this.#flashAmp = 0.55 + 0.45 * this.#rng();
      this.#flashSecond = this.#rng() < 0.6;
    }
  }
}
