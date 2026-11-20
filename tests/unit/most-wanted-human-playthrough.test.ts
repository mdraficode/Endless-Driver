import { describe, expect, it } from 'vitest';

import { BUST_CONFIG, EVADE_CONFIG, MW_TIER_CAPS } from '../../src/config/most-wanted';
import { initialBountyState, settleBounty, stepBounty } from '../../src/most-wanted/BountyModel';
import {
  initialBlacklistRaceState,
  stepBlacklistRace,
  type BlacklistRaceConfig,
} from '../../src/most-wanted/BlacklistRaceModel';
import { initialHideSpotState, stepHideSpot } from '../../src/most-wanted/HideSpotModel';
import { initialHeatState, stepHeat, type HeatState } from '../../src/most-wanted/HeatModel';
import { PoliceUnits } from '../../src/most-wanted/PoliceUnits';
import {
  initialPursuitState,
  stepPursuit,
  type PursuitState,
} from '../../src/most-wanted/PursuitModel';
import { computePursuitTactics } from '../../src/most-wanted/PursuitTactics';
import {
  initialTrapState,
  stepTraps,
  type TrapState,
} from '../../src/most-wanted/PursuitTrapsModel';
import type { PoliceUnitKind } from '../../src/most-wanted/types';
import type { SceneManager } from '../../src/core/SceneManager';

/**
 * **Intensive human‑player‑perspective playthrough** (Phase 10 Most Wanted).
 *
 * After each completed phase, this drives the *real, integrated* logic stack exactly the way
 * `Application` does — heat → pursuit brain → tactics → squad → **traps + hide spots + bounty +
 * KO‑cops** — with a **heuristic human driver** (it reacts to what it "sees": heat, the nearest
 * cop, whether it's boxed, traps ahead, hide spots) and a real longitudinal speed model (throttle /
 * brake / drag / spike‑deflation / roadblock‑slam). It asserts the experience a human actually has:
 *   - flooring it escalates the whole pursuit (squad, rhino, heli, roadblocks, spikes);
 *   - getting boxed + stopping → busted → you pay the fine (bounty forfeited);
 *   - ducking into a hide spot at high heat → you evade → you bank the bounty (D3);
 *   - roadblocks / spike strips actually slow you down;
 *   - plowing through a cruiser at speed → 10‑25 + its bounty joins your take (D6);
 *   - a Blacklist race (M5a) is won by a driver who holds pace, lost by one who stalls.
 *
 * The car/physics/scene coupling is stubbed (a no‑op SceneManager); everything else is the real code.
 */

const stubScene = { addObject: () => {}, removeObject: () => {} } as unknown as SceneManager;
const CAPS = MW_TIER_CAPS.A;
const RIVALS_BUSTED = 6;

// Player car longitudinal model (rough but faithful enough for the feel).
const TOP_SPEED = 40; // m/s (~144 km/h) — a speed crime (>34) but below the cruisers (42),
// so the squad can catch up and the chase actually sustains (see the pursuit simulation).
const ACCEL = 9; // m/s^2 at full throttle
const BRAKE = 14; // m/s^2
const DRAG = 0.35; // m/s^2
const DEFLECT_CAP = TOP_SPEED * 0.5; // deflated tyres can't go fast

/**
 * World hide spots. Off‑path (default) so they don't accidentally let a scenario hide; the evade
 * scenario uses the on‑path set so the driver (travelling -z at x=0) can actually reach one.
 */
const OFF_PATH_HIDE_SPOTS = [0, -1000, -2000, -3000].map((z) => ({ x: 600, z }));
const ON_PATH_HIDE_SPOTS = [0, -700, -1400, -2100, -2800, -3500].map((z) => ({ x: 0, z }));

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Situation {
  readonly t: number;
  readonly speed: number;
  readonly level: number;
  readonly nearestCop: number;
  /** True this frame if units are currently boxing the player in. */
  readonly boxed: boolean;
  readonly bustMeter: number;
  readonly deflated: boolean;
  /** Distance (m) to the nearest world hide spot (Infinity when none). */
  readonly nearestHideSpot: number;
  /** Distance (m) to the nearest hide spot AHEAD in the direction of travel (Infinity if none). */
  readonly hideSpotAhead: number;
}
interface Actions {
  readonly throttle: number;
  readonly brake: number;
}
type Human = (sit: Situation) => Actions;

interface Sim {
  heat: HeatState;
  pursuit: PursuitState;
  units: PoliceUnits;
  traps: TrapState;
  hideSpot: ReturnType<typeof initialHideSpotState>;
  bounty: ReturnType<typeof initialBountyState>;
  impoundStrikes: number;
  bountyPhase: 'none' | 'active' | 'settled';
  px: number;
  pz: number;
  speed: number;
  deflatedSeconds: number;
  crashSeconds: number;
  // Observations for a human-like "play" and the assertions.
  maxLevel: number;
  maxRoster: number;
  minNearest: number;
  saw: { rhino: boolean; heli: boolean; roadblock: boolean; spikes: boolean; boxed: boolean };
  bustedAt: number | null;
  bustedFine: number;
  bustedStrikes: number;
  evadedAt: number | null;
  careerBounty: number;
  koCount: number;
  koBounty: number;
  sawRoadblockHit: boolean;
  sawSpikeHit: boolean;
  minSpeedWhileChased: number;
  boxedNow: boolean;
  hideSpots: readonly { x: number; z: number }[];
  situation: Situation;
}

function newSim(hideSpots: readonly { x: number; z: number }[] = OFF_PATH_HIDE_SPOTS): Sim {
  return {
    heat: initialHeatState(),
    pursuit: initialPursuitState(),
    units: new PoliceUnits(stubScene),
    hideSpots,
    traps: initialTrapState(),
    hideSpot: initialHideSpotState(),
    bounty: initialBountyState(),
    impoundStrikes: 0,
    bountyPhase: 'none',
    px: 0,
    pz: 0,
    speed: 0,
    deflatedSeconds: 0,
    crashSeconds: 0,
    maxLevel: 0,
    maxRoster: 0,
    minNearest: Number.POSITIVE_INFINITY,
    saw: { rhino: false, heli: false, roadblock: false, spikes: false, boxed: false },
    bustedAt: null,
    bustedFine: 0,
    bustedStrikes: 0,
    evadedAt: null,
    careerBounty: 0,
    koCount: 0,
    koBounty: 0,
    sawRoadblockHit: false,
    sawSpikeHit: false,
    minSpeedWhileChased: Number.POSITIVE_INFINITY,
    boxedNow: false,
    situation: {
      t: 0,
      speed: 0,
      level: 0,
      nearestCop: Number.POSITIVE_INFINITY,
      boxed: false,
      bustMeter: 0,
      deflated: false,
      nearestHideSpot: Number.POSITIVE_INFINITY,
      hideSpotAhead: Number.POSITIVE_INFINITY,
    },
  };
}

/** One frame, mirroring `Application.#stepMostWanted` (debug off) + the M4 systems. */
function tick(sim: Sim, dt: number, human: Human, t: number): void {
  const actions = human(sim.situation);

  // ---- Longitudinal speed (throttle/brake/drag + trap effects). ----
  const deflated = sim.deflatedSeconds > 0;
  const crashing = sim.crashSeconds > 0;
  let accel =
    actions.throttle * ACCEL - actions.brake * BRAKE - DRAG * (0.3 + sim.speed / TOP_SPEED);
  if (deflated) accel -= 6; // flat tyres bleed off speed
  if (crashing) accel -= 22; // roadblock smash slams the brakes
  const cap = deflated ? DEFLECT_CAP : TOP_SPEED;
  sim.speed = clamp(sim.speed + accel * dt, 0, cap);
  sim.deflatedSeconds = Math.max(0, sim.deflatedSeconds - dt);
  sim.crashSeconds = Math.max(0, sim.crashSeconds - dt);

  // ---- Move (heading 0 → forward (0, -1)). ----
  sim.pz += -sim.speed * dt;
  const player = { x: sim.px, y: 0, z: sim.pz, yaw: 0, speedMps: sim.speed };
  const level = sim.heat.level;
  const engaged = level > 0;

  // Pursuit starts when heat rises from 0: fresh bounty accumulator + hide-spot charges (D5).
  if (level > 0 && sim.bountyPhase === 'none') {
    sim.bountyPhase = 'active';
    sim.bounty = { ...sim.bounty, currentPursuit: 0 };
    sim.hideSpot = initialHideSpotState();
  }

  // ---- Hide spots (M4b-1): a world hideout within range hides the player. ----
  const nearestHideSpot = sim.hideSpots.reduce(
    (best, h) => Math.min(best, Math.hypot(h.x - sim.px, h.z - sim.pz)),
    Number.POSITIVE_INFINITY,
  );
  // The driver travels in -z; a hide spot is "ahead" when its z is more negative than the player's.
  const hideSpotAhead = sim.hideSpots.reduce(
    (best, h) => (h.z < sim.pz ? Math.min(best, sim.pz - h.z) : best),
    Number.POSITIVE_INFINITY,
  );
  const inHideSpotZone = nearestHideSpot <= EVADE_CONFIG.hideSpotRadiusMeters;
  let hideInHideSpot = false;
  if (engaged) {
    const hide = stepHideSpot(sim.hideSpot, {
      inSpot: inHideSpotZone,
      wasInSpot: sim.situation.nearestHideSpot <= EVADE_CONFIG.hideSpotRadiusMeters,
    });
    sim.hideSpot = hide.state;
    hideInHideSpot = hide.inHideSpot;
  }

  let policeDetected = false;
  let ramedCop = false;
  let rammedPlayer = false;
  let roadblockCrashed = false;
  let destroyedKind: PoliceUnitKind | null;
  if (engaged) {
    const plan = computePursuitTactics({
      units: sim.units.poses(),
      player,
      road: { forwardX: 0, forwardZ: -1 },
      level,
    });
    const unitResult = sim.units.sync({
      roster: sim.pursuit.units,
      commands: plan.commands,
      player,
      dt,
    });
    rammedPlayer = unitResult.rammed;
    destroyedKind = unitResult.destroyed?.kind ?? null;
    if (destroyedKind !== null) {
      sim.koCount += 1;
      sim.koBounty += 1; // (bounty value added below via stepBounty)
    }
    const p = stepPursuit(sim.pursuit, {
      level,
      maxUnits: CAPS.maxUnits,
      maxHelicopters: CAPS.maxHelicopters,
      dt,
      playerSpeedMps: sim.speed,
      inHideSpot: hideInHideSpot,
      nearestUnitMeters: plan.nearestUnitMeters,
      playerBoxed: plan.playerBoxed && !hideInHideSpot, // hiding breaks the box (see Application)
      disabledUnitKind: destroyedKind,
      debugPolice: false,
      engaged,
    });
    sim.pursuit = p.state;
    sim.boxedNow = plan.playerBoxed;

    // Bounty accrues while in an active, unsettled chase; a KO'd cop's bounty joins the take (D6).
    if (sim.bountyPhase === 'active' && sim.pursuit.phase === 'pursuit') {
      const r = stepBounty(sim.bounty, {
        inPursuit: true,
        level,
        dt,
        disabledUnit: destroyedKind,
      });
      sim.bounty = r.state;
      if (r.bustedUnit !== null) sim.koBounty += r.bustedUnit.bounty;
    }

    // Physical traps (M4b-2): committed from the plan; a hit slams the brakes or deflates tyres.
    const pursuing = sim.pursuit.phase === 'pursuit' && !sim.pursuit.busted;
    const trap = stepTraps(sim.traps, {
      pursuing,
      playerX: sim.px,
      playerZ: sim.pz,
      dt,
      roadblockPlacement: plan.roadblock,
      spikePlacement: plan.spikeStrip,
    });
    sim.traps = trap.state;
    if (trap.events.roadblockHit) {
      sim.sawRoadblockHit = true;
      roadblockCrashed = true;
      sim.crashSeconds = 0.7;
    }
    if (trap.events.spikeHit) {
      sim.sawSpikeHit = true;
      sim.deflatedSeconds = 12;
    }

    if (p.signals.busted) {
      sim.units.clear();
      if (sim.bountyPhase === 'active') {
        const s = settleBounty(sim.bounty, 'busted', level, sim.impoundStrikes);
        sim.bounty = s.state;
        sim.impoundStrikes = s.impoundStrikes;
        sim.bustedFine = s.fine;
        sim.bustedStrikes = s.impoundStrikes;
        sim.bountyPhase = 'settled';
      }
    }
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
    if (p.signals.busted && sim.bustedAt === null) sim.bustedAt = t;
    sim.minSpeedWhileChased = Math.min(sim.minSpeedWhileChased, sim.speed);
  } else {
    sim.units.clear();
    sim.traps = initialTrapState();
    sim.boxedNow = false;
  }
  sim.maxRoster = Math.max(sim.maxRoster, sim.pursuit.units.length);

  // ---- Heat model: always runs. ----
  const h = stepHeat(
    sim.heat,
    {
      speedMps: sim.speed,
      stationary: sim.speed < 1.5,
      ramed: ramedCop,
      collided: rammedPlayer,
      roadblockCrash: roadblockCrashed,
      policeDetected,
      rivalsBusted: RIVALS_BUSTED,
    },
    dt,
  );
  sim.heat = h.state;
  sim.maxLevel = Math.max(sim.maxLevel, sim.heat.level);

  // Fully cleared: bank an evaded bounty (D3) and reset (matches Application).
  if (sim.heat.level <= 0 && !engaged) {
    if (sim.bountyPhase === 'active') {
      const s = settleBounty(sim.bounty, 'evaded', level, sim.impoundStrikes);
      sim.bounty = s.state;
      sim.bountyPhase = 'none';
    }
    sim.heat = initialHeatState();
    sim.pursuit = initialPursuitState();
    sim.units.clear();
    sim.traps = initialTrapState();
  }
  sim.careerBounty = sim.bounty.careerTotal;
  if (sim.heat.level === 0 && sim.evadedAt === null && sim.maxLevel > 0) sim.evadedAt = t;

  // ---- Expose the situation to the human driver. ----
  sim.situation = {
    t,
    speed: sim.speed,
    level: sim.heat.level,
    nearestCop: sim.minNearest === Number.POSITIVE_INFINITY ? Infinity : nearestNow(sim),
    boxed: sim.boxedNow,
    bustMeter: sim.pursuit.bustMeter,
    deflated: sim.deflatedSeconds > 0,
    nearestHideSpot,
    hideSpotAhead,
  };
}

function nearestNow(sim: Sim): number {
  // Distance from the player to the closest visible unit.
  return sim.units.poses().reduce((best, u) => {
    const d = Math.hypot(u.x - sim.px, u.z - sim.pz);
    return d < best ? d : best;
  }, Number.POSITIVE_INFINITY);
}

function run(
  seconds: number,
  human: Human,
  dt = 1 / 60,
  hideSpots: readonly { x: number; z: number }[] = OFF_PATH_HIDE_SPOTS,
): Sim {
  const sim = newSim(hideSpots);
  for (let t = 0; t < seconds; t += dt) tick(sim, dt, human, t);
  return sim;
}

// The 34 m/s speed-crime threshold lives in HEAT_CONFIG; the driver floors well above it.
const FLOOR = (): Actions => ({ throttle: 1, brake: 0 });

describe('Most Wanted — intensive human‑player‑perspective playthrough (Phase 10)', () => {
  it('flooring it escalates the WHOLE pursuit: squad, rhino, heli, roadblocks, spikes', () => {
    const sim = run(70, FLOOR);
    expect(sim.maxRoster).toBeGreaterThan(0);
    expect(sim.minNearest).toBeLessThan(25); // the squad closed in on you
    expect(sim.maxLevel).toBeGreaterThanOrEqual(4);
    expect(sim.saw.roadblock).toBe(true);
    expect(sim.saw.rhino).toBe(true);
    expect(sim.saw.spikes).toBe(true);
    expect(sim.saw.heli).toBe(true);
    // A long chase accrues a real bounty.
    expect(sim.bounty.currentPursuit + sim.careerBounty).toBeGreaterThan(0);
  });

  it('giving up when boxed → busted → you pay the fine and forfeit the bounty (D4)', () => {
    // Floor it until the chase is hot (level 3); a cornered human gives up — slams to a stop and
    // lets them box you in (the box only forms once you're slow), the bust meter fills → busted.
    const sim = run(90, (sit) => (sit.level >= 3 ? { throttle: 0, brake: 1 } : FLOOR()));
    expect(sim.bustedAt).not.toBeNull();
    // The fine is the real bust settlement: base + per-level, and an impound strike is taken.
    expect(sim.bustedFine).toBeGreaterThanOrEqual(BUST_CONFIG.baseFine);
    expect(sim.bustedStrikes).toBe(1);
    // The pursuit bounty was forfeited on the bust (not banked into the career total).
    expect(sim.bounty.currentPursuit).toBe(0);
  });

  it('ducking into a hide spot during a chase → you evade and BANK the bounty (D3 + D5)', () => {
    // Floor it to build a chase; when a hide spot is ahead, brake into it and stop INSIDE it (a
    // human pulls into cover and stands it down — stays parked). Hiding breaks the box, the squad
    // loses sight, the heat cools → you evade and keep the accrued bounty.
    let inCover = false;
    const sim = run(
      140,
      (sit) => {
        if (sit.level >= 2 && sit.hideSpotAhead < 100) inCover = true;
        if (inCover) return { throttle: 0, brake: 1 }; // brake into cover, then hold the stop
        return FLOOR();
      },
      1 / 60,
      ON_PATH_HIDE_SPOTS,
    );
    expect(sim.maxLevel).toBeGreaterThanOrEqual(2); // it was a real chase (roadblocks, box-in)
    expect(sim.maxRoster).toBeGreaterThan(0);
    expect(sim.evadedAt).not.toBeNull(); // you actually stood it down
    expect(sim.heat.level).toBe(0); // and you're still clean — the squad gave up
    // The accrued bounty was kept into the career total (D3) — that's the whole point of evading.
    expect(sim.careerBounty).toBeGreaterThan(0);
  });

  it('roadblocks and spike strips really slow you down (M4b-2)', () => {
    // A full-speed chase lays traps ahead; driving into them slams the brakes (roadblock) and
    // deflates the tyres (spikes). The driver should be measurably slowed at some point.
    const sim = run(80, FLOOR);
    expect(sim.sawRoadblockHit).toBe(true);
    expect(sim.sawSpikeHit).toBe(true);
    // At some point while being chased the driver was far below top speed (traps + deflation).
    expect(sim.minSpeedWhileChased).toBeLessThan(TOP_SPEED * 0.6);
  });

  it('plowing through a cruiser at speed → 10-25 + its bounty joins your take (M4c, D6)', () => {
    // A full-speed chase puts cruisers in contact; plowing through at speed wrecks them.
    const sim = run(90, FLOOR);
    expect(sim.koCount).toBeGreaterThanOrEqual(1);
    expect(sim.koBounty).toBeGreaterThan(0); // the wrecked cop's bounty value was added
  });

  it('Blacklist race (M5a): holding pace wins, stalling / busting loses', () => {
    const race: BlacklistRaceConfig = {
      routeLengthMeters: 4000,
      timeLimitSeconds: 300,
      rivalCruiseSpeedMps: 30, // rival covers it in ~133s
      rivalHeadStartMeters: 0,
      countdownSeconds: 3,
    };
    // A driver who holds ~40 m/s beats the 30 m/s rival to the finish.
    const winner = (() => {
      let s = initialBlacklistRaceState(race);
      let outcome: 'won' | 'lost' | null = null;
      const dt = 0.1;
      for (let t = 0; t < 200 && outcome === null; t += dt) {
        const progress = Math.min(1, (t * 40) / race.routeLengthMeters);
        const r = stepBlacklistRace(race, s, { dt, playerProgress: progress, busted: false });
        s = r.state;
        outcome = r.outcome;
      }
      return outcome;
    })();
    expect(winner).toBe('won');

    // A driver who stalls (barely moves) loses — the rival finishes first.
    const loser = (() => {
      let s = initialBlacklistRaceState(race);
      let outcome: 'won' | 'lost' | null = null;
      const dt = 0.1;
      for (let t = 0; t < 300 && outcome === null; t += dt) {
        const progress = Math.min(1, (t * 4) / race.routeLengthMeters);
        const r = stepBlacklistRace(race, s, { dt, playerProgress: progress, busted: false });
        s = r.state;
        outcome = r.outcome;
      }
      return outcome;
    })();
    expect(loser).toBe('lost');
  });
});
