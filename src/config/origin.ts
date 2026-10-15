/**
 * Floating-origin configuration (Phase 4, PROJECT_PLAN §5).
 *
 * The deterministic world is endless, but three.js and Rapier both compute in 32-bit
 * floats: past ~10 km from the origin, positions quantize coarsely enough that
 * vertices and physics contacts visibly jitter. The fix is to never let anything
 * get that far from *its* origin — the world keeps eternal world coordinates (the
 * sampler, chunk keys, bookmarks), while the physics/render spaces slide underneath
 * it by whole terrain chunks whenever the car strays past `rebaseDistanceMeters`.
 */
export interface OriginConfig {
  /**
   * Distance in metres from the current origin at which a rebase fires. Far enough
   * to be rare (at 40 m/s, worst case one rebase a minute), close enough that every
   * float32 computation stays millimetre-precise (2^-11 m steps at 4 km, and the
   * camera is never more than ~2.8 km diagonally from the origin).
   */
  readonly rebaseDistanceMeters: number;
  /**
   * Rebase shifts snap to this grid (metres) so chunk centres, heightfield colliders
   * and mesh placements stay exactly aligned with the eternal grid. Must equal the
   * terrain chunk size — pinned by test rather than assumed.
   */
  readonly gridMeters: number;
}

export const ORIGIN_CONFIG: OriginConfig = {
  rebaseDistanceMeters: 2048,
  gridMeters: 128,
};
