import { PHYSICS_CONFIG, type PhysicsConfig } from '../config/physics';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { clamp } from '../shared/math';
import { cloneVec3, type Quat, type Vec3 } from '../shared/vector';
import type { TerrainSampler } from '../world/terrain-height';
import { sampleTerrainSurface, type TerrainSurfaceSample } from '../world/terrain-surface';
import {
  chunkKey,
  planPhysicsAround,
  resolveWindowCenter,
  type ChunkCoord,
} from '../world/terrain-chunks';
import type {
  RapierCollider,
  RapierEventQueue,
  RapierModule,
  RapierRigidBody,
  RapierWorld,
} from './RapierModule';

export interface PhysicsWorldOptions {
  readonly rapier: RapierModule;
  readonly config?: PhysicsConfig;
  readonly worldConfig?: WorldConfig;
  readonly gravity?: Vec3;
}

export interface PhysicsStepHandler {
  (fixedDelta: number): void;
}

export interface PhysicsCollisionEvent {
  readonly colliderA: RapierCollider;
  readonly colliderB: RapierCollider;
  readonly bodyA: RapierRigidBody | null;
  readonly bodyB: RapierRigidBody | null;
  /** `true` when contact begins, `false` when it ends. */
  readonly started: boolean;
}

export interface PhysicsCollisionHandler {
  (event: PhysicsCollisionEvent): void;
}

export interface PhysicsStatistics {
  /** Fixed steps executed in the last `update` call. */
  readonly stepsLastUpdate: number;
  /** Accumulated real time not yet simulated, in seconds. */
  readonly accumulatorSeconds: number;
  readonly interpolationAlpha: number;
  /** Frames where the catch-up budget was exhausted and backlog was discarded. */
  readonly stalledFrames: number;
  /** Simulated time since the world was created, in seconds. */
  readonly elapsedSeconds: number;
  readonly bodies: number;
}

/**
 * Owns the single Rapier world and the fixed-step contract.
 *
 * Responsibilities:
 * - create and dispose the world, ground, and static obstacle colliders;
 * - advance simulation in whole fixed steps with a bounded catch-up budget;
 * - run pre-step handlers (vehicle forces) and post-step handlers (pose snapshots) so that
 *   force application always happens before integration and snapshots are always captured after;
 * - expose the interpolation alpha used by the renderer.
 *
 * It contains no rendering code and no vehicle logic: `docs/ARCHITECTURE.md` §4 and §6.
 */
export class PhysicsWorld {
  readonly #rapier: RapierModule;
  readonly #world: RapierWorld;
  readonly #eventQueue: RapierEventQueue;
  readonly #config: PhysicsConfig;
  readonly #worldConfig: WorldConfig;
  readonly #preStepHandlers = new Set<PhysicsStepHandler>();
  readonly #postStepHandlers = new Set<PhysicsStepHandler>();
  readonly #collisionHandlers = new Set<PhysicsCollisionHandler>();
  readonly #originAwareBodies = new Set<RapierRigidBody>();
  #groundBody: RapierRigidBody | null = null;
  #terrainSampler: TerrainSampler | null = null;
  readonly #terrainBodies = new Map<string, RapierRigidBody>();
  /**
   * Fixed bodies anchored to eternal world coordinates (config obstacles; the shipped
   * world starts with none — the list is a seam for fixtures and tests),
   * remembered by their world translation so a floating-origin slide can move them
   * without losing where in the world they stand.
   */
  readonly #anchoredBodies = new Map<RapierRigidBody, { x: number; y: number; z: number }>();
  /** Floating-origin slide: physics-space position = world - origin (see origin.ts). */
  #originX = 0;
  #originZ = 0;
  #terrainChunkSize = 0;
  #terrainCenter: ChunkCoord | null = null;
  #accumulator = 0;
  #elapsed = 0;
  #stepsLastUpdate = 0;
  #stalledFrames = 0;
  #disposed = false;

  constructor(options: PhysicsWorldOptions) {
    this.#rapier = options.rapier;
    this.#config = options.config ?? PHYSICS_CONFIG;
    this.#worldConfig = options.worldConfig ?? WORLD_CONFIG;

    const gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.#world = new this.#rapier.World(gravity);
    this.#eventQueue = new this.#rapier.EventQueue(true);
    this.#world.timestep = this.#config.fixedTimestep;

    this.#createStaticGeometry();
  }

  get rapier(): RapierModule {
    return this.#rapier;
  }

  get world(): RapierWorld {
    return this.#world;
  }

  get fixedTimestep(): number {
    return this.#config.fixedTimestep;
  }

  get interpolationAlpha(): number {
    return clamp(this.#accumulator / this.#config.fixedTimestep, 0, 1);
  }

  get elapsedSeconds(): number {
    return this.#elapsed;
  }

  get statistics(): PhysicsStatistics {
    return {
      stepsLastUpdate: this.#stepsLastUpdate,
      accumulatorSeconds: this.#accumulator,
      interpolationAlpha: this.interpolationAlpha,
      stalledFrames: this.#stalledFrames,
      elapsedSeconds: this.#elapsed,
      bodies: this.#world.bodies.len(),
    };
  }

  /**
   * Runs before each fixed step. Vehicle controllers apply suspension and tire impulses here so
   * they are integrated by the step that follows.
   */
  addPreStepHandler(handler: PhysicsStepHandler): () => void {
    this.#preStepHandlers.add(handler);
    return () => {
      this.#preStepHandlers.delete(handler);
    };
  }

  /** Runs after each fixed step; used to capture authoritative pose snapshots. */
  addPostStepHandler(handler: PhysicsStepHandler): () => void {
    this.#postStepHandlers.add(handler);
    return () => {
      this.#postStepHandlers.delete(handler);
    };
  }

  /** Receives Rapier contact begin/end events for colliders that opt into active events. */
  addCollisionHandler(handler: PhysicsCollisionHandler): () => void {
    this.#collisionHandlers.add(handler);
    return () => {
      this.#collisionHandlers.delete(handler);
    };
  }

  /** Registers a moving body that must follow the floating-origin slide without changing world position. */
  registerOriginAwareBody(body: RapierRigidBody): () => void {
    this.#originAwareBodies.add(body);
    return () => {
      this.#originAwareBodies.delete(body);
    };
  }

  /**
   * Advances simulation from a rendered frame delta.
   *
   * Executes at most `maxStepsPerFrame` fixed steps. If the backlog exceeds the budget, the
   * excess is discarded and counted (rather than spiralling), matching the plan's overload
   * contract.
   */
  update(frameDeltaSeconds: number): void {
    if (this.#disposed) {
      return;
    }

    const maxFrameDelta = Math.min(
      Number.isFinite(frameDeltaSeconds) && frameDeltaSeconds > 0 ? frameDeltaSeconds : 0,
      this.#config.maxFrameDeltaSeconds,
    );
    this.#accumulator += maxFrameDelta;
    this.#stepsLastUpdate = 0;

    const maxSteps = this.#config.maxStepsPerFrame;
    let steps = 0;
    while (this.#accumulator >= this.#config.fixedTimestep && steps < maxSteps) {
      this.#stepOnce();
      this.#accumulator -= this.#config.fixedTimestep;
      steps += 1;
    }

    if (steps === maxSteps && this.#accumulator >= this.#config.fixedTimestep) {
      // Budget exhausted: drop the remaining backlog instead of accumulating a spiral.
      this.#accumulator %= this.#config.fixedTimestep;
      this.#stalledFrames += 1;
    }

    this.#stepsLastUpdate = steps;
  }

  /** Clears accumulated time (used on pause/resume boundaries). */
  resetAccumulator(): void {
    this.#accumulator = 0;
  }

  createDynamicBody(desc: ReturnType<RapierModule['RigidBodyDesc']['dynamic']>): RapierRigidBody {
    if (!this.#config.allowSleeping) {
      desc.setCanSleep(false);
    }
    return this.#world.createRigidBody(desc);
  }

  attachCollider(
    desc: Parameters<RapierWorld['createCollider']>[0],
    body: RapierRigidBody,
  ): RapierCollider {
    return this.#world.createCollider(desc, body);
  }

  removeBody(body: RapierRigidBody): void {
    this.#originAwareBodies.delete(body);
    if (this.#world.bodies.contains(body.handle)) {
      this.#world.removeRigidBody(body);
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#preStepHandlers.clear();
    this.#postStepHandlers.clear();
    this.#collisionHandlers.clear();
    this.#originAwareBodies.clear();
    this.#eventQueue.free();
    this.#world.free();
  }

  #stepOnce(): void {
    const delta = this.#config.fixedTimestep;
    for (const handler of [...this.#preStepHandlers]) {
      handler(delta);
    }
    this.#world.step(this.#eventQueue);
    this.#eventQueue.drainCollisionEvents((handleA, handleB, started) => {
      let colliderA: RapierCollider;
      let colliderB: RapierCollider;
      try {
        colliderA = this.#world.getCollider(handleA);
        colliderB = this.#world.getCollider(handleB);
      } catch {
        // A collider may have been removed between the broad-phase event and dispatch.
        return;
      }
      const event: PhysicsCollisionEvent = {
        colliderA,
        colliderB,
        bodyA: colliderA.parent(),
        bodyB: colliderB.parent(),
        started,
      };
      for (const handler of [...this.#collisionHandlers]) {
        handler(event);
      }
    });
    this.#elapsed += delta;
    for (const handler of [...this.#postStepHandlers]) {
      handler(delta);
    }
  }

  #createStaticGeometry(): void {
    const { ground, obstacles, friction, restitution } = this.#worldConfig;
    const halfThickness = ground.thickness / 2;

    // Ground top face at y = 0 so wheel raycasts and spawn heights use a simple convention.
    const groundBody = this.#world.createRigidBody(
      this.#rapier.RigidBodyDesc.fixed().setTranslation(0, -halfThickness, 0),
    );
    this.#groundBody = groundBody;
    this.#world.createCollider(
      this.#rapier.ColliderDesc.cuboid(ground.size / 2, halfThickness, ground.size / 2)
        .setFriction(friction)
        .setRestitution(restitution),
      groundBody,
    );

    for (const obstacle of obstacles) {
      const [hx, hy, hz] = obstacle.size;
      const [x, y, z] = obstacle.position;
      const body = this.#world.createRigidBody(
        new this.#rapier.RigidBodyDesc(this.#rapier.RigidBodyType.Fixed).setTranslation(x, y, z),
      );
      this.#anchoredBodies.set(body, { x, y, z });
      this.#world.createCollider(
        this.#rapier.ColliderDesc.cuboid(hx / 2, hy / 2, hz / 2)
          .setFriction(friction)
          .setRestitution(restitution),
        body,
      );
    }
  }

  /**
   * Switches ground collision from the flat arena slab to streamed terrain heightfields
   * (Phase 4). The slab is removed the moment terrain takes over — two grounds at once
   * would fight at every slope — while the static obstacle colliders stay: they stand on
   * the spawn plateau, where the terrain is exactly y=0.
   *
   * Callers must `syncTerrain` for the spawn area before the first physics step, or the
   * car falls through the not-yet-built ground. `Application` does this in its constructor.
   */
  enableTerrain(sampler: TerrainSampler): void {
    this.#terrainChunkSize = sampler.config.chunkSizeMeters;
    if (this.#groundBody !== null) {
      this.#world.removeRigidBody(this.#groundBody);
      this.#groundBody = null;
    }
    this.#terrainSampler = sampler;
  }

  /**
   * Maintains heightfield colliders in the physics window around `focus` — a
   * WORLD-space position, so the window is stable across origin slides (the planner in
   * `terrain-chunks.ts` decides the window; this only executes it). Heights come from the
   * shared sampler at physics resolution, independent of the visual chunk LOD — collision
   * must never get coarser because the camera is far away. Cheap to call every frame: an
   * unchanged window is a map lookup per chunk.
   */
  /**
   * Slides every anchored collider by a new floating-origin offset (see
   * `OriginManager`): chunk colliders recompute their local placement from their
   * eternal chunk keys, obstacle bodies from their recorded world positions. The
   * set of *wanted* chunks does not change — `focus` passed to `syncTerrain` is
   * world-space, so the window is already correct on both sides of the slide.
   */
  setOriginOffset(offsetX: number, offsetZ: number): void {
    const shiftX = offsetX - this.#originX;
    const shiftZ = offsetZ - this.#originZ;
    for (const body of this.#originAwareBodies) {
      const position = body.translation();
      body.setTranslation({ x: position.x - shiftX, y: position.y, z: position.z - shiftZ }, true);
    }
    this.#originX = offsetX;
    this.#originZ = offsetZ;
    const size = this.#terrainChunkSize;
    if (size > 0) {
      for (const [key, body] of this.#terrainBodies) {
        const comma = key.indexOf(',');
        const cx = Number(key.slice(0, comma));
        const cz = Number(key.slice(comma + 1));
        body.setTranslation(
          { x: cx * size + size / 2 - offsetX, y: 0, z: cz * size + size / 2 - offsetZ },
          true,
        );
      }
    }
    for (const [body, world] of this.#anchoredBodies) {
      body.setTranslation({ x: world.x - offsetX, y: world.y, z: world.z - offsetZ }, true);
    }
  }

  /** Current floating-origin offset (physics position = world - offset). */
  get originOffset(): { readonly x: number; readonly z: number } {
    return { x: this.#originX, z: this.#originZ };
  }

  syncTerrain(focus: Vec3, maxNewChunksPerCall = Number.POSITIVE_INFINITY): void {
    const sampler = this.#terrainSampler;
    if (sampler === null || this.#disposed) {
      return;
    }
    const { config } = sampler;
    // Never velocity-biased: colliders centre on where the car is, with the same
    // hysteresis as the visual window so the two windows slide together.
    this.#terrainCenter = resolveWindowCenter(this.#terrainCenter, config, focus.x, focus.z);
    const planned = planPhysicsAround(config, this.#terrainCenter.cx, this.#terrainCenter.cz);
    const wanted = new Set(planned.map((chunk) => chunkKey(chunk.cx, chunk.cz)));
    for (const [key, body] of this.#terrainBodies) {
      if (!wanted.has(key)) {
        this.#world.removeRigidBody(body);
        this.#terrainBodies.delete(key);
      }
    }
    const segments = config.physicsSegmentsPerChunk;
    const size = config.chunkSizeMeters;
    const step = size / segments;
    const buildBudget = Number.isFinite(maxNewChunksPerCall)
      ? Math.max(0, Math.floor(maxNewChunksPerCall))
      : Number.POSITIVE_INFINITY;
    let createdChunks = 0;
    for (const chunk of planned) {
      const key = chunkKey(chunk.cx, chunk.cz);
      if (this.#terrainBodies.has(key)) {
        continue;
      }
      if (createdChunks >= buildBudget) {
        break;
      }
      const originX = chunk.cx * size;
      const originZ = chunk.cz * size;
      const heights = new Float32Array((segments + 1) * (segments + 1));
      // Rapier's heightfield array is x-major: heights[ix * (n + 1) + iz]. The axis
      // convention is pinned empirically by tests/physics/terrain-colliders.test.ts — a
      // transposed field still collides, just with the world rotated 90 degrees, so only
      // a raycast against known slopes can catch it.
      for (let j = 0; j <= segments; j += 1) {
        for (let i = 0; i <= segments; i += 1) {
          heights[i * (segments + 1) + j] = sampler.heightAt(
            originX + i * step,
            originZ + j * step,
          );
        }
      }
      const body = this.#world.createRigidBody(
        this.#rapier.RigidBodyDesc.fixed().setTranslation(
          originX + size / 2 - this.#originX,
          0,
          originZ + size / 2 - this.#originZ,
        ),
      );
      this.#world.createCollider(
        this.#rapier.ColliderDesc.heightfield(segments, segments, heights, {
          x: size,
          y: 1,
          z: size,
        })
          .setFriction(this.#worldConfig.friction)
          .setRestitution(this.#worldConfig.restitution),
        body,
      );
      this.#terrainBodies.set(key, body);
      createdChunks += 1;
    }
  }

  /**
   * The driving surface at (x, z) from the terrain generator, or `null` before terrain is
   * enabled (the flat-arena default response). This is the Phase 2 surface-query seam:
   * the car asks the world what it is standing on, the generator answers from the same
   * weights the renderer blends — grip follows looks by construction.
   */
  surfaceAt(x: number, z: number): TerrainSurfaceSample | null {
    // Callers pass physics-space coordinates (where the car body actually is); the
    // sampler answers in eternal world space, hence the slide.
    return this.#terrainSampler === null
      ? null
      : sampleTerrainSurface(this.#terrainSampler, x + this.#originX, z + this.#originZ);
  }

  /** Heightfield chunk colliders currently alive (diagnostics and tests). */
  get terrainColliderChunks(): number {
    return this.#terrainBodies.size;
  }
}

/** Snapshot of a rigid body pose used for render interpolation. */
export interface PoseSnapshot {
  position: Vec3;
  rotation: Quat;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

export function captureSnapshot(target: RapierRigidBody): PoseSnapshot {
  const t = target.translation();
  const r = target.rotation();
  const lv = target.linvel();
  const av = target.angvel();
  return {
    position: cloneVec3(t),
    rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
    linearVelocity: cloneVec3(lv),
    angularVelocity: cloneVec3(av),
  };
}
