/**
 * Loading-bar fraction for a warm-up pass: steady visible movement from `from` to `to` across
 * the whole timeout window, clamped to the window on both ends.
 */
export function warmupProgressFraction(
  elapsedMs: number,
  timeoutMs: number,
  from: number,
  to: number,
): number {
  const t = timeoutMs > 0 ? Math.min(1, Math.max(0, elapsedMs / timeoutMs)) : 1;
  return from + (to - from) * t;
}

/**
 * Resolves with the source promise's value when it settles within the budget, otherwise with
 * null. The source promise keeps running in the background either way; the caller decides what
 * "not ready in time" means (usually: start anyway and let the late result apply). Never rejects.
 */
export function waitForWithinBudget<T>(source: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([
    source.then(
      (value) => value,
      () => null,
    ),
    timeout,
  ]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
