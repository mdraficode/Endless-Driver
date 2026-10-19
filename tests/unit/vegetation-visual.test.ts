import { InstancedMesh } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import { VEGETATION_CONFIG } from '../../src/config/districts';
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
  it('prepares every chunk in the starting foliage window before drawing', async () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(sampler, { ...VEGETATION_CONFIG, radiusChunks: 1 });

    await world.prepareInitial({ x: -430, z: -1010 }, { x: 0, z: -50 });

    const stats = world.getContentStats();
    const leafyMesh = world.root.getObjectByName('vegetation-broadleaf-0');
    expect(leafyMesh).toBeInstanceOf(InstancedMesh);
    expect((leafyMesh as InstancedMesh).material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(
      ((leafyMesh as InstancedMesh).material as MeshStandardNodeMaterial).positionNode,
    ).not.toBeNull();
    expect(stats.vegetationWindAmplitudeMeters).toBe(0.065);
    expect(stats.vegetationChunks).toBe(9);
    expect(stats.vegetationChunksDesired).toBe(9);
    expect(stats.vegetationChunksPending).toBe(0);
    expect(stats.vegetationInstances).toBeGreaterThan(0);
    world.dispose();
  });

  it('omits the wind position node on the constrained C tier', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(sampler, VEGETATION_CONFIG, 0.6, 'C');
    const leafyMesh = world.root.getObjectByName('vegetation-broadleaf-0');

    expect(leafyMesh).toBeInstanceOf(InstancedMesh);
    expect(
      ((leafyMesh as InstancedMesh).material as MeshStandardNodeMaterial).positionNode,
    ).toBeNull();
    expect(world.getContentStats().vegetationWindAmplitudeMeters).toBe(0);
    world.dispose();
  });

  it('turns snap/shatter events into stumps and debris', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(sampler);
    const focus = { x: -430, z: -1010 };
    for (let frame = 0; frame < 40; frame += 1) {
      world.updateStreaming(focus, { x: 0, z: 0 }, 1 / 60);
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
        absorbedSpeed: 6.7,
        reactionImpulseNs: 8040,
        reactionSpeed: 7,
      },
    ]);
    const afterSnap = world.getContentStats();
    expect(afterSnap.vegetationSnapped).toBe(1);
    expect(afterSnap.vegetationStumps).toBeGreaterThanOrEqual(1);
    expect(afterSnap.vegetationDebris).toBe(1); // the falling crown

    // The crown falls: after simulated seconds it is still tracked, then the
    // pool keeps it resting (age < lifetime), count stable.
    for (let frame = 0; frame < 120; frame += 1) {
      world.updateStreaming(focus, { x: 0, z: 0 }, 1 / 30);
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
        absorbedSpeed: 9.3,
        reactionImpulseNs: 11160,
        reactionSpeed: 10,
      },
    ]);
    const afterShatter = world.getContentStats();
    expect(afterShatter.vegetationShattered).toBe(1);
    expect(afterShatter.vegetationDebris).toBeGreaterThan(5); // shards + crown
    world.dispose();
  });
});
