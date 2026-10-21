import { describe, expect, it } from 'vitest';

import { GROUND_COVER_CONFIG, GROUND_COVER_STYLES } from '../../src/config/ground-cover';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { URBAN_CITY_CONFIG } from '../../src/config/urban-city';
import {
  buildGroundCoverGeometry,
  generateChunkGroundCover,
  resolveGroundCoverStyle,
} from '../../src/world/ground-cover';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

describe('Phase 5 ground-cover scatter', () => {
  const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);

  it('selects district-aware microdetail styles inside the existing total tier pool', () => {
    expect(resolveGroundCoverStyle('kuroha-jungle', 0, 0.1)).toBe('fern');
    expect(resolveGroundCoverStyle('sakura-avenue', 0, 0.1)).toBe('wildflower');
    expect(resolveGroundCoverStyle('west-highlands', 0.8, 0.1)).toBe('stone');
    expect(resolveGroundCoverStyle(undefined, 0, 0.9)).toBe('grass');
    for (const tier of ['C', 'B', 'A'] as const) {
      const styleBudget = GROUND_COVER_STYLES.reduce(
        (total, style) => total + GROUND_COVER_CONFIG.styleInstanceBudgetByTier[tier][style],
        0,
      );
      expect(styleBudget).toBe(GROUND_COVER_CONFIG.instanceBudgetByTier[tier]);
    }
    for (const style of GROUND_COVER_STYLES) {
      const geometry = buildGroundCoverGeometry(style);
      expect(geometry.boundingBox?.max.y).toBeLessThanOrEqual(
        GROUND_COVER_CONFIG.maximumDetailHeightMeters,
      );
      expect(geometry.getAttribute('foliageMask')).toBeDefined();
      geometry.dispose();
    }
  });

  it('is deterministic, tier-scaled, and owned by exactly one chunk at borders', () => {
    const a = generateChunkGroundCover(sampler, 0, 0, 'A');
    const repeat = generateChunkGroundCover(sampler, 0, 0, 'A');
    const c = generateChunkGroundCover(sampler, 0, 0, 'C');
    const b = generateChunkGroundCover(sampler, 0, 0, 'B');
    const adjacent = generateChunkGroundCover(sampler, 1, 0, 'A');

    expect(a).toEqual(repeat);
    expect(a.length).toBeGreaterThan(0);
    expect(c.length).toBeLessThanOrEqual(b.length);
    expect(b.length).toBeLessThanOrEqual(a.length);
    const aKeys = new Set(a.map((placement) => `${placement.x},${placement.z}`));
    expect(adjacent.some((placement) => aKeys.has(`${placement.x},${placement.z}`))).toBe(false);
    for (const placement of a) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.x).toBeLessThan(TERRAIN_CONFIG.chunkSizeMeters);
      expect(placement.z).toBeGreaterThanOrEqual(0);
      expect(placement.z).toBeLessThan(TERRAIN_CONFIG.chunkSizeMeters);
      expect(Math.hypot(placement.x, placement.z)).toBeGreaterThanOrEqual(
        GROUND_COVER_CONFIG.spawnClearanceMeters,
      );
    }
  });

  it('keeps the rural clumps outside road shoulders, sidewalks, slopes, and the Aohara core', () => {
    const placements = generateChunkGroundCover(sampler, 0, 0, 'B');
    for (const placement of placements) {
      expect(sampler.normalAt(placement.x, placement.z).y).toBeGreaterThanOrEqual(
        GROUND_COVER_CONFIG.minimumNormalY,
      );
      const road = sampler.roadAt?.(placement.x, placement.z) ?? null;
      if (road !== null) {
        const urban = road.roadClass === 'urban-local' || road.roadClass === 'urban-arterial';
        const sidewalk = urban ? URBAN_CITY_CONFIG.sidewalk.widthMeters : 0;
        expect(road.distance).toBeGreaterThanOrEqual(
          road.halfWidthMeters +
            road.shoulderMeters +
            sidewalk +
            GROUND_COVER_CONFIG.roadEdgeClearanceMeters,
        );
      }
    }

    const aoharaChunk = generateChunkGroundCover(
      sampler,
      Math.floor(AOHARA_DISTRICT_CONFIG.centerX / TERRAIN_CONFIG.chunkSizeMeters),
      Math.floor(AOHARA_DISTRICT_CONFIG.centerZ / TERRAIN_CONFIG.chunkSizeMeters),
      'A',
    );
    expect(aoharaChunk).toHaveLength(0);
  });

  it('respects existing building footprints without changing their collision geometry', () => {
    const openLot = generateChunkGroundCover(sampler, 0, 0, 'A');
    const blockerPoint = openLot[0];
    if (blockerPoint === undefined) {
      throw new Error('the spawn-adjacent grass test chunk should produce scatter');
    }
    const blocked = generateChunkGroundCover(sampler, 0, 0, 'A', [
      {
        x: blockerPoint.x,
        z: blockerPoint.z,
        yaw: 0,
        halfWidth: 2.4,
        halfDepth: 2.4,
      },
    ]);
    expect(blocked).not.toContainEqual(blockerPoint);
    expect(blocked.length).toBeLessThan(openLot.length);
  });
});
