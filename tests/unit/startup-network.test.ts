import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStartupNetworkStats } from '../../src/core/startup-network';

interface FakeResourceEntry {
  readonly name: string;
  readonly startTime: number;
  readonly responseEnd: number;
  readonly transferSize: number;
}

function stubResources(entries: readonly FakeResourceEntry[]) {
  const fakePerformance = {
    ...performance,
    getEntriesByType: vi.fn((type: string) => (type === 'resource' ? [...entries] : [])),
  };
  vi.stubGlobal('performance', fakePerformance);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStartupNetworkStats', () => {
  it('sums wire bytes and spans the window of every resource', () => {
    stubResources([
      { name: 'index.js', startTime: 100, responseEnd: 5_000, transferSize: 2_000_000 },
      { name: 'hero.glb', startTime: 2_000, responseEnd: 44_500, transferSize: 2_900_000 },
      // A cache hit counts zero wire bytes but still stretches the window: the loader waited
      // on the memory cache, not on the network.
      { name: 'grass.jpg', startTime: 1_000, responseEnd: 2_500, transferSize: 0 },
    ]);
    const stats = getStartupNetworkStats();
    expect(stats).not.toBeNull();
    expect(stats?.bytes).toBe(4_900_000);
    // First start (100) to last finish (44 500): 44 400 ms.
    expect(stats?.ms).toBe(44_400);
    expect(stats?.resources).toBe(3);
  });

  it('returns null when there are no resource entries yet', () => {
    stubResources([]);
    expect(getStartupNetworkStats()).toBeNull();
  });

  it('returns null where the performance log is unavailable', () => {
    const real = performance;
    vi.stubGlobal('performance', { now: real.now });
    expect(getStartupNetworkStats()).toBeNull();
  });
});
