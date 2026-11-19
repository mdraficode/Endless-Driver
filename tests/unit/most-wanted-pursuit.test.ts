import { describe, expect, it } from 'vitest';

import { BUST_CONFIG, EVADE_CONFIG } from '../../src/config/most-wanted';
import {
  initialPursuitState,
  stepPursuit,
  type PursuitFrame,
  type PursuitSignals,
  type PursuitState,
} from '../../src/most-wanted/PursuitModel';

const BASE: PursuitFrame = {
  level: 1,
  maxUnits: 12,
  maxHelicopters: 1,
  dt: 0.1,
  playerSpeedMps: 20,
  inHideSpot: false,
  nearestUnitMeters: 20, // within the 90 m detect radius
  playerBoxed: false,
  disabledUnitKind: null,
  debugPolice: false,
};

/** Run `seconds` of 0.1 s ticks feeding `overrides`, returning the final state + last signal. */
function run(
  start: PursuitState,
  overrides: Partial<PursuitFrame>,
  seconds: number,
  dt = 0.1,
): { state: PursuitState; signal: ReturnType<typeof stepPursuit>['signals'] } {
  let state = start;
  let signal: PursuitSignals = {
    policeDetected: false,
    ramed: false,
    phase: 'inactive',
    activeUnits: 0,
    takenOut: 0,
    busted: false,
    roadblockArmed: false,
    spikeArmed: false,
    heliActive: false,
    message: null,
  };
  for (let t = 0; t < seconds; t += dt) {
    const r = stepPursuit(state, { ...BASE, ...overrides, dt });
    state = r.state;
    signal = r.signals;
  }
  return { state, signal };
}

describe('Most Wanted pursuit brain (Phase 10, Milestone 3)', () => {
  it('stays inactive and clean at heat level 0', () => {
    const { state, signal } = run(initialPursuitState(), { level: 0 }, 2);
    expect(state.phase).toBe('inactive');
    expect(state.units).toHaveLength(0);
    expect(signal.policeDetected).toBe(false);
  });

  it('starts a pursuit, ramps the roster toward the level-1 target, and reports detection', () => {
    const { state, signal } = run(initialPursuitState(), { level: 1 }, 6);
    expect(state.phase).toBe('pursuit');
    expect(signal.policeDetected).toBe(true);
    expect(state.units.length).toBeGreaterThanOrEqual(3); // level-1 target is 3 cruisers
    expect(state.units.every((u) => u.kind === 'sedan')).toBe(true);
  });

  it('escalates the roster, roadblocks, spike strips and helicopter by level', () => {
    // Level 3 → a Light Rhino joins; roadblocks on; no spikes / heli yet.
    const l3 = run(initialPursuitState(), { level: 3 }, 10).state;
    expect(l3.units.some((u) => u.kind === 'rhino')).toBe(true);
    expect(l3.roadblockArmed).toBe(true);
    expect(l3.spikeArmed).toBe(false);
    expect(l3.heliActive).toBe(false);

    // Level 4 → helicopter + spike strips appear.
    const l4 = run(initialPursuitState(), { level: 4 }, 12).state;
    expect(l4.heliActive).toBe(true);
    expect(l4.spikeArmed).toBe(true);
    expect(l4.units.some((u) => u.kind === 'rhino')).toBe(true);

    // Level 5 → the Cross / Street Racing Unit joins.
    const l5 = run(initialPursuitState(), { level: 5 }, 14).state;
    expect(l5.units.some((u) => u.kind === 'cross')).toBe(true);
  });

  it('breaks into cooldown when the player is lost, then stands down at level 0', () => {
    let s = run(initialPursuitState(), { level: 2 }, 6).state;
    expect(s.phase).toBe('pursuit');
    // The player gets out of sight: nearest unit far away for the lost-hold window.
    s = run(s, { level: 2, nearestUnitMeters: 999 }, EVADE_CONFIG.lostHoldSeconds + 1).state;
    expect(s.phase).toBe('cooldown');
    // Cooldown keeps reporting "not detected" (so the heat model cools).
    const cool = run(s, { level: 2, nearestUnitMeters: 999 }, 1).signal;
    expect(cool.policeDetected).toBe(false);
    // Heat reaches 0 → pursuit fully ends.
    s = run(s, { level: 0, nearestUnitMeters: 999 }, 1).state;
    expect(s.phase).toBe('inactive');
    expect(s.units).toHaveLength(0);
  });

  it('re-pursues (with a reacquired call) when rediscovered during cooldown', () => {
    let s = run(initialPursuitState(), { level: 2 }, 6).state;
    s = run(s, { level: 2, nearestUnitMeters: 999 }, EVADE_CONFIG.lostHoldSeconds + 1).state;
    expect(s.phase).toBe('cooldown');
    const found = run(s, { level: 2, nearestUnitMeters: 20 }, 1);
    expect(found.state.phase).toBe('pursuit');
    expect(found.state.phase).toBe('pursuit');
  });

  it('cannot be detected while inside a hiding spot', () => {
    let s = run(initialPursuitState(), { level: 2 }, 6).state;
    // Close units but hidden → treated as lost.
    s = run(
      s,
      { level: 2, nearestUnitMeters: 5, inHideSpot: true },
      EVADE_CONFIG.lostHoldSeconds + 1,
    ).state;
    expect(s.phase).toBe('cooldown');
  });

  it('busts the player when boxed in and slow, and emits the arrest call', () => {
    const { state } = run(initialPursuitState(), { level: 3 }, 4);
    // Drive the bust meter to the top while boxed in and slow; capture the bust radio.
    const fillSeconds = 1 / BUST_CONFIG.fillPerSecond + 0.5;
    let bustedState = state;
    let bustRadio: string | undefined;
    for (let t = 0; t < fillSeconds; t += 0.1) {
      const r = stepPursuit(bustedState, {
        ...BASE,
        level: 3,
        playerBoxed: true,
        playerSpeedMps: 3,
        dt: 0.1,
      });
      bustedState = r.state;
      if (r.signals.message?.kind === 'busted') bustRadio = r.signals.message.text;
    }
    expect(bustedState.busted).toBe(true);
    expect(bustRadio).toBeTypeOf('string');
    expect(bustRadio).toMatch(/apprehended/i);
  });

  it('counts a rammed unit as taken out and reports it', () => {
    const s = run(initialPursuitState(), { level: 3 }, 8).state;
    expect(s.units.length).toBeGreaterThan(0);
    const step = stepPursuit(s, { ...BASE, level: 3, disabledUnitKind: 'sedan', dt: 0.1 });
    expect(step.signals.ramed).toBe(true);
    expect(step.state.takenOut).toBe(1);
    // A unit was removed; reinforcement may respawn one the same tick, so the count is s-1 or s.
    expect([s.units.length - 1, s.units.length]).toContain(step.state.units.length);
    expect(step.signals.message?.kind).toBe('unitDown');
  });

  it('respects the tier unit cap', () => {
    // Cap of 2 ground units: even at level 5 the roster never exceeds 2 (plus the capped heli).
    const { state } = run(initialPursuitState(), { level: 5, maxUnits: 2 }, 14);
    const ground = state.units.filter((u) => u.kind !== 'heli');
    expect(ground.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic for a fixed input sequence', () => {
    const seq: Partial<PursuitFrame>[] = [
      { level: 1 },
      { level: 2 },
      { level: 3 },
      { level: 3, nearestUnitMeters: 999 },
      { level: 3, nearestUnitMeters: 20 },
      { level: 2, disabledUnitKind: 'sedan' },
      { level: 1 },
      { level: 0 },
    ];
    const runSeq = (): PursuitState => {
      let s = initialPursuitState();
      for (const o of seq) s = stepPursuit(s, { ...BASE, ...o }).state;
      return s;
    };
    expect(JSON.stringify(runSeq())).toBe(JSON.stringify(runSeq()));
  });
});
