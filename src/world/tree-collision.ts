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
 *
 * The impulse is a momentum exchange, stated once and used by both sides:
 * the car's normal velocity change times its mass is the reaction impulse
 * (newton-seconds). A tree that stays standing is rooted, so that impulse is
 * delivered into the tree-plus-ground system and the car loses its closing
 * speed; a tree that fails converts the configured share of the same impulse
 * into crown/shard motion (`reactionSpeed`), with the rest dissipated in the
 * fracture. Standing trees keep resisting on contact frames between damage
 * hits — the damage cooldown never opens a hole the car can push through.
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
  /** Normal speed (m/s) this hit takes out of the car — the impulse per kilogram of car. */
  readonly absorbedSpeed: number;
  /**
   * Equal-and-opposite impulse (N·s) delivered to the tree/ground system:
   * exactly the car's mass times `absorbedSpeed`, in the opposite direction.
   */
  readonly reactionImpulseNs: number;
  /**
   * Speed (m/s) the failed trunk/crown carries away from that impulse, after
   * the fracture's dissipation share. Zero for rocks (the ground takes it).
   */
  readonly reactionSpeed: number;
}

export interface TreeHit extends TreeHitEvent {
  /** Contact normal in world space, pointing from the tree toward the car. */
  readonly normalX: number;
  readonly normalZ: number;
  readonly penetration: number;
  readonly solid: boolean;
  /** True when the tree is still rooted and resists as an anchored obstacle. */
  readonly rooted: boolean;
  /** True when this hit spent hit points (renderer reacts); false for brushes/solids. */
  readonly impact: boolean;
  /** Lateral offset of the contact from the car's centre (for yaw kick). */
  readonly lateralOffset: number;
  /** Signed lever arm (m) of the contact about the car's yaw axis. */
  readonly yawLeverArmMeters: number;
  /** Share of that lever arm converted into angular impulse. */
  readonly yawImpulseFraction: number;
}

export interface CollisionBody {
  mass(): number;
  linvel(): { x: number; y: number; z: number };
  applyImpulse(impulse: { x: number; y: number; z: number }, wakeUp: boolean): void;
  applyTorqueImpulse(impulse: { x: number; y: number; z: number }, wakeUp: boolean): void;
}

type BodyLike = CollisionBody;

const CAR_HALF_WIDTH = 0.9;
const CAR_HALF_LENGTH = 2.05;
/** Fallback car mass (kg) when a caller cannot report the body's real mass. */
const REFERENCE_CAR_MASS_KG = 1200;

/**
 * Speed a failed trunk/crown carries away from a reaction impulse: the
 * configured momentum share divided by the participating mass. Capped so a
 * featherweight bamboo clump cannot leave at ballistic-fiction speeds.
 */
function reactionSpeedFor(impulseNs: number, impactMassKg: number): number {
  if (!Number.isFinite(impactMassKg) || impactMassKg <= 0) {
    return 0;
  }
  return Math.min(13, (impulseNs * TREE_COLLISION.momentumTransferFraction) / impactMassKg);
}

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

  /**
   * Keeps placements generated in the collision radius around a world point.
   * `maxNewChunksPerCall` lets the application spread the initial nine-chunk window over frames;
   * the center chunk is always generated first so collision at the car never waits on the ring.
   */
  sync(focusX: number, focusZ: number, maxNewChunksPerCall = Number.POSITIVE_INFINITY): void {
    const size = this.#sampler.config.chunkSizeMeters;
    const cx = Math.floor(focusX / size);
    const cz = Math.floor(focusZ / size);
    const centerChanged = cx !== this.#centerChunkX || cz !== this.#centerChunkZ;
    if (!centerChanged && this.#chunks.size === 9) {
      return;
    }
    this.#centerChunkX = cx;
    this.#centerChunkZ = cz;
    const wanted = new Set<string>();
    const missing: { cx: number; cz: number; distanceSquared: number }[] = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const chunkX = cx + dx;
        const chunkZ = cz + dz;
        const key = chunkKey(chunkX, chunkZ);
        wanted.add(key);
        if (!this.#chunks.has(key)) {
          missing.push({ cx: chunkX, cz: chunkZ, distanceSquared: dx * dx + dz * dz });
        }
      }
    }
    for (const key of [...this.#chunks.keys()]) {
      if (!wanted.has(key)) {
        this.#chunks.delete(key);
      }
    }

    missing.sort((a, b) => a.distanceSquared - b.distanceSquared);
    const buildBudget = Number.isFinite(maxNewChunksPerCall)
      ? Math.max(0, Math.floor(maxNewChunksPerCall))
      : Number.POSITIVE_INFINITY;
    let createdChunks = 0;
    for (const chunk of missing) {
      if (createdChunks >= buildBudget) {
        break;
      }
      this.#chunks.set(
        chunkKey(chunk.cx, chunk.cz),
        generateChunkVegetation(this.#sampler, chunk.cx, chunk.cz),
      );
      createdChunks += 1;
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
      /** Real body mass (kg); the reaction impulse is computed against it. */
      readonly massKg?: number;
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
    const carMassKg =
      car.massKg !== undefined && Number.isFinite(car.massKg) && car.massKg > 0
        ? car.massKg
        : REFERENCE_CAR_MASS_KG;

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
        // Participating trunk/crown mass grows with the cube of the drawn scale.
        const impactMassKg = damage.impactMassKg * placement.scale ** 3;
        // r x n in plan view: how much of the normal impulse turns into yaw.
        const yawLeverArmMeters = lz * normalLocalX - lx * normalLocalZ;

        if (solid || closing <= TREE_COLLISION.minImpactSpeed || onCooldown) {
          // Contact without a damage event. This is not a hole: a standing
          // tree is rooted, so it still takes the car's whole closing speed
          // out along the normal (and the response below pushes the overlap
          // apart). Only the *damage* is on cooldown, never the obstacle.
          if (penetration > 0.01) {
            const absorbedSpeed = Math.max(0, closing);
            const reactionImpulseNs = carMassKg * absorbedSpeed;
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
              absorbedSpeed,
              reactionImpulseNs,
              reactionSpeed: reactionSpeedFor(reactionImpulseNs, impactMassKg),
              normalX,
              normalZ,
              penetration,
              solid,
              rooted: !solid,
              impact: false,
              lateralOffset: lx,
              yawLeverArmMeters,
              yawImpulseFraction: TREE_COLLISION.yawImpulseFraction,
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
        // One momentum statement for both sides of the impact: the car loses
        // `absorbedSpeed` along the normal; the tree/ground system receives
        // carMass x absorbedSpeed in the opposite direction. A tree that
        // holds is rooted (full stop + dull rebound); a tree that fails
        // takes its species' fracture share out of the car on the way down.
        const absorbedSpeed =
          outcome === 'bend'
            ? closing * (1 + TREE_COLLISION.standingRestitution)
            : closing *
              (outcome === 'snap' ? damage.snapSpeedLossFraction : damage.shatterSpeedLossFraction);
        const reactionImpulseNs = carMassKg * absorbedSpeed;
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
          absorbedSpeed,
          reactionImpulseNs,
          reactionSpeed: reactionSpeedFor(reactionImpulseNs, impactMassKg),
          normalX,
          normalZ,
          penetration,
          solid: false,
          rooted: outcome === 'bend',
          impact: true,
          lateralOffset: lx,
          yawLeverArmMeters,
          yawImpulseFraction: TREE_COLLISION.yawImpulseFraction,
        });
      }
    }
    return hits;
  }

  /**
   * Applies one hit's velocity change to the car body and returns the linear
   * impulse magnitude (N·s) actually delivered — the equal-and-opposite
   * partner of the `reactionImpulseNs` the tree side recorded.
   */
  respond(body: BodyLike, hit: TreeHit): number {
    return applyCollisionResponse(body, hit);
  }
}

/**
 * The shared collision response: removes the hit's absorbed velocity along the
 * contact normal (guaranteeing separation when nothing broke, a small bounce
 * off solids), plus yaw from the contact's lever arm on off-centre hits. The
 * impulse applied here is along the tree→car normal with magnitude
 * mass x velocity-change; the obstacle received the same magnitude along the
 * opposite normal when the contact was evaluated. Trees, rocks, buildings
 * and poles all answer the car through this one contract. Returns the linear
 * impulse magnitude (N·s) actually applied.
 */
export function applyCollisionResponse(
  body: CollisionBody,
  hit: {
    readonly normalX: number;
    readonly normalZ: number;
    readonly penetration: number;
    readonly absorbedSpeed: number;
    readonly solid: boolean;
    readonly rooted?: boolean;
    readonly impact: boolean;
    readonly impactSpeed: number;
    readonly lateralOffset: number;
    readonly yawLeverArmMeters?: number;
    readonly yawImpulseFraction?: number;
  },
): number {
  const velocity = body.linvel();
  const vn = velocity.x * hit.normalX + velocity.z * hit.normalZ;
  let target = vn + hit.absorbedSpeed;
  if (!hit.impact) {
    // Standing contact still has to separate the overlap. A rooted tree gets
    // a firmer push-out than a folding pole: it is not going anywhere.
    const separation =
      hit.rooted === true
        ? Math.min(3.2, 0.35 + hit.penetration * 7)
        : Math.min(2.5, hit.penetration * 5);
    target = Math.max(target, separation);
  }
  if (hit.solid && hit.impactSpeed > 1) {
    target = Math.max(target, hit.impactSpeed * 0.12);
  }
  const dv = target - vn;
  if (dv <= 0) {
    return 0;
  }
  const mass = body.mass();
  const impulseNs = dv * mass;
  body.applyImpulse({ x: hit.normalX * impulseNs, y: 0, z: hit.normalZ * impulseNs }, true);
  // Angular half of the same exchange: lever arm x linear impulse, scaled to
  // the authored fraction and capped so a corner hit kicks the nose around
  // instead of spinning the car like a top.
  const leverArm = hit.yawLeverArmMeters ?? -hit.lateralOffset;
  const fraction = hit.yawImpulseFraction ?? 0.06;
  const maxTorqueImpulse = mass * 1.6;
  const torque = Math.max(
    -maxTorqueImpulse,
    Math.min(maxTorqueImpulse, leverArm * impulseNs * fraction),
  );
  if (Math.abs(torque) > 1) {
    body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
  }
  return impulseNs;
}
