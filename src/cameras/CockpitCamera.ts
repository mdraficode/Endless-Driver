import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { COCKPIT_CAMERA_CONFIG, type CockpitCameraConfig } from '../config/camera';
import { clamp } from '../shared/math';
import { smoothingFactor } from '../shared/vector';
import { VEHICLE_CONFIG } from '../config/vehicle';
import type { VehiclePose, VehicleTelemetry } from '../vehicles/types';

const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const LOCAL_FORWARD = new Vector3(0, 0, -1);

/**
 * First-person camera anchored to the driver's seat, not to the world origin. Chassis pitch and
 * roll carry through naturally; small damped head motion, corner gaze, suspension cues, and a
 * restrained speed lens keep it readable without making the view feel detached from the car.
 */
export class CockpitCamera {
  readonly camera: PerspectiveCamera;
  readonly #config: CockpitCameraConfig;
  readonly #position = new Vector3();
  readonly #localPosition = new Vector3();
  readonly #anchor = new Vector3();
  readonly #posePosition = new Vector3();
  readonly #eyeAnchor: [number, number, number];
  readonly #bodyOrientation = new Quaternion();
  readonly #targetOrientation = new Quaternion();
  readonly #orientation = new Quaternion();
  readonly #yawRotation = new Quaternion();
  readonly #pitchRotation = new Quaternion();
  readonly #rollRotation = new Quaternion();
  #fov: number;
  #lookYaw = 0;
  #lookPitch = 0;
  #targetLookYaw = 0;
  #targetLookPitch = 0;
  #elapsedSeconds = 0;
  #initialized = false;

  constructor(config: CockpitCameraConfig = COCKPIT_CAMERA_CONFIG, aspect = 1) {
    this.#config = config;
    this.#eyeAnchor = [...config.eyeAnchor];
    this.#fov = config.baseFov;
    this.camera = new PerspectiveCamera(config.baseFov, aspect, 0.045, 2000);
    this.camera.name = 'driver-cockpit-camera';
  }

  /** Resize the lens for the current canvas without changing its framing. */
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Adopt the selected visual's driver-seat coordinates (hero asset or authored fallback). */
  setEyeAnchor(anchor: readonly [number, number, number]): void {
    this.#eyeAnchor[0] = anchor[0];
    this.#eyeAnchor[1] = anchor[1];
    this.#eyeAnchor[2] = anchor[2];
  }

  /** Place the eye and lens immediately after a camera-mode switch, reset, or origin rebase. */
  snapTo(pose: VehiclePose, telemetry: VehicleTelemetry): void {
    this.#elapsedSeconds = 0;
    this.#computeTarget(pose, telemetry, 0);
    this.#localPosition.copy(this.#anchor);
    this.#position
      .copy(this.#localPosition)
      .applyQuaternion(this.#bodyOrientation)
      .add(this.#posePosition);
    this.#orientation.copy(this.#targetOrientation);
    this.camera.position.copy(this.#position);
    this.camera.quaternion.copy(this.#orientation);
    this.#fov = this.#targetFov(telemetry);
    this.camera.fov = this.#fov;
    this.camera.updateProjectionMatrix();
    this.#elapsedSeconds = 0;
    this.#initialized = true;
  }

  /** Ease the seat pose, gaze, and lens toward the latest interpolated vehicle pose. */
  update(deltaSeconds: number, pose: VehiclePose, telemetry: VehicleTelemetry): void {
    const delta = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
    this.#elapsedSeconds += delta;
    this.#computeTarget(pose, telemetry, delta);

    if (!this.#initialized) {
      this.snapTo(pose, telemetry);
      return;
    }

    // Smooth only the seat-local head/suspension offset. Follow chassis translation immediately;
    // damping absolute world coordinates made the camera trail the car by speed × lag time.
    this.#localPosition.lerp(this.#anchor, smoothingFactor(delta, this.#config.positionLagSeconds));
    this.#position
      .copy(this.#localPosition)
      .applyQuaternion(this.#bodyOrientation)
      .add(this.#posePosition);
    this.#orientation.slerp(
      this.#targetOrientation,
      smoothingFactor(delta, this.#config.orientationLagSeconds),
    );
    this.camera.position.copy(this.#position);
    this.camera.quaternion.copy(this.#orientation);

    const targetFov = this.#targetFov(telemetry);
    const nextFov =
      this.#fov + (targetFov - this.#fov) * smoothingFactor(delta, this.#config.fovLagSeconds);
    if (Math.abs(nextFov - this.#fov) > 0.005) {
      this.#fov = nextFov;
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Free-space drag looks around from the seat; driving controls remain independently captured. */
  lookBySwipe(deltaXPixels: number, deltaYPixels: number, viewportWidthPixels: number): void {
    const width = Math.max(1, viewportWidthPixels || 1);
    this.#targetLookYaw = clamp(
      this.#targetLookYaw + (deltaXPixels / width) * this.#config.lookYawRadiansPerViewportWidth,
      -this.#config.maxLookYawRadians,
      this.#config.maxLookYawRadians,
    );
    this.#targetLookPitch = clamp(
      this.#targetLookPitch - deltaYPixels * this.#config.lookPitchRadiansPerPixel,
      -this.#config.maxLookPitchRadians,
      this.#config.maxLookPitchRadians,
    );
  }

  /** Restore a forward-facing view without changing the vehicle or the chase-camera orbit. */
  resetLook(): void {
    this.#lookYaw = 0;
    this.#lookPitch = 0;
    this.#targetLookYaw = 0;
    this.#targetLookPitch = 0;
  }

  #computeTarget(pose: VehiclePose, telemetry: VehicleTelemetry, delta: number): void {
    const config = this.#config;
    this.#bodyOrientation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    if (this.#bodyOrientation.lengthSq() < 1e-8) {
      this.#bodyOrientation.identity();
    } else {
      this.#bodyOrientation.normalize();
    }

    const gazeAlpha = smoothingFactor(delta, config.lookLagSeconds);
    this.#lookYaw += (this.#targetLookYaw - this.#lookYaw) * gazeAlpha;
    this.#lookPitch += (this.#targetLookPitch - this.#lookPitch) * gazeAlpha;

    let frontCompression = 0;
    let rearCompression = 0;
    let frontCount = 0;
    let rearCount = 0;
    for (const wheel of pose.wheels) {
      const compression = VEHICLE_CONFIG.wheels.restLength - wheel.suspensionLength;
      if (wheel.isFront) {
        frontCompression += compression;
        frontCount += 1;
      } else {
        rearCompression += compression;
        rearCount += 1;
      }
    }
    if (frontCount > 0) frontCompression /= frontCount;
    if (rearCount > 0) rearCompression /= rearCount;
    const suspensionPitch = clamp(
      -(frontCompression - rearCompression) * config.suspensionPitchFactor,
      -config.maxSuspensionPitchRadians,
      config.maxSuspensionPitchRadians,
    );

    const localYaw = clamp(
      telemetry.steerAngle * config.steeringLookFactor + this.#lookYaw,
      -config.maxSteeringLookRadians - config.maxLookYawRadians,
      config.maxSteeringLookRadians + config.maxLookYawRadians,
    );
    const localPitch = clamp(
      this.#lookPitch +
        suspensionPitch -
        telemetry.longitudinalAcceleration * config.accelerationPitchFactor,
      -config.maxLookPitchRadians - config.maxAccelerationPitchRadians,
      config.maxLookPitchRadians + config.maxAccelerationPitchRadians,
    );
    const localRoll = clamp(
      -telemetry.lateralAcceleration * config.lateralRollFactor,
      -config.maxLateralRollRadians,
      config.maxLateralRollRadians,
    );
    this.#yawRotation.setFromAxisAngle(LOCAL_UP, localYaw);
    this.#pitchRotation.setFromAxisAngle(LOCAL_RIGHT, localPitch);
    this.#rollRotation.setFromAxisAngle(LOCAL_FORWARD, localRoll);
    this.#targetOrientation
      .copy(this.#bodyOrientation)
      .multiply(this.#yawRotation)
      .multiply(this.#pitchRotation)
      .multiply(this.#rollRotation)
      .normalize();

    const speedBlend = clamp(Math.abs(telemetry.speedMps) / config.vibrationReferenceSpeed, 0, 1);
    const vibration = speedBlend * config.vibrationAmplitudeMeters;
    const frequency = config.vibrationFrequencyHz + speedBlend * config.vibrationSpeedFrequencyHz;
    const phase = this.#elapsedSeconds * Math.PI * 2 * frequency;
    const lateralSway = clamp(
      -telemetry.lateralAcceleration * config.lateralHeadSwayMetersPerMps2,
      -config.maxHeadSwayMeters,
      config.maxHeadSwayMeters,
    );
    const longitudinalSway = clamp(
      -telemetry.longitudinalAcceleration * config.longitudinalHeadSwayMetersPerMps2,
      -config.maxHeadSwayMeters,
      config.maxHeadSwayMeters,
    );
    this.#anchor.set(
      this.#eyeAnchor[0] + lateralSway + Math.sin(phase * 0.83) * vibration,
      this.#eyeAnchor[1] + Math.sin(phase) * vibration * 0.58,
      this.#eyeAnchor[2] + longitudinalSway + Math.cos(phase * 0.71) * vibration * 0.35,
    );
    this.#posePosition.set(pose.position.x, pose.position.y, pose.position.z);
  }

  #targetFov(telemetry: VehicleTelemetry): number {
    const blend = clamp(Math.abs(telemetry.speedMps) / this.#config.fovMaxSpeed, 0, 1);
    return this.#config.baseFov + (this.#config.maxFov - this.#config.baseFov) * blend;
  }
}
