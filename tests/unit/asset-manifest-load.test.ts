import { Texture, TextureLoader } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadMaterialTextureSet, type AssetManifest } from '../../src/assets/AssetManifest';

const MANIFEST: AssetManifest = {
  schemaVersion: 1,
  assets: [
    {
      id: 'test-surface',
      kind: 'material',
      name: 'Test surface',
      assetClass: 'material',
      source: {
        url: 'https://example.invalid',
        creator: 'Test',
        licence: 'CC0-1.0',
        attribution: '',
        retrieved: '2026-10-25',
      },
      role: 'Unit-test fixture',
      files: ['diffuse', 'normal', 'arm', 'height'].map((slot) => ({
        slot,
        path: `assets/${slot}.png`,
        bytes: 1,
        sha256: '0'.repeat(64),
        colourSpace: slot === 'diffuse' ? 'srgb' : 'linear',
        format: 'png',
      })),
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('startup surface loading', () => {
  it('requests all maps for a material set concurrently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MANIFEST,
      } as Response),
    );

    const resolveTextures: Array<(texture: Texture) => void> = [];
    const loadTexture = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(
      () =>
        new Promise<Texture>((resolve) => {
          resolveTextures.push(resolve);
        }),
    );

    const pendingSet = loadMaterialTextureSet('test-surface', 'test-manifest.json');
    // Let manifest reading settle. With sequential slot loading only the diffuse request would
    // exist here; concurrent startup should have all four requests in flight together.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(loadTexture).toHaveBeenCalledTimes(4);
    expect(resolveTextures).toHaveLength(4);

    for (const resolve of resolveTextures) {
      resolve(new Texture());
    }
    const set = await pendingSet;
    expect(set?.id).toBe('test-surface');
    set?.dispose();
  });
});
