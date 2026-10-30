/**
 * The page's real network bill, read from the browser's own performance log.
 *
 * The Startup row already measures the wall clock of every load stage; what it could not say was
 * how much of that clock was the *link*. On a phone the first frame is a download, and "about
 * the same" after a 66 % asset cut is a question the stage numbers alone cannot answer: was it
 * the old build in the cache, a link that is simply slow at any byte count, or CPU-side decode
 * and upload time? The resource timing entries answer all three: they carry the wire bytes
 * (`transferSize` — zero for a cache hit) of every file the page pulled, JS bundle included, and
 * their start/finish instants span the download window.
 */
export interface StartupNetworkStats {
  /** Wire bytes of every resource the page fetched (compressed; cache hits count 0). */
  readonly bytes: number;
  /** Wall-clock span of the resource window, ms (first start to last finish). */
  readonly ms: number;
  /** How many resource entries were counted. */
  readonly resources: number;
}

/**
 * The page's network bill so far, or `null` where the performance log is unavailable (no
 * browser, or an old WebView without resource timing) — the row then omits the net part.
 */
export function getStartupNetworkStats(): StartupNetworkStats | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return null;
  }
  let entries: PerformanceResourceTiming[];
  try {
    entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  } catch {
    return null;
  }
  if (entries.length === 0) {
    return null;
  }
  let bytes = 0;
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (const entry of entries) {
    // transferSize is the compressed wire size; it is 0 for memory-cache hits (a retest on the
    // same device loads its repeat files from cache, so a fast retest reporting few megabytes
    // is the cache working, not a bug).
    bytes += entry.transferSize;
    if (entry.startTime > 0 && entry.startTime < first) {
      first = entry.startTime;
    }
    if (entry.responseEnd > last) {
      last = entry.responseEnd;
    }
  }
  if (!Number.isFinite(first)) {
    return null;
  }
  return {
    bytes,
    ms: Math.max(0, last - first),
    resources: entries.length,
  };
}
