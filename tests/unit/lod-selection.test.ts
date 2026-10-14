import { describe, expect, it } from 'vitest';
import {
  LOD_SWITCH_RADII,
  lodSwitchDistance,
  selectLodLevel,
  type LodLevel,
} from '../../src/assets/LodSelection';

/**
 * The level-of-detail rule, tested as the pure function it is.
 *
 * These assertions are about *apparent* size, not about specific distances: the thresholds are
 * expressed in multiples of a model's own radius, so the same rule has to hold for a stone and for a
 * cliff. Each case below therefore states what a viewer would see — "still close up", "far enough away
 * that the cheapest level is fine" — rather than repeating the arithmetic.
 */

const LEVELS: readonly LodLevel[] = [
  { level: 0, node: 'lod0', triangles: 54_138, seamMerged: false },
  { level: 1, node: 'lod1', triangles: 26_448, seamMerged: true },
  { level: 2, node: 'lod2', triangles: 10_578, seamMerged: true },
];

describe('selectLodLevel', () => {
  it('shows the closest level while the model is close up', () => {
    expect(selectLodLevel(LEVELS, 0, 1)?.level).toBe(0);
    expect(selectLodLevel(LEVELS, 5, 1)?.level).toBe(0);
  });

  it('steps down as the model recedes, and stops at the cheapest level', () => {
    expect(selectLodLevel(LEVELS, LOD_SWITCH_RADII[0] ?? 0, 1)?.level).toBe(1);
    expect(selectLodLevel(LEVELS, (LOD_SWITCH_RADII[1] ?? 0) - 0.01, 1)?.level).toBe(1);
    expect(selectLodLevel(LEVELS, LOD_SWITCH_RADII[1] ?? 0, 1)?.level).toBe(2);
    expect(selectLodLevel(LEVELS, 500, 1)?.level).toBe(2);
  });

  it('switches at the same apparent size whatever the model measures', () => {
    // A 0.35 m stone and an 8 m boulder leave the closest level at the same multiple of their radius.
    const stone = LOD_SWITCH_RADII[0] ?? 0;
    expect(selectLodLevel(LEVELS, stone * 0.35, 0.35)?.level).toBe(1);
    expect(selectLodLevel(LEVELS, stone * 8, 8)?.level).toBe(1);
    expect(selectLodLevel(LEVELS, stone * 0.35 - 0.01, 0.35)?.level).toBe(0);
    expect(selectLodLevel(LEVELS, stone * 8 - 0.1, 8)?.level).toBe(0);
  });

  it('never skips past the end of a chain that is shorter than the threshold table', () => {
    const two = LEVELS.slice(0, 2);
    expect(selectLodLevel(two, 1000, 1)?.level).toBe(1);
  });

  it('handles a single level, and no levels at all', () => {
    expect(selectLodLevel(LEVELS.slice(0, 1), 1000, 1)?.level).toBe(0);
    expect(selectLodLevel([], 10, 1)).toBeNull();
  });

  it('stays at the closest level rather than popping when the size is unknown', () => {
    // A zero or non-finite radius would otherwise collapse every threshold onto the camera, which
    // shows the ugliest level to the nearest viewer — the worst possible failure for this rule.
    expect(selectLodLevel(LEVELS, 10, 0)?.level).toBe(0);
    expect(selectLodLevel(LEVELS, Number.NaN, 1)?.level).toBe(0);
    expect(selectLodLevel(LEVELS, Number.POSITIVE_INFINITY, 1)?.level).toBe(2);
  });

  it('reports the distances it switches at', () => {
    expect(lodSwitchDistance(0, 2)).toBeCloseTo((LOD_SWITCH_RADII[0] ?? 0) * 2);
    expect(lodSwitchDistance(99, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});
