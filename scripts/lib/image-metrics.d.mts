/**
 * Types for `image-metrics.mjs`, so the harness's numbers can be asserted on from the TypeScript
 * test suite with readable failures instead of module errors.
 */

/** Extracts the luminance plane of an 8-bit RGB(A) buffer as floats in 0–255. */
export declare function luminance(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels?: number,
): Float32Array;

/** Structural similarity between two same-sized images; 1 = identical. */
export declare function ssim(
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels?: number,
): number;

export interface TemporalStabilityReport {
  readonly flatMeanStd: number;
  readonly flatP95Std: number;
  readonly overallMeanStd: number;
  readonly flatFraction: number;
  readonly frames: number;
}

/** Per-pixel temporal variance across a burst, reported over flat regions. */
export declare function temporalStability(
  frames: readonly (Uint8Array | Uint8ClampedArray)[],
  width: number,
  height: number,
  channels?: number,
  flatGradientThreshold?: number,
): TemporalStabilityReport;

/** Mean absolute per-channel difference between two images, in code values (0–255). */
export declare function meanAbsoluteDifference(
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
  channels?: number,
): number;
