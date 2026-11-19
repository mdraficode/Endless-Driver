/**
 * Phase 10 Most Wanted — the **tactical layer** (Milestone 3b). Pure geometry + logic
 * (Node-testable, no Three.js / Rapier / DOM). It turns the pursuit brain's roster into concrete
 * per-unit targets and the roadblock / spike-strip / helicopter placement, and it computes the
 * *feedback* the brain needs (nearest-unit distance + "boxed in") so the chase closes the loop:
 *
 *   brain (who/how many)  →  tactics (where each unit aims)  →  units (physics/mesh)
 *        ↑__________________ feedback (nearestUnitMeters, playerBoxed) __________________|
 *
 * Faithful to NFS Most Wanted (2005) — see `docs/NFS_MW_PURSUIT_RECON.md`: cruisers chase, a
 * rhino rams head-on, P.I.T. units shunt the rear, box-in units flank, a roadblock is laid across
 * the road ahead, spike strips go beyond it, and the heli hovers ahead of the player.
 */
import { policeMixForLevel, PURSUIT_TACTICS } from '../config/most-wanted';
import type { PoliceUnitKind } from './types';

/** A unit's current pose (maintained by the physics/mesh layer; synthetic in tests). */
export interface UnitPose {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly kind: PoliceUnitKind;
}

export interface PlayerPose {
  readonly x: number;
  readonly z: number;
  /** Chassis heading; forward = (-sin yaw, -cos yaw), matching the road network. */
  readonly yaw: number;
  readonly speedMps: number;
  readonly y: number;
}

/** Direction of the road ahead of the player (a unit vector). */
export interface RoadAhead {
  readonly forwardX: number;
  readonly forwardZ: number;
}

export type PursuitMode = 'chase' | 'ram' | 'box-left' | 'box-right' | 'pit' | 'heli';

export interface UnitCommand {
  readonly id: number;
  readonly mode: PursuitMode;
  readonly targetX: number;
  readonly targetZ: number;
}

export interface PlacementPoint {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface HeliPlacement {
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

export interface PursuitPlan {
  readonly commands: readonly UnitCommand[];
  readonly roadblock: PlacementPoint | null;
  readonly spikeStrip: PlacementPoint | null;
  readonly heli: HeliPlacement | null;
  /** Distance (m) to the closest unit — feedback to the brain (Infinity when none). */
  readonly nearestUnitMeters: number;
  /** True when units are boxing the player in — feedback to the brain (drives the bust). */
  readonly playerBoxed: boolean;
}

/** Per-frame inputs to the tactical layer. */
export interface PursuitTacticsFrame {
  readonly units: readonly UnitPose[];
  readonly player: PlayerPose;
  readonly road: RoadAhead;
  readonly level: number;
}

interface Vec {
  readonly x: number;
  readonly z: number;
}

function fwd(yaw: number): Vec {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Inverse of `fwd`: the yaw whose forward is the given direction. */
function yawOf(v: Vec): number {
  return Math.atan2(-v.x, -v.z);
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isCruiser(kind: PoliceUnitKind): boolean {
  return kind !== 'heli' && kind !== 'rhino' && kind !== 'cross';
}

export function computePursuitTactics(frame: PursuitTacticsFrame): PursuitPlan {
  const t = PURSUIT_TACTICS;
  const mix = policeMixForLevel(frame.level);
  const p = frame.player;
  const pf = fwd(p.yaw);
  const left: Vec = { x: pf.z, z: -pf.x };
  const right: Vec = { x: -pf.z, z: pf.x };
  const rf: Vec = { x: frame.road.forwardX, z: frame.road.forwardZ };
  const roadYaw = yawOf(rf);

  // Designate which cruisers box / P.I.T. (deterministic by roster order).
  const cruisers = frame.units.map((u, i) => ({ u, i })).filter(({ u }) => isCruiser(u.kind));
  const boxLeftIdx =
    frame.level >= 2 && mix.roadblocks && cruisers.length > 0 ? cruisers[0]!.i : -1;
  const boxRightIdx =
    frame.level >= 2 && mix.roadblocks && cruisers.length > 1 ? cruisers[1]!.i : -1;
  const pitIdx =
    frame.level >= 3 && mix.tactics.includes('pit') && cruisers.length > 2 ? cruisers[2]!.i : -1;

  const at = (v: Vec, s: number): Vec => ({ x: p.x + v.x * s, z: p.z + v.z * s });

  const commands: UnitCommand[] = frame.units.map((u, i) => {
    let mode: PursuitMode;
    let target: Vec;
    if (u.kind === 'heli') {
      mode = 'heli';
      target = at(rf, t.heliForwardMeters);
    } else if (u.kind === 'rhino') {
      // Head-on: aim ahead of the player so it meets you oncoming.
      mode = 'ram';
      target = at(pf, t.ramLeadMeters);
    } else if (u.kind === 'cross') {
      mode = 'chase';
      target = at(pf, 0);
    } else if (i === pitIdx) {
      mode = 'pit';
      target = at(pf, -t.pitGapMeters);
    } else if (i === boxLeftIdx) {
      mode = 'box-left';
      target = at(left, t.boxOffsetMeters);
    } else if (i === boxRightIdx) {
      mode = 'box-right';
      target = at(right, t.boxOffsetMeters);
    } else {
      mode = 'chase';
      target = at(pf, 0);
    }
    return { id: u.id, mode, targetX: target.x, targetZ: target.z };
  });

  const roadblock: PlacementPoint | null = mix.roadblocks
    ? (() => {
        const c = at(rf, t.roadblockDistMeters);
        return { x: c.x, z: c.z, yaw: roadYaw };
      })()
    : null;
  const spikeStrip: PlacementPoint | null = mix.spikeStrips
    ? (() => {
        const c = at(rf, t.roadblockDistMeters + t.spikeGapMeters);
        return { x: c.x, z: c.z, yaw: roadYaw };
      })()
    : null;
  const heli: HeliPlacement | null = mix.helicopter
    ? {
        x: p.x + rf.x * t.heliForwardMeters,
        z: p.z + rf.z * t.heliForwardMeters,
        y: p.y + t.heliHeightMeters,
      }
    : null;

  let nearest = Number.POSITIVE_INFINITY;
  let ahead = 0;
  let behind = 0;
  let within = 0;
  for (const u of frame.units) {
    const d = dist(u, p);
    if (d < nearest) nearest = d;
    if (d <= t.boxRadiusMeters) {
      within += 1;
      const dot = (u.x - p.x) * pf.x + (u.z - p.z) * pf.z;
      if (dot > 0) ahead += 1;
      else if (dot < 0) behind += 1;
    }
  }
  const playerBoxed = (ahead >= 1 && behind >= 1) || within >= 3;

  return { commands, roadblock, spikeStrip, heli, nearestUnitMeters: nearest, playerBoxed };
}
