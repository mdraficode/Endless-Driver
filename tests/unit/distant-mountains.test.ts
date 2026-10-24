import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';

import {
  DISTANT_MOUNTAIN_MESH_CONFIG,
  DISTANT_MOUNTAIN_RANGES,
} from '../../src/config/distant-mountains';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { buildDistantMountainGeometry, DistantMountainWorld } from '../../src/world/distant-mountains';

const sampler = createTerrainSampler(TERRAIN_CONFIG);

function readYBounds(geometry: ReturnType<typeof buildDistantMountainGeometry>): [number, number] {
  const positions = geometry.getAttribute('position');
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.count; index += 1) {
    minY = Math.min(minY, positions.getY(index));
    maxY = Math.max(maxY, positions.getY(index));
  }
  return [minY, maxY];
}

describe('distant mountain horizon', () => {
  it('builds deterministic, finite ridges with varied terrain-seated profiles', () => {
    for (const range of DISTANT_MOUNTAIN_RANGES) {
      const first = buildDistantMountainGeometry(sampler, range);
      const second = buildDistantMountainGeometry(sampler, range);
      const positions = first.getAttribute('position');
      const colors = first.getAttribute('color');
      const [minY, maxY] = readYBounds(first);
      const [sameMinY, sameMaxY] = readYBounds(second);

      expect(positions.count).toBe(
        (DISTANT_MOUNTAIN_MESH_CONFIG.alongSegments + 1) *
          (DISTANT_MOUNTAIN_MESH_CONFIG.crossSegments + 1),
      );
      expect(colors.count).toBe(positions.count);
      expect(first.index?.count).toBe(
        DISTANT_MOUNTAIN_MESH_CONFIG.alongSegments *
          DISTANT_MOUNTAIN_MESH_CONFIG.crossSegments *
          6,
      );
      expect(first.getAttribute('position').array).toEqual(second.getAttribute('position').array);
      expect([minY, maxY]).toEqual([sameMinY, sameMaxY]);
      expect(maxY - minY).toBeGreaterThan(range.heightMeters * 0.55);
      for (let index = 0; index < positions.count; index += 1) {
        expect(Number.isFinite(positions.getX(index))).toBe(true);
        expect(Number.isFinite(positions.getY(index))).toBe(true);
        expect(Number.isFinite(positions.getZ(index))).toBe(true);
        expect(colors.getX(index)).toBeGreaterThan(0);
        expect(colors.getY(index)).toBeGreaterThan(0);
        expect(colors.getZ(index)).toBeGreaterThan(0);
      }
      first.dispose();
      second.dispose();
    }
  });

  it('mounts a small, shared-material mountain layer in the driving content', () => {
    const mountains = new DistantMountainWorld(sampler);
    expect(mountains.root.name).toBe('DistantMountainWorld');
    expect(mountains.root.children).toHaveLength(DISTANT_MOUNTAIN_RANGES.length);
    expect(mountains.getContentStats()).toMatchObject({
      distantMountainRanges: DISTANT_MOUNTAIN_RANGES.length,
      distantMountainVertices:
        DISTANT_MOUNTAIN_RANGES.length *
        (DISTANT_MOUNTAIN_MESH_CONFIG.alongSegments + 1) *
        (DISTANT_MOUNTAIN_MESH_CONFIG.crossSegments + 1),
    });
    for (const child of mountains.root.children) {
      expect(child).toBeInstanceOf(Mesh);
      if (!(child instanceof Mesh)) {
        throw new Error('each distant ridge should be a mesh');
      }
      expect(child.castShadow).toBe(false);
      expect(child.receiveShadow).toBe(false);
    }
  });
});
