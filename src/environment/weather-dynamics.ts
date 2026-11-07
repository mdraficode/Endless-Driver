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
}

/** What each preset eases towards. */
const WEATHER_TARGETS: Readonly<Record<WeatherPreset, WeatherSample>> = {
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
}

function moveTowards(current: number, target: number, step: number): number {
  if (current === target) return current;
  if (step <= 0) return current;
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/**
 * Advances the weather towards its preset at a fixed rate. Deterministic in the delta:
 * the same input sequence produces the same wetness curve, so telemetry comparisons
 * (and the no-pop contract) are testable without a renderer.
 */
export class WeatherDynamics {
  #preset: WeatherPreset;
  readonly #current: MutableWeatherSample;

  constructor(preset: WeatherPreset) {
    this.#preset = preset;
    // A world starts in equilibrium for its preset: the first frame shows the weather
    // it was launched with, not a ramp from clear.
    this.#current = { ...WEATHER_TARGETS[preset] };
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
    return this.#current;
  }
}
