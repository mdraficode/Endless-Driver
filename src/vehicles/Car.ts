import { VEHICLE_CONFIG, type VehicleConfig } from '../config/vehicle';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierModule, RapierRay, RapierRigidBody } from '../physics/RapierModule';
import { clamp } from '../shared/math';
import {
  addScaledVec3,
  addVec3,
  cloneVec3,
  copyVec3,
  crossVec3,
  dotVec3,
  lengthVec3,
  lerpQuat,
  lerpVec3,
  normalizeVec3,
  rotateVec3ByQuat,
  scaleVec3,
  setVec3,
  subtractVec3,
  vec3,
  type Quat,
  type Vec3,
} from '../shared/vector';
import { Drivetrain } from './Drivetrain';
import {
  effectiveFriction,
  frictionCircleScale,
  lateralForceMagnitude,
  slipAngleFromVelocities,
} from './TireModel';
import {
  NEUTRAL_ACTIONS,
  WHEEL_INDEX,
  type SurfaceProvider,
  type VehicleActions,
  type VehiclePose,
  type VehicleTelemetry,
  type WheelState,
  type WheelVisualState,
} from './types';

export interface CarOptions {
  readonly rapier: RapierModule;
  readonly physics: PhysicsWorld;
  readonly config?: VehicleConfig;
  /** Overrides the configured spawn (used by reset and by tests). */
  readonly spawnPosition?: readonly [number, number, number];
  readonly spawnYaw?: number;
  /**
   * Generator-side surface query (terrain today, roads next). Without one, every contact
   * uses the default asphalt response the tire model is tuned against.
   */
  readonly surfaceProvider?: SurfaceProvider;
  /**
   * Analytic ground normal from the terrain generator, when one exists. Blended with
   * the raycast facet normal so faceted heightfield ground stops kicking the
   * suspension with a new normal direction every triangle.
   */
  readonly groundNormalProvider?: (x: number, z: number) => Vec3;
}

interface WheelDefinition {
  readonly index: number;
  readonly isFront: boolean;
  readonly side: -1 | 1;
  readonly anchor: Vec3;
}

const UP_LOCAL: Vec3 = { x: 0, y: 1, z: 0 };
const FORWARD_LOCAL: Vec3 = { x: 0, y: 0, z: -1 };
const RIGHT_LOCAL: Vec3 = { x: 1, y: 0, z: 0 };
/** Chassis slip angle above which the HUD flags a drift, in radians (~11.5 degrees). */
const DRIFT_SLIP_THRESHOLD = 0.2;
/** Below this contact-patch longitudinal speed, brake force is not applied (avoids sign chatter). */
const BRAKE_DEADBAND_SPEED = 0.08;
/** Magnitude of gravity in m/s^2; the cornering budget is expressed in units of g. */
const GRAVITY = 9.81;

/**
 * Raycast-suspension vehicle on a Rapier rigid body.
 *
 * Force path — exactly one authority, no built-in vehicle controller:
 * 1. four downward raycasts yield per-wheel contact, suspension length and contact normal;
 * 2. spring/damper forces plus anti-roll bars load the wheels;
 * 3. a Pacejka-style lateral model plus a friction-circle budget produces tire forces;
 * 4. everything is applied as impulses at the contact patches before Rapier integrates.
 *
 * Rapier owns mass, contacts and integration; this class only generates suspension and tire
 * forces. It never touches the renderer, so the model is fully testable headlessly.
 */
export class Car {
  readonly body: RapierRigidBody;
  readonly wheels: readonly WheelState[];
  readonly #config: VehicleConfig;
  readonly #rapier: RapierModule;
  readonly #physics: PhysicsWorld;
  readonly #drivetrain: Drivetrain;
  readonly #surfaceProvider: SurfaceProvider | null;

  readonly #groundNormalProvider: ((x: number, z: number) => Vec3) | null;

  /** Yaw moment of inertia captured at body creation, for the stability assist. */
  #yawInertia = 0;
  readonly #ray: RapierRay;
  readonly #unsubscribers: (() => void)[] = [];
  readonly #referenceLoad: number;
  /** Fixed-order tuple so indexing is statically known to be in range. */
  readonly #wheelDefinitions: readonly [
    WheelDefinition,
    WheelDefinition,
    WheelDefinition,
    WheelDefinition,
  ];
  /** Per-wheel anti-roll force in newtons, indexed by wheel index. */
  readonly #antiRollForces: number[] = [0, 0, 0, 0];

  #actions: VehicleActions = NEUTRAL_ACTIONS;
  #previousPose: { position: Vec3; rotation: Quat };
  #currentPose: { position: Vec3; rotation: Quat };
  #previousWheelVisual: WheelVisualState[];
  #currentWheelVisual: WheelVisualState[];
  #telemetry: VehicleTelemetry;
  #previousVelocity: Vec3 = vec3();
  #distanceTravelled = 0;
  #disposed = false;

  // Scratch vectors reused every step so the hot path stays allocation-free.
  readonly #scratch = {
    anchorWorld: vec3(),
    axis: vec3(),
    up: vec3(),
    forward: vec3(),
    right: vec3(),
    left: vec3(),
    wheelForward: vec3(),
    wheelRight: vec3(),
    normal: vec3(),
    contactPoint: vec3(),
    radiusVector: vec3(),
    surfaceVelocity: vec3(),
    force: vec3(),
    impulse: vec3(),
    rotation: { x: 0, y: 0, z: 0, w: 1 } as Quat,
    acceleration: vec3(),
    temp: vec3(),
  };

  constructor(options: CarOptions) {
    this.#config = options.config ?? VEHICLE_CONFIG;
    this.#rapier = options.rapier;
    this.#physics = options.physics;
    this.#surfaceProvider = options.surfaceProvider ?? null;
    this.#groundNormalProvider = options.groundNormalProvider ?? null;
    this.#ray = new this.#rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.#drivetrain = new Drivetrain(this.#config.drivetrain, this.#config.wheels.radius);
    this.#referenceLoad = (this.#config.chassis.mass * 9.81) / 4;

    this.#wheelDefinitions = [
      { index: WHEEL_INDEX.frontLeft, isFront: true, side: -1, anchor: this.#anchorFor(true, -1) },
      { index: WHEEL_INDEX.frontRight, isFront: true, side: 1, anchor: this.#anchorFor(true, 1) },
      { index: WHEEL_INDEX.rearLeft, isFront: false, side: -1, anchor: this.#anchorFor(false, -1) },
      { index: WHEEL_INDEX.rearRight, isFront: false, side: 1, anchor: this.#anchorFor(false, 1) },
    ];

    this.wheels = [
      this.#createWheelState(this.#wheelDefinitions[0]),
      this.#createWheelState(this.#wheelDefinitions[1]),
      this.#createWheelState(this.#wheelDefinitions[2]),
      this.#createWheelState(this.#wheelDefinitions[3]),
    ];

    this.body = this.#createBody(options);
    const pose = this.#readPose();
    this.#previousPose = { position: cloneVec3(pose.position), rotation: { ...pose.rotation } };
    this.#currentPose = { position: cloneVec3(pose.position), rotation: { ...pose.rotation } };
    this.#previousWheelVisual = this.#readWheelVisual();
    this.#currentWheelVisual = this.#readWheelVisual();
    this.#telemetry = this.#buildTelemetry(0);

    this.#unsubscribers.push(
      this.#physics.addPreStepHandler(this.#applyForces),
      this.#physics.addPostStepHandler(this.#capturePose),
    );
  }

  get telemetry(): VehicleTelemetry {
    return this.#telemetry;
  }

  get position(): Vec3 {
    return this.#currentPose.position;
  }

  get rotation(): Quat {
    return this.#currentPose.rotation;
  }

  /** Sets the driving intent consumed by the next fixed step. */
  setActions(actions: VehicleActions): void {
    this.#actions = actions;
  }

  /**
   * Interpolates the last two authoritative poses for rendering. Physics runs at a fixed 60 Hz
   * while rendering does not, so presentation lags by at most one step.
   */
  getInterpolatedPose(alpha: number): VehiclePose {
    const t = clamp(alpha, 0, 1);
    const position = lerpVec3(vec3(), this.#previousPose.position, this.#currentPose.position, t);
    const rotation = lerpQuat(
      { x: 0, y: 0, z: 0, w: 1 },
      this.#previousPose.rotation,
      this.#currentPose.rotation,
      t,
    );
    const wheels = this.#currentWheelVisual.map((current, index) => {
      const previous = this.#previousWheelVisual[index] ?? current;
      return {
        isFront: current.isFront,
        steerAngle: previous.steerAngle + (current.steerAngle - previous.steerAngle) * t,
        spinAngle: current.spinAngle,
        suspensionLength:
          previous.suspensionLength + (current.suspensionLength - previous.suspensionLength) * t,
      };
    });
    return { position, rotation, wheels, brake: this.#telemetry.brake };
  }

  /**
   * Slides the car by (dx, dz) without changing anything about its motion
   * (floating-origin rebase): body and interpolation poses move together, velocity
   * and rotation are untouched, so the step after the slide is indistinguishable
   * from the step before it — just computed near the origin, where float32 is
   * precise. Wheel state is all relative (compression, forces), so it carries over.
   */
  shiftBy(dx: number, dz: number): void {
    const t = this.body.translation();
    this.body.setTranslation({ x: t.x - dx, y: t.y, z: t.z - dz }, true);
    for (const pose of [this.#previousPose, this.#currentPose]) {
      pose.position.x -= dx;
      pose.position.z -= dz;
    }
  }

  reset(position?: readonly [number, number, number], yaw?: number): void {
    const target = position ?? this.#config.spawn.position;
    const rotation = yaw ?? this.#config.spawn.yaw;
    const half = rotation * 0.5;

    this.body.setTranslation({ x: target[0], y: target[1], z: target[2] }, true);
    this.body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.#drivetrain.reset();
    this.#distanceTravelled = 0;
    this.#previousVelocity = vec3();
    this.#antiRollForces.fill(0);

    for (const wheel of this.wheels) {
      wheel.inContact = false;
      wheel.normalLoad = 0;
      wheel.tireLoad = 0;
      wheel.suspensionLength = this.#config.wheels.restLength;
      wheel.compression = 0;
      wheel.smoothedCompression = 0;
      wheel.suspensionForce = 0;
      wheel.slipAngle = 0;
      wheel.longitudinalForce = 0;
      wheel.lateralForce = 0;
      wheel.steerAngle = 0;
      wheel.spinAngle = 0;
      wheel.utilization = 0;
      setVec3(wheel.surfaceVelocity, 0, 0, 0);
      setVec3(wheel.contactNormal, 0, 1, 0);
    }

    const pose = this.#readPose();
    copyVec3(this.#previousPose.position, pose.position);
    copyVec3(this.#currentPose.position, pose.position);
    this.#previousPose.rotation = { ...pose.rotation };
    this.#currentPose.rotation = { ...pose.rotation };
    this.#previousWheelVisual = this.#readWheelVisual();
    this.#currentWheelVisual = this.#readWheelVisual();
    this.#telemetry = this.#buildTelemetry(0);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const unsubscribe of this.#unsubscribers) {
      unsubscribe();
    }
    this.#unsubscribers.length = 0;
    this.#physics.removeBody(this.body);
  }

  #anchorFor(isFront: boolean, side: -1 | 1): Vec3 {
    const wheels = this.#config.wheels;
    return vec3(side * wheels.halfTrack, wheels.anchorY, isFront ? wheels.frontZ : wheels.rearZ);
  }

  #createWheelState(definition: WheelDefinition): WheelState {
    return {
      index: definition.index,
      isFront: definition.isFront,
      side: definition.side,
      anchor: cloneVec3(definition.anchor),
      inContact: false,
      contactPoint: vec3(),
      contactNormal: vec3(0, 1, 0),
      suspensionLength: this.#config.wheels.restLength,
      compression: 0,
      smoothedCompression: 0,
      suspensionForce: 0,
      normalLoad: 0,
      tireLoad: 0,
      slipAngle: 0,
      longitudinalForce: 0,
      lateralForce: 0,
      steerAngle: 0,
      spinAngle: 0,
      utilization: 0,
      surfaceVelocity: vec3(),
      surfaceId: 'asphalt',
      surfaceGripModifier: 1,
      surfaceRollingResistance: this.#config.tires.rollingResistance,
    };
  }

  #createBody(options: CarOptions): RapierRigidBody {
    const { chassis, spawn } = this.#config;
    const [halfWidth, halfHeight, halfLength] = chassis.halfExtents;
    const spawnPosition = options.spawnPosition ?? spawn.position;
    const spawnYaw = options.spawnYaw ?? spawn.yaw;
    const half = spawnYaw * 0.5;

    // Solid-box inertia is a reasonable stand-in for a car body; inertiaScale tunes rotational
    // feel without changing collision geometry.
    const mass = chassis.mass;
    const [pitchScale, yawScale, rollScale] = chassis.inertiaScale;
    const pitchInertia = (mass / 12) * (4 * halfHeight ** 2 + 4 * halfLength ** 2) * pitchScale;
    const yawInertia = (mass / 12) * (4 * halfWidth ** 2 + 4 * halfLength ** 2) * yawScale;
    this.#yawInertia = yawInertia;
    const rollInertia = (mass / 12) * (4 * halfWidth ** 2 + 4 * halfHeight ** 2) * rollScale;

    const bodyDesc = this.#rapier.RigidBodyDesc.dynamic()
      .setTranslation(spawnPosition[0], spawnPosition[1], spawnPosition[2])
      .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
      .setLinearDamping(chassis.linearDamping)
      .setAngularDamping(chassis.angularDamping)
      .setCcdEnabled(chassis.ccd)
      .setAdditionalMassProperties(
        mass,
        {
          x: chassis.centerOfMass[0],
          y: chassis.centerOfMass[1],
          z: chassis.centerOfMass[2],
        },
        vec3(pitchInertia, yawInertia, rollInertia),
        { x: 0, y: 0, z: 0, w: 1 },
      );

    const body = this.#physics.createDynamicBody(bodyDesc);

    // The collider contributes collision geometry only: density is zero so the body's mass
    // properties come exclusively from the tuned additional mass above.
    this.#physics.attachCollider(
      this.#rapier.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength)
        .setDensity(0)
        .setFriction(0.35)
        .setRestitution(0.05)
        .setActiveEvents(this.#rapier.ActiveEvents.COLLISION_EVENTS),
      body,
    );

    return body;
  }

  #readPose(): { position: Vec3; rotation: Quat } {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    return {
      position: cloneVec3(translation),
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    };
  }

  #readWheelVisual(): WheelVisualState[] {
    return this.wheels.map((wheel) => ({
      isFront: wheel.isFront,
      steerAngle: wheel.steerAngle,
      spinAngle: wheel.spinAngle,
      suspensionLength: wheel.suspensionLength,
    }));
  }

  /**
   * Pre-step handler: raycasts, suspension, drivetrain and tire forces for one fixed step.
   * An arrow property so the same reference can be registered and later removed.
   */
  #applyForces = (delta: number): void => {
    if (this.#disposed) {
      return;
    }
    const dt = delta > 0 ? delta : 0;
    if (dt <= 0) {
      return;
    }

    const config = this.#config;
    const { wheels: wheelConfig, tires, steering, aero } = config;
    const scratch = this.#scratch;
    const actions = this.#actions;
    const body = this.body;
    const world = this.#physics.world;

    const translation = body.translation();
    const rotation = body.rotation();
    setVec3(scratch.rotation, rotation.x, rotation.y, rotation.z);
    scratch.rotation.w = rotation.w;

    rotateVec3ByQuat(scratch.up, UP_LOCAL, scratch.rotation);
    rotateVec3ByQuat(scratch.forward, FORWARD_LOCAL, scratch.rotation);
    rotateVec3ByQuat(scratch.right, RIGHT_LOCAL, scratch.rotation);
    scaleVec3(scratch.left, scratch.right, -1);

    const linearVelocity = body.linvel();
    const angularVelocity = body.angvel();
    const centerOfMass = body.worldCom();
    const speed = lengthVec3(linearVelocity);

    // Steering authority is derived from the tires' cornering budget rather than a hand-tuned
    // falloff: a steady-state corner at lateral acceleration `a` needs `atan(wheelbase * a / v^2)`
    // of wheel angle, so scaling the limit from that budget keeps full lock meaningful at every
    // speed. The relief term adds authority in proportion to the chassis slip angle so a slide can
    // be caught with opposite lock.
    const wheelbase = Math.abs(wheelConfig.rearZ - wheelConfig.frontZ);
    const corneringBudget = steering.gripBudgetFactor * tires.frictionCoefficient * GRAVITY;
    const budgetAngle = Math.atan((wheelbase * corneringBudget) / Math.max(speed * speed, 1));
    const chassisSlip = Math.atan2(
      dotVec3(linearVelocity, scratch.right),
      Math.max(Math.abs(dotVec3(linearVelocity, scratch.forward)), 1),
    );
    // Relief is for catching a slide, not feeding it. Positive chassis slip means the velocity is
    // to the body's right; steering right points the front tires into that travel direction and
    // helps catch the oversteer. Both signals therefore share a sign for countersteering here.
    const counterSteering = chassisSlip * actions.steer > 0;
    const slipRelief = counterSteering ? Math.abs(chassisSlip) * steering.slipReliefFactor : 0;
    const maxSteerAngle = clamp(budgetAngle + slipRelief, steering.minAngle, steering.maxAngle);
    // Sign convention: `actions.steer` is +1 for right, while the physical steering angle is
    // positive for a left turn (counter-clockwise about +Y, matching Three.js rotation.y and the
    // wheel visual). The single sign flip happens here so the rest of the model reads naturally.
    const steerAngle = -clamp(actions.steer, -1, 1) * maxSteerAngle;

    // Downforce reaches the tires through the suspension loads, so compute it up front.
    const downforcePerWheel = (aero.downforceCoefficient * speed * speed) / 4;
    const handbrake = actions.handbrake;
    this.#antiRollForces.fill(0);

    let drivenWheelSpeedSum = 0;
    let drivenWheelCount = 0;

    // Pass 1 — contact resolution and suspension compression.
    for (const definition of this.#wheelDefinitions) {
      const wheel = this.wheels[definition.index];
      if (!wheel) {
        continue;
      }

      const anchorWorld = addVec3(
        scratch.anchorWorld,
        translation,
        rotateVec3ByQuat(scratch.axis, wheel.anchor, scratch.rotation),
      );
      this.#ray.origin = { x: anchorWorld.x, y: anchorWorld.y, z: anchorWorld.z };
      this.#ray.dir = { x: -scratch.up.x, y: -scratch.up.y, z: -scratch.up.z };

      const hit = world.castRayAndGetNormal(
        this.#ray,
        wheelConfig.maxLength + wheelConfig.radius,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );

      if (!hit) {
        wheel.inContact = false;
        wheel.normalLoad = 0;
        wheel.tireLoad = 0;
        wheel.compression = 0;
        wheel.smoothedCompression = 0;
        wheel.suspensionForce = 0;
        wheel.suspensionLength = wheelConfig.maxLength;
        wheel.longitudinalForce = 0;
        wheel.lateralForce = 0;
        wheel.utilization = 0;
        wheel.surfaceId = 'air';
        wheel.surfaceGripModifier = 1;
        wheel.surfaceRollingResistance = this.#config.tires.rollingResistance;
        setVec3(wheel.contactNormal, scratch.up.x, scratch.up.y, scratch.up.z);
        setVec3(wheel.surfaceVelocity, 0, 0, 0);
        continue;
      }

      wheel.inContact = true;
      const distanceToContact = hit.timeOfImpact;
      normalizeVec3(scratch.normal, hit.normal);
      copyVec3(wheel.contactNormal, scratch.normal);

      // The wheel center sits one radius above the contact patch along the cast axis.
      const lengthAlongAxis = clamp(
        distanceToContact - wheelConfig.radius,
        wheelConfig.minLength,
        wheelConfig.maxLength,
      );
      wheel.suspensionLength = lengthAlongAxis;
      wheel.compression = wheelConfig.restLength - lengthAlongAxis;
      // Facet smoothing: the measured compression steps at triangle edges; the spring
      // works from a 30 ms-lagged value so steps become ramps. On first contact the
      // lag starts from the measurement so a landing still lands.
      const compressionBlend = clamp(
        dt / Math.max(wheelConfig.compressionSmoothingSeconds, 0.001),
        0,
        1,
      );
      wheel.smoothedCompression +=
        (wheel.compression - wheel.smoothedCompression) * compressionBlend;

      addScaledVec3(scratch.contactPoint, anchorWorld, this.#ray.dir as Vec3, distanceToContact);
      copyVec3(wheel.contactPoint, scratch.contactPoint);

      // Facet normals on triangulated ground jump direction every triangle; at speed
      // that reads as constant small kicks through the suspension. When the generator
      // can answer analytically, lean the contact normal most of the way to its smooth
      // normal (only on upward ground — walls and obstacle sides keep the true hit).
      if (this.#groundNormalProvider !== null && scratch.normal.y > 0.5) {
        const analytic = this.#groundNormalProvider(scratch.contactPoint.x, scratch.contactPoint.z);
        scratch.normal.x = scratch.normal.x * 0.15 + analytic.x * 0.85;
        scratch.normal.y = scratch.normal.y * 0.15 + analytic.y * 0.85;
        scratch.normal.z = scratch.normal.z * 0.15 + analytic.z * 0.85;
        normalizeVec3(scratch.normal, scratch.normal);
        copyVec3(wheel.contactNormal, scratch.normal);
      }

      // What is under this wheel, per the generator. Asked once per contact per step at
      // the patch, so a car straddling a grass/soil boundary loads each tire honestly.
      const surface = this.#surfaceProvider?.(scratch.contactPoint.x, scratch.contactPoint.z);
      if (surface) {
        wheel.surfaceId = surface.id;
        wheel.surfaceGripModifier = surface.gripModifier;
        wheel.surfaceRollingResistance = surface.rollingResistance;
      } else {
        wheel.surfaceId = 'asphalt';
        wheel.surfaceGripModifier = 1;
        wheel.surfaceRollingResistance = this.#config.tires.rollingResistance;
      }

      // Velocity of the contact patch: v + omega x r.
      subtractVec3(scratch.radiusVector, scratch.contactPoint, centerOfMass);
      crossVec3(scratch.temp, angularVelocity, scratch.radiusVector);
      addVec3(scratch.surfaceVelocity, linearVelocity, scratch.temp);
      copyVec3(wheel.surfaceVelocity, scratch.surfaceVelocity);
    }

    // Anti-roll bars transfer load between the wheels on each axle.
    if (wheelConfig.antiRollStiffness > 0) {
      this.#accumulateAntiRoll(WHEEL_INDEX.frontLeft, WHEEL_INDEX.frontRight);
      this.#accumulateAntiRoll(WHEEL_INDEX.rearLeft, WHEEL_INDEX.rearRight);
    }

    // Driven-axle speed for the drivetrain, taken from contact-patch velocities.
    const allWheelDrive = config.drivetrain.drivenWheels === 'all';
    for (const definition of this.#wheelDefinitions) {
      const wheel = this.wheels[definition.index];
      if (!wheel || !wheel.inContact) {
        continue;
      }
      if (!allWheelDrive && definition.isFront) {
        continue;
      }
      drivenWheelSpeedSum += dotVec3(wheel.surfaceVelocity, scratch.forward);
      drivenWheelCount += 1;
    }
    const drivenWheelSpeed = drivenWheelCount > 0 ? drivenWheelSpeedSum / drivenWheelCount : 0;

    const drivetrainState = this.#drivetrain.update(dt, {
      throttle: actions.throttle,
      brake: actions.brake,
      drivenWheelSpeed,
      speed,
    });
    const reversing = drivetrainState.reversing;
    const drivenWheelIndices: readonly number[] = allWheelDrive
      ? [WHEEL_INDEX.frontLeft, WHEEL_INDEX.frontRight, WHEEL_INDEX.rearLeft, WHEEL_INDEX.rearRight]
      : [WHEEL_INDEX.rearLeft, WHEEL_INDEX.rearRight];
    const driveForcePerWheel = drivetrainState.driveForce / drivenWheelIndices.length;

    // Pass 2 — tire forces and impulse application.
    for (const definition of this.#wheelDefinitions) {
      const wheel = this.wheels[definition.index];
      if (!wheel) {
        continue;
      }

      const wheelSteerAngle = definition.isFront
        ? this.#ackermannAngle(steerAngle, definition.side)
        : 0;
      wheel.steerAngle = wheelSteerAngle;

      if (!wheel.inContact) {
        continue;
      }

      // Suspension spring, damper, and the anti-roll contribution along the contact normal.
      const springForce = wheelConfig.stiffness * wheel.smoothedCompression;
      const velocityAlongNormal = dotVec3(wheel.surfaceVelocity, wheel.contactNormal);
      const dampingCoefficient =
        velocityAlongNormal < 0 ? wheelConfig.compressionDamping : wheelConfig.reboundDamping;
      // Blow-off: beyond the blow-off speed the damper's force saturates instead of
      // scaling linearly with impact velocity (a landed crest must not spike 20 kN).
      const blowoff = Math.max(wheelConfig.dampingBlowoffSpeed, 0.01);
      const dampingVelocity = velocityAlongNormal / (1 + Math.abs(velocityAlongNormal) / blowoff);
      const unslewedForce = clamp(
        springForce -
          dampingCoefficient * dampingVelocity +
          (this.#antiRollForces[definition.index] ?? 0),
        0,
        wheelConfig.maxForce,
      );
      // Slew-rate limit: the applied force approaches the computed force at a capped
      // rate, so even a cliff-edge landing spreads over a few steps instead of
      // arriving as a one-step 20 kN kick through one corner of the chassis.
      const maxForceDelta = wheelConfig.maxForceRatePerSecond * dt;
      const suspensionForce =
        wheel.suspensionForce +
        clamp(unslewedForce - wheel.suspensionForce, -maxForceDelta, maxForceDelta);
      wheel.suspensionForce = suspensionForce;

      const normalLoad = Math.max(0, suspensionForce + downforcePerWheel);
      wheel.normalLoad = normalLoad;
      const loadBlend = clamp(dt / 0.025, 0, 1);
      wheel.tireLoad += (normalLoad - wheel.tireLoad) * loadBlend;

      // Wheel-plane axes: forward rotated by the steering angle about the contact normal.
      addScaledVec3(scratch.temp, scratch.forward, scratch.left, Math.tan(wheelSteerAngle));
      normalizeVec3(scratch.wheelForward, scratch.temp);
      if (lengthVec3(scratch.wheelForward) < 1e-6) {
        copyVec3(scratch.wheelForward, scratch.forward);
      }
      crossVec3(scratch.temp, scratch.wheelForward, wheel.contactNormal);
      normalizeVec3(scratch.wheelRight, scratch.temp);
      if (lengthVec3(scratch.wheelRight) < 1e-6) {
        copyVec3(scratch.wheelRight, scratch.right);
      }

      const velocityLongitudinal = dotVec3(wheel.surfaceVelocity, scratch.wheelForward);
      const velocityLateral = dotVec3(wheel.surfaceVelocity, scratch.wheelRight);
      const slipAngle = slipAngleFromVelocities(
        velocityLateral,
        velocityLongitudinal,
        tires.slipAngleReferenceSpeed,
      );
      wheel.slipAngle = slipAngle;

      // Longitudinal demand: drive, service brakes, handbrake, rolling resistance.
      const motionSign =
        Math.abs(velocityLongitudinal) > BRAKE_DEADBAND_SPEED ? Math.sign(velocityLongitudinal) : 0;
      let longitudinalForce = 0;
      if (drivenWheelIndices.includes(definition.index)) {
        // The drivetrain already reports a signed force (negative in reverse), so no extra sign.
        longitudinalForce += driveForcePerWheel;
      }
      const brakeForce = definition.isFront ? config.brakes.frontForce : config.brakes.rearForce;
      // In reverse the brake key is reverse throttle, so it must not also brake the wheels.
      if (!reversing) {
        longitudinalForce -= brakeForce * actions.brake * motionSign;
      }
      if (handbrake && !definition.isFront) {
        longitudinalForce -= config.brakes.handbrakeForce * motionSign;
      }
      longitudinalForce -= wheel.surfaceRollingResistance * normalLoad * motionSign;

      const frictionLimit =
        effectiveFriction(wheel.tireLoad, this.#referenceLoad, tires) *
        wheel.tireLoad *
        wheel.surfaceGripModifier;
      const gripLimit = frictionLimit * tires.longitudinalSaturation;
      const clampedLongitudinal = clamp(longitudinalForce, -gripLimit, gripLimit);

      const handbrakeScale = handbrake && !definition.isFront ? tires.handbrakeGripScale : 1;
      const lateralTarget =
        -lateralForceMagnitude(wheel.tireLoad, slipAngle, this.#referenceLoad, tires) *
        wheel.surfaceGripModifier *
        handbrakeScale *
        frictionCircleScale(clampedLongitudinal, gripLimit);
      // Relaxation: the tire reaches its target force over a rolling distance, not in
      // one step. This is both the physical behaviour and the low-pass filter that
      // keeps facet/load spikes out of the chassis' yaw.
      const patchSpeed = Math.hypot(velocityLongitudinal, velocityLateral);
      const relaxation = clamp(
        (patchSpeed * dt) / Math.max(tires.relaxationLengthMeters, 0.01),
        0,
        1,
      );
      const lateralForce = wheel.lateralForce + (lateralTarget - wheel.lateralForce) * relaxation;

      wheel.longitudinalForce = clampedLongitudinal;
      wheel.lateralForce = lateralForce;
      wheel.utilization =
        frictionLimit > 0
          ? Math.min(1, Math.hypot(clampedLongitudinal, lateralForce) / frictionLimit)
          : 0;

      scaleVec3(scratch.force, wheel.contactNormal, suspensionForce);
      addScaledVec3(scratch.force, scratch.force, scratch.wheelForward, clampedLongitudinal);
      addScaledVec3(scratch.force, scratch.force, scratch.wheelRight, lateralForce);
      scaleVec3(scratch.impulse, scratch.force, dt);
      body.applyImpulseAtPoint(scratch.impulse, wheel.contactPoint, true);
    }

    // Yaw stability assist: damp rotation toward the rate the steering asks for
    // (bicycle model capped by the cornering budget the steering limit derives from).
    // Excess yaw is what turns a slide into a spin; the assist removes the excess
    // without steering the car or inventing grip. Handbrake = deliberate drift, so
    // the assist stands down and the slide is the player's to catch.
    let groundedContacts = 0;
    for (const wheel of this.wheels) {
      if (wheel.inContact) {
        groundedContacts += 1;
      }
    }
    // Planted landings: fully airborne at speed, extra gravity pulls the car back to
    // the ground sooner and flatter. Flight is fun; floating into a spin is not.
    if (groundedContacts === 0 && config.stability.airborneGravityScale > 0 && speed > 6) {
      setVec3(scratch.temp, 0, -1, 0);
      scaleVec3(
        scratch.impulse,
        scratch.temp,
        body.mass() * GRAVITY * config.stability.airborneGravityScale * dt,
      );
      body.applyImpulse(scratch.impulse, true);
    }
    if (!handbrake && this.#yawInertia > 0) {
      const contacts = groundedContacts;
      const forwardSpeed = dotVec3(linearVelocity, scratch.forward);
      if (contacts >= 2 && Math.abs(forwardSpeed) > config.stability.minSpeedMps) {
        const yawCap = corneringBudget / Math.max(Math.abs(forwardSpeed), 1);
        const desiredYawRate = clamp(
          (forwardSpeed / wheelbase) * Math.tan(steerAngle),
          -yawCap,
          yawCap,
        );
        const currentYawRate = dotVec3(angularVelocity, scratch.up);
        const yawError = currentYawRate - desiredYawRate;
        // Partially grounded (landing on two wheels, crest unloading) is when kicks
        // arrive, so the assist answers faster then; a hard cap on total yaw rate
        // catches the rotation that is already beyond what tires could sustain.
        const response = config.stability.yawResponsePerSecond * (contacts < 4 ? 1.7 : 1);
        let correction = -yawError * Math.min(1, response * dt);
        const hardCap = yawCap * 1.5 + 0.5;
        if (Math.abs(currentYawRate) > hardCap) {
          correction +=
            (Math.sign(currentYawRate) * hardCap - currentYawRate) * Math.min(1, 8 * dt);
        }
        scaleVec3(scratch.impulse, scratch.up, this.#yawInertia * correction);
        body.applyTorqueImpulse(scratch.impulse, true);
      }
    }

    // Aerodynamic drag acts on the chassis as a whole.
    if (speed > 0.01) {
      const dragMagnitude = aero.dragCoefficient * speed * speed;
      normalizeVec3(scratch.temp, linearVelocity);
      scaleVec3(scratch.impulse, scratch.temp, -dragMagnitude * dt);
      body.applyImpulse(scratch.impulse, true);
    }

    // Low-speed hold damping stops endless creep and residual spin at a standstill.
    if (speed < tires.holdSpeed && actions.throttle < 0.05 && actions.brake < 0.05) {
      scaleVec3(scratch.impulse, linearVelocity, -tires.holdDamping * dt);
      body.applyImpulse(scratch.impulse, true);
      const angularSpeed = lengthVec3(angularVelocity);
      if (angularSpeed > 0.001) {
        scaleVec3(scratch.impulse, angularVelocity, -tires.holdDamping * 0.05 * dt);
        body.applyTorqueImpulse(scratch.impulse, true);
      }
    }

    this.#updateWheelPresentation(dt, steerAngle);
  };

  /** Post-step handler: captures the authoritative pose and derives telemetry. */
  #capturePose = (delta: number): void => {
    if (this.#disposed) {
      return;
    }

    copyVec3(this.#previousPose.position, this.#currentPose.position);
    this.#previousPose.rotation = { ...this.#currentPose.rotation };
    this.#previousWheelVisual = this.#currentWheelVisual;

    const pose = this.#readPose();
    copyVec3(this.#currentPose.position, pose.position);
    this.#currentPose.rotation = { ...pose.rotation };
    this.#currentWheelVisual = this.#readWheelVisual();

    if (pose.position.y < this.#config.chassis.outOfBoundsY) {
      this.reset();
      return;
    }

    this.#telemetry = this.#buildTelemetry(delta);
  };

  /**
   * Wheel presentation state: steering angle and accumulated spin, derived from contact-patch
   * velocity. Wheel angular velocity is not simulated (the tire model applies forces directly),
   * so spin is a rolling-speed approximation; locked rear wheels during a handbrake stop spinning.
   */
  #updateWheelPresentation(delta: number, steerAngle: number): void {
    const { wheels: wheelConfig } = this.#config;
    const forward = this.#scratch.forward;
    const handbrake = this.#actions.handbrake;

    for (const definition of this.#wheelDefinitions) {
      const wheel = this.wheels[definition.index];
      if (!wheel) {
        continue;
      }
      wheel.steerAngle = definition.isFront ? this.#ackermannAngle(steerAngle, definition.side) : 0;

      if (!wheel.inContact) {
        continue;
      }
      if (handbrake && !definition.isFront) {
        wheel.spinAngle = 0;
        continue;
      }
      const longitudinalVelocity = dotVec3(wheel.surfaceVelocity, forward);
      wheel.spinAngle += (longitudinalVelocity / wheelConfig.radius) * delta;
    }
  }

  #ackermannAngle(steerAngle: number, side: -1 | 1): number {
    const { ackermann } = this.#config.steering;
    if (ackermann <= 0 || steerAngle === 0) {
      return steerAngle;
    }
    // Positive steer turns left: the left (inner) wheel turns more, the right (outer) less.
    const inner = Math.sign(steerAngle) === -side;
    return steerAngle * (inner ? 1 + ackermann * 0.5 : 1 - ackermann * 0.5);
  }

  #accumulateAntiRoll(leftIndex: number, rightIndex: number): void {
    const left = this.wheels[leftIndex];
    const right = this.wheels[rightIndex];
    if (!left || !right || !left.inContact || !right.inContact) {
      return;
    }
    const transfer = this.#config.wheels.antiRollStiffness * (left.compression - right.compression);
    if (transfer === 0) {
      return;
    }
    this.#antiRollForces[leftIndex] = (this.#antiRollForces[leftIndex] ?? 0) + transfer;
    this.#antiRollForces[rightIndex] = (this.#antiRollForces[rightIndex] ?? 0) - transfer;
  }

  #buildTelemetry(delta: number): VehicleTelemetry {
    const config = this.#config;
    const linearVelocity = this.body.linvel();
    const quat = this.rotation;
    const forward = rotateVec3ByQuat(vec3(), FORWARD_LOCAL, quat);
    const right = rotateVec3ByQuat(vec3(), RIGHT_LOCAL, quat);
    const speed = lengthVec3(linearVelocity);
    const forwardSpeed = dotVec3(linearVelocity, forward);

    let contactCount = 0;
    let steerTotal = 0;
    let steerCount = 0;
    for (const wheel of this.wheels) {
      if (wheel.inContact) {
        contactCount += 1;
      }
      if (wheel.isFront) {
        steerTotal += wheel.steerAngle;
        steerCount += 1;
      }
    }

    const slipAngle = slipAngleFromVelocities(
      dotVec3(linearVelocity, right),
      forwardSpeed,
      config.tires.slipAngleReferenceSpeed,
    );

    const acceleration = scaleVec3(
      this.#scratch.acceleration,
      subtractVec3(this.#scratch.temp, linearVelocity, this.#previousVelocity),
      delta > 0 ? 1 / delta : 0,
    );
    const lateralAcceleration = dotVec3(acceleration, right);
    const longitudinalAcceleration = dotVec3(acceleration, forward);
    this.#previousVelocity = cloneVec3(linearVelocity);
    this.#distanceTravelled += speed * delta;
    const drivetrainState = this.#drivetrain.state;

    return {
      speedMps: speed,
      speedKph: speed * 3.6,
      forwardSpeed,
      rpm: drivetrainState.rpm,
      gear: drivetrainState.gear,
      shifting: drivetrainState.shifting,
      throttle: this.#actions.throttle,
      brake: this.#actions.brake,
      handbrake: this.#actions.handbrake,
      steerAngle: steerCount > 0 ? steerTotal / steerCount : 0,
      contactCount,
      isGrounded: contactCount > 0,
      slipAngle,
      lateralAcceleration,
      longitudinalAcceleration,
      drifting: Math.abs(slipAngle) > DRIFT_SLIP_THRESHOLD && speed > 6,
      distanceTravelled: this.#distanceTravelled,
    };
  }
}
