/**
 * Which level of detail a model should be showing at a given distance.
 *
 * Kept as a pure function, apart from the loader and the renderer, because this is the rule the
 * whole streamed world will lean on: hundreds of props, each choosing a level every frame, and a
 * mistake here is a visible popping artefact or a frame-time spike rather than a crash. It is worth
 * being able to test it directly.
 *
 * The thresholds are expressed as multiples of the model's own bounding radius rather than as fixed
 * metres, because the same rule has to serve a 0.4 m stone and a 12 m rock face. A prop that fills
 * the same share of the screen costs the same to draw, so the switch should happen at the same
 * *apparent* size — and apparent size scales with the object.
 */

/** One level of detail, as the manifest describes it and the runtime resolves it. */
export interface LodLevel {
  /** Index in the chain: 0 is the closest, most detailed level. */
  readonly level: number;
  /** Name of the node in the GLB that carries this level's mesh. */
  readonly node: string;
  /** Triangles in this level, for the budget ledger and the readout. */
  readonly triangles: number;
  /** Whether the derivation merged position seams to reach this level. */
  readonly seamMerged: boolean;
}

/**
 * Distance at which the chain hands over to the next level, as a multiple of the model's bounding
 * radius: level 0 up to 12 radii, level 1 to 24, and the last level from there on.
 *
 * Twelve radii is a compromise the numbers support: a prop at twelve times its own radius covers
 * roughly a twelfth of its closest-view size, which is where a 26k-triangle rock and a 10k-triangle
 * rock first stop being distinguishable at 1080p. The table is deliberately shorter than the chain —
 * the final level is the fallback for everything beyond it, so the chain can grow without the table
 * having to.
 */
export const LOD_SWITCH_RADII: readonly number[] = [12, 24];

/**
 * Picks the level to draw at a given distance.
 *
 * @param levels The chain, closest level first. Order is the caller's contract; `resolveModelLevels`
 *   sorts what the manifest publishes into it.
 * @param distance Distance from the camera to the model's centre, in metres.
 * @param radius The model's bounding radius, in metres. A zero or non-finite radius collapses the
 *   thresholds onto the camera, which would pop the model straight to its cheapest level; the guard
 *   below treats that as "unknown size" and stays at the closest level instead — the failure mode of
 *   guessing wrong in the other direction (too many triangles drawn, never a visible pop) is the one
 *   a player would not notice. A *distance* that is infinite or `NaN` is not guarded: an infinite
 *   distance correctly means "as far as possible", and a `NaN` fails every comparison and therefore
 *   stays on the closest level, which is the same conservative outcome.
 */
export function selectLodLevel(
  levels: readonly LodLevel[],
  distance: number,
  radius: number,
): LodLevel | null {
  if (levels.length === 0) {
    return null;
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    return levels[0] ?? null;
  }

  let index = 0;
  while (index < LOD_SWITCH_RADII.length && distance >= (LOD_SWITCH_RADII[index] ?? 0) * radius) {
    index += 1;
  }
  return levels[Math.min(index, levels.length - 1)] ?? null;
}

/** Distance, in metres, at which a level hands over to the next one. Exposed for tests and tooling. */
export function lodSwitchDistance(level: number, radius: number): number {
  return (LOD_SWITCH_RADII[level] ?? Number.POSITIVE_INFINITY) * radius;
}
