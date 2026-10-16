import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { VegetationWorld } from '../../src/world/vegetation';
import { generateChunkVegetation } from '../../src/world/vegetation-placement';

/**
 * The renderer's mirror of destruction: hit events become bent springs,
 * stumps + falling crowns, and shard bursts — without a GPU, since instanced
 * matrices are plain data until something draws them.
 */
describe('vegetation destruction visuals', () => {
  it('turns snap/shatter events into stumps and debris', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(sampler);
    const focus = { x: -430, z: -1010 };
    for (let frame = 0; frame < 40; frame += 1) {
      world.updateStreaming(focus, 1 / 60);
    }
    const before = world.getContentStats();
    expect(before.vegetationInstances).toBeGreaterThan(500);

    const tree = generateChunkVegetation(sampler, -4, -8).find((p) => p.species === 'conifer')!;
    world.applyHits([
      {
        key: tree.key,
        species: tree.species,
        variant: tree.variant,
        x: tree.x,
        y: tree.y,
        z: tree.z,
        scale: tree.scale,
        rotationY: tree.rotationY,
        outcome: 'snap',
        impactSpeed: 9,
        dirX: 0,
        dirZ: -1,
        leanAngleRad: 0,
      },
    ]);
    const afterSnap = world.getContentStats();
    expect(afterSnap.vegetationSnapped).toBe(1);
    expect(afterSnap.vegetationStumps).toBeGreaterThanOrEqual(1);
    expect(afterSnap.vegetationDebris).toBe(1); // the falling crown

    // The crown falls: after simulated seconds it is still tracked, then the
    // pool keeps it resting (age < lifetime), count stable.
    for (let frame = 0; frame < 120; frame += 1) {
      world.updateStreaming(focus, 1 / 30);
    }
    expect(world.getContentStats().vegetationDebris).toBe(1);

    const other = generateChunkVegetation(sampler, -4, -8).find((p) => p.species === 'broadleaf')!;
    world.applyHits([
      {
        key: other.key,
        species: other.species,
        variant: other.variant,
        x: other.x,
        y: other.y,
        z: other.z,
        scale: other.scale,
        rotationY: other.rotationY,
        outcome: 'shatter',
        impactSpeed: 16,
        dirX: 0,
        dirZ: -1,
        leanAngleRad: 0,
      },
    ]);
    const afterShatter = world.getContentStats();
    expect(afterShatter.vegetationShattered).toBe(1);
    expect(afterShatter.vegetationDebris).toBeGreaterThan(5); // shards + crown
    world.dispose();
  });
});
