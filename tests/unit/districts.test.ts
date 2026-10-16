import { describe, expect, it } from 'vitest';

import { DISTRICTS } from '../../src/config/districts';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { districtAt, speciesMultipliersAt } from '../../src/world/districts';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { generateChunkVegetation } from '../../src/world/vegetation';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';

/**
 * Districts and their vegetation, pinned as pure functions of the eternal map:
 * the resolver's falloff behaviour, and the scatter rules (never on the road,
 * never on the spawn pad, nothing leafy above the treeline, cedar country
 * denser than farmland). Placement must be a function of position alone —
 * same chunk in, same forest out, forever.
 */

const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);

describe('district resolver', () => {
  it('has unique, well-formed districts', () => {
    const ids = new Set(DISTRICTS.map((district) => district.id));
    expect(ids.size).toBe(DISTRICTS.length);
    for (const district of DISTRICTS) {
      expect(district.radiusMeters).toBeGreaterThan(100);
      expect(Number.isFinite(district.centerX)).toBe(true);
    }
  });

  it('is full-strength at a district core and background far away', () => {
    const cedar = DISTRICTS.find((district) => district.id === 'Kiri-cedar')!;
    const atCore = speciesMultipliersAt(cedar.centerX, cedar.centerZ);
    expect(atCore.conifer).toBeCloseTo(cedar.speciesDensity.conifer!, 5);
    const far = speciesMultipliersAt(4000, 4000);
    expect(far).toEqual({ conifer: 1, broadleaf: 1, sakura: 1, bamboo: 1, rock: 1 });
    expect(districtAt(cedar.centerX, cedar.centerZ)?.id).toBe('Kiri-cedar');
    expect(districtAt(4000, 4000)).toBeNull();
  });
});

describe('vegetation placement', () => {
  it('is deterministic: same chunk, same placements', () => {
    const a = generateChunkVegetation(sampler, -4, -8);
    const b = generateChunkVegetation(sampler, -4, -8);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('never plants in the road corridor or on the spawn pad', () => {
    const junctionChunk = generateChunkVegetation(sampler, 0, -2);
    for (const placement of junctionChunk) {
      const road = sampler.roadAt!(placement.x, placement.z);
      if (road !== null) {
        expect(road.distance).toBeGreaterThanOrEqual(7.5);
      }
    }
    const spawnChunk = generateChunkVegetation(sampler, 0, 0);
    for (const placement of spawnChunk) {
      expect(Math.hypot(placement.x, placement.z)).toBeGreaterThanOrEqual(55);
    }
  });

  it('keeps trees below the treeline on the volcano', () => {
    // Chunk containing the high volcano slopes (summit ~300 m).
    const high = generateChunkVegetation(sampler, -12, -17);
    for (const placement of high) {
      if (placement.species !== 'rock') {
        expect(placement.y).toBeLessThanOrEqual(150);
      }
    }
  });

  it('grows a denser cedar forest than farmland', () => {
    const cedarChunk = generateChunkVegetation(sampler, -4, -8); // at the pass
    const fieldChunk = generateChunkVegetation(sampler, 0, 5); // south fields
    const conifers = cedarChunk.filter((p) => p.species === 'conifer').length;
    const fieldTrees = fieldChunk.filter((p) => p.species !== 'rock').length;
    expect(conifers).toBeGreaterThan(12);
    expect(conifers).toBeGreaterThan(fieldTrees);
  });
});
