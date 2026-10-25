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
