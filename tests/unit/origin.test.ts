import { describe, expect, it } from 'vitest';

import { ORIGIN_CONFIG } from '../../src/config/origin';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { OriginManager } from '../../src/world/origin';

/**
 * The floating origin, pinned as a pure function: world coordinates are eternal,
 * the local slide is whole grid steps, and a slide can never immediately
 * re-trigger (the car always lands within half a grid step of the new origin).
 */
describe('OriginManager', () => {
  it('pins the slide grid to the terrain chunk grid', () => {
    expect(ORIGIN_CONFIG.gridMeters).toBe(TERRAIN_CONFIG.chunkSizeMeters);
  });

  it('does nothing inside the bounded zone', () => {
    const origin = new OriginManager(ORIGIN_CONFIG);
    expect(origin.update(0, 0)).toBeNull();
    expect(origin.update(2048, -2048)).toBeNull();
    expect(origin.rebases).toBe(0);
    expect(origin.offset).toEqual({ x: 0, z: 0 });
  });

  it('slides by whole grid steps and lands the car beside the new origin', () => {
    const origin = new OriginManager(ORIGIN_CONFIG);
    const shift = origin.update(2600, -100);
    expect(shift).not.toBeNull();
    expect(Number.isInteger(shift!.dx / 128)).toBe(true);
    expect(Number.isInteger(shift!.dz / 128)).toBe(true);
    // World position is untouched by the slide; only its local reading changes.
    expect(origin.worldFromLocalX(2600 - shift!.dx)).toBe(2600);
    expect(origin.worldFromLocalZ(-100 - shift!.dz)).toBe(-100);
    // The car now sits within half a grid step of the origin: no re-trigger.
    expect(Math.abs(2600 - shift!.dx)).toBeLessThanOrEqual(64);
    expect(origin.update(2600 - shift!.dx, -100 - shift!.dz)).toBeNull();
    expect(origin.rebases).toBe(1);
  });

  it('accumulates across a long drive in both directions', () => {
    const origin = new OriginManager(ORIGIN_CONFIG);
    let local = 0;
    // Drive 10 km east in rebase-sized hops, as the frame loop would see it.
    for (let i = 0; i < 5; i += 1) {
      const shift = origin.update(local + 2100, 0);
      expect(shift).not.toBeNull();
      local = local + 2100 - shift!.dx;
      expect(origin.worldFromLocalX(local)).toBe(2100 * (i + 1));
    }
    expect(origin.offset.x).toBeGreaterThan(9000);
    const back = origin.update(local - 5000, 0);
    expect(back).not.toBeNull();
    expect(back!.dx).toBeLessThan(0);
  });
});
