import { describe, expect, it } from 'vitest';

import { MW_TIER_CAPS } from '../../src/config/most-wanted';
import {
  initialHeatState,
  stepHeat,
  type HeatState,
  type RadioMessage,
} from '../../src/most-wanted/HeatModel';
import { PoliceUnits } from '../../src/most-wanted/PoliceUnits';
import {
  initialPursuitState,
  stepPursuit,
  type PursuitState,
} from '../../src/most-wanted/PursuitModel';
import { computePursuitTactics } from '../../src/most-wanted/PursuitTactics';
import type { SceneManager } from '../../src/core/SceneManager';

/**
 * Player-perspective integration test (Phase 10 Most Wanted).
 *
 * This drives the *real* logic stack exactly the way `Application.#stepMostWanted` wires it —
 * heat model → pursuit brain → tactical layer → visible squad → feedback — and scripts a player
 * (speed / heading) so we can verify each chase PHASE actually completes end to end:
 *   speeding → 911 → pursuit engages → squad spawns + chases → escalation (roadblock / rhino /
 *   spike / heli) → you get boxed → busted → the squad stands down → heat cools → cleared.
 *
 * The car/physics/scene coupling is stubbed (a no-op SceneManager); everything else is the real code.
 */

// PoliceUnits only calls addObject/removeObject on the scene.
const stubScene = { addObject: () => {}, removeObject: () => {} } as unknown as SceneManager;

// Tier "A" caps give the full roster so escalation is visible.
const CAPS = MW_TIER_CAPS.A;
// Script rival progress so the heat ceiling (1 + rivalsBusted) is high enough to escalate.
const RIVALS_BUSTED = 6;

type PlayerDriver = (t: number) => { speed: number; turn?: number; hide?: boolean };

interface Sim {
  heat: HeatState;
  pursuit: PursuitState;
  units: PoliceUnits;
  px: number;
  pz: number;
  pyaw: number;
  // Observations accumulated across the run.
  maxLevel: number;
  maxRoster: number;
  minNearest: number;
  saw: { rhino: boolean; heli: boolean; roadblock: boolean; spikes: boolean; boxed: boolean };
  bustedAt: number | null;
  bustedMessage: RadioMessage | null;
  clearedAt: number | null;
  evadedAt: number | null;
}

function newSim(): Sim {
  return {
    heat: initialHeatState(),
    pursuit: initialPursuitState(),
    units: new PoliceUnits(stubScene),
    px: 0,
    pz: 0,
    pyaw: 0,
    maxLevel: 0,
    maxRoster: 0,
    minNearest: Number.POSITIVE_INFINITY,
    saw: { rhino: false, heli: false, roadblock: false, spikes: false, boxed: false },
    bustedAt: null,
    bustedMessage: null,
    clearedAt: null,
    evadedAt: null,
  };
}

/** One frame, mirroring Application.#stepMostWanted (debug off). The heat model always runs. */
function tick(sim: Sim, dt: number, driver: PlayerDriver, t: number): void {
  const speed = driver(t).speed;
  const turn = driver(t).turn ?? 0;
  const hide = driver(t).hide ?? false;
  // Integrate the player (heading 0 → forward (0,-1)).
  sim.pyaw += turn * dt;
  const fx = -Math.sin(sim.pyaw);
  const fz = -Math.cos(sim.pyaw);
  sim.px += fx * speed * dt;
  sim.pz += fz * speed * dt;

  const player = { x: sim.px, y: 0, z: sim.pz, yaw: sim.pyaw, speedMps: speed };
  const level = sim.heat.level;
  const engaged = level > 0;

  // Pursuit stack (gated): tactical plan → sync squad → brain, with real feedback.
  let policeDetected = false;
  let ramedCop = false;
  let rammedPlayer = false;
  if (engaged) {
    const plan = computePursuitTactics({
      units: sim.units.poses(),
      player,
      road: { forwardX: fx, forwardZ: fz },
      level,
    });
    rammedPlayer = sim.units.sync({
      roster: sim.pursuit.units,
      commands: plan.commands,
      player,
      dt,
    }).rammed;
    const p = stepPursuit(sim.pursuit, {
      level,
      maxUnits: CAPS.maxUnits,
      maxHelicopters: CAPS.maxHelicopters,
      dt,
      playerSpeedMps: speed,
      inHideSpot: hide,
      nearestUnitMeters: plan.nearestUnitMeters,
      playerBoxed: plan.playerBoxed,
      disabledUnitKind: null,
      debugPolice: false,
      engaged,
    });
    sim.pursuit = p.state;
    if (p.signals.busted) sim.units.clear();
    policeDetected = p.signals.policeDetected;
    ramedCop = p.signals.ramed;

    // Observe the escalation + bust.
    sim.minNearest = Math.min(sim.minNearest, plan.nearestUnitMeters);
    sim.saw.boxed = sim.saw.boxed || plan.playerBoxed;
    for (const u of sim.pursuit.units) {
      if (u.kind === 'rhino') sim.saw.rhino = true;
      if (u.kind === 'heli') sim.saw.heli = true;
    }
    sim.saw.roadblock = sim.saw.roadblock || sim.pursuit.roadblockArmed;
    sim.saw.spikes = sim.saw.spikes || sim.pursuit.spikeArmed;
    if (p.signals.busted && sim.bustedAt === null) {
      sim.bustedAt = t;
      sim.bustedMessage = p.signals.message;
    }
  } else {
    sim.units.clear();
  }
  sim.maxRoster = Math.max(sim.maxRoster, sim.pursuit.units.length);

  // Heat model: always runs.
  const h = stepHeat(
    sim.heat,
    {
      speedMps: speed,
      stationary: speed < 1.5,
      ramed: ramedCop,
      collided: rammedPlayer,
      policeDetected,
      rivalsBusted: RIVALS_BUSTED,
    },
    dt,
  );
  sim.heat = h.state;
  sim.maxLevel = Math.max(sim.maxLevel, sim.heat.level);
  if (h.state.level === 0 && sim.evadedAt === null) sim.evadedAt = t;

  // Fully cleared: reset (matches Application).
  if (sim.heat.level <= 0) {
    if (sim.clearedAt === null) sim.clearedAt = t;
    sim.heat = initialHeatState();
    sim.pursuit = initialPursuitState();
    sim.units.clear();
  }
}

function run(seconds: number, driver: PlayerDriver, dt = 1 / 60): Sim {
  const sim = newSim();
  for (let t = 0; t < seconds; t += dt) tick(sim, dt, driver, t);
  return sim;
}

describe('Most Wanted — player-perspective pursuit simulation (Phase 10)', () => {
  it('speeding pulls a pursuit that escalates: roadblock, rhino, spikes, heli', () => {
    // Floor it the whole time; heat climbs to the ceiling and the roster ramps up (spawns are
    // 1.2 s apart, so allow enough time for the high-heat units to join the chase).
    const sim = run(64, (t) => ({ speed: t < 2 ? 0 : 40 }));
    // The squad showed up and chased (closed to the player).
    expect(sim.maxRoster).toBeGreaterThan(0);
    expect(sim.minNearest).toBeLessThan(25);
    // Heat escalated into the high band.
    expect(sim.maxLevel).toBeGreaterThanOrEqual(4);
    // The right tactics appeared at the right heat (recon-faithful).
    expect(sim.saw.roadblock).toBe(true); // heat >= 2
    expect(sim.saw.rhino).toBe(true); // heat >= 3
    expect(sim.saw.spikes).toBe(true); // heat >= 4
    expect(sim.saw.heli).toBe(true); // heat >= 4
  });

  it('getting boxed while slowing leads to a bust, then the squad stands down', () => {
    // Fast chase to build heat + a full squad, then stop and get surrounded.
    const sim = run(70, (t) => ({ speed: t < 42 ? 40 : 0 }));
    expect(sim.saw.boxed).toBe(true);
    expect(sim.bustedAt).not.toBeNull();
    expect(sim.bustedMessage?.kind).toBe('busted');
  });

  it('after a bust the chase ends: heat cools and the squad clears (no respawn)', () => {
    const sim = run(90, (t) => ({ speed: t < 42 ? 40 : 0 }));
    expect(sim.bustedAt).not.toBeNull();
    // Once busted, the roster empties (the squad stands down) ...
    const rosterAfterBust = sim.pursuit.units.length;
    expect(rosterAfterBust).toBe(0);
    // ... and heat eventually cools all the way down to a full clear.
    expect(sim.clearedAt).not.toBeNull();
    expect(sim.clearedAt).toBeGreaterThan(sim.bustedAt!);
    expect(sim.heat.level).toBe(0);
    expect(sim.units.count).toBe(0);
  });

  it('breaking line of sight (hide spot) lets you stand the chase down', () => {
    // Speed up and get chased, then duck into a hide spot (off-road, no longer speeding): the
    // cops lose sight of you, the heat cools, and the pursuit stands down. (Evasion is a
    // line-of-sight mechanic — Milestone 4 adds the actual hide spots; this verifies the path.)
    const sim = run(44, (t) => {
      if (t < 2) return { speed: 0 };
      if (t < 20) return { speed: 45 };
      return { speed: 10, hide: true };
    });
    expect(sim.maxLevel).toBeGreaterThanOrEqual(1);
    expect(sim.maxRoster).toBeGreaterThan(0); // the squad actually showed up
    expect(sim.evadedAt).not.toBeNull();
    expect(sim.heat.level).toBe(0);
  });

  it('the chase does not start on its own: clean driving stays at heat 0', () => {
    // No speeding (below the crime threshold) → no 911, no pursuit.
    const sim = run(12, () => ({ speed: 25 }));
    expect(sim.maxLevel).toBe(0);
    expect(sim.maxRoster).toBe(0);
    expect(sim.units.count).toBe(0);
  });
});
