import type { TerrainConfig } from '../config/terrain';

/**
 * The streaming planner: pure chunk arithmetic shared by the visual streamer and the
 * physics collider window.
 *
 * Keeping this pure (no three.js, no Rapier) is what makes the Phase 4 acceptance criteria
 * testable headlessly: "the planner asks for the right chunks, at the right LODs, around
 * any focus" is a unit test; "the loaded set matches the plan inside a per-frame build
 * budget" is another. The stateful streamers consume plans; they do not improvise them.
 */
export interface ChunkCoord {
  readonly cx: number;
  readonly cz: number;
}

export interface PlannedChunk extends ChunkCoord {
  /** Chebyshev distance from the focus chunk: 0 is the chunk under the car. */
  readonly ring: number;
  /** Grid resolution this chunk should be built at, cells per edge. */
  readonly segments: number;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function chunkIndexAt(position: number, chunkSizeMeters: number): number {
  return Math.floor(position / chunkSizeMeters);
}

/** LOD for a ring: the finest ring start the ring has reached wins. */
export function segmentsForRing(config: TerrainConfig, ring: number): number {
  let segments = config.lodSegments[2];
  for (let tier = 0; tier < 3; tier += 1) {
    if (ring >= (config.lodRingStarts[tier] ?? 0)) {
      segments = config.lodSegments[tier] ?? segments;
    }
  }
  return segments;
}

/**
 * The chunks that should exist around a focus, nearest first. The load order matters: the
 * streamer spends its per-frame budget from the front of this list, so the ground under
 * the car always materialises before the horizon does.
 */
export function planChunks(config: TerrainConfig, focusX: number, focusZ: number): PlannedChunk[] {
  const size = config.chunkSizeMeters;
  const centerX = chunkIndexAt(focusX, size);
  const centerZ = chunkIndexAt(focusZ, size);
  const radius = config.viewRadiusChunks;
  const planned: PlannedChunk[] = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      planned.push({
        cx: centerX + dx,
        cz: centerZ + dz,
        ring,
        segments: segmentsForRing(config, ring),
      });
    }
  }
  planned.sort((a, b) => {
    if (a.ring !== b.ring) return a.ring - b.ring;
    const da = (a.cx - centerX) ** 2 + (a.cz - centerZ) ** 2;
    const db = (b.cx - centerX) ** 2 + (b.cz - centerZ) ** 2;
    return da - db;
  });
  return planned;
}

/** The physics window: chunk coords whose heightfield colliders should exist. */
export function planPhysicsChunks(
  config: TerrainConfig,
  focusX: number,
  focusZ: number,
): ChunkCoord[] {
  const size = config.chunkSizeMeters;
  const centerX = chunkIndexAt(focusX, size);
  const centerZ = chunkIndexAt(focusZ, size);
  const radius = config.physicsRadiusChunks;
  const planned: ChunkCoord[] = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      planned.push({ cx: centerX + dx, cz: centerZ + dz });
    }
  }
  return planned;
}
