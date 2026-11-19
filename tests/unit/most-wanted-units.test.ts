import { describe, expect, it } from 'vitest';

import { stepChasePos } from '../../src/most-wanted/PoliceUnits';

describe('visible police unit movement (Phase 10, Milestone 3b)', () => {
  it('moves toward the target, capped by max speed * dt', () => {
    const p = stepChasePos({ x: 0, z: 0 }, { x: 10, z: 0 }, 30, 1 / 30); // wants to move 1m
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0);
  });

  it('snaps to the target when it is within the step distance', () => {
    const p = stepChasePos({ x: 0, z: 0 }, { x: 0.5, z: 0 }, 30, 1 / 30);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.z).toBeCloseTo(0);
  });

  it('keeps position when the step is zero', () => {
    const p = stepChasePos({ x: 3, z: 4 }, { x: 10, z: 9 }, 30, 0);
    expect(p.x).toBe(3);
    expect(p.z).toBe(4);
  });

  it('moves diagonally in the correct direction', () => {
    const p = stepChasePos({ x: 0, z: 0 }, { x: 10, z: 10 }, 10, 1);
    // distance ~14.14, step 10 → fraction ~0.707
    expect(p.x).toBeCloseTo(7.07, 1);
    expect(p.z).toBeCloseTo(7.07, 1);
  });
});
