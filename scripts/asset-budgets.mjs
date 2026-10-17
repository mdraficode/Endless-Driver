/**
 * Per-asset budgets for derived models.
 *
 * One source of truth, imported by three places that must agree: `scripts/build-models.mjs` (which
 * refuses to write an asset that exceeds its budget), `scripts/verify-assets.mjs` (which re-checks
 * the committed manifest offline in CI), and `tests/unit/asset-budgets.test.ts` (which asserts the
 * committed set is within budget). A budget that only the builder knows about is a budget that a
 * hand-edited manifest can quietly break.
 *
 * The numbers are chosen from what the asset actually has to do in the world, not from what it
 * happens to weigh:
 *
 * - **Triangle ceiling.** A prop the player passes at 60 km/h is on screen for a couple of seconds
 *   and is never the subject. It does not need a hero mesh's density; what it needs is to not be the
 *   thing that makes a streamed chunk hitch.
 * - **Byte ceiling.** Phase 4 streams chunks over a network. A chunk holds many props, so a
 *   per-prop ceiling is what keeps a chunk load inside a frame or two on a modest connection.
 * - **Texture size.** 1024 is the resolution the world is authored at (`docs/ASSET_SOURCES.md`); a
 *   single scanned prop must not be the reason the GPU holds a 4K texture set.
 *
 * These are deliberately tight enough to be *checkable* rather than aspirational, and the first
 * model through the pipeline is expected to strain them.
 */

/** Budget class names, referenced by the manifest's `assetClass` field. */
export const MODEL_BUDGETS = {
  /**
   * A scenic prop: rocks, plants, street furniture. Seen at a distance, never inspected up close.
   */
  prop: {
    maxBytes: 2_500_000,
    maxTriangles: 60_000,
    maxTextureSize: 1024,
    minLods: 2,
    maxLods: 3,
  },
  /**
   * A scanned tree: the dominant silhouette of the world, seen from every distance at once —
   * roadside at 5 m and a hillside forest at 300 m in the same frame. Three levels are the
   * minimum that covers that range without a visible switch, and the triangle ceiling is what
   * a chunk of forest can carry: VISUAL_TARGET.md §3 budgets the whole vegetation system at
   * 200k triangles on the top tier, so a single tree may not ask for a fifth of that at LOD0.
   */
  tree: {
    maxBytes: 4_500_000,
    maxTriangles: 40_000,
    maxTextureSize: 1024,
    minLods: 3,
    maxLods: 3,
    /**
     * Absolute per-level triangle targets. Scanned trees arrive at 1.6-7 million triangles,
     * where a ratio of the source is meaningless (0.8 of a fir is still 3.3 million); the tree
     * class therefore names its levels in triangles and the builder derives a per-source ratio
     * from them. The numbers are what a conifer silhouette needs at each switch distance:
     * full shape near, crown mass mid, a recognisable cone far.
     */
    lodTriangles: [20_000, 3_000, 450],
  },
};

/**
 * How each level of detail is simplified, as a fraction of the source triangles.
 *
 * Two rules are baked into these numbers, both earned by measurement rather than taste:
 *
 * - **The closest level keeps its seams.** Levels that preserve UV/normal seams top out at about 82%
 *   of the source before the simplifier runs out of collapsible edges, whatever error budget it is
 *   given, so 0.8 is the honest target for LOD0 rather than an aspiration. It is also the level
 *   where seam merging would be visible.
 * - **Deeper levels merge seams first**, which is what lets them actually reach their ratio instead
 *   of stalling. They are only ever seen from a distance, where a merged seam cannot be resolved.
 */
export const MODEL_LOD_RATIOS = [0.8, 0.4, 0.16];

/**
 * Simplification error ceiling, passed to meshoptimizer. The ratio is a target and this is the
 * limit: simplification stops at whichever comes first. 0.01 is about one per cent of the mesh's
 * own scale, comfortably below what is visible at the distances these levels are used at.
 */
export const MODEL_SIMPLIFY_ERROR = 0.01;

/** Texture cap and encode quality applied to every derived model texture. */
export const MODEL_TEXTURE = {
  /** Longest edge, in pixels, after resizing. */
  maxSize: 1024,
  /**
   * ETC1S quality, 1–255. Lower packs harder and loses more; 160 is the point where scanned rock and
   * concrete still read correctly at gameplay distances while the file stays small.
   */
  etc1sQuality: 160,
  /** JPEG quality used for the intermediate resize before Basis encoding. */
  intermediateJpegQuality: 92,
};

/** Looks up a budget, failing loudly rather than defaulting to "unlimited". */
export function requireBudget(assetClass) {
  const budget = MODEL_BUDGETS[assetClass];
  if (!budget) {
    throw new Error(
      `no budget is defined for asset class "${assetClass}"; add one to scripts/asset-budgets.mjs`,
    );
  }
  return budget;
}

/** Formats bytes for build output and test failure messages. */
export function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(0)} kB`;
  return `${bytes} B`;
}
