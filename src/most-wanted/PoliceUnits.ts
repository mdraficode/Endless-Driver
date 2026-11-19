/**
 * Phase 10 Most Wanted — **visible police units** (Milestone 3b).
 *
 * Spawns/steers a low-poly squad of police units that chase the player during an active pursuit.
 * Units are *kinematic visuals*: each frame they move toward the tactical target computed by
 * `computePursuitTactics` (see `PursuitTactics.ts`) and are rendered as simple meshes. A rhino or
 * Cross that closes to the player triggers a "rammed" event (proximity), which feeds the pursuit
 * brain. This keeps the chase visible and robust; full physical collision with the player car is a
 * follow-up.
 *
 * The per-frame movement (`stepChasePos`) is pure and unit-tested; the Three.js/Rapier wiring is
 * thin around it.
 */
import * as THREE from 'three';

import { POLICE_UNITS } from '../config/most-wanted';
import type { SceneManager } from '../core/SceneManager';
import type { PoliceUnitKind } from './types';
import type { UnitCommand, UnitPose } from './PursuitTactics';

/** A unit's roster entry (id + kind), straight from the pursuit brain. */
export interface PoliceUnitEntry {
  readonly id: number;
  readonly kind: PoliceUnitKind;
}

export interface PoliceUnitsPlayer {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly yaw: number;
  readonly speedMps: number;
}

export interface PoliceUnitsFrame {
  readonly roster: readonly PoliceUnitEntry[];
  readonly commands: readonly UnitCommand[];
  readonly player: PoliceUnitsPlayer;
  readonly dt: number;
}

export interface PoliceUnitsResult {
  /** True if a ram-type unit (rhino / Cross) is within ram distance of the player this frame. */
  readonly rammed: boolean;
  /** The first cop the player plows through at speed this frame (null otherwise). */
  readonly destroyed: { readonly id: number; readonly kind: PoliceUnitKind } | null;
  /** World positions of all visible units, for the minimap. */
  readonly blips: readonly { readonly id: number; readonly x: number; readonly z: number }[];
}

interface UnitVisual {
  readonly id: number;
  readonly kind: PoliceUnitKind;
  x: number;
  z: number;
  readonly group: THREE.Group;
}

/**
 * Max approach speed (m/s) per unit kind. Crucially the cruisers must out-run the speed-crime
 * threshold (34 m/s) so a speeding racer can actually sustain a chase — otherwise the player
 * outruns the squad, "loses" them, and the heat cools before it can escalate (see the
 * player-perspective simulation test).
 */
function unitSpeed(kind: PoliceUnitKind): number {
  if (kind === 'heli') return 30; // hovers ahead, doesn't really chase
  if (kind === 'rhino') return 58; // kamikaze, fastest
  if (kind === 'cross') return 50;
  return 42; // cruisers
}

const RAM_DISTANCE_METERS = 5;

/** Player must be moving at least this fast (m/s) to plow through a cop. */
const DESTROY_SPEED_METERS = 18;
/** The player is "on" a cop within this distance (m). */
const DESTROY_RADIUS_METERS = 4.5;
/** Units tougher than this damageResist survive being plowed through (armoured / air). */
const DESTROY_MAX_RESIST = 0.65;

/**
 * Can the player destroy this unit by plowing through it? A soft unit (cruiser-class) at speed
 * is wrecked; an armoured rhino / Cross / SUV, a van, or a helicopter is not. Pure + unit-tested.
 */
export function canPlayerDestroyUnit(
  speedMps: number,
  distanceMeters: number,
  kind: PoliceUnitKind,
): boolean {
  if (kind === 'heli') return false;
  if (POLICE_UNITS[kind].damageResist > DESTROY_MAX_RESIST) return false;
  return speedMps >= DESTROY_SPEED_METERS && distanceMeters <= DESTROY_RADIUS_METERS;
}

/** Move `current` toward `target` by at most `maxSpeed * dt` (pure, unit-tested). */
export function stepChasePos(
  current: { x: number; z: number },
  target: { x: number; z: number },
  maxSpeed: number,
  dt: number,
): { x: number; z: number } {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const dist = Math.hypot(dx, dz);
  const step = maxSpeed * dt;
  if (dist <= step || dist === 0) return { x: target.x, z: target.z };
  const k = step / dist;
  return { x: current.x + dx * k, z: current.z + dz * k };
}

const UNIT_COLORS: Record<PoliceUnitKind, number> = {
  sedan: 0x1b3a6b,
  unmarked: 0x0c0d10,
  motorcycle: 0x274b6d,
  van: 0x34506f,
  suv: 0x33363b,
  muscle: 0x153a7a,
  heli: 0x2f4a70,
  rhino: 0x4a4e55,
  cross: 0x101a2e,
};

function unitSize(kind: PoliceUnitKind): [number, number, number] {
  if (kind === 'heli') return [6, 3, 10];
  if (kind === 'rhino') return [3, 2.2, 4.6];
  if (kind === 'suv') return [2.3, 1.8, 4.6];
  if (kind === 'van') return [2.2, 2.2, 5];
  return [2.0, 1.4, 4.4];
}

export class PoliceUnits {
  private readonly units = new Map<number, UnitVisual>();
  private readonly geometries = new Map<PoliceUnitKind, THREE.BoxGeometry>();
  private readonly materials = new Map<PoliceUnitKind, THREE.MeshStandardMaterial>();
  private readonly barGeo = new THREE.BoxGeometry(1.1, 0.22, 0.5);
  private readonly barMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    emissive: 0xff2b2b,
    emissiveIntensity: 1.4,
  });

  constructor(private readonly scene: SceneManager) {}

  get count(): number {
    return this.units.size;
  }

  /** Current world poses of every visible unit (feeds the tactical layer's feedback loop). */
  poses(): UnitPose[] {
    return [...this.units.values()].map((u) => ({
      id: u.id,
      x: u.x,
      z: u.z,
      yaw: 0,
      kind: u.kind,
    }));
  }

  /** Spawn/despawn/steer the squad to match the brain's roster. Returns ram + blips. */
  sync(frame: PoliceUnitsFrame): PoliceUnitsResult {
    const { roster, commands, player, dt } = frame;

    // Despawn units that left the roster (busted / taken out / pursuit ended).
    const wanted = new Set<number>(roster.map((u) => u.id));
    for (const id of [...this.units.keys()]) if (!wanted.has(id)) this.#despawn(id);

    // Spawn new units + steer existing ones.
    let rammed = false;
    let destroyed: { id: number; kind: PoliceUnitKind } | null = null;
    const blips: { id: number; x: number; z: number }[] = [];
    for (const entry of roster) {
      const cmd = commands.find((c) => c.id === entry.id);
      // A just-added roster unit has no tactical command yet — chase the player until next tick.
      const targetX = cmd ? cmd.targetX : player.x;
      const targetZ = cmd ? cmd.targetZ : player.z;
      let unit = this.units.get(entry.id);
      if (!unit) {
        unit = this.#spawn(entry.id, entry.kind, player);
        this.units.set(entry.id, unit);
      }
      // Move toward the tactical target.
      const moved = stepChasePos(
        { x: unit.x, z: unit.z },
        { x: targetX, z: targetZ },
        unitSpeed(entry.kind),
        dt,
      );
      unit.x = moved.x;
      unit.z = moved.z;
      // Orient toward the target (front of the car along -z at yaw 0, matching the player).
      const faceYaw = Math.atan2(-(targetX - unit.x), -(targetZ - unit.z));
      this.#place(unit, player.y, faceYaw);
      blips.push({ id: entry.id, x: unit.x, z: unit.z });
      const distance = Math.hypot(unit.x - player.x, unit.z - player.z);
      if ((entry.kind === 'rhino' || entry.kind === 'cross') && distance <= RAM_DISTANCE_METERS) {
        rammed = true;
      }
      // The player plows through a soft cop at speed → it's destroyed (first one this frame).
      if (destroyed === null && canPlayerDestroyUnit(player.speedMps, distance, entry.kind)) {
        destroyed = { id: entry.id, kind: entry.kind };
      }
    }
    return { rammed, destroyed, blips };
  }

  #spawn(id: number, kind: PoliceUnitKind, player: PoliceUnitsPlayer): UnitVisual {
    const size = unitSize(kind);
    let geo = this.geometries.get(kind);
    if (!geo) {
      geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
      this.geometries.set(kind, geo);
    }
    let mat = this.materials.get(kind);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: UNIT_COLORS[kind],
        roughness: 0.55,
        metalness: 0.35,
      });
      this.materials.set(kind, mat);
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo, mat);
    body.position.y = size[1] / 2;
    group.add(body);
    // A small light bar on the roof (shared geometry + material).
    const bar = new THREE.Mesh(this.barGeo, this.barMat);
    bar.position.y = size[1] + 0.12;
    group.add(bar);
    this.scene.addObject(group);

    // Spawn behind the player's heading from a realistic *response* distance. Crucially this is
    // beyond the evade detect radius (90 m): a player faster than the squad can pull past it and
    // break the chase, while a slower player gets caught as units close in. (If it were ~18 m the
    // squad would always be in detect range and the player could never lose them — see the
    // player-perspective simulation test.)
    const spawnDist = 100;
    const backX = player.x + Math.sin(player.yaw) * spawnDist;
    const backZ = player.z + Math.cos(player.yaw) * spawnDist;
    return { id, kind, x: backX, z: backZ, group };
  }

  #place(unit: UnitVisual, groundY: number, yaw: number): void {
    unit.group.position.set(unit.x, groundY, unit.z);
    unit.group.rotation.y = yaw;
  }

  #despawn(id: number): void {
    const unit = this.units.get(id);
    if (!unit) return;
    this.scene.removeObject(unit.group);
    this.units.delete(id);
  }

  /** Remove every unit (pursuit ended / busted / game over). */
  clear(): void {
    for (const id of [...this.units.keys()]) this.#despawn(id);
  }

  dispose(): void {
    this.clear();
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.barGeo.dispose();
    this.barMat.dispose();
  }
}
