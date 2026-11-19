import { describe, expect, it } from 'vitest';

import { HEAT_CONFIG } from '../../src/config/most-wanted';
import {
  computeCeiling,
  initialHeatState,
  stepHeat,
  type HeatInput,
  type HeatState,
} from '../../src/most-wanted/HeatModel';

const BASE: HeatInput = {
  speedMps: 0,
  stationary: false,
  ramed: false,
  collided: false,
  roadblockCrash: false,
  policeDetected: false,
  rivalsBusted: 0,
};

function tick(state: HeatState, overrides: Partial<HeatInput>, dt: number) {
  return stepHeat(state, { ...BASE, ...overrides }, dt);
}

/** Run `seconds` of fixed `dt` ticks, feeding `overrides` every tick. */
function chase(state: HeatState, overrides: Partial<HeatInput>, seconds: number, dt = 0.1) {
  let s = state;
  for (let t = 0; t < seconds; t += dt) {
    s = tick(s, overrides, dt).state;
  }
  return s;
}

describe('Most Wanted heat model (Phase 10, Milestone 2)', () => {
  it('pulls a 911 on a crime while clean and stays clean without one', () => {
    const start = initialHeatState();
    // No crime → no 911.
    const quiet = tick(start, { speedMps: 10, policeDetected: false }, 1.0);
    expect(quiet.state.level).toBe(0);
    expect(quiet.message).toBeNull();
    // Speeding (a crime) → 911 → level 1, active, with an alert toast.
    const alert = tick(
      start,
      { speedMps: HEAT_CONFIG.speedCrimeThresholdMps + 5, policeDetected: false },
      0.1,
    );
    expect(alert.state.level).toBe(1);
    expect(alert.state.active).toBe(true);
    expect(alert.message?.kind).toBe('alert911');
  });

  it('fills the meter while chased and rises a heat level', () => {
    // Enough busted rivals so the ceiling allows rising past level 1.
    let s = tick(
      initialHeatState(),
      { speedMps: 40, policeDetected: true, rivalsBusted: 14 },
      0.1,
    ).state;
    expect(s.level).toBe(1);
    s = chase(s, { speedMps: 40, policeDetected: true, rivalsBusted: 14 }, 20);
    expect(s.level).toBeGreaterThanOrEqual(2);
  });

  it('respects the ceiling (D2: 1 + rivals busted)', () => {
    expect(computeCeiling(0)).toBe(1);
    expect(computeCeiling(1)).toBe(2);
    expect(computeCeiling(14)).toBe(15);
    expect(computeCeiling(99)).toBe(15); // capped
    // Ceiling 1: heat is held at the level-1 full, never rises to 2.
    let s = tick(
      initialHeatState(),
      { speedMps: 40, policeDetected: true, rivalsBusted: 0 },
      0.1,
    ).state;
    s = chase(s, { speedMps: 40, policeDetected: true, rivalsBusted: 0 }, 30);
    expect(s.level).toBe(1);
    // With one rival busted (ceiling 2) the same chase climbs to 2.
    s = tick(
      initialHeatState(),
      { speedMps: 40, policeDetected: true, rivalsBusted: 1 },
      0.1,
    ).state;
    s = chase(s, { speedMps: 40, policeDetected: true, rivalsBusted: 1 }, 25);
    expect(s.level).toBeGreaterThanOrEqual(2);
  });

  it('stalls at high heat unless the player keeps committing infractions', () => {
    const high = 10;
    const make = (): HeatState => ({
      level: high,
      heat: 0,
      ceiling: 15,
      active: true,
      evading: false,
      recentCrimeSeconds: 0,
    });
    const withCrime = tick(make(), { speedMps: 45, policeDetected: true }, 5).state;
    const clean = tick(make(), { speedMps: 10, policeDetected: true }, 5).state;
    // Same time, same level: committing a crime fills the meter faster than cruising clean.
    expect(withCrime.heat).toBeGreaterThan(clean.heat);
    expect(clean.heat).toBeGreaterThan(0); // it still creeps, just slowly (a stall, not a freeze)
  });

  it('a roadblock smash is a crime that spikes heat harder than a fender-bender (4b-2)', () => {
    const mid = (): HeatState => ({
      level: 3,
      heat: 0,
      ceiling: 15,
      active: true,
      evading: false,
      recentCrimeSeconds: 0,
    });
    const crashed = tick(mid(), { roadblockCrash: true, policeDetected: true }, 0).state;
    const bumped = tick(mid(), { collided: true, policeDetected: true }, 0).state;
    const clean = tick(mid(), { policeDetected: true }, 0).state;
    expect(crashed.heat).toBe(HEAT_CONFIG.roadblockCrimeHeat);
    expect(crashed.heat).toBeGreaterThan(bumped.heat);
    expect(bumped.heat).toBeGreaterThan(clean.heat);
  });

  it('cools down once the police lose the player, and stands down at level 0', () => {
    const s: HeatState = {
      level: 3,
      heat: 0.5,
      ceiling: 15,
      active: true,
      evading: false,
      recentCrimeSeconds: 0,
    };
    const first = tick(s, { speedMps: 10, policeDetected: false }, 0.5);
    expect(first.state.evading).toBe(true);
    expect(first.message?.kind).toBe('evading');
    // Keep it lost: the level decays to 0 and the pursuit is stood down.
    let last: HeatState = first.state;
    let evaded = false;
    for (let i = 0; i < 300; i += 1) {
      const r = tick(last, { speedMps: 10, policeDetected: false }, 0.1);
      last = r.state;
      if (r.message?.kind === 'evaded') evaded = true;
    }
    expect(last.level).toBe(0);
    expect(last.active).toBe(false);
    expect(evaded).toBe(true);
  });

  it('cools down much faster when stopped / engine off', () => {
    const make = (): HeatState => ({
      level: 2,
      heat: 0.5,
      ceiling: 15,
      active: true,
      evading: false,
      recentCrimeSeconds: 0,
    });
    const moving = chase(make(), { speedMps: 20, policeDetected: false }, 5);
    const stopped = chase(make(), { speedMps: 0, stationary: true, policeDetected: false }, 5);
    // Same 5 s lost: the stopped car has decayed to a lower level.
    expect(stopped.level + stopped.heat).toBeLessThan(moving.level + moving.heat);
  });

  it('is deterministic for a fixed input sequence', () => {
    const sequence: Partial<HeatInput>[] = [
      { speedMps: 40, policeDetected: true },
      { speedMps: 40, policeDetected: true, ramed: true },
      { speedMps: 30, policeDetected: true },
      { speedMps: 10, policeDetected: false },
      { speedMps: 10, policeDetected: false, stationary: true },
    ];
    const run = (): HeatState => {
      let s = initialHeatState();
      for (const o of sequence) s = tick(s, o, 0.5).state;
      return s;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
