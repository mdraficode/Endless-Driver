import { TREE_COLLISION, TREE_DAMAGE, type VegetationSpecies } from '../config/districts';
import type { TerrainSampler } from './terrain-height';
import { chunkKey } from './terrain-chunks';
import { generateChunkVegetation, type VegetationPlacement } from './vegetation-placement';

/**
 * Vegetation collision & destruction (owner request 2026-10-16): trees are
 * solid, and they answer impacts by severity — a brush bends them, a solid
 * hit snaps the trunk (crown falls, stump stays), a fast hit shatters them.
 * Rocks never break; they just stop the car.
 *
 * This module is physics-side and renderer-free: it owns the eternal truth
 * about every plant near the car (condition, accumulated damage, lean) using
 * exactly the placements the renderer draws (`vegetation-placement.ts`), so
 * the tree you see is the tree you hit. The renderer mirrors this state from
 * hit events + a state provider; debris animation is its own business.
 *
 * Collision is analytic (trunk circle vs the car's OBB in plan view) evaluated
 * once per frame before the physics step — the response is an impulse on the
 * car body, so Rapier still owns the car's motion; no per-tree colliders to
 * stream, and tunnelling is impossible at car speeds vs the OBB size.
 */

export type TreeCondition = 'intact' | 'bent' | 'snapped' | 'shattered';
export type TreeOutcome = 'bend' | 'snap' | 'shatter';

export interface TreeVisualState {
  readonly condition: TreeCondition;
  readonly leanAngleRad: number;
  readonly leanDirX: number;
  readonly leanDirZ: number;
}

interface TreeRecord extends TreeVisualState {
  damage: number;
  lastHitTime: number;
  condition: TreeCondition;
  leanAngleRad: number;
  leanDirX: number;
  leanDirZ: number;
}

export interface TreeHitEvent {
  readonly key: string;
  readonly species: VegetationSpecies;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotationY: number;
  readonly outcome: TreeOutcome;
  readonly impactSpeed: number;
  /** Unit direction the car was travelling (the way the tree gives way). */
  readonly dirX: number;
  readonly dirZ: number;
  readonly leanAngleRad: number;
}

export interface TreeHit extends TreeHitEvent {
  /** Contact normal in world space, pointing from the tree toward the car. */
  readonly normalX: number;
  readonly normalZ: number;
  readonly penetration: number;
  /** Velocity (m/s along the normal) this hit removes from the car. */
  readonly absorbedSpeed: number;
  readonly solid: boolean;
  /** True when this hit spent hit points (renderer reacts); false for brushes/solids. */
  readonly impact: boolean;
  /** Lateral offset of the contact from the car's centre (for yaw kick). */
  readonly lateralOffset: number;
}

interface BodyLike {
  mass(): number;
  linvel(): { x: number; y: number; z: number };
  applyImpulse(impulse: { x: number; y: number; z: number }, wakeUp: boolean): void;
  applyTorqueImpulse(impulse: { x: number; y: number; z: number }, wakeUp: boolean): void;
}

const CAR_HALF_WIDTH = 0.9;
const CAR_HALF_LENGTH = 2.05;

export class TreeCollisionField {
  readonly #sampler: TerrainSampler;
  readonly #chunks = new Map<string, VegetationPlacement[]>();
  readonly #records = new Map<string, TreeRecord>();
  #time = 0;
  #centerChunkX = Number.NaN;
  #centerChunkZ = Number.NaN;

  constructor(sampler: TerrainSampler) {
    this.#sampler = sampler;
  }

  /** Keeps placements generated in the collision radius around a world point. */
  sync(focusX: number, focusZ: number): void {
    const size = this.#sampler.config.chunkSizeMeters;
    const cx = Math.floor(focusX / size);
    const cz = Math.floor(focusZ / size);
    if (cx === this.#centerChunkX && cz === this.#centerChunkZ) {
      return;
    }
    this.#centerChunkX = cx;
    this.#centerChunkZ = cz;
    const wanted = new Set<string>();
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const key = chunkKey(cx + dx, cz + dz);
        wanted.add(key);
        if (!this.#chunks.has(key)) {
          this.#chunks.set(key, generateChunkVegetation(this.#sampler, cx + dx, cz + dz));
        }
      }
    }
    for (const key of [...this.#chunks.keys()]) {
      if (!wanted.has(key)) {
        this.#chunks.delete(key);
      }
    }
  }

  /** The renderer's window on the truth (bent angle, condition) for one plant. */
  getVisualState(key: string): TreeVisualState | undefined {
    const record = this.#records.get(key);
    if (record === undefined || record.condition === 'intact') {
      return undefined;
    }
    return {
      condition: record.condition,
      leanAngleRad: record.leanAngleRad,
      leanDirX: record.leanDirX,
      leanDirZ: record.leanDirZ,
    };
  }

  /** Counts by condition, for diagnostics (how much of the forest is down). */
  get stats(): { bent: number; snapped: number; shattered: number } {
    let bent = 0;
    let snapped = 0;
    let shattered = 0;
    for (const record of this.#records.values()) {
      if (record.condition === 'bent') bent += 1;
      else if (record.condition === 'snapped') snapped += 1;
      else if (record.condition === 'shattered') shattered += 1;
    }
    return { bent, snapped, shattered };
  }

  /**
   * Tests the car (world position, yaw, horizontal velocity) against every
   * standing trunk nearby and returns the hits this frame, newest damage
   * already applied to the records. Call once per frame before the physics
   * step, then `respond` each hit onto the body.
   */
  evaluate(
    car: {
      readonly x: number;
      readonly z: number;
      readonly yaw: number;
      readonly velocityX: number;
      readonly velocityZ: number;
    },
    deltaSeconds: number,
  ): TreeHit[] {
    this.#time += deltaSeconds;
    const hits: TreeHit[] = [];
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const speed = Math.hypot(car.velocityX, car.velocityZ);
    const travelX = speed > 0.01 ? car.velocityX / speed : -sin;
    const travelZ = speed > 0.01 ? car.velocityZ / speed : -cos;

    for (const placements of this.#chunks.values()) {
      for (const placement of placements) {
        const dx = placement.x - car.x;
        const dz = placement.z - car.z;
        if (dx * dx + dz * dz > 64) {
          continue;
        }
        const record = this.#records.get(placement.key);
        if (record !== undefined && record.condition !== 'intact' && record.condition !== 'bent') {
          continue; // Snapped/shattered: the stump is low enough to straddle.
        }
        const damage = TREE_DAMAGE[placement.species];
        const radius = damage.trunkRadius * placement.scale;
        // World → car plan frame (forward is -Z local).
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const closestX = Math.max(-CAR_HALF_WIDTH, Math.min(CAR_HALF_WIDTH, lx));
        const closestZ = Math.max(-CAR_HALF_LENGTH, Math.min(CAR_HALF_LENGTH, lz));
        const offX = lx - closestX;
        const offZ = lz - closestZ;
        const distSq = offX * offX + offZ * offZ;
        if (distSq >= radius * radius) {
          continue;
        }
        // Contact normal (car frame → world). Inside the OBB, exit along the
        // shallowest axis; otherwise away from the closest point.
        let normalLocalX: number;
        let normalLocalZ: number;
        let penetration: number;
        if (distSq > 1e-9) {
          const dist = Math.sqrt(distSq);
          // off points car→tree; the contact normal points tree→car.
          normalLocalX = -offX / dist;
          normalLocalZ = -offZ / dist;
          penetration = radius - dist;
        } else if (CAR_HALF_WIDTH - Math.abs(lx) < CAR_HALF_LENGTH - Math.abs(lz)) {
          normalLocalX = lx >= 0 ? -1 : 1;
          normalLocalZ = 0;
          penetration = CAR_HALF_WIDTH - Math.abs(lx) + radius;
        } else {
          normalLocalX = 0;
          normalLocalZ = lz >= 0 ? -1 : 1;
          penetration = CAR_HALF_LENGTH - Math.abs(lz) + radius;
        }
        const normalX = normalLocalX * cos + normalLocalZ * sin;
        const normalZ = -normalLocalX * sin + normalLocalZ * cos;
        const closing = -(car.velocityX * normalX + car.velocityZ * normalZ);
        const onCooldown =
          record !== undefined &&
          this.#time - record.lastHitTime < TREE_COLLISION.hitCooldownSeconds;
        const solid = placement.species === 'rock';

        if (solid || closing <= TREE_COLLISION.minImpactSpeed || onCooldown) {
          // Solid contact (or a brush): positional resistance only, no event.
          if (penetration > 0.01) {
            hits.push({
              key: placement.key,
              species: placement.species,
              variant: placement.variant,
              x: placement.x,
              y: placement.y,
              z: placement.z,
              scale: placement.scale,
              rotationY: placement.rotationY,
              outcome: 'bend',
              impactSpeed: Math.max(0, closing),
              dirX: travelX,
              dirZ: travelZ,
              leanAngleRad: 0,
              normalX,
              normalZ,
              penetration,
              absorbedSpeed: solid ? Math.max(0, closing) : 0,
              solid,
              impact: false,
              lateralOffset: lx,
            });
          }
          continue;
        }

        // A real impact: spend the tree's hit points.
        const existing: TreeRecord = record ?? {
          damage: 0,
          lastHitTime: -Number.POSITIVE_INFINITY,
          condition: 'intact',
          leanAngleRad: 0,
          leanDirX: travelX,
          leanDirZ: travelZ,
        };
        existing.damage += closing * TREE_COLLISION.damagePerSpeed;
        existing.lastHitTime = this.#time;
        let outcome: TreeOutcome;
        if (closing >= damage.shatterSpeed || existing.damage >= damage.hitPoints * 2.2) {
          outcome = 'shatter';
          existing.condition = 'shattered';
        } else if (existing.damage >= damage.hitPoints) {
          outcome = 'snap';
          existing.condition = 'snapped';
        } else {
          outcome = 'bend';
          existing.condition = 'bent';
          existing.leanDirX = travelX;
          existing.leanDirZ = travelZ;
          existing.leanAngleRad = Math.min(0.8, 0.14 + (existing.damage / damage.hitPoints) * 0.66);
        }
        this.#records.set(placement.key, existing);
        hits.push({
          key: placement.key,
          species: placement.species,
          variant: placement.variant,
          x: placement.x,
          y: placement.y,
          z: placement.z,
          scale: placement.scale,
          rotationY: placement.rotationY,
          outcome,
          impactSpeed: closing,
          dirX: travelX,
          dirZ: travelZ,
          leanAngleRad: existing.leanAngleRad,
          normalX,
          normalZ,
          penetration,
          absorbedSpeed: Math.min(closing, damage.stopSpeed * (outcome === 'bend' ? 0.45 : 1)),
          solid: false,
          impact: true,
          lateralOffset: lx,
        });
      }
    }
    return hits;
  }

  /** Applies one hit's velocity change (and a whisper of yaw) to the car body. */
  respond(body: BodyLike, hit: TreeHit): void {
    const velocity = body.linvel();
    const vn = velocity.x * hit.normalX + velocity.z * hit.normalZ;
    let target = vn + hit.absorbedSpeed;
    if (!hit.impact) {
      // No break: never leave the car interpenetrating — guarantee separation.
      target = Math.max(target, Math.min(2.5, hit.penetration * 5));
    }
    if (hit.solid && hit.impactSpeed > 1) {
      // A rock gives a little back.
      target = Math.max(target, hit.impactSpeed * 0.12);
    }
    const dv = target - vn;
    if (dv <= 0) {
      return;
    }
    const mass = body.mass();
    body.applyImpulse({ x: hit.normalX * dv * mass, y: 0, z: hit.normalZ * dv * mass }, true);
    // Off-centre hits nudge the nose away; centre hits stay clean.
    const torque = -hit.lateralOffset * dv * mass * 0.06;
    if (Math.abs(torque) > 1) {
      body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
    }
  }
}
