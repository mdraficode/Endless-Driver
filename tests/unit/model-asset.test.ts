import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createLoadedModel,
  disposeObject,
  resolveModelAsset,
  resolveModelLevels,
  type LoadedModel,
  type ModelAsset,
} from '../../src/assets/ModelAsset';
import type { AssetManifestEntry } from '../../src/assets/AssetManifest';
import manifest from '../../public/assets/manifest.json';

/**
 * Resolving a derived model: which nodes are the levels, and showing one without leaking the others.
 *
 * The file that exercises this in the browser is a real GLB with meshopt-compressed geometry and KTX2
 * textures, and none of that is needed to test the behaviour that matters here — a wrapper that finds
 * its level nodes and toggles exactly one of them visible. Building the tree by hand keeps the test
 * about the logic rather than about the loader, and lets it run without a renderer, a decoder, or a
 * network.
 */

const ENTRY: AssetManifestEntry = {
  id: 'model-test-prop',
  kind: 'model',
  name: 'Test prop',
  assetClass: 'prop',
  source: {
    url: 'https://example.invalid/model',
    creator: 'Nobody',
    licence: 'CC0-1.0',
    attribution: '',
    retrieved: '2026-01-01',
  },
  role: 'fixture',
  pipeline: {
    lods: [
      { level: 2, node: 'lod2', triangles: 1000, seamMerged: true },
      { level: 0, node: 'lod0', triangles: 9000, seamMerged: false },
      { level: 1, node: 'lod1', triangles: 4000, seamMerged: true },
    ],
  },
  files: [
    {
      slot: 'model',
      path: 'assets/models/test.glb',
      bytes: 1234,
      sha256: 'abc',
      colourSpace: 'mixed',
      format: 'glb',
    },
  ],
};

/** A stand-in for a loaded glTF scene: three level nodes, each with its own mesh. */
function createLevelTree(levels: readonly { node: string }[]): Group {
  const group = new Group();
  for (const { node } of levels) {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    mesh.name = node;
    group.add(mesh);
  }
  // A node that is not a level, as a real file has (the glTF scene root, empty parents, and so on).
  group.add(new Object3D());
  return group;
}

function createModel(asset: ModelAsset, tree: Group): LoadedModel {
  return createLoadedModel(asset, tree);
}

const ASSET: ModelAsset = {
  id: ENTRY.id,
  name: ENTRY.name,
  licence: 'CC0-1.0',
  creator: 'Nobody',
  sourceUrl: 'https://example.invalid/model',
  file: 'assets/models/test.glb',
  bytes: 1234,
  levels: resolveModelLevels(ENTRY),
};

describe('resolveModelLevels', () => {
  it('orders the chain by triangle count, closest first', () => {
    expect(resolveModelLevels(ENTRY).map((level) => level.level)).toEqual([0, 1, 2]);
  });

  it('sorts a manifest that listed its levels backwards', () => {
    const backwards = resolveModelLevels({
      ...ENTRY,
      pipeline: { lods: [...(ENTRY.pipeline?.lods ?? [])].reverse() },
    });
    expect(backwards.map((level) => level.triangles)).toEqual([9000, 4000, 1000]);
  });

  it('survives an entry with no pipeline section at all', () => {
    const withoutPipeline: AssetManifestEntry = {
      id: ENTRY.id,
      kind: ENTRY.kind,
      name: ENTRY.name,
      assetClass: ENTRY.assetClass,
      source: ENTRY.source,
      role: ENTRY.role,
      files: ENTRY.files,
    };
    expect(resolveModelLevels(withoutPipeline)).toEqual([]);
  });
});

describe('resolveModelAsset', () => {
  it('resolves the file, the licence, and the chain', () => {
    const asset = resolveModelAsset(ENTRY);
    expect(asset?.file).toBe('assets/models/test.glb');
    expect(asset?.bytes).toBe(1234);
    expect(asset?.licence).toBe('CC0-1.0');
    expect(asset?.levels).toHaveLength(3);
  });

  it('returns null for an entry with no files', () => {
    expect(resolveModelAsset({ ...ENTRY, files: [] })).toBeNull();
  });

  it('resolves every model the project actually publishes', () => {
    const models = manifest.assets.filter((asset) => asset.kind === 'model');
    expect(models.length).toBeGreaterThan(0);
    for (const entry of models) {
      const asset = resolveModelAsset(entry as AssetManifestEntry);
      expect(asset).not.toBeNull();
      expect(asset?.levels.length).toBeGreaterThanOrEqual(2);
      // The chain has to be strictly descending or selection is meaningless.
      const triangles = asset?.levels.map((level) => level.triangles) ?? [];
      for (let i = 1; i < triangles.length; i += 1) {
        expect(triangles[i]).toBeLessThan(triangles[i - 1] as number);
      }
    }
  });
});

describe('createLoadedModel', () => {
  it('starts on the closest level and hides the rest', () => {
    const model = createModel(ASSET, createLevelTree(ASSET.levels));
    expect(model.activeLevel).toBe(0);
    expect(visibleLevels(model)).toEqual(['lod0']);
  });

  it('shows exactly one level at a time', () => {
    const model = createModel(ASSET, createLevelTree(ASSET.levels));
    model.setLevel(2);
    expect(model.activeLevel).toBe(2);
    expect(visibleLevels(model)).toEqual(['lod2']);
  });

  it('ignores a level that is not in the chain', () => {
    const model = createModel(ASSET, createLevelTree(ASSET.levels));
    model.setLevel(7);
    expect(model.activeLevel).toBe(0);
    expect(visibleLevels(model)).toEqual(['lod0']);
  });

  it('switches level by distance, using the model’s own size', () => {
    const model = createModel(ASSET, createLevelTree(ASSET.levels));
    model.updateForDistance(0.5);
    expect(model.activeLevel).toBe(0);
    model.updateForDistance(model.radius * 30);
    expect(model.activeLevel).toBe(2);
  });

  it('carries on with the levels it has when the file is missing one', () => {
    const partial: ModelAsset = { ...ASSET, levels: ASSET.levels.slice(0, 2) };
    const model = createModel(partial, createLevelTree([{ node: 'lod0' }, { node: 'lod2' }]));
    // Neither advertised level is present, so there is nothing to show and the wrapper says so.
    expect(() => createModel(partial, createLevelTree([{ node: 'lod2' }]))).toThrow(
      /none of the level nodes/,
    );
    expect(model.activeLevel).toBe(0);
  });
});

/** Names of the level nodes that are currently visible. */
function visibleLevels(model: LoadedModel): string[] {
  const visible: string[] = [];
  model.object.traverse((child) => {
    if (child.name !== '' && child instanceof Mesh && child.visible) {
      visible.push(child.name);
    }
  });
  return visible;
}

describe('disposeObject', () => {
  it('disposes geometries and materials, and each shared texture only once', () => {
    const shared = new MeshBasicMaterial();
    const geometry = new BoxGeometry(1, 1, 1);
    const first = new Mesh(geometry, shared);
    const second = new Mesh(new BoxGeometry(1, 1, 1), shared);
    const geometrySpy = vi.spyOn(geometry, 'dispose');
    const materialSpy = vi.spyOn(shared, 'dispose');

    const root = new Group();
    root.add(first, second);
    disposeObject(root);

    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(2);
  });
});
