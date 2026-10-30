import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAssetBytes,
  prefetchAssetBytes,
  releaseAssetBytes,
  resetAssetBytesCache,
  warmAssetHttpCache,
} from '../../src/assets/AssetBytes';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetAssetBytesCache();
});

/** A fetch stub that remembers its calls and serves bytes (or fails) per url. */
function stubFetch(options: { bytes?: ArrayBuffer; fail?: ReadonlySet<string> } = {}) {
  const bytes = options.bytes ?? new ArrayBuffer(8);
  const fail = options.fail ?? new Set<string>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (fail.has(url)) {
      throw new Error(`network down for ${url}`);
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes,
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('asset byte cache', () => {
  it('dedupes in-flight fetches for the same url', async () => {
    const fetchMock = stubFetch();

    const first = prefetchAssetBytes(['assets/models/a.glb']);
    prefetchAssetBytes(['assets/models/a.glb']);
    const joined = getAssetBytes('assets/models/a.glb');

    expect(first).toBeUndefined();
    await joined;
    await joined;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps bytes for later lookups and does not refetch them', async () => {
    const fetchMock = stubFetch({ bytes: new ArrayBuffer(16) });

    const bytes = await getAssetBytes('assets/models/a.glb');
    const again = await getAssetBytes('assets/models/a.glb');

    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(again).toBe(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves to null on failure (never rejects) and remembers the miss', async () => {
    const fetchMock = stubFetch({ fail: new Set(['assets/models/dead.glb']) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const bytes = await getAssetBytes('assets/models/dead.glb');
    const again = await getAssetBytes('assets/models/dead.glb');

    expect(bytes).toBeNull();
    expect(again).toBeNull();
    // The miss is remembered: a second lookup must not hammer a dead endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('releases a kept file so a later lookup refetches', async () => {
    const fetchMock = stubFetch();

    const bytes = await getAssetBytes('assets/models/a.glb');
    releaseAssetBytes('assets/models/a.glb');
    const refetched = await getAssetBytes('assets/models/a.glb');

    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(refetched).toBeInstanceOf(ArrayBuffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('warms the HTTP cache once per url and swallows failures silently', async () => {
    const fetchMock = stubFetch({ fail: new Set(['assets/textures/dead.jpg']) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    warmAssetHttpCache([
      'assets/textures/a.jpg',
      'assets/textures/a.jpg',
      'assets/textures/dead.jpg',
    ]);

    // Let the fire-and-forget fetches settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores empty urls in both flavours', () => {
    const fetchMock = stubFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    prefetchAssetBytes(['']);
    warmAssetHttpCache(['']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
