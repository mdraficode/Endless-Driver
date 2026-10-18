import { describe, expect, it } from 'vitest';

import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { VEGETATION_CONFIG } from '../../src/config/districts';
import { planVegetationWindow } from '../../src/world/vegetation-streaming';

describe('vegetation streaming planner', () => {
  it('leads the bounded foliage window in the direction of travel while retaining the player chunk', () => {
    const focus = { x: 0, z: 0 };
    const plan = planVegetationWindow(TERRAIN_CONFIG, VEGETATION_CONFIG.radiusChunks, null, focus, {
      x: 0,
      z: -50,
    });

    expect(plan.center).toEqual({ cx: 0, cz: -1 });
    expect(plan.chunks).toHaveLength((2 * VEGETATION_CONFIG.radiusChunks + 1) ** 2);
    expect(plan.chunks[0]).toMatchObject({ cx: 0, cz: -1, ring: 0 });
    expect(plan.chunks).toContainEqual(expect.objectContaining({ cx: 0, cz: 0 }));
    expect(plan.chunks.every((chunk) => chunk.ring <= VEGETATION_CONFIG.radiusChunks)).toBe(true);
  });

  it('holds its hysteretic centre when the projected focus jitters near a chunk seam', () => {
    const first = planVegetationWindow(TERRAIN_CONFIG, 1, null, { x: 120, z: 10 }, { x: 0, z: 0 });
    const jittered = planVegetationWindow(
      TERRAIN_CONFIG,
      1,
      first.center,
      { x: 129, z: 10 },
      { x: 0, z: 0 },
    );
    expect(jittered.center).toEqual(first.center);
    expect(jittered.chunks).toHaveLength(9);
  });
});
