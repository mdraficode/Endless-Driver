/**
 * Types for `lut.mjs`, so the look can be asserted on from the TypeScript test suite — and so that
 * `npm run typecheck` catches a change to the transform that the tests would otherwise only discover
 * at runtime, when a test that imports a function that no longer exists fails with a module error
 * instead of a readable assertion.
 */

/** The authored look, as the numbers that describe it. */
export declare const LOOK: {
  readonly contrast: number;
  readonly midSaturation: number;
  readonly highlightDesaturation: number;
  readonly highlightTint: readonly [number, number, number];
  readonly shadowTint: readonly [number, number, number];
  readonly midGreen: number;
};

/**
 * The look applied to one display-referred colour, both in 0-1.
 *
 * Declared as a three-tuple rather than an array: the runtime returns exactly three channels, and
 * saying so is what lets the tests destructure without every index being `number | undefined`.
 */
export declare function applyLook(rgb: readonly number[]): [number, number, number];

/** One lattice point's value, quantised to the 8 bits the table ships as. */
export declare function lutEntry(
  size: number,
  r: number,
  g: number,
  b: number,
): [number, number, number];

/** The whole table as bytes, red varying fastest within each blue slice. */
export declare function generateLutData(size: number): Uint8Array;

/** A neutral table of the given size, entry for entry. */
export declare function identityLutData(size: number): Uint8Array;

/** Trilinear reconstruction, the way the GPU samples the texture. */
export declare function sampleLut(
  data: Uint8Array,
  size: number,
  rgb: readonly number[],
): [number, number, number];

/** Worst-case reconstruction error in 8-bit codes, optionally restricted to colours under a chroma. */
export declare function measureLutError(
  size: number,
  steps?: number,
  maxChroma?: number,
): { readonly worstError: number; readonly meanError: number };

/** Serialises a table as a `.cube` file. */
export declare function serialiseCube(
  size: number,
  data: Uint8Array,
  title: string,
  decimals?: number,
): string;
