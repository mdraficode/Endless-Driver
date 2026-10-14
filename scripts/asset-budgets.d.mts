/**
 * Types for `asset-budgets.mjs`, so the budgets can be asserted on from the TypeScript test suite.
 */
/** A per-asset-class budget. */
export interface ModelBudget {
  readonly maxBytes: number;
  readonly maxTriangles: number;
  readonly maxTextureSize: number;
  readonly minLods: number;
  readonly maxLods: number;
}

/** Budgets by asset class name. */
export declare const MODEL_BUDGETS: Readonly<Record<string, ModelBudget>> & {
  readonly prop: ModelBudget;
};

/** Simplification ratio per level of detail, closest first. */
export declare const MODEL_LOD_RATIOS: readonly number[];

/** Simplification error ceiling passed to meshoptimizer. */
export declare const MODEL_SIMPLIFY_ERROR: number;

/** Texture handling applied to every derived model. */
export declare const MODEL_TEXTURE: {
  readonly maxSize: number;
  readonly etc1sQuality: number;
  readonly intermediateJpegQuality: number;
};

/** Looks up a budget, throwing rather than falling back to "unlimited". */
export declare function requireBudget(assetClass: string): ModelBudget;

/** Formats byte counts for build output and test failures. */
export declare function formatBytes(bytes: number): string;
