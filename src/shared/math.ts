/**
 * Small, engine-independent numeric helpers shared across systems.
 *
 * These functions are intentionally total: they never throw and always return a usable
 * number, because they run on the per-frame path where a NaN or an inverted range must
 * not propagate into camera, resize, or timing state.
 */

/**
 * Clamps `value` into `[min, max]`.
 *
 * Inverted bounds are normalized (`clamp(5, 10, 0)` is `5`), a non-finite bound is treated as
 * open-ended, `NaN` resolves to the lower bound, and `±Infinity` clamps to the matching bound. When
 * both bounds are non-finite the value passes through unchanged.
 */
export function clamp(value: number, min: number, max: number): number {
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) {
    return Number.isFinite(value) ? value : 0;
  }

  const lower = hasMin ? min : -Number.MAX_VALUE;
  const upper = hasMax ? max : Number.MAX_VALUE;
  const from = Math.min(lower, upper);
  const to = Math.max(lower, upper);

  if (Number.isNaN(value)) {
    return from;
  }
  return Math.min(Math.max(value, from), to);
}

/**
 * Resolves the renderer pixel ratio for the current device.
 *
 * Returns `1` for missing/invalid devicePixelRatio (for example embedded or headless
 * contexts) and never exceeds `maxPixelRatio`, which protects mobile GPUs from
 * rendering at 3x–4x device scale.
 */
export function resolvePixelRatio(devicePixelRatio: number, maxPixelRatio: number): number {
  const limit = Number.isFinite(maxPixelRatio) && maxPixelRatio > 0 ? maxPixelRatio : 1;
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return Math.min(1, limit);
  }
  return Math.min(devicePixelRatio, limit);
}

/**
 * Bounds a frame delta so a stalled tab, a breakpoint, or a slow first frame cannot
 * advance simulation state by seconds at once.
 */
export function clampFrameDelta(deltaSeconds: number, maxDeltaSeconds: number): number {
  const limit = Number.isFinite(maxDeltaSeconds) && maxDeltaSeconds > 0 ? maxDeltaSeconds : 0.1;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    return 0;
  }
  return Math.min(deltaSeconds, limit);
}

/** Converts seconds to milliseconds. */
export function secondsToMilliseconds(seconds: number): number {
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}
