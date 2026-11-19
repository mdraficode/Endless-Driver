import { describe, expect, it } from 'vitest';

import {
  computePursuitTactics,
  type PursuitTacticsFrame,
  type UnitPose,
} from '../../src/most-wanted/PursuitTactics';

// Player at the origin, heading yaw 0 → forward = (0,-1), so "ahead" is -z.
const PLAYER = { x: 0, z: 0, yaw: 0, speedMps: 25, y: 0 };
const ROAD = { forwardX: 0, forwardZ: -1 };

function unit(id: number, kind: UnitPose['kind'], x = 0, z = 5, yaw = 0): UnitPose {
  return { id, kind, x, z, yaw };
}

function frame(units: UnitPose[], level = 1): PursuitTacticsFrame {
  return { units, player: PLAYER, road: ROAD, level };
}

const cmd = (plan: ReturnType<typeof computePursuitTactics>, id: number) =>
  plan.commands.find((c) => c.id === id)!;

describe('Most Wanted tactical layer (Phase 10, Milestone 3b)', () => {
  it('chases: a lone cruiser aims at the player and reports the nearest distance', () => {
    const plan = computePursuitTactics(frame([unit(1, 'sedan', 0, 8)]));
    const c = cmd(plan, 1);
    expect(c.mode).toBe('chase');
    expect(c.targetX).toBeCloseTo(0);
    expect(c.targetZ).toBeCloseTo(0);
    expect(plan.nearestUnitMeters).toBeCloseTo(8);
  });

  it('a rhino rams head-on: it aims ahead of the player', () => {
    const plan = computePursuitTactics(frame([unit(1, 'rhino')], 3));
    const c = cmd(plan, 1);
    expect(c.mode).toBe('ram');
    // Target is ahead of the player (positive projection onto forward (0,-1) → z negative).
    expect(c.targetZ).toBeLessThan(0);
    expect(c.targetZ).toBeCloseTo(-12);
  });

  it('a P.I.T. unit at heat 3+ aims behind the player', () => {
    const plan = computePursuitTactics(
      frame([unit(1, 'sedan'), unit(2, 'unmarked'), unit(3, 'sedan')], 3),
    );
    const pit = plan.commands.find((c) => c.mode === 'pit');
    expect(pit).toBeDefined();
    // Behind the player → positive projection of (0 - z) ... target z is positive.
    expect(pit!.targetZ).toBeGreaterThan(0);
  });

  it('box-in units flank the sides of the player at heat 2+', () => {
    const plan = computePursuitTactics(frame([unit(1, 'sedan'), unit(2, 'sedan')], 2));
    const modes = plan.commands.map((c) => c.mode);
    expect(modes).toContain('box-left');
    expect(modes).toContain('box-right');
    const bl = plan.commands.find((c) => c.mode === 'box-left')!;
    // Flanking: off to the side (x non-zero), near the player's z.
    expect(Math.abs(bl.targetX)).toBeCloseTo(3);
    expect(bl.targetZ).toBeCloseTo(0);
  });

  it('places a roadblock across the road ahead (and not at heat 1)', () => {
    const l2 = computePursuitTactics(frame([unit(1, 'sedan')], 2));
    expect(l2.roadblock).not.toBeNull();
    expect(l2.roadblock!.z).toBeCloseTo(-40); // 40 m ahead
    expect(l2.roadblock!.yaw).toBeCloseTo(0); // aligned with the road
    const l1 = computePursuitTactics(frame([unit(1, 'sedan')], 1));
    expect(l1.roadblock).toBeNull();
  });

  it('adds spike strips and a helicopter at heat 4, not before', () => {
    const l3 = computePursuitTactics(frame([unit(1, 'rhino')], 3));
    expect(l3.spikeStrip).toBeNull();
    expect(l3.heli).toBeNull();
    const l4 = computePursuitTactics(frame([unit(1, 'rhino'), unit(2, 'heli')], 4));
    expect(l4.spikeStrip).not.toBeNull();
    expect(l4.spikeStrip!.z).toBeCloseTo(-55); // 40 + 15 ahead
    expect(l4.heli).not.toBeNull();
    expect(l4.heli!.y).toBeCloseTo(40);
  });

  it('reports "boxed in" when units are on opposite sides, not when they are far', () => {
    // One ahead (z=-10), one behind (z=+10), both within the 15 m box radius.
    const boxed = computePursuitTactics(frame([unit(1, 'sedan', 0, -10), unit(2, 'sedan', 0, 10)]));
    expect(boxed.playerBoxed).toBe(true);
    const far = computePursuitTactics(frame([unit(1, 'sedan', 0, 40), unit(2, 'sedan', 0, 60)]));
    expect(far.playerBoxed).toBe(false);
  });

  it('reports the nearest unit when several are present', () => {
    const plan = computePursuitTactics(
      frame([unit(1, 'sedan', 0, 6), unit(2, 'unmarked', 0, 20), unit(3, 'sedan', 0, 30)]),
    );
    expect(plan.nearestUnitMeters).toBeCloseTo(6);
  });

  it('is deterministic for a fixed frame', () => {
    const f = frame([unit(1, 'sedan', 0, 8), unit(2, 'rhino', 0, -6), unit(3, 'heli', 5, -20)], 4);
    expect(JSON.stringify(computePursuitTactics(f))).toBe(JSON.stringify(computePursuitTactics(f)));
  });
});
