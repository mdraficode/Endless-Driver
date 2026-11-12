import { BufferGeometry, DoubleSide, InstancedMesh } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { afterEach, describe, expect, it } from 'vitest';

import { buildShardGeometry, buildSpeciesGeometry } from '../../src/world/vegetation';

import { VEGETATION_CONFIG } from '../../src/config/districts';
import { GROUND_COVER_CONFIG, GROUND_COVER_STYLES } from '../../src/config/ground-cover';
import { VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME } from '../../src/config/vegetation-streaming';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { resolveSeasonPresentation } from '../../src/environment/seasons';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { VegetationWorld } from '../../src/world/vegetation';
import { generateChunkVegetation } from '../../src/world/vegetation-placement';

/**
 * The renderer's mirror of destruction: hit events become bent springs,
 * stumps + falling crowns, and shard bursts — without a GPU, since instanced
 * matrices are plain data until something draws them.
 */
describe('vegetation destruction visuals', { timeout: 30_000 }, () => {
  it('prepares near foliage before play and leaves distant chunks for the streamer', async () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(sampler, { ...VEGETATION_CONFIG, radiusChunks: 3 });
    const progress: number[] = [];

    await world.prepareInitial({ x: -430, z: -1010 }, { x: 0, z: -50 }, (fraction) => {
      progress.push(fraction);
    });

    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    const completedChunkReports = progress.filter(
      (fraction, index) => index > 0 && fraction > (progress[index - 1] ?? 0),
    );
    // Only the spawn-adjacent chunk is prepared before play; the remaining 48 are streamed later.
    expect(completedChunkReports).toHaveLength(1);

    const stats = world.getContentStats();
    const leafyMesh = world.root.getObjectByName('vegetation-broadleaf-0');
    expect(leafyMesh).toBeInstanceOf(InstancedMesh);
    expect((leafyMesh as InstancedMesh).material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(
      ((leafyMesh as InstancedMesh).material as MeshStandardNodeMaterial).positionNode,
    ).not.toBeNull();
    expect(stats.vegetationWindAmplitudeMeters).toBe(0.065);
    expect(stats.vegetationChunks).toBe(1);
    expect(stats.vegetationChunksDesired).toBe(49);
    expect(stats.vegetationChunksPending).toBe(48);
    expect(stats.vegetationInstances).toBeGreaterThan(0);
    const groundCover = world.root.getObjectByName('ground-cover-grass');
    expect(groundCover).toBeInstanceOf(InstancedMesh);
    if (!(groundCover instanceof InstancedMesh)) {
      throw new Error('ground-cover scatter should be one instanced mesh');
    }
    expect(groundCover.count).toBeGreaterThan(0);
    expect(groundCover.count).toBeLessThanOrEqual(GROUND_COVER_CONFIG.instanceBudgetByTier.A);
    expect((groundCover.material as MeshStandardNodeMaterial).side).toBe(DoubleSide);
    expect((groundCover.material as MeshStandardNodeMaterial).positionNode).not.toBeNull();
    expect(stats.groundCoverGrassInstances).toBe(groundCover.count);
    let styleTotal = 0;
    for (const style of GROUND_COVER_STYLES) {
      const styleMesh = world.root.getObjectByName(`ground-cover-${style}`);
      expect(styleMesh).toBeInstanceOf(InstancedMesh);
      if (!(styleMesh instanceof InstancedMesh)) {
        throw new Error(`ground-cover ${style} should have a fixed instanced pool`);
      }
      const budget = GROUND_COVER_CONFIG.styleInstanceBudgetByTier.A[style];
      expect(styleMesh.count).toBeLessThanOrEqual(budget);
      expect(styleMesh.geometry.getAttribute('foliageMask')).toBeDefined();
      styleTotal += styleMesh.count;
    }
    expect(stats.groundCoverInstances).toBeDefined();
    expect(styleTotal).toBe(stats.groundCoverInstances!);
    expect(stats.groundCoverFernInstances).toBeDefined();
    expect(stats.groundCoverFernBudget).toBeDefined();
    expect(stats.groundCoverFernInstances!).toBeLessThanOrEqual(stats.groundCoverFernBudget!);
    expect(stats.groundCoverWildflowerInstances).toBeDefined();
    expect(stats.groundCoverWildflowerBudget).toBeDefined();
    expect(stats.groundCoverWildflowerInstances!).toBeLessThanOrEqual(
      stats.groundCoverWildflowerBudget!,
    );
    expect(stats.groundCoverStoneInstances).toBeDefined();
    expect(stats.groundCoverStoneBudget).toBeDefined();
    expect(stats.groundCoverStoneInstances!).toBeLessThanOrEqual(stats.groundCoverStoneBudget!);
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
    const groundCover = world.root.getObjectByName('ground-cover-grass');
    expect(groundCover).toBeInstanceOf(InstancedMesh);
    if (!(groundCover instanceof InstancedMesh)) {
      throw new Error('ground-cover scatter should be one instanced mesh');
    }
    expect((groundCover.material as MeshStandardNodeMaterial).positionNode).toBeNull();
    expect(world.getContentStats().groundCoverInstanceBudget).toBe(
      GROUND_COVER_CONFIG.instanceBudgetByTier.C,
    );
    expect(world.getContentStats().vegetationWindAmplitudeMeters).toBe(0);
    world.dispose();
  });

  it('spreads runtime chunk-generation work across C/B/A tier budgets', () => {
    expect(VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME).toEqual({ C: 1, B: 2, A: 3 });
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const focus = { x: -430, z: -1010 };

    for (const tier of ['C', 'B', 'A'] as const) {
      const world = new VegetationWorld(
        sampler,
        { ...VEGETATION_CONFIG, radiusChunks: 1 },
        tier === 'C' ? 0.6 : 1,
        tier,
      );
      world.updateStreaming(focus, { x: 0, z: 0 }, 1 / 60);
      expect(world.getContentStats()).toMatchObject({
        vegetationChunks: VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME[tier],
        vegetationChunkBuildBudgetPerFrame: VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME[tier],
      });
      world.dispose();
    }
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

/**
 * The `toNonIndexed` warning spam caught by the human-perspective bug hunt (2026-10-25):
 * vegetation builders de-indexed Icosahedron parts, but PolyhedronGeometry (and thus
 * IcosahedronGeometry) is already un-indexed, so every broadleaf/sakura canopy, rock,
 * and shatter shard logged a console warning — hundreds per world, visible to any player
 * who opens devtools. The guard must stay: geometry output is identical (un-indexed,
 * with baked colour + foliage mask), but no redundant de-index call may remain.
 */
describe('vegetation geometry de-index hygiene', () => {
  let spuriousCalls = 0;
  const originalToNonIndexed = BufferGeometry.prototype.toNonIndexed;

  afterEach(() => {
    BufferGeometry.prototype.toNonIndexed = originalToNonIndexed;
    spuriousCalls = 0;
  });

  it('never calls toNonIndexed on an already-un-indexed geometry, and output stays un-indexed', () => {
    BufferGeometry.prototype.toNonIndexed = function (this: BufferGeometry) {
      if (this.index === null) spuriousCalls += 1;
      return originalToNonIndexed.call(this);
    };

    for (const species of ['conifer', 'broadleaf', 'sakura', 'bamboo', 'rock'] as const) {
      for (let variant = 0; variant < 3; variant += 1) {
        const geometry = buildSpeciesGeometry(species, variant);
        expect(geometry.index).toBeNull();
        expect(geometry.getAttribute('color')).toBeDefined();
        expect(geometry.getAttribute('foliageMask')).toBeDefined();
        geometry.dispose();
      }
    }
    for (const kind of ['wood', 'leaf', 'blossom'] as const) {
      const geometry = buildShardGeometry(kind);
      expect(geometry.index).toBeNull();
      expect(geometry.getAttribute('color')).toBeDefined();
      geometry.dispose();
    }

    expect(spuriousCalls).toBe(0);
  });
});

/**
 * Reads the baked vertex colours of a geometry, keeping only the vertices the season tint
 * actually reaches (foliageMask > 0 — trunks and ground patches stay at their base colour).
 */
function readTintedVertexColors(object: unknown): number[] {
  const mesh = object as {
    geometry?: {
      getAttribute(name: string): {
        count: number;
        getX(i: number): number;
        getY(i: number): number;
        getZ(i: number): number;
      } | null;
    };
  };
  const attr = mesh.geometry?.getAttribute('color');
  const mask = mesh.geometry?.getAttribute('foliageMask');
  if (attr === null || attr === undefined || mask === null || mask === undefined) {
    throw new Error('expected baked vertex colours with a foliage mask');
  }
  const out: number[] = [];
  for (let i = 0; i < attr.count; i += 1) {
    if (mask.getX(i) <= 0) continue;
    out.push(attr.getX(i), attr.getY(i), attr.getZ(i));
  }
  return out;
}

describe('live season re-tint', () => {
  it('re-bakes the live geometries when the season switches and leaves placement untouched', async () => {
    const AUTUMN = resolveSeasonPresentation('autumn');
    const WINTER = resolveSeasonPresentation('winter');
    const SPRING = resolveSeasonPresentation('spring');
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(
      sampler,
      { ...VEGETATION_CONFIG, radiusChunks: 3 },
      undefined,
      'A',
      { foliage: AUTUMN.foliageTint, ground: AUTUMN.groundTint },
    );
    await world.prepareInitial({ x: -430, z: -1010 }, { x: 0, z: -50 }, () => {});

    const leafy = world.root.getObjectByName('vegetation-broadleaf-0');
    const grass = world.root.getObjectByName('ground-cover-grass');
    expect(leafy).not.toBeNull();
    expect(grass).not.toBeNull();
    const leavesBefore = readTintedVertexColors(leafy);
    const grassBefore = readTintedVertexColors(grass);
    const instancesBefore = world.getContentStats().vegetationInstances;

    // The tint is a multiplier on the base colours, so the switch rescales every baked
    // vertex by the winter/autumn factor — on foliage and on the ground cover.
    world.setSeasonTint({ foliage: WINTER.foliageTint, ground: WINTER.groundTint });
    const leavesAfter = readTintedVertexColors(leafy);
    const grassAfter = readTintedVertexColors(grass);
    expect(leavesAfter.length).toBe(leavesBefore.length);
    for (let i = 0; i < leavesAfter.length; i += 3) {
      expect(leavesAfter[i]!).toBeCloseTo(
        leavesBefore[i]! * (WINTER.foliageTint.r / AUTUMN.foliageTint.r),
        4,
      );
      expect(leavesAfter[i + 1]!).toBeCloseTo(
        leavesBefore[i + 1]! * (WINTER.foliageTint.g / AUTUMN.foliageTint.g),
        4,
      );
      expect(leavesAfter[i + 2]!).toBeCloseTo(
        leavesBefore[i + 2]! * (WINTER.foliageTint.b / AUTUMN.foliageTint.b),
        4,
      );
    }
    for (let i = 0; i < grassAfter.length; i += 3) {
      expect(grassAfter[i]!).toBeCloseTo(
        grassBefore[i]! * (WINTER.groundTint.r / AUTUMN.groundTint.r),
        4,
      );
    }
    // The switch re-tints: it never re-places or drops a single instance.
    expect(world.getContentStats().vegetationInstances).toBe(instancesBefore);

    // A third switch composes on the stored base colours, not on the last tint.
    world.setSeasonTint({ foliage: SPRING.foliageTint, ground: SPRING.groundTint });
    const leavesSpring = readTintedVertexColors(leafy);
    for (let i = 0; i < leavesSpring.length; i += 3) {
      expect(leavesSpring[i]!).toBeCloseTo(
        leavesBefore[i]! * (SPRING.foliageTint.r / AUTUMN.foliageTint.r),
        4,
      );
    }
    world.dispose();
  });
});
