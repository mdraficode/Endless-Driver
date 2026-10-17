/**
 * How daylight phase values combine with configured baselines.
 *
 * The environment clock's `sunIntensity`, `ambientIntensity`, `environmentIntensity` and
 * `exposure` are PHASE MULTIPLIERS: 1 at full day, fading towards twilight and night
 * (config/daylight.ts documents the night ends of the ranges). They are not absolute
 * light levels — the absolutes live in `render.ts` (`lighting.sunIntensity`,
 * `lighting.ambientIntensity`, `environment.intensity`, `renderer.toneMappingExposure`).
 * Applying a phase value as an absolute ran the daytime sun at 1.0 instead of 2.4 and the
 * fill at 1.0 instead of 0.35: a 1:1 sun-to-fill ratio with no shadow contrast, which read
 * as a milky wash over the whole frame (owner report, 2026-10-17). One helper for every
 * combination keeps the semantics in a single tested place.
 */

/** A configured baseline scaled by a daylight phase multiplier. */
export function scaleBaseline(baseline: number, phase: number): number {
  return baseline * phase;
}
