import { describe, expect, it } from 'vitest';

import { PURSUIT_CONFIG, PURSUIT_TRAPS } from '../../src/config/most-wanted';
import {
  initialTrapState,
  stepTraps,
  type TrapFrame,
} from '../../src/most-wanted/PursuitTrapsModel';

/** A frame with a roadblock + spike placement `roadblockDist` / `spikeDist` ahead of the player. */
function frame(over: Partial<TrapFrame> = {}): TrapFrame {
  return {
    pursuing: true,
    playerX: 0,
    playerZ: 0,
    dt: 1,
    roadblockPlacement: { x: 40, z: 0, yaw: 0 },
    spikePlacement: { x: 55, z: 0, yaw: 0 },
    ...over,
  };
}

const noPlacement = frame({ roadblockPlacement: null, spikePlacement: null });

describe('Most Wanted physical traps (Milestone 4b-2)', () => {
  it('lays a roadblock at the snapshot point on the first pursuing tick', () => {
    const r = stepTraps(initialTrapState(), frame());
    expect(r.events.roadblockPlaced).toBe(true);
    expect(r.state.roadblock).not.toBeNull();
    expect(r.state.roadblock!.x).toBe(40);
    expect(r.state.roadblock!.z).toBe(0);
  });

  it('does not lay traps when not pursuing (and clears existing ones)', () => {
    const laid = stepTraps(initialTrapState(), frame()).state;
    expect(laid.roadblock).not.toBeNull();
    const cleared = stepTraps(laid, frame({ pursuing: false }));
    expect(cleared.state.roadblock).toBeNull();
    expect(cleared.state.spikeStrip).toBeNull();
    expect(cleared.events).toEqual({
      roadblockPlaced: false,
      spikePlaced: false,
      roadblockHit: false,
      spikeHit: false,
    });
  });

  it('lays a roadblock then a spike strip at their own placements', () => {
    const r = stepTraps(initialTrapState(), frame());
    expect(r.state.roadblock).not.toBeNull();
    expect(r.state.spikeStrip).not.toBeNull();
    expect(r.state.spikeStrip!.x).toBe(55);
  });

  it('lays nothing when the mix provides no placement (low level)', () => {
    const r = stepTraps(initialTrapState(), noPlacement);
    expect(r.state.roadblock).toBeNull();
    expect(r.state.spikeStrip).toBeNull();
  });

  it('fires a roadblock hit when the player reaches it, exactly once', () => {
    let state = stepTraps(initialTrapState(), frame()).state;
    // Player approaches to within the hit radius.
    const near = stepTraps(state, frame({ playerX: 39, dt: 0 }));
    expect(near.events.roadblockHit).toBe(true);
    state = near.state;
    // A second pass does not re-fire.
    const again = stepTraps(state, frame({ playerX: 38, dt: 0 }));
    expect(again.events.roadblockHit).toBe(false);
    expect(again.state.roadblock!.hit).toBe(true);
  });

  it('a hit roadblock is removed after the hit linger, and a fresh one lays once the interval elapses', () => {
    let state = stepTraps(initialTrapState(), frame()).state;
    state = stepTraps(state, frame({ playerX: 40, dt: 0 })).state; // hit
    expect(state.roadblock!.hit).toBe(true);
    // Advance past the hit linger → removed.
    const linger = Math.ceil(PURSUIT_TRAPS.trapHitLingerSeconds);
    let s = state;
    for (let i = 0; i < linger; i += 1) s = stepTraps(s, noPlacement).state;
    expect(s.roadblock).toBeNull();
    // Let the layout interval fully elapse (no placement meanwhile) → a new roadblock lays.
    const interval = Math.ceil(PURSUIT_CONFIG.roadblockIntervalSeconds);
    for (let i = 0; i < interval; i += 1) s = stepTraps(s, noPlacement).state;
    const laid = stepTraps(s, frame());
    expect(laid.events.roadblockPlaced).toBe(true);
    expect(laid.state.roadblock).not.toBeNull();
    expect(laid.state.roadblockTimer).toBe(PURSUIT_CONFIG.roadblockIntervalSeconds);
  });

  it('spike strips fire their own hit event when reached', () => {
    const state = stepTraps(initialTrapState(), frame()).state;
    const near = stepTraps(state, frame({ playerX: 54, dt: 0 }));
    expect(near.events.spikeHit).toBe(true);
    expect(near.state.spikeStrip!.hit).toBe(true);
  });

  it('respects the layout cadence: no second roadblock before the interval elapses', () => {
    let state = stepTraps(initialTrapState(), frame()).state;
    // Immediately after laying, remove the current one and try to lay again → not due.
    state = { ...state, roadblock: null };
    const r = stepTraps(state, frame({ dt: 0 }));
    expect(r.events.roadblockPlaced).toBe(false);
    // After the interval, it lays again.
    let s = state;
    for (let i = 0; i < PURSUIT_CONFIG.roadblockIntervalSeconds; i += 1)
      s = stepTraps(s, noPlacement).state;
    expect(stepTraps(s, frame()).events.roadblockPlaced).toBe(true);
  });
});
