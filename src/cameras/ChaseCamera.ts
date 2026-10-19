import { PerspectiveCamera } from 'three';
import {
  CHASE_CAMERA_CONFIG,
  type ChaseCameraConfig,
  type ChaseCameraView,
} from '../config/camera';
import {
  applyOrbitSwipe,
  CHASE_ORBIT_CONFIG,
  NEUTRAL_ORBIT,
  orbitOffsetVec3,
  wrapOrbitYaw,
  type ChaseOrbitConfig,
  type OrbitOffset,
} from './camera-orbit';
import { clamp } from '../shared/math';
import {
  addVec3,
  cloneVec3,
  copyVec3,
  lerpVec3,
  rotateVec3ByQuat,
  setVec3,
  smoothingFactor,
  vec3,
  yawFromQuat,
  type Quat,
  type Vec3,
} from '../shared/vector';
import type { VehiclePose, VehicleTelemetry } from '../vehicles/types';

/**
 * Damped chase camera with speed-scaled field of view.
 *
 * The camera does not sit rigidly on the car: it chases a target derived from the car's pose with
 * an exponential time constant, so it visibly lags behind hard turns and hard acceleration, then
 * settles. FOV widens with speed to amplify the sensation of speed, and a small roll is applied
 * while cornering.
 *
 * Damping is expressed as time constants, so the feel is identical at 30, 60, or 144 Hz — an
 * important property on a cross-platform target where phone frame rates vary widely.
 */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  readonly #config: ChaseCameraConfig;
  readonly #position = vec3();
  readonly #lookAt = vec3();
  #fov: number;
  /** Active distance view; offsets/FOV glide toward it on `viewTransitionSeconds`. */
  #viewIndex: number;
  readonly #currentOffset = vec3();
  readonly #currentLookOffset = vec3();
  #currentFovDelta = 0;
  /**
   * Smoothed car velocity estimated from pose deltas. The position follow is an
   * exponential lag, whose steady-state trail grows with speed (speed x lag); aiming
   * the desired point one lag-interval ahead of the car cancels that trail, so the
   * framing distance is the same at 30 km/h and at 200 km/h.
   */
  readonly #velocity = vec3();
  readonly #lastPosePosition = vec3();
  #hasPoseSample = false;
  #initialized = false;
  /** Smoothed heading: the camera's yaw chases the car's yaw on its own time constant. */
  #yaw = 0;
  /** Smoothed horizon roll: telemetry lateral acceleration is a finite difference and
   * spikes on every bump; the roll must chase it, never mirror it. */
  #roll = 0;
  #groundHeight: ((x: number, z: number) => number) | null = null;
  /**
   * Swipe-to-orbit offset around the car (owner request 2026-10-17): the target
   * moves immediately with each swipe pixel, and the framed offset eases after it
   * on its own time constant so a flick reads as a camera move, not a cut.
   */
  #orbitTarget: OrbitOffset = { ...NEUTRAL_ORBIT };
  #orbit: OrbitOffset = { ...NEUTRAL_ORBIT };
  readonly #orbitConfig: ChaseOrbitConfig;

  // Scratch vectors kept out of the per-frame allocation path.
  readonly #desiredPosition = vec3();
  readonly #desiredLook = vec3();
  readonly #offset = vec3();
  readonly #lookOffset = vec3();

  constructor(
    config: ChaseCameraConfig = CHASE_CAMERA_CONFIG,
    aspect = 1,
    orbitConfig: ChaseOrbitConfig = CHASE_ORBIT_CONFIG,
  ) {
    this.#config = config;
    this.#orbitConfig = orbitConfig;
    this.#fov = config.baseFov;
    this.camera = new PerspectiveCamera(config.baseFov, aspect, 0.1, 2000);
    this.camera.position.set(0, 3, 8);
    this.#viewIndex = Math.max(
      0,
      config.views.findIndex((view) => view.id === config.defaultViewId),
    );
    const view = this.view;
    copyVec3(this.#currentOffset, {
      x: view.offset[0],
      y: view.offset[1],
      z: view.offset[2],
    });
    copyVec3(this.#currentLookOffset, {
      x: view.lookOffset[0],
      y: view.lookOffset[1],
      z: view.lookOffset[2],
    });
    this.#currentFovDelta = view.fovDelta;
  }

  /** The distance view currently being framed (or glided toward). */
  get view(): ChaseCameraView {
    return this.#config.views[this.#viewIndex] ?? this.#config.views[0]!;
  }

  /** Advances to the next distance view, wrapping around. Returns the new view. */
  cycleView(): ChaseCameraView {
    this.#viewIndex = (this.#viewIndex + 1) % this.#config.views.length;
    return this.view;
  }

  /** Jumps the view selection (glide still applies). False for an unknown id. */
  setView(id: string): boolean {
    const index = this.#config.views.findIndex((view) => view.id === id);
    if (index < 0) {
      return false;
    }
    this.#viewIndex = index;
    return true;
  }

  get fov(): number {
    return this.#fov;
  }

  get position(): Vec3 {
    return cloneVec3(this.#position);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Gives the camera the ground height function (the terrain sampler in the game). The
   * desired position is then clamped above the actual ground, not above y=0 — a chase
   * camera that clips through a hillside behind the car breaks immersion instantly.
   */
  setGroundHeightProvider(provider: ((x: number, z: number) => number) | null): void {
    this.#groundHeight = provider;
  }

  /** The eased orbit offset currently framing the shot, radians. */
  get orbit(): OrbitOffset {
    return { ...this.#orbit };
  }

  /** The orbit the camera is easing towards, radians. */
  get orbitTarget(): OrbitOffset {
    return { ...this.#orbitTarget };
  }

  /**
   * Applies one free-space swipe to the orbit target. A full canvas-width horizontal
   * drag is a complete revolution; pitch is clamped away from the ground.
   */
  orbitBySwipe(deltaXPixels: number, deltaYPixels: number, viewportWidthPixels: number): void {
    this.#orbitTarget = applyOrbitSwipe(
      this.#orbitTarget,
      deltaXPixels,
      deltaYPixels,
      viewportWidthPixels,
      this.#orbitConfig,
    );
  }

  /** Eases the gameplay view back to its authored, car-centered chase framing. */
  resetOrbit(): void {
    // Remove completed turns without changing the visible angle, then ease to neutral.
    this.#orbit = { ...this.#orbit, yaw: wrapOrbitYaw(this.#orbit.yaw) };
    this.#orbitTarget = { ...NEUTRAL_ORBIT };
  }

  /** Places the camera immediately at the ideal pose (spawn, reset, teleports). */
  snapTo(pose: VehiclePose): void {
    copyVec3(this.#lastPosePosition, pose.position);
    setVec3(this.#velocity, 0, 0, 0);
    this.#hasPoseSample = true;
    const view = this.view;
    copyVec3(this.#currentOffset, {
      x: view.offset[0],
      y: view.offset[1],
      z: view.offset[2],
    });
    copyVec3(this.#currentLookOffset, {
      x: view.lookOffset[0],
      y: view.lookOffset[1],
      z: view.lookOffset[2],
    });
    this.#currentFovDelta = view.fovDelta;
    this.#yaw = yawFromQuat(pose.rotation);
    this.resetOrbit();
    this.#orbit = { ...this.#orbitTarget };
    this.#computeDesired(pose);
    copyVec3(this.#position, this.#desiredPosition);
    copyVec3(this.#lookAt, this.#desiredLook);
    this.#initialized = true;
    this.#apply();
  }

  update(deltaSeconds: number, pose: VehiclePose, telemetry: VehicleTelemetry): void {
    const config = this.#config;
    const dt = deltaSeconds > 0 ? deltaSeconds : 0;

    if (!this.#initialized) {
      this.snapTo(pose);
      return;
    }

    // Heading lag: yaw follows on the heading time constant (the config's
    // `headingLagSeconds`, finally wired), turning with the shortest arc.
    // Velocity from the pose stream itself (interpolated poses are smooth, so the
    // finite difference is stable), low-passed so a teleport or a physics hitch
    // cannot yank the aim point.
    if (dt > 0 && this.#hasPoseSample) {
      const dx = pose.position.x - this.#lastPosePosition.x;
      const dy = pose.position.y - this.#lastPosePosition.y;
      const dz = pose.position.z - this.#lastPosePosition.z;
      if (dx * dx + dy * dy + dz * dz > 25 * 25) {
        // A pose jump is a teleport, not motion: no velocity to feed forward.
        setVec3(this.#velocity, 0, 0, 0);
      } else {
        const blend = smoothingFactor(dt, 0.12);
        this.#velocity.x += (dx / dt - this.#velocity.x) * blend;
        this.#velocity.y += (dy / dt - this.#velocity.y) * blend;
        this.#velocity.z += (dz / dt - this.#velocity.z) * blend;
        // Clamp to a plausible car speed so one odd sample cannot throw the aim.
        const speed = Math.hypot(this.#velocity.x, this.#velocity.y, this.#velocity.z);
        if (speed > 90) {
          const scale = 90 / speed;
          this.#velocity.x *= scale;
          this.#velocity.y *= scale;
          this.#velocity.z *= scale;
        }
      }
    }
    copyVec3(this.#lastPosePosition, pose.position);
    this.#hasPoseSample = true;

    // Orbit ease: the framed offset chases the swipe target on its own constant.
    const orbitFactor = smoothingFactor(dt, this.#orbitConfig.smoothingSeconds);
    this.#orbit = {
      yaw: this.#orbit.yaw + (this.#orbitTarget.yaw - this.#orbit.yaw) * orbitFactor,
      pitch: this.#orbit.pitch + (this.#orbitTarget.pitch - this.#orbit.pitch) * orbitFactor,
    };

    const targetYaw = yawFromQuat(pose.rotation);
    let delta = targetYaw - this.#yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.#yaw += delta * smoothingFactor(dt, config.headingLagSeconds);

    // Distance-view glide: the framing eases to the newly selected view instead of
    // cutting, on its own (slower) constant so it reads as a deliberate dolly move.
    const view = this.view;
    const viewFactor = smoothingFactor(dt, config.viewTransitionSeconds);
    copyVec3(this.#offset, { x: view.offset[0], y: view.offset[1], z: view.offset[2] });
    copyVec3(this.#lookOffset, {
      x: view.lookOffset[0],
      y: view.lookOffset[1],
      z: view.lookOffset[2],
    });
    lerpVec3(this.#currentOffset, this.#currentOffset, this.#offset, viewFactor);
    lerpVec3(this.#currentLookOffset, this.#currentLookOffset, this.#lookOffset, viewFactor);
    this.#currentFovDelta += (view.fovDelta - this.#currentFovDelta) * viewFactor;

    this.#computeDesired(pose);

    // Position lag produces the spring-arm feel; look-at lags less so the car stays centered.
    // Vertical follows more slowly still: the chassis pitches and bounces over crests
    // and landings, and a camera that mirrors every hop reads as screen shake.
    const positionFactor = smoothingFactor(dt, config.positionLagSeconds);
    const verticalFactor = smoothingFactor(dt, config.positionLagSeconds * 2.2);
    const lookFactor = smoothingFactor(dt, config.lookLagSeconds);
    const yBefore = this.#position.y;
    lerpVec3(this.#position, this.#position, this.#desiredPosition, positionFactor);
    this.#position.y = yBefore + (this.#desiredPosition.y - yBefore) * verticalFactor;
    lerpVec3(this.#lookAt, this.#lookAt, this.#desiredLook, lookFactor);

    // Speed-scaled FOV: smoothstep so the widening is gentle at low speed and assertive at pace.
    const speedRatio = clamp(Math.abs(telemetry.speedMps) / Math.max(config.fovMaxSpeed, 1), 0, 1);
    const smoothRatio = speedRatio * speedRatio * (3 - 2 * speedRatio);
    const targetFov =
      config.baseFov + this.#currentFovDelta + (config.maxFov - config.baseFov) * smoothRatio;
    this.#fov += (targetFov - this.#fov) * smoothingFactor(dt, config.fovLagSeconds);

    this.#apply(telemetry, dt);
  }

  dispose(): void {
    this.camera.removeFromParent();
  }

  #computeDesired(pose: VehiclePose): void {
    copyVec3(this.#offset, this.#currentOffset);
    copyVec3(this.#lookOffset, this.#currentLookOffset);

    // Offsets rotate by the smoothed heading only: the camera does not pitch and roll
    // with every crest the chassis crosses, which is what makes a chase view feel stable
    // at speed while the car visibly works underneath it.
    const half = this.#yaw / 2;
    const heading: Quat = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
    const worldOffset = rotateVec3ByQuat(this.#offset, this.#offset, heading);
    const worldLookOffset = rotateVec3ByQuat(this.#lookOffset, this.#lookOffset, heading);
    // Rotate the camera and look target together around the car. This preserves the
    // authored car framing while exposing the full surroundings through a 360° swipe.
    const orbited = orbitOffsetVec3(worldOffset, this.#orbit, this.#orbitConfig);
    const orbitedLookOffset = orbitOffsetVec3(worldLookOffset, this.#orbit, this.#orbitConfig);
    this.#desiredPosition.x = pose.position.x;
    this.#desiredPosition.y = pose.position.y;
    this.#desiredPosition.z = pose.position.z;
    addVec3(this.#desiredPosition, this.#desiredPosition, orbited);
    addVec3(this.#desiredLook, pose.position, orbitedLookOffset);

    // Feed-forward (see #velocity): with the desired point one lag-interval ahead,
    // the exponential follow settles exactly on the view's offset at any speed.
    const lead = this.#config.positionLagSeconds;
    this.#desiredPosition.x += this.#velocity.x * lead;
    this.#desiredPosition.y += this.#velocity.y * lead;
    this.#desiredPosition.z += this.#velocity.z * lead;

    // Never dip below the ground: the terrain height where the camera wants to be, when
    // a provider is wired, else the flat y=0 convention.
    const groundY =
      this.#groundHeight !== null
        ? this.#groundHeight(this.#desiredPosition.x, this.#desiredPosition.z) + 0.6
        : 0.5;
    if (this.#desiredPosition.y < groundY) {
      this.#desiredPosition.y = groundY;
    }
  }

  #apply(telemetry?: VehicleTelemetry, deltaSeconds = 0): void {
    this.camera.position.set(this.#position.x, this.#position.y, this.#position.z);
    this.camera.lookAt(this.#lookAt.x, this.#lookAt.y, this.#lookAt.z);

    if (telemetry) {
      const config = this.#config;
      const targetRoll = clamp(
        -clamp(telemetry.lateralAcceleration, -30, 30) * config.lateralRollFactor,
        -config.maxLateralRoll,
        config.maxLateralRoll,
      );
      this.#roll += (targetRoll - this.#roll) * smoothingFactor(deltaSeconds, 0.12);
      if (this.#roll !== 0) {
        // Local Z rotation tilts the horizon slightly into the corner.
        this.camera.rotateZ(this.#roll);
      }
    }

    if (Math.abs(this.camera.fov - this.#fov) > 0.01) {
      this.camera.fov = this.#fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
