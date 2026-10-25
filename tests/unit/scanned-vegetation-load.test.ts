import { BufferGeometry, MeshStandardMaterial } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { VEGETATION_CONFIG } from '../../src/config/districts';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { VegetationWorld } from '../../src/world/vegetation';

const { loadScannedSpeciesMock } = vi.hoisted(() => ({ loadScannedSpeciesMock: vi.fn() }));
vi.mock('../../src/world/scanned-vegetation', () => ({
  loadScannedSpecies: loadScannedSpeciesMock,
}));

beforeEach(() => {
  loadScannedSpeciesMock
    .mockReset()
    .mockImplementation(async (_renderer: object, assetId: string) => ({
      id: assetId,
      height: 10,
      lods: [
        {
          level: 0,
          parts: [{ geometry: new BufferGeometry(), material: new MeshStandardMaterial() }],
        },
      ],
    }));
});

describe('scanned vegetation startup loading', () => {
  it('loads each unique scanned model once, even when several scatter variants share it', async () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const world = new VegetationWorld(sampler, { ...VEGETATION_CONFIG, radiusChunks: 1 });

    await world.adoptScanned({});

    const loadedAssetIds = loadScannedSpeciesMock.mock.calls.map((call) => call[1] as string);
    expect(loadedAssetIds).toHaveLength(6);
    expect(new Set(loadedAssetIds).size).toBe(6);
    expect(loadedAssetIds).toContain('model-tree-stump-01');

    world.dispose();
  });
});
