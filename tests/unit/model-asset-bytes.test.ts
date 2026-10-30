import { TextEncoder } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { loadModelAsset } from '../../src/assets/ModelAsset';
import {
  getAssetBytes,
  prefetchAssetBytes,
  resetAssetBytesCache,
} from '../../src/assets/AssetBytes';
import {
  resetAssetManifestCache,
  type AssetManifest,
  type AssetManifestEntry,
} from '../../src/assets/AssetManifest';

const FAKE_RENDERER = {
  extensions: {
    has: () => false,
    get: () => null,
  },
} as unknown as object;

const ENTRY: AssetManifestEntry = {
  id: 'model-bytes-test',
  kind: 'model',
  name: 'Bytes test model',
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
    {
      slot: 'model',
      path: 'https://example.invalid/assets/models/bytes-test.glb',
      bytes: 128,
      sha256: 'abc',
      colourSpace: 'mixed',
      format: 'glb',
    },
  ],
};

const MANIFEST: AssetManifest = { schemaVersion: 1, assets: [ENTRY] };

/**
 * A minimal, hand-built GLB (one triangle, one node named `lod0`): the same fixture approach the
 * rest of the model tests use — a real container for the loader to parse, without a network or a
 * 2.9 MB binary.
 */
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
    jsonChunk[index] = 0x20; // JSON chunks pad with spaces
  }

  const bin = new ArrayBuffer(48);
  new Uint16Array(bin, 0, 3).set([0, 1, 2]);
  new Float32Array(bin, 12, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);

  const total = 12 + 8 + jsonChunk.length + 8 + bin.byteLength;
  const glb = new ArrayBuffer(total);
  const view = new DataView(glb);
  const bytes = new Uint8Array(glb);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonChunk, 20);
  view.setUint32(20 + jsonChunk.length, bin.byteLength, true);
  view.setUint32(24 + jsonChunk.length, 0x004e4942, true); // 'BIN\0'
  bytes.set(new Uint8Array(bin), 28 + jsonChunk.length);
  return glb;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof URL === 'function' && input instanceof URL) {
    return input.toString();
  }
  const asRequest = input as { url?: string };
  if (asRequest.url !== undefined) {
    return asRequest.url;
  }
  return String(input);
}

function stubManifestFetch(manifestUrl: string, glbUrl: string, glbBytes: ArrayBuffer) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input);
    if (url === manifestUrl) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: manifestUrl,
        json: async () => MANIFEST,
      } as unknown as Response;
    }
    if (url === glbUrl) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: glbUrl,
        arrayBuffer: async () => glbBytes,
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('model loading from bytes', () => {
  it('parses explicit bytes without fetching the file', async () => {
    resetAssetManifestCache();
    resetAssetBytesCache();
    const manifestUrl = 'bytes-explicit-manifest.json';
    const glbUrl = 'https://example.invalid/assets/models/bytes-test.glb';
    const fetchMock = stubManifestFetch(manifestUrl, glbUrl, buildMinimalGlb());

    const model = await loadModelAsset({
      renderer: FAKE_RENDERER,
      assetId: 'model-bytes-test',
      url: manifestUrl,
      bytes: buildMinimalGlb(),
    });

    expect(model).not.toBeNull();
    expect(model?.object.getObjectByName('lod0')).not.toBeNull();
    // The manifest was fetched; the model file was not — the parse ran on the given bytes.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(manifestUrl);
  });

  it('fetches the file when the caller says no bytes', async () => {
    resetAssetManifestCache();
    resetAssetBytesCache();
    const manifestUrl = 'bytes-null-manifest.json';
    const glbUrl = 'https://example.invalid/assets/models/bytes-test.glb';
    const glb = buildMinimalGlb();
    const fetchMock = stubManifestFetch(manifestUrl, glbUrl, glb);

    const model = await loadModelAsset({
      renderer: FAKE_RENDERER,
      assetId: 'model-bytes-test',
      url: manifestUrl,
      bytes: null,
    });

    expect(model).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('consults the shared byte cache, parses, and releases the bytes', async () => {
    resetAssetManifestCache();
    resetAssetBytesCache();
    const manifestUrl = 'bytes-cache-manifest.json';
    const glbUrl = 'https://example.invalid/assets/models/bytes-test.glb';
    const glb = buildMinimalGlb();
    const fetchMock = stubManifestFetch(manifestUrl, glbUrl, glb);

    // A t=0 prefetch of the model file.
    prefetchAssetBytes([glbUrl]);
    await getAssetBytes(glbUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The load finds the bytes in the cache: no second download.
    const model = await loadModelAsset({
      renderer: FAKE_RENDERER,
      assetId: 'model-bytes-test',
      url: manifestUrl,
    });
    expect(model).not.toBeNull();
    expect(model?.object.getObjectByName('lod0')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // manifest + the one prefetch, nothing else

    // The parse owns the data: the cache released the payload, so a later lookup refetches.
    const refetched = await getAssetBytes(glbUrl);
    expect(refetched).toBeInstanceOf(ArrayBuffer);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to a URL fetch when the byte cache missed the file', async () => {
    resetAssetManifestCache();
    resetAssetBytesCache();
    const manifestUrl = 'bytes-miss-manifest.json';
    const glbUrl = 'https://example.invalid/assets/models/bytes-test.glb';
    const glb = buildMinimalGlb();
    // The first fetch of the model file hits a dead network; later ones succeed.
    let glbAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url === manifestUrl) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          url: manifestUrl,
          json: async () => MANIFEST,
        } as unknown as Response;
      }
      if (url === glbUrl) {
        glbAttempts += 1;
        if (glbAttempts === 1) {
          throw new Error('first attempt fails');
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          url: glbUrl,
          arrayBuffer: async () => glb,
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Prime the cache with a remembered miss for the model file.
    const missed = await getAssetBytes(glbUrl);
    expect(missed).toBeNull();

    // The load finds the null in the cache and falls back to its own URL fetch — the pre-cache
    // behaviour — which succeeds.
    const model = await loadModelAsset({
      renderer: FAKE_RENDERER,
      assetId: 'model-bytes-test',
      url: manifestUrl,
    });
    expect(model).not.toBeNull();
    // miss (1) + manifest (1) + the loader's own fetch (1).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
