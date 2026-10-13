import { PerspectiveCamera } from 'three';
import { CHASE_CAMERA_CONFIG, type ChaseCameraConfig } from '../config/camera';
import { clamp } from '../shared/math';
import {
  addVec3,
  cloneVec3,
  copyVec3,
  lerpVec3,
  rotateVec3ByQuat,
  smoothingFactor,
  vec3,
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
  #initialized = false;

  // Scratch vectors kept out of the per-frame allocation path.
  readonly #desiredPosition = vec3();
  readonly #desiredLook = vec3();
  readonly #offset = vec3();
  readonly #lookOffset = vec3();

  constructor(config: ChaseCameraConfig = CHASE_CAMERA_CONFIG, aspect = 1) {
    this.#config = config;
    this.#fov = config.baseFov;
    this.camera = new PerspectiveCamera(config.baseFov, aspect, 0.1, 2000);
    this.camera.position.set(0, 3, 8);
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

  /** Places the camera immediately at the ideal pose (spawn, reset, teleports). */
  snapTo(pose: VehiclePose): void {
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

    this.#computeDesired(pose);

    // Position lag produces the spring-arm feel; look-at lags less so the car stays centered.
    const positionFactor = smoothingFactor(dt, config.positionLagSeconds);
    const lookFactor = smoothingFactor(dt, config.lookLagSeconds);
    lerpVec3(this.#position, this.#position, this.#desiredPosition, positionFactor);
    lerpVec3(this.#lookAt, this.#lookAt, this.#desiredLook, lookFactor);

    // Speed-scaled FOV: smoothstep so the widening is gentle at low speed and assertive at pace.
    const speedRatio = clamp(Math.abs(telemetry.speedMps) / Math.max(config.fovMaxSpeed, 1), 0, 1);
    const smoothRatio = speedRatio * speedRatio * (3 - 2 * speedRatio);
    const targetFov = config.baseFov + (config.maxFov - config.baseFov) * smoothRatio;
    this.#fov += (targetFov - this.#fov) * smoothingFactor(dt, config.fovLagSeconds);

    this.#apply(telemetry);
  }

  dispose(): void {
    this.camera.removeFromParent();
  }

  #computeDesired(pose: VehiclePose): void {
    const config = this.#config;
    copyVec3(this.#offset, { x: config.offset[0], y: config.offset[1], z: config.offset[2] });
    copyVec3(this.#lookOffset, {
      x: config.lookOffset[0],
      y: config.lookOffset[1],
      z: config.lookOffset[2],
    });

    const worldOffset = rotateVec3ByQuat(this.#offset, this.#offset, pose.rotation);
    const worldLookOffset = rotateVec3ByQuat(this.#lookOffset, this.#lookOffset, pose.rotation);
    addVec3(this.#desiredPosition, pose.position, worldOffset);
    addVec3(this.#desiredLook, pose.position, worldLookOffset);

    // Never dip below the ground plane.
    if (this.#desiredPosition.y < 0.5) {
      this.#desiredPosition.y = 0.5;
    }
  }

  #apply(telemetry?: VehicleTelemetry): void {
    this.camera.position.set(this.#position.x, this.#position.y, this.#position.z);
    this.camera.lookAt(this.#lookAt.x, this.#lookAt.y, this.#lookAt.z);

    if (telemetry) {
      const config = this.#config;
      const roll = clamp(
        -telemetry.lateralAcceleration * config.lateralRollFactor,
        -config.maxLateralRoll,
        config.maxLateralRoll,
      );
      if (roll !== 0) {
        // Local Z rotation tilts the horizon slightly into the corner.
        this.camera.rotateZ(roll);
      }
    }

    if (Math.abs(this.camera.fov - this.#fov) > 0.01) {
      this.camera.fov = this.#fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
