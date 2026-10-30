/**
 * A page-lifetime byte cache for the files the first drive needs.
 *
 * Why this exists: on a slow mobile link the startup used to *serialize* the network on top of
 * the GPU — the 2.9 MB hero GLB downloaded beside the terrain, but the 28 MB of road/terrain
 * textures and the 10 MB of scanned trees only started fetching after the hero gate, so a first
 * run on 4G spent most of its wall time with the loading bar parked. The fix is to fetch every
 * manifest file at t=0, so the network cost overlaps terrain generation, the hero download and
 * the shader compile instead of stacking on top of them.
 *
 * Two flavours, because the cost profiles differ:
 *
 * - `prefetchAssetBytes` keeps the bytes: model files (GLB) are the only assets whose *parse*
 *   is a main-thread spike (GLTFLoader.parse decodes meshopt buffers and builds ~114k triangles
 *   for the hero coupé). Holding the bytes lets the caller decide WHEN to parse — the hero gate
 *   owns its parse instead of the terrain stage paying for a download that happens to finish
 *   mid-terrain. The bytes are released again once a parse succeeds, so the cache never keeps a
 *   parsed model's payload alive for the whole page.
 * - `warmAssetHttpCache` fetches and discards: textures, HDRIs and the LUT are loaded by URL by
 *   their own loaders, and the browser's HTTP cache (GitHub Pages serves static files with a
 *   long max-age) makes the second fetch a memory-cache hit. Retaining those 30 MB of decoded-
 *   again-anyway JPG bytes in JS memory would cost the low-end device more than the one round
 *   trip it saves.
 *
 * Every path is fail-soft: a fetch that fails or times out resolves to `null` (bytes) or
 * resolves nothing observable (warm), and the loaders fall back to their own fetch exactly as
 * before the cache existed. A `null` bytes entry is remembered, so a dead file is not re-fetched
 * by every caller — the loaders' own fetch is the retry.
 */

const DEFAULT_BYTE_TIMEOUT_MS = 180_000;

const bytesInFlight = new Map<string, Promise<ArrayBuffer | null>>();
const bytesResolved = new Map<string, ArrayBuffer | null>();
const warmed = new Set<string>();

interface ByteFetchOptions {
  /** Aborts a stalled fetch after this long; the entry resolves to `null`. Default 180 s. */
  readonly timeoutMs?: number;
}

function fetchBytes(url: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.arrayBuffer();
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn(
          `asset bytes timed out for ${url} after ${timeoutMs} ms; loaders fall back to their own fetch`,
        );
      } else {
        console.warn(
          `asset bytes unavailable for ${url}: ${error instanceof Error ? error.message : String(error)}; loaders fall back to their own fetch`,
        );
      }
      return null;
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Starts one fetch per url (deduplicated for the page) and keeps the bytes for later `parse`
 * calls. Fire-and-forget: callers that need the bytes await `getAssetBytes` for the same url,
 * which joins the same in-flight fetch rather than starting a second one.
 */
export function prefetchAssetBytes(urls: readonly string[], options?: ByteFetchOptions): void {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_BYTE_TIMEOUT_MS;
  for (const url of urls) {
    if (url === '' || bytesInFlight.has(url) || bytesResolved.has(url)) {
      continue;
    }
    const request = fetchBytes(url, timeoutMs).then((bytes) => {
      bytesInFlight.delete(url);
      bytesResolved.set(url, bytes);
      return bytes;
    });
    bytesInFlight.set(url, request);
  }
}

/**
 * The bytes for a url: the in-flight prefetch if there is one, a completed prefetch if there is
 * one, or a new fetch started now (deduplicated the same way). Resolves to `null` — never
 * rejects — when the file is unreachable; the caller falls back to fetching by URL.
 */
export function getAssetBytes(
  url: string,
  options?: ByteFetchOptions,
): Promise<ArrayBuffer | null> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_BYTE_TIMEOUT_MS;
  const inFlight = bytesInFlight.get(url);
  if (inFlight !== undefined) {
    return inFlight;
  }
  const resolved = bytesResolved.get(url) ?? null;
  if (bytesResolved.has(url)) {
    return Promise.resolve(resolved);
  }
  const request = fetchBytes(url, timeoutMs).then((bytes) => {
    bytesInFlight.delete(url);
    bytesResolved.set(url, bytes);
    return bytes;
  });
  bytesInFlight.set(url, request);
  return request;
}

/**
 * Drops a kept file's bytes from the cache (the parse owns the data now). Called after a
 * successful model parse so the page does not retain multi-megabyte GLB payloads alongside the
 * decoded geometry.
 */
export function releaseAssetBytes(url: string): void {
  bytesResolved.delete(url);
  // An in-flight fetch for the same url (a second caller) keeps its own promise; dropping the
  // resolved entry only affects later lookups, which would start a fresh fetch.
}

/**
 * Fetches each url and discards the body, priming the browser's HTTP cache so the loaders' own
 * URL fetches hit the memory cache. Deduplicated for the page; failures are silent by design —
 * a missed warm-up is exactly the pre-cache behaviour, and the loaders report their own errors.
 */
export function warmAssetHttpCache(urls: readonly string[]): void {
  for (const url of urls) {
    if (url === '' || warmed.has(url)) {
      continue;
    }
    warmed.add(url);
    fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null)
      .then(() => undefined);
  }
}

/** Test hook: forgets every in-flight fetch, resolved entry and warm-up. */
export function resetAssetBytesCache(): void {
  bytesInFlight.clear();
  bytesResolved.clear();
  warmed.clear();
}
