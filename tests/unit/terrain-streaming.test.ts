import { describe, expect, it } from 'vitest';

import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { TerrainWorld } from '../../src/world/TerrainWorld';
import { createTerrainSampler } from '../../src/world/terrain-height';

describe('terrain startup preparation', () => {
  it('waits until the complete visual window is loaded before resolving', async () => {
    const config = {
      ...TERRAIN_CONFIG,
      viewRadiusChunks: 1,
      lodSegments: [8, 4, 2] as const,
      lodRingStarts: [0, 1, 2] as const,
      maxBuildsPerFrame: 2,
    };
    const world = new TerrainWorld(createTerrainSampler(config));
    const progress: number[] = [];

    await world.prepareInitial({ x: 0, y: 0, z: 0 }, undefined, (fraction) => {
      progress.push(fraction);
    });

    expect(progress[0]).toBeGreaterThanOrEqual(0);
    expect(progress[progress.length - 1]).toBe(1);
    expect(
      progress.some((fraction, index) => index > 0 && fraction > (progress[index - 1] ?? 0)),
    ).toBe(true);

    const stats = world.getContentStats();
    expect(stats.terrainChunksLoaded).toBe(9);
    expect(stats.terrainChunksDesired).toBe(9);
    expect(stats.terrainBuildsPending).toBe(0);
    expect(stats.terrainWorkerBacklog).toBe(0);
    expect(stats.terrainPlanBuilds).toBe(1);
    world.dispose();
  });

  it('reuses the desired plan while the hysteretic window stays put', () => {
    const config = {
      ...TERRAIN_CONFIG,
      viewRadiusChunks: 1,
      lodSegments: [8, 4, 2] as const,
      lodRingStarts: [0, 1, 2] as const,
      maxBuildsPerFrame: 1,
    };
    const world = new TerrainWorld(createTerrainSampler(config), {
      enableParallaxOcclusion: false,
    });

    world.updateStreaming({ x: 0, y: 0, z: 0 });
    world.updateStreaming({ x: 8, y: 0, z: 8 });

    const stats = world.getContentStats();
    expect(stats.terrainPlanBuilds).toBe(1);
    expect(stats.terrainPomConfigured).toBe(0);
    world.dispose();
  });
});
