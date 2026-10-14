/**
 * Types for `geometry.mjs`, so the pipeline's rules can be unit-tested from TypeScript.
 *
 * The implementation is plain ESM because it runs under Node as a build step, not in the bundle;
 * the tests that exercise it are TypeScript like the rest of the suite, and this is what lets them
 * import it without giving up type checking.
 */
import type { Document, Material, Mesh, Primitive } from '@gltf-transform/core';

/** What merging position seams did to one primitive. */
export interface SeamMergeResult {
  /** Vertex count before the merge. */
  readonly before: number;
  /** Vertex count after the merge. */
  readonly after: number;
  /** Vertices that were duplicates of another vertex's position and were merged away. */
  readonly removed: number;
}

/**
 * Merges vertices that share a position, keeping the first occurrence's other attributes.
 *
 * @param tolerance Positions within this distance are treated as identical. Default `0`, which
 *   merges exactly-duplicated positions.
 */
export function mergePositionSeams(
  primitive: Primitive,
  options?: { tolerance?: number },
): SeamMergeResult;

/**
 * Copies a primitive's geometry into another document, wired to a material that already exists there.
 *
 * @param material Material already owned by the destination document, or `null` to leave it unset.
 */
export function copyPrimitiveInto(
  primitive: Primitive,
  document: Document,
  material: Material | null,
): Primitive;

/** Triangles in one mesh, counted across its primitives. */
export function countMeshTriangles(mesh: Mesh): number;
