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

    await world.prepareInitial({ x: 0, y: 0, z: 0 });

    const stats = world.getContentStats();
    expect(stats.terrainChunksLoaded).toBe(9);
    expect(stats.terrainChunksDesired).toBe(9);
    expect(stats.terrainBuildsPending).toBe(0);
    expect(stats.terrainWorkerBacklog).toBe(0);
    world.dispose();
  });
});
