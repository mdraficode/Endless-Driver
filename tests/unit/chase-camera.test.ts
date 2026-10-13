import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CHASE_CAMERA_CONFIG } from '../../src/config/camera';
import { ChaseCamera } from '../../src/cameras/ChaseCamera';
import { identityQuat, quatFromYaw } from '../../src/shared/vector';
import type { VehiclePose, VehicleTelemetry } from '../../src/vehicles/types';

const identityWheels = () =>
  [0, 1, 2, 3].map(() => ({
    isFront: true,
    steerAngle: 0,
    spinAngle: 0,
    suspensionLength: 0.3,
  }));

function pose(x = 0, y = 0.6, z = 0, yaw = 0): VehiclePose {
  return {
    position: { x, y, z },
    rotation: yaw === 0 ? identityQuat() : quatFromYaw(yaw),
    wheels: identityWheels(),
  };
}

function telemetry(overrides: Partial<VehicleTelemetry> = {}): VehicleTelemetry {
  return {
    speedMps: 0,
    speedKph: 0,
    forwardSpeed: 0,
    rpm: 900,
    gear: 1,
    shifting: false,
    throttle: 0,
    brake: 0,
    handbrake: false,
    steerAngle: 0,
    contactCount: 4,
    isGrounded: true,
    slipAngle: 0,
    lateralAcceleration: 0,
    longitudinalAcceleration: 0,
    drifting: false,
    distanceTravelled: 0,
    ...overrides,
  };
}

function advance(
  camera: ChaseCamera,
  seconds: number,
  target: VehiclePose,
  stats = telemetry(),
): void {
  const step = 1 / 60;
  const steps = Math.max(1, Math.round(seconds / step));
  for (let index = 0; index < steps; index += 1) {
    camera.update(step, target, stats);
  }
}

describe('chase camera', () => {
  it('starts at the configured base field of view behind the car', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 16 / 9);
    camera.snapTo(pose());

    expect(camera.camera.fov).toBe(CHASE_CAMERA_CONFIG.baseFov);
    // Behind and above: forward is -Z, so the camera sits at positive Z.
    expect(camera.camera.position.z).toBeCloseTo(CHASE_CAMERA_CONFIG.offset[2], 6);
    expect(camera.camera.position.y).toBeCloseTo(0.6 + CHASE_CAMERA_CONFIG.offset[1], 6);
    expect(camera.camera.aspect).toBeCloseTo(16 / 9, 6);
  });

  it('rotates its offset with the car so it stays behind the nose', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    camera.snapTo(pose(0, 0.6, 0, Math.PI / 2));

    // Quarter turn to the left: forward becomes -X, so the camera trails at +X.
    expect(camera.camera.position.x).toBeCloseTo(CHASE_CAMERA_CONFIG.offset[2], 5);
    expect(Math.abs(camera.camera.position.z)).toBeLessThan(1e-6);
  });

  it('lags behind position changes and then catches up', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    camera.snapTo(pose());
    const startZ = camera.camera.position.z;

    // Teleport the car 20 m forward (a hard acceleration step).
    const moved = pose(0, 0.6, -20);
    camera.update(1 / 60, moved, telemetry());
    const afterOneFrame = camera.camera.position.z;

    // One frame must not close the whole 20 m gap: that is the spring-arm feel.
    expect(afterOneFrame).toBeGreaterThan(startZ - 20);
    expect(Math.abs(afterOneFrame - startZ)).toBeLessThan(5);

    advance(camera, 2, moved);
    // Steady state: the camera settles at its offset from the car.
    expect(camera.camera.position.z).toBeCloseTo(-20 + CHASE_CAMERA_CONFIG.offset[2], 1);
  });

  it('damping is frame-rate independent', () => {
    const coarse = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    const fine = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    coarse.snapTo(pose());
    fine.snapTo(pose());
    const moved = pose(0, 0.6, -30);

    coarse.update(0.1, moved, telemetry());
    for (let index = 0; index < 6; index += 1) {
      fine.update(1 / 60, moved, telemetry());
    }
    expect(coarse.camera.position.z).toBeCloseTo(fine.camera.position.z, 6);
  });

  it('widens the field of view with speed and narrows it again at rest', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    const stationary = pose();
    camera.snapTo(stationary);
    expect(camera.fov).toBeCloseTo(CHASE_CAMERA_CONFIG.baseFov, 6);

    advance(camera, 3, stationary, telemetry({ speedMps: 60, speedKph: 216 }));
    expect(camera.fov).toBeGreaterThan(CHASE_CAMERA_CONFIG.baseFov + 8);
    expect(camera.fov).toBeLessThanOrEqual(CHASE_CAMERA_CONFIG.maxFov + 1e-6);

    advance(camera, 5, stationary, telemetry());
    expect(camera.fov).toBeLessThan(CHASE_CAMERA_CONFIG.baseFov + 2);
  });

  it('keeps the camera above the ground plane', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    camera.snapTo(pose(0, 0.6, 0, 0));
    // Pitch the car nose-down steeply: the naive camera offset would go underground.
    const steep: VehiclePose = {
      position: { x: 0, y: 0.4, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      wheels: identityWheels(),
    };
    advance(camera, 2, steep);
    expect(camera.camera.position.y).toBeGreaterThanOrEqual(0.5);
  });

  it('rolls slightly while cornering and returns level afterwards', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    const straight = pose();
    camera.snapTo(straight);

    // Roll lives in the camera quaternion, not in `camera.up`, so read the world-space up axis.
    const worldUp = (): Vector3 => new Vector3(0, 1, 0).applyQuaternion(camera.camera.quaternion);
    const levelUp = worldUp();

    // Positive lateral acceleration means the car is accelerating to its right (a right-hand
    // corner), and the camera leans into the corner by tipping its up axis to the right.
    advance(camera, 1, straight, telemetry({ lateralAcceleration: 8, speedMps: 25 }));
    const rolledUp = worldUp();
    expect(rolledUp.x).toBeGreaterThan(levelUp.x + 0.005);
    // A small tilt only: the horizon must never look broken.
    expect(rolledUp.y).toBeGreaterThan(0.99);

    advance(camera, 1, straight, telemetry());
    // The camera looks slightly downward at the car by design, so compare with the level roll of
    // the snapped pose: only the lateral tilt must disappear.
    const settledUp = worldUp();
    expect(Math.abs(settledUp.y - levelUp.y)).toBeLessThan(1e-3);
    expect(Math.abs(settledUp.x)).toBeLessThan(1e-3);
  });

  it('snaps to a pose on demand and follows resizes', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    camera.snapTo(pose(5, 0.6, -5));
    expect(camera.camera.position.x).toBeCloseTo(5, 5);

    camera.resize(2);
    expect(camera.camera.aspect).toBe(2);
  });

  it('is total for degenerate deltas and telemetry', () => {
    const camera = new ChaseCamera(CHASE_CAMERA_CONFIG, 1);
    camera.snapTo(pose());
    camera.update(0, pose(), telemetry());
    camera.update(-5, pose(), telemetry());
    camera.update(Number.NaN, pose(), telemetry());
    camera.update(1 / 60, pose(), telemetry({ speedMps: Number.NaN }));

    const position = camera.camera.position;
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
    expect(Number.isFinite(camera.fov)).toBe(true);
  });
});
