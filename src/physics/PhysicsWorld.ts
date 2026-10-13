import { PHYSICS_CONFIG, type PhysicsConfig } from '../config/physics';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { clamp } from '../shared/math';
import { cloneVec3, type Quat, type Vec3 } from '../shared/vector';
import type { RapierCollider, RapierModule, RapierRigidBody, RapierWorld } from './RapierModule';

export interface PhysicsWorldOptions {
  readonly rapier: RapierModule;
  readonly config?: PhysicsConfig;
  readonly worldConfig?: WorldConfig;
  readonly gravity?: Vec3;
}

export interface PhysicsStepHandler {
  (fixedDelta: number): void;
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
  readonly #config: PhysicsConfig;
  readonly #worldConfig: WorldConfig;
  readonly #preStepHandlers = new Set<PhysicsStepHandler>();
  readonly #postStepHandlers = new Set<PhysicsStepHandler>();
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
    this.#world.free();
  }

  #stepOnce(): void {
    const delta = this.#config.fixedTimestep;
    for (const handler of [...this.#preStepHandlers]) {
      handler(delta);
    }
    this.#world.step();
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
      this.#world.createCollider(
        this.#rapier.ColliderDesc.cuboid(hx / 2, hy / 2, hz / 2)
          .setFriction(friction)
          .setRestitution(restitution),
        body,
      );
    }
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
