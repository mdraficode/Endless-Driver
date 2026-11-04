/**
 * Phase 7.3 — fauna charges: a wild boar, a deer, or a troop of monkeys bursts from the
 * underbrush and sprints across the car's path.
 *
 * The whole thing is physics-side and renderer-free, the same way `tree-collision.ts` is:
 * a deterministic state machine (telegraph → charge → flee), analytic circle-vs-OBB contact
 * against the car, and a response that is a light momentum nudge on the car body plus the
 * chassis shudder `PlayerCarVisual` already renders. The animal never damages the car —
 * there is no health, no damage, and the impulse is bounded by the animal's own momentum.
 *
 * Scheduling is hash-gated and rare: per (player chunk, minute) the charge rolls once, so
 * the encounter is the same on every device for a given seed, and the rate is tuned per
 * quality tier (0.02/min on C … 0.05/min on A). It only arms in the wild — off the paved
 * network, away from Aohara and the spawn pad.
 */
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import { chunkKey, chunkIndexAt } from './terrain-chunks';
import { roadDistanceAt } from './road-distance';
import { clamp } from '../shared/math';

export type FaunaSpeciesId = 'boar' | 'deer' | 'monkey';

export interface FaunaSpeciesDef {
  readonly id: FaunaSpeciesId;
  /** Total mass in kilograms (the troop counts as one body — it is one charge). */
  readonly massKg: number;
  /** Contact radius in plan view, metres. */
  readonly radiusMeters: number;
  readonly lengthMeters: number;
  readonly heightMeters: number;
}

export const FAUNA_SPECIES: Record<FaunaSpeciesId, FaunaSpeciesDef> = {
  boar: {
    id: 'boar',
    massKg: 90,
    radiusMeters: 0.7,
    lengthMeters: 1.9,
    heightMeters: 0.95,
  },
  deer: {
    id: 'deer',
    massKg: 60,
    radiusMeters: 0.6,
    lengthMeters: 1.7,
    heightMeters: 1.15,
  },
  monkey: {
    id: 'monkey',
    massKg: 25,
    radiusMeters: 0.45,
    lengthMeters: 1.0,
    heightMeters: 0.6,
  },
};

export const FAUNA_CONFIG = {
  /** The charge only arms above this player speed — parked cars are never bothered. */
  playerSpeedMetersPerSecond: 8,
  /** Per-minute arm rate by quality tier (the spec: C 0.02, A 0.05). */
  chargeRatePerMinute: { A: 0.05, B: 0.035, C: 0.02 },
  /** The animal holds in the brush before the sprint, telegraphed by the rustle. */
  telegraphSeconds: 0.7,
  chargeSeconds: 1.8,
  chargeSpeedMetersPerSecond: 7,
  /** After the sprint the animal veers off into the brush. */
  fleeSeconds: 2.6,
  /** The veer angle away from the run line when fleeing. */
  fleeTurnDegrees: 38,
  /** The approach meets the car's heading at 90 ± this many degrees — a side attack. */
  sideAngleDegrees: 30,
  /** Stay off the paved corridors (centreline clearance). */
  roadClearanceMeters: 10,
  /** Same keep-outs as the wilderness tracks: the city core and the spawn pad. */
  cityExclusionMeters: 700,
  spawnPadExclusionMeters: 110,
  /** Monkeys per troop by tier. */
  monkeyTroopSize: { A: 5, B: 4, C: 3 },
  /** One charge at a time: rare is the point. */
  maxActiveCharges: 1,
  /** The spawn aims slightly ahead of the car along its heading (metres). */
  aimLeadMeters: 1.5,
  /** The charge re-aim aims this far past the car's centre so the sprint passes through. */
  aimOvershootMeters: 0.8,
} as const;

export type FaunaPhase = 'telegraph' | 'charge' | 'flee';

export interface FaunaCharge {
  readonly id: number;
  readonly species: FaunaSpeciesId;
  readonly troopSize: number;
  readonly phase: FaunaPhase;
  /** Seconds into the current phase. */
  readonly phaseTime: number;
  readonly x: number;
  readonly z: number;
  /** Unit run direction (zero during the telegraph). */
  readonly dirX: number;
  readonly dirZ: number;
  /** True once contact with the car has been resolved. */
  readonly hit: boolean;
}

/** One contact between a charging animal and the car, resolved once per charge. */
export interface FaunaHit {
  readonly chargeId: number;
  readonly species: FaunaSpeciesId;
  /** Contact point in world XZ (the animal's centre at contact). */
  readonly x: number;
  readonly z: number;
  /** Closing speed (m/s) at contact — feeds the chassis shudder. */
  readonly impactSpeed: number;
  /** Lateral offset of the contact from the car's centre (car frame, +right). */
  readonly lateralOffset: number;
  /** The animal's unit run direction at contact. */
  readonly animalDirX: number;
  readonly animalDirZ: number;
  /** The animal's momentum in N·s — the whole impulse the car may receive. */
  readonly impulseNs: number;
}

/** A monkey leaf on its way at the car — kinematic, decorative, rating fodder. */
export interface FaunaLeafEvent {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly dirZ: number;
  readonly spin: number;
}

export interface FaunaFrame {
  /** Newly armed charges this frame (the toast + the rustle burst). */
  readonly spawned: readonly {
    readonly charge: FaunaCharge;
    readonly toast: string;
  }[];
  /** Car contacts resolved this frame (at most one — one charge is active). */
  readonly hits: readonly FaunaHit[];
  /** Leaf throws queued for the visuals. */
  readonly leaves: readonly FaunaLeafEvent[];
  /** Charges finished this frame (the visuals despawn them). */
  readonly finished: readonly number[];
}

const TOASTS: Record<FaunaSpeciesId, string> = {
  boar: 'A wild boar charges from the jungle!',
  deer: 'A deer bolts across your path!',
  monkey: 'A troop of monkeys scatters into the road!',
};

/** FNV-1a → [0, 1), stable across threads and launches. */
export function faunaHash01(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface FaunaCarProbe {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

/** Car OBB half-extents in plan view — the same chassis `tree-collision.ts` tests. */
const CAR_HALF_WIDTH = 0.9;
const CAR_HALF_LENGTH = 2.05;
/** Extra contact margin so the animal's shoulder meets the chassis before the circle centre. */
const CONTACT_MARGIN = 0.25;

/** True when the car's OBB (yaw in world frame) touches a circle of `radius` at (px, pz). */
function carTouchesCircle(car: FaunaCarProbe, px: number, pz: number, radius: number): boolean {
  const cos = Math.cos(car.yaw);
  const sin = Math.sin(car.yaw);
  // World → car frame (car forward is +Z at yaw 0).
  const dx = px - car.x;
  const dz = pz - car.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const cx = clamp(localX, -CAR_HALF_WIDTH, CAR_HALF_WIDTH);
  const cz = clamp(localZ, -CAR_HALF_LENGTH, CAR_HALF_LENGTH);
  const pxLocal = localX - cx;
  const pzLocal = localZ - cz;
  const r = radius + CONTACT_MARGIN;
  return pxLocal * pxLocal + pzLocal * pzLocal <= r * r;
}

export interface FaunaFieldOptions {
  /** The world seed the encounter rolls against. */
  readonly terrainSeed: number;
  /** Chunk size in metres for the player-chunk key. */
  readonly chunkSizeMeters: number;
  /** Quality tier for the rate/troop detail; defaults to C. */
  readonly qualityTier?: string;
}

/**
 * The pure charge state machine. `advanceAndCollide` is driven by Application before the
 * physics step (the car probe is the pre-step truth); the visuals mirror the returned
 * frame and the `charges` list each frame.
 */
export class FaunaField {
  readonly #seed: number;
  readonly #chunkSize: number;
  readonly #tier: string;
  readonly #rate: number;
  #charges: FaunaCharge[] = [];
  #nextId = 1;
  /** (chunk, minute) keys that have already rolled — one roll each. */
  readonly #rolled = new Map<string, number>();
  /** Spawns armed via the test hook, flushed into the next frame. */
  #pendingSpawn: { charge: FaunaCharge; toast: string }[] = [];
  #leafThrowTimes = [0.3, 0.9, 1.5];
  #leafThrowsDone = 0;

  constructor(options: FaunaFieldOptions) {
    this.#seed = options.terrainSeed | 0;
    this.#chunkSize = options.chunkSizeMeters;
    this.#tier = options.qualityTier ?? 'C';
    this.#rate =
      FAUNA_CONFIG.chargeRatePerMinute[this.#tier as 'A' | 'B' | 'C'] ??
      FAUNA_CONFIG.chargeRatePerMinute.C;
  }

  /** The active charges (read-only mirror for the visuals). */
  get charges(): readonly FaunaCharge[] {
    return this.#charges;
  }

  /**
   * Advances the field one frame and tests contact against the car. The probe is the
   * pre-physics car state: position, yaw, velocity.
   */
  advanceAndCollide(car: FaunaCarProbe, deltaSeconds: number): FaunaFrame {
    const frame: {
      spawned: { charge: FaunaCharge; toast: string }[];
      hits: FaunaHit[];
      leaves: FaunaLeafEvent[];
      finished: number[];
    } = {
      spawned: [...this.#pendingSpawn],
      hits: [],
      leaves: [],
      finished: [],
    };
    this.#pendingSpawn = [];
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return frame as FaunaFrame;
    }

    this.#schedule(car, frame);
    this.#advance(car, deltaSeconds, frame);
    return frame as FaunaFrame;
  }

  /** The hash roll, one per (chunk, minute), only when the player qualifies. */
  #schedule(
    car: FaunaCarProbe,
    frame: { spawned: { charge: FaunaCharge; toast: string }[] },
  ): void {
    if (this.#charges.length >= FAUNA_CONFIG.maxActiveCharges) return;
    const speed = Math.hypot(car.velocityX, car.velocityZ);
    if (speed < FAUNA_CONFIG.playerSpeedMetersPerSecond) return;
    if (!this.#inTheWild(car.x, car.z)) return;

    const minute = Math.floor(this.#clock / 60);
    const cx = chunkIndexAt(car.x, this.#chunkSize);
    const cz = chunkIndexAt(car.z, this.#chunkSize);
    const key = `${chunkKey(cx, cz)}:${minute}`;
    if (this.#rolled.has(key)) return;
    this.#rolled.set(key, 0);
    if (this.#rolled.size > 128) {
      // The map only grows while qualifying: drop the oldest entries.
      const keys = this.#rolled.keys();
      for (let i = 0; i < 32; i += 1) {
        const oldest = keys.next();
        if (oldest.done === true) break;
        this.#rolled.delete(oldest.value);
      }
    }

    const rollKey = `${this.#seed}:${key}`;
    if (faunaHash01(rollKey) >= this.#rate) return;
    const charge = this.#spawnCharge(car, rollKey);
    if (charge !== null) {
      frame.spawned.push({ charge, toast: TOASTS[charge.species] });
    }
  }

  /** Simulated clock: integrated from the frame deltas, so replays are exact. */
  #clock = 0;

  #inTheWild(x: number, z: number): boolean {
    if (roadDistanceAt(x, z) < FAUNA_CONFIG.roadClearanceMeters) return false;
    const dCity = Math.hypot(
      x - AOHARA_DISTRICT_CONFIG.centerX,
      z - AOHARA_DISTRICT_CONFIG.centerZ,
    );
    if (dCity < FAUNA_CONFIG.cityExclusionMeters) return false;
    if (Math.hypot(x, z) < FAUNA_CONFIG.spawnPadExclusionMeters) return false;
    return true;
  }

  #spawnCharge(car: FaunaCarProbe, rollKey: string): FaunaCharge | null {
    if (this.#charges.length >= FAUNA_CONFIG.maxActiveCharges) return null;
    const { chargeSpeedMetersPerSecond, chargeSeconds, sideAngleDegrees, aimLeadMeters } =
      FAUNA_CONFIG;
    const travel = chargeSpeedMetersPerSecond * chargeSeconds;
    const side = faunaHash01(rollKey + ':side') < 0.5 ? -1 : 1;
    // 90 ± sideAngle degrees off the car's heading, the sign choosing which shoulder.
    const offsetDeg = 90 + (faunaHash01(rollKey + ':angle') * 2 - 1) * sideAngleDegrees;
    const angle = car.yaw + (side * (offsetDeg * Math.PI)) / 180;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);
    // The aim leads the car slightly along its heading — a swerving driver misses the sprint.
    const aimX = car.x + Math.sin(car.yaw) * aimLeadMeters;
    const aimZ = car.z + Math.cos(car.yaw) * aimLeadMeters;
    const x = aimX - dirX * travel;
    const z = aimZ - dirZ * travel;

    const speciesRoll = faunaHash01(rollKey + ':species');
    const species: FaunaSpeciesId =
      speciesRoll < 0.4 ? 'boar' : speciesRoll < 0.75 ? 'deer' : 'monkey';
    const troopSize =
      species === 'monkey'
        ? (FAUNA_CONFIG.monkeyTroopSize[this.#tier as 'A' | 'B' | 'C'] ??
          FAUNA_CONFIG.monkeyTroopSize.C)
        : 1;
    const charge: FaunaCharge = {
      id: this.#nextId,
      species,
      troopSize,
      phase: 'telegraph',
      phaseTime: 0,
      x,
      z,
      dirX: 0,
      dirZ: 0,
      hit: false,
    };
    this.#charges.push(charge);
    this.#nextId += 1;
    return charge;
  }

  #advance(
    car: FaunaCarProbe,
    deltaSeconds: number,
    frame: { hits: FaunaHit[]; leaves: FaunaLeafEvent[]; finished: number[] },
  ): void {
    this.#clock += deltaSeconds;
    const {
      telegraphSeconds,
      chargeSeconds,
      chargeSpeedMetersPerSecond,
      fleeSeconds,
      fleeTurnDegrees,
    } = FAUNA_CONFIG;
    const next: FaunaCharge[] = [];
    for (const c of this.#charges) {
      const def = FAUNA_SPECIES[c.species];
      let phase = c.phase;
      let phaseTime = c.phaseTime + deltaSeconds;
      let x = c.x;
      let z = c.z;
      let dirX = c.dirX;
      let dirZ = c.dirZ;
      let hit = c.hit;

      if (phase === 'telegraph') {
        if (phaseTime >= telegraphSeconds) {
          phase = 'charge';
          phaseTime = 0;
          // Re-aim at the car's current position, slightly past its centre: a straight
          // sprint that passes through the chassis, whatever the lead baked into the
          // spawn point. A driver who swerves is simply no longer on the line.
          let ax = car.x - x;
          let az = car.z - z;
          const d = Math.hypot(ax, az) || 1;
          ax /= d;
          az /= d;
          const angle = Math.atan2(
            car.x + ax * FAUNA_CONFIG.aimOvershootMeters - x,
            car.z + az * FAUNA_CONFIG.aimOvershootMeters - z,
          );
          dirX = Math.sin(angle);
          dirZ = Math.cos(angle);
          this.#leafThrowsDone = 0;
        }
      } else if (phase === 'charge') {
        const step = chargeSpeedMetersPerSecond * deltaSeconds;
        x += dirX * step;
        z += dirZ * step;
        // One contact per charge, resolved at the first touching frame.
        if (!hit && carTouchesCircle(car, x, z, def.radiusMeters)) {
          hit = true;
          const relX = car.velocityX - dirX * chargeSpeedMetersPerSecond;
          const relZ = car.velocityZ - dirZ * chargeSpeedMetersPerSecond;
          const cos = Math.cos(car.yaw);
          const sin = Math.sin(car.yaw);
          const dx = x - car.x;
          const dz = z - car.z;
          const lateral = dx * cos - dz * sin;
          frame.hits.push({
            chargeId: c.id,
            species: c.species,
            x,
            z,
            impactSpeed: Math.hypot(relX, relZ),
            lateralOffset: lateral,
            animalDirX: dirX,
            animalDirZ: dirZ,
            impulseNs: def.massKg * chargeSpeedMetersPerSecond,
          });
        }
        // The monkeys throw leaves on their way past.
        if (c.species === 'monkey') {
          for (const t of this.#leafThrowTimes) {
            if (this.#leafThrowsDone < 3 && phaseTime >= t * (chargeSeconds / 2.0)) {
              this.#throwLeaf(c, car, x, z, frame);
              this.#leafThrowsDone += 1;
            }
          }
        }
        if (phaseTime >= chargeSeconds) {
          phase = 'flee';
          phaseTime = 0;
          // Veer away from the run line into the brush.
          const turn = (fleeTurnDegrees * Math.PI) / 180;
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          const nx = dirX * cos - dirZ * sin;
          const nz = dirX * sin + dirZ * cos;
          dirX = nx;
          dirZ = nz;
        }
      } else {
        const step = chargeSpeedMetersPerSecond * deltaSeconds;
        x += dirX * step;
        z += dirZ * step;
        if (phaseTime >= fleeSeconds) {
          frame.finished.push(c.id);
          continue;
        }
      }

      next.push({
        id: c.id,
        species: c.species,
        troopSize: c.troopSize,
        phase,
        phaseTime,
        x,
        z,
        dirX,
        dirZ,
        hit,
      });
    }
    this.#charges = next;
  }

  #throwLeaf(
    c: FaunaCharge,
    car: FaunaCarProbe,
    x: number,
    z: number,
    frame: { leaves: FaunaLeafEvent[] },
  ): void {
    const ground = 0.6;
    const dx = car.x - x;
    const dz = car.z - z;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const spin = (faunaHash01(`${this.#seed}:${c.id}:${this.#leafThrowsDone}`) * 2 - 1) * 6;
    // A loose arc: mostly at the car, a bit up, speed 8 m/s.
    frame.leaves.push({
      x: x + dirX * 0.6,
      y: ground,
      z: z + dirZ * 0.6,
      dirX: dirX * 8,
      dirY: 2.2 + faunaHash01(`${c.id}:${this.#leafThrowsDone}:y`) * 1.4,
      dirZ: dirZ * 8,
      spin,
    });
  }

  /** Test hook: arm a charge immediately, bypassing the hash roll. */
  spawnForTest(species: FaunaSpeciesId, car?: FaunaCarProbe): FaunaCharge | null {
    const probe = car ?? { x: 0, z: 0, yaw: 0, velocityX: 0, velocityZ: 0 };
    const charge = this.#spawnCharge(probe, `test:${this.#nextId}`);
    if (charge === null) return null;
    // #spawnCharge picks the species from the hash; override it for the test.
    const troopSize =
      species === 'monkey'
        ? (FAUNA_CONFIG.monkeyTroopSize[this.#tier as 'A' | 'B' | 'C'] ??
          FAUNA_CONFIG.monkeyTroopSize.C)
        : 1;
    const updated: FaunaCharge = { ...charge, species, troopSize };
    this.#charges = this.#charges.map((c) => (c.id === updated.id ? updated : c));
    this.#pendingSpawn.push({ charge: updated, toast: TOASTS[species] });
    return updated;
  }
}

/**
 * The car-side response to a charge contact: the animal's momentum lands along its run
 * direction, with a small yaw torque from the lever arm. Bounded by the animal's mass —
 * a boar at full sprint is ~0.5 m/s off a 1,200 kg car. Never damage, never health.
 */
export function applyFaunaResponse(
  body: {
    mass(): number;
    applyImpulse(impulse: { x: number; y: number; z: number }, wakeUp: boolean): void;
    applyTorqueImpulse(impulse: { x: number; y: number; z: number }, wakeUp: boolean): void;
  },
  hit: FaunaHit,
): void {
  if (hit.impulseNs <= 1) return;
  const mass = body.mass();
  body.applyImpulse(
    { x: hit.animalDirX * hit.impulseNs, y: 0, z: hit.animalDirZ * hit.impulseNs },
    true,
  );
  const leverArm = -hit.lateralOffset;
  const maxTorqueImpulse = mass * 1.2;
  const torque = clamp(leverArm * hit.impulseNs * 0.05, -maxTorqueImpulse, maxTorqueImpulse);
  if (Math.abs(torque) > 1) {
    body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
  }
}
