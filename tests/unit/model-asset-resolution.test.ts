import { TextEncoder } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { listModelAssets, loadModelAsset, resolveModelAsset } from '../../src/assets/ModelAsset';
import {
  resetAssetManifestCache,
  type AssetManifest,
  type AssetManifestEntry,
} from '../../src/assets/AssetManifest';

/**
 * A model entry that ships one file per pixel budget: the 1K file (no `resolution` field — the
 * historical form) and a 512-px derivation. The tier-C load must take the 512 file; a budget the
 * catalog has not derived (or a B/A load) must take the 1K one.
 */
const ONE_K_FILE = {
  slot: 'model',
  path: 'https://example.invalid/assets/models/two-budget_1k.glb',
  bytes: 128,
  sha256: 'abc',
  colourSpace: 'mixed',
  format: 'glb',
};

const TWO_BUDGET_ENTRY: AssetManifestEntry = {
  id: 'model-two-budget',
  kind: 'model',
  name: 'Two budget model',
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
    lods: [{ level: 0, node: 'lod0', triangles: 1 }],
  },
  files: [
    ONE_K_FILE,
    {
      slot: 'model',
      path: 'https://example.invalid/assets/models/two-budget_512.glb',
      bytes: 64,
      sha256: 'def',
      colourSpace: 'mixed',
      format: 'glb',
      resolution: '512',
    },
  ],
};

const ONE_BUDGET_ENTRY: AssetManifestEntry = {
  ...TWO_BUDGET_ENTRY,
  id: 'model-one-budget',
  name: 'One budget model',
  files: [ONE_K_FILE],
};

const MANIFEST: AssetManifest = {
  schemaVersion: 1,
  assets: [TWO_BUDGET_ENTRY, ONE_BUDGET_ENTRY],
};

describe('model asset resolution', () => {
  it('picks the 512 file for the 512 budget', () => {
    const asset = resolveModelAsset(TWO_BUDGET_ENTRY, '512');
    expect(asset?.file).toBe('https://example.invalid/assets/models/two-budget_512.glb');
    expect(asset?.bytes).toBe(64);
  });

  it('picks the 1K file for the 1K budget and by default', () => {
    expect(resolveModelAsset(TWO_BUDGET_ENTRY, '1k')?.file).toBe(
      'https://example.invalid/assets/models/two-budget_1k.glb',
    );
    expect(resolveModelAsset(TWO_BUDGET_ENTRY)?.file).toBe(
      'https://example.invalid/assets/models/two-budget_1k.glb',
    );
  });

  it('falls back to the 1K file when the 512 budget was never derived for a model', () => {
    const asset = resolveModelAsset(ONE_BUDGET_ENTRY, '512');
    expect(asset?.file).toBe('https://example.invalid/assets/models/two-budget_1k.glb');
  });

  it('lists models at the requested budget', () => {
    const at512 = listModelAssets(MANIFEST, '512');
    const at1k = listModelAssets(MANIFEST);
    expect(at512.find((model) => model.id === 'model-two-budget')?.file).toBe(
      'https://example.invalid/assets/models/two-budget_512.glb',
    );
    expect(at512.find((model) => model.id === 'model-one-budget')?.file).toBe(
      'https://example.invalid/assets/models/two-budget_1k.glb',
    );
    expect(at1k.every((model) => model.file.endsWith('_1k.glb'))).toBe(true);
  });
});

/** A minimal, hand-built GLB: the same fixture approach as the model-bytes tests. */
function buildMinimalGlb(): ArrayBuffer {
  const json = {
    asset: { version: '2.0', generator: 'endless-driver-test' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ name: 'lod0', mesh: 0 }],
    meshes: [{ name: 'triangle', primitives: [{ attributes: { POSITION: 1 }, indices: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5123, count: 3, type: 'SCALAR' },
      {
        bufferView: 1,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12, target: 34963 },
      { buffer: 0, byteOffset: 12, byteLength: 36, target: 34962 },
    ],
    buffers: [{ byteLength: 48 }],
  };
  const jsonPayload = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunk = new Uint8Array(jsonPayload.length + ((4 - (jsonPayload.length % 4)) % 4));
  jsonChunk.set(jsonPayload);
  for (let index = jsonPayload.length; index < jsonChunk.length; index += 1) {
    jsonChunk[index] = 0x20;
  }
  const bin = new ArrayBuffer(48);
  new Uint16Array(bin, 0, 3).set([0, 1, 2]);
  new Float32Array(bin, 12, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.byteLength;
  const glb = new ArrayBuffer(total);
  const view = new DataView(glb);
  const bytes = new Uint8Array(glb);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonChunk, 20);
  view.setUint32(20 + jsonChunk.length, bin.byteLength, true);
  view.setUint32(24 + jsonChunk.length, 0x004e4942, true);
  bytes.set(new Uint8Array(bin), 28 + jsonChunk.length);
  return glb;
}

const FAKE_RENDERER = {
  extensions: {
    has: () => false,
    get: () => null,
  },
} as unknown as object;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof URL === 'function' && input instanceof URL) {
    return input.toString();
  }
  return (input as { url?: string }).url ?? String(input);
}

describe('loadModelAsset end to end', () => {
  it('downloads the 512 file, not the 1K one, for the 512 budget', async () => {
    resetAssetManifestCache();
    const manifestUrl = 'resolution-manifest.json';
    const urls = new Set<string>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      urls.add(url);
      if (url === manifestUrl) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          url: manifestUrl,
          json: async () => MANIFEST,
        } as unknown as Response;
      }
      if (url.endsWith('.glb')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          url,
          arrayBuffer: async () => buildMinimalGlb(),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const model = await loadModelAsset({
      renderer: FAKE_RENDERER,
      assetId: 'model-two-budget',
      url: manifestUrl,
      resolution: '512',
    });

    expect(model).not.toBeNull();
    expect(urls.has('https://example.invalid/assets/models/two-budget_512.glb')).toBe(true);
    expect(urls.has('https://example.invalid/assets/models/two-budget_1k.glb')).toBe(false);
  });
});
