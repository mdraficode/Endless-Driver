import { RepeatWrapping, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { MaterialTextureSet } from '../../src/assets/AssetManifest';
import {
  configureTiledSurface,
  SurfaceTextureLibrary,
} from '../../src/assets/SurfaceTextureLibrary';

function createSet(dispose = vi.fn()): MaterialTextureSet {
  return {
    id: 'test-surface',
    name: 'Test surface',
    licence: 'CC0-1.0',
    creator: 'Test creator',
    diffuse: new Texture(),
    normal: new Texture(),
    arm: new Texture(),
    height: null,
    dispose,
  };
}

describe('per-world scanned surface ownership', () => {
  it('coalesces concurrent loads and disposes its shared set exactly once', async () => {
    const set = createSet();
    const loadSet = vi.fn().mockResolvedValue(set);
    const library = new SurfaceTextureLibrary(loadSet);

    const first = library.load('tex-concrete');
    const second = library.load('tex-concrete');
    expect(loadSet).toHaveBeenCalledTimes(1);
    const [firstSet, secondSet] = await Promise.all([first, second]);
    expect(firstSet).toBe(set);
    expect(secondSet).toBe(set);

    library.dispose();
    library.dispose();
    expect(set.dispose).toHaveBeenCalledTimes(1);
    await expect(library.load('tex-concrete')).resolves.toBeNull();
    expect(loadSet).toHaveBeenCalledTimes(1);
  });

  it('releases a set that finishes loading after its world is disposed', async () => {
    const set = createSet();
    let resolveLoad: ((value: MaterialTextureSet | null) => void) | undefined;
    const loadPromise = new Promise<MaterialTextureSet | null>((resolve) => {
      resolveLoad = resolve;
    });
    const library = new SurfaceTextureLibrary(vi.fn().mockReturnValue(loadPromise));
    const pending = library.load('tex-concrete');

    library.dispose();
    resolveLoad?.(set);

    await expect(pending).resolves.toBeNull();
    expect(set.dispose).toHaveBeenCalledOnce();
  });

  it('enables repeat sampling without lowering the requested anisotropy', () => {
    const set = createSet();
    set.diffuse.anisotropy = 12;
    configureTiledSurface(set, 8);

    for (const map of [set.diffuse, set.normal, set.arm]) {
      expect(map.wrapS).toBe(RepeatWrapping);
      expect(map.wrapT).toBe(RepeatWrapping);
      expect(map.version).toBeGreaterThan(0);
    }
    expect(set.diffuse.anisotropy).toBe(12);
    expect(set.normal.anisotropy).toBe(8);
    set.diffuse.dispose();
    set.normal.dispose();
    set.arm?.dispose();
  });
});
