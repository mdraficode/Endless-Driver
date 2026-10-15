import { BufferAttribute, BufferGeometry } from 'three';

import {
  terrainColorAt,
  terrainSurfaceWeights,
  terrainVariationAt,
  type TerrainSampler,
} from './terrain-height';

/**
 * Chunk mesh construction: a heightfield grid sampled from the world height function, plus
 * a skirt — a vertical curtain dropped from the border vertices.
 *
 * Two chunks built at different LODs do not share border vertices (the coarse one samples
 * the border at half the points), which would open T-junction cracks along every LOD
 * boundary, seen edge-on across a valley as flickering sky-coloured slits. The classic,
 * cheap answer is the skirt: extrude the border down by `skirtDepthMeters`, so any gap
 * shows the skirt's shaded underside instead of the sky. The skirt lives in the same
 * buffer, so it costs no extra draw call.
 *
 * Normals are derived from the sampled grid (with a one-cell halo sampled past the border)
 * rather than from the analytic sampler: they then describe the surface actually drawn,
 * and — because the halo values are the neighbour chunk's own interior samples — two
 * same-LOD neighbours compute identical normals along their shared edge. Combined with
 * bit-identical border heights from the shared sampler, the seam is invisible; the tests
 * pin both properties.
 */
/**
 * Raw chunk geometry as transferable arrays. This is the form the generation worker
 * produces (buffers cross the thread boundary zero-copy); the main thread only wraps
 * them into a `BufferGeometry`.
 */
export interface ChunkGeometryData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly splats: Float32Array;
  readonly tints: Float32Array;
  readonly indices: Uint32Array;
}

/** Pure chunk construction: sampler in, arrays out. No three.js, so it can run in a worker. */
export function buildChunkGeometryData(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  segments: number,
): ChunkGeometryData {
  const { config } = sampler;
  const size = config.chunkSizeMeters;
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const step = size / segments;
  const vertsPerEdge = segments + 1;
  const gridCount = vertsPerEdge * vertsPerEdge;
  // Skirt: one duplicated vertex per border vertex.
  const borderCount = segments * 4;

  // Height grid with a one-cell halo, so border normals use the same central differences
  // the neighbouring chunk computes for its interior.
  const haloEdge = vertsPerEdge + 2;
  const heights = new Float32Array(haloEdge * haloEdge);
  for (let j = 0; j < haloEdge; j += 1) {
    for (let i = 0; i < haloEdge; i += 1) {
      heights[j * haloEdge + i] = sampler.heightAt(
        originX + (i - 1) * step,
        originZ + (j - 1) * step,
      );
    }
  }
  const heightAtCell = (i: number, j: number): number => heights[(j + 1) * haloEdge + (i + 1)] ?? 0;

  const positions = new Float32Array((gridCount + borderCount) * 3);
  const normals = new Float32Array((gridCount + borderCount) * 3);
  const colors = new Float32Array((gridCount + borderCount) * 3);
  // [grass, soil, rock, snow] per vertex: the material blends scanned sets by these, and
  // they are the same weights the physics surface query mixes grip from.
  const splats = new Float32Array((gridCount + borderCount) * 4);
  // Macro tint around 1.0 (variation + curvature occlusion): the textured material
  // multiplies its detail by this, the flat material ignores it.
  const tints = new Float32Array(gridCount + borderCount);

  const writeVertex = (index: number, i: number, j: number, yOverride: number | null): void => {
    const height = heightAtCell(i, j);
    // Central differences on the sampled grid: the normal of the drawn surface.
    const dx = heightAtCell(i - 1, j) - heightAtCell(i + 1, j);
    const dz = heightAtCell(i, j - 1) - heightAtCell(i, j + 1);
    const invLength = 1 / Math.sqrt(dx * dx + 4 * step * step + dz * dz);
    const nx = dx * invLength;
    const ny = 2 * step * invLength;
    const nz = dz * invLength;
    const x = originX + i * step;
    const z = originZ + j * step;
    // Curvature occlusion from the halo grid: concave ground (valley floors, gullies)
    // darkens a little, convex crests lighten — cheap baked AO that survives every LOD
    // because it is derived from the heights themselves.
    const laplacian =
      (heightAtCell(i - 1, j) +
        heightAtCell(i + 1, j) +
        heightAtCell(i, j - 1) +
        heightAtCell(i, j + 1) -
        4 * height) /
      (step * step);
    const occlusion = Math.min(1.05, Math.max(0.84, 1 - laplacian * 1.1));
    const variation = terrainVariationAt(config, x, z);
    const color = terrainColorAt(config, height, 1 - ny, variation, occlusion);
    const weights = terrainSurfaceWeights(config, height, 1 - ny);
    positions[index * 3] = x;
    positions[index * 3 + 1] = yOverride ?? height;
    positions[index * 3 + 2] = z;
    normals[index * 3] = nx;
    normals[index * 3 + 1] = ny;
    normals[index * 3 + 2] = nz;
    colors[index * 3] = color[0];
    colors[index * 3 + 1] = color[1];
    colors[index * 3 + 2] = color[2];
    splats[index * 4] = weights[0];
    splats[index * 4 + 1] = weights[1];
    splats[index * 4 + 2] = weights[2];
    splats[index * 4 + 3] = weights[3];
    tints[index] = Math.min(1.06, Math.max(0.72, (0.9 + (variation + 1) * 0.06) * occlusion));
  };

  for (let j = 0; j < vertsPerEdge; j += 1) {
    for (let i = 0; i < vertsPerEdge; i += 1) {
      writeVertex(j * vertsPerEdge + i, i, j, null);
    }
  }

  // Border walk, counter-clockwise seen from above: top edge (j=0), right (i=segments),
  // bottom (j=segments, reversed), left (i=0, reversed). Each skirt vertex copies its grid
  // vertex, dropped by the skirt depth; normals keep the surface normal (the curtain is
  // almost never lit face-on, and a copied normal avoids a lighting cliff at the rim).
  const borderCell: Array<readonly [number, number]> = [];
  for (let i = 0; i < segments; i += 1) borderCell.push([i, 0]);
  for (let j = 0; j < segments; j += 1) borderCell.push([segments, j]);
  for (let i = segments; i > 0; i -= 1) borderCell.push([i, segments]);
  for (let j = segments; j > 0; j -= 1) borderCell.push([0, j]);
  borderCell.forEach(([i, j], borderIndex) => {
    writeVertex(gridCount + borderIndex, i, j, heightAtCell(i, j) - config.skirtDepthMeters);
  });

  const indexList: number[] = [];
  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = j * vertsPerEdge + i;
      const b = a + 1;
      const c = a + vertsPerEdge;
      const d = c + 1;
      indexList.push(a, c, b, b, c, d);
    }
  }
  for (let b = 0; b < borderCount; b += 1) {
    const next = (b + 1) % borderCount;
    const [ai, aj] = borderCell[b] ?? [0, 0];
    const [bi, bj] = borderCell[next] ?? [0, 0];
    const topA = aj * vertsPerEdge + ai;
    const topB = bj * vertsPerEdge + bi;
    const skirtA = gridCount + b;
    const skirtB = gridCount + next;
    indexList.push(topA, skirtA, topB, topB, skirtA, skirtB);
  }

  return {
    positions,
    normals,
    colors,
    splats,
    tints,
    indices: Uint32Array.from(indexList),
  };
}

/** Wraps raw chunk data (main-thread or worker-produced) into a renderable geometry. */
export function chunkGeometryFromData(data: ChunkGeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.setAttribute('splat', new BufferAttribute(data.splats, 4));
  geometry.setAttribute('tint', new BufferAttribute(data.tints, 1));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildChunkGeometry(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  segments: number,
): BufferGeometry {
  return chunkGeometryFromData(buildChunkGeometryData(sampler, chunkX, chunkZ, segments));
}
