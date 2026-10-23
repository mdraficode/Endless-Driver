import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { COCKPIT_CAMERA_CONFIG, FALLBACK_COCKPIT_EYE_ANCHOR } from '../../src/config/camera';
import { CockpitCamera } from '../../src/cameras/CockpitCamera';
import type { VehiclePose, VehicleTelemetry } from '../../src/vehicles/types';

function pose(
  position: readonly [number, number, number] = [0, 0, 0],
  rotation = new Quaternion(),
): VehiclePose {
  return {
    position: { x: position[0], y: position[1], z: position[2] },
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    wheels: [],
    brake: 0,
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
    contactCount: 0,
    isGrounded: false,
    slipAngle: 0,
    lateralAcceleration: 0,
    longitudinalAcceleration: 0,
    drifting: false,
    distanceTravelled: 0,
    ...overrides,
  };
}

function projectLandmark(
  camera: CockpitCamera,
  landmark: readonly [number, number, number],
): Vector3 {
  camera.camera.updateMatrixWorld(true);
  return new Vector3(...landmark).project(camera.camera);
}

function expectLandmarksInFrame(
  camera: CockpitCamera,
  landmarks: readonly (readonly [number, number, number])[],
): Vector3[] {
  return landmarks.map((landmark) => {
    const projected = projectLandmark(camera, landmark);
    expect(projected.x).toBeGreaterThan(-1);
    expect(projected.x).toBeLessThan(1);
    expect(projected.y).toBeGreaterThan(-1);
    expect(projected.y).toBeLessThan(1);
    return projected;
  });
}

describe('cockpit camera', () => {
  it('places the eye at a body-relative seat anchor and carries chassis orientation', () => {
    const camera = new CockpitCamera(COCKPIT_CAMERA_CONFIG, 16 / 9);
    const vehiclePose = pose(
      [12, 3, -8],
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    );
    camera.snapTo(vehiclePose, telemetry());

    const expectedOffset = new Vector3(...COCKPIT_CAMERA_CONFIG.eyeAnchor).applyQuaternion(
      new Quaternion(
        vehiclePose.rotation.x,
        vehiclePose.rotation.y,
        vehiclePose.rotation.z,
        vehiclePose.rotation.w,
      ),
    );
    expect(camera.camera.position.x).toBeCloseTo(12 + expectedOffset.x, 6);
    expect(camera.camera.position.y).toBeCloseTo(3 + expectedOffset.y, 6);
    expect(camera.camera.position.z).toBeCloseTo(-8 + expectedOffset.z, 6);
    expect(
      camera.camera.quaternion.angleTo(
        new Quaternion(
          vehiclePose.rotation.x,
          vehiclePose.rotation.y,
          vehiclePose.rotation.z,
          vehiclePose.rotation.w,
        ),
      ),
    ).toBeCloseTo(0, 6);
  });

  it('follows vehicle translation without accumulating speed-dependent world-space lag', () => {
    const config = {
      ...COCKPIT_CAMERA_CONFIG,
      vibrationAmplitudeMeters: 0,
      lateralHeadSwayMetersPerMps2: 0,
      longitudinalHeadSwayMetersPerMps2: 0,
    };
    const camera = new CockpitCamera(config, 16 / 9);
    camera.snapTo(pose(), telemetry());

    const speedMps = 20;
    const elapsedSeconds = 1;
    const frames = 60;
    for (let frame = 1; frame <= frames; frame += 1) {
      const distance = (speedMps * elapsedSeconds * frame) / frames;
      camera.update(elapsedSeconds / frames, pose([0, 0, -distance]), telemetry({ speedMps }));
    }

    expect(camera.camera.position.z).toBeCloseTo(
      -speedMps * elapsedSeconds + config.eyeAnchor[2],
      6,
    );
  });

  it('fills the hero view with the windshield and crops the steering wheel to its lower arc', () => {
    const camera = new CockpitCamera(COCKPIT_CAMERA_CONFIG, 16 / 9);
    camera.snapTo(pose(), telemetry());

    const [eyeX, eyeHeight, eyeDepth] = COCKPIT_CAMERA_CONFIG.eyeAnchor;
    // Keep the eye in the cabin but close to the glass; the windshield spans most of the view,
    // its lower borders approach the screen edges, and only the wheel's upper arc remains visible.
    expect(Math.abs(eyeX)).toBeLessThan(0.1);
    expect(eyeHeight).toBeGreaterThan(0.33);
    expect(eyeHeight).toBeLessThan(0.423);
    expect(eyeDepth).toBeGreaterThan(-0.127);
    expect(eyeDepth).toBeLessThan(0.25);
    expect(camera.camera.fov).toBe(70);

    const [
      windshieldTop,
      windshieldBottom,
      windshieldBottomLeft,
      windshieldBottomRight,
      steeringWheelTop,
      dashboard,
    ] = expectLandmarksInFrame(camera, [
      [0, 0.423, 0.081],
      [0, 0.118, -0.452],
      [-0.744, 0.118, -0.452],
      [0.744, 0.118, -0.452],
      [-0.411, 0.213, -0.127],
      [0, 0.15, -0.45],
    ]);
    const steeringWheelLower = projectLandmark(camera, [-0.411, 0.03, -0.127]);

    expect(windshieldTop!.y).toBeGreaterThan(0.7);
    expect(windshieldBottom!.y).toBeLessThan(-0.45);
    expect(Math.abs(windshieldBottomLeft!.x)).toBeGreaterThan(0.8);
    expect(windshieldBottomRight!.x).toBeGreaterThan(0.9);
    expect(steeringWheelTop!.y).toBeLessThan(-0.6);
    expect(steeringWheelTop!.y).toBeGreaterThan(-0.75);
    expect(steeringWheelLower.y).toBeLessThan(-1);
    expect(dashboard!.y).toBeLessThan(-0.4);
  });

  it('keeps the fallback roadster windshield dominant and its right-hand wheel at the bottom', () => {
    const camera = new CockpitCamera(COCKPIT_CAMERA_CONFIG, 16 / 9);
    camera.setEyeAnchor(FALLBACK_COCKPIT_EYE_ANCHOR);
    camera.snapTo(pose(), telemetry());

    const [eyeX, eyeHeight, eyeDepth] = FALLBACK_COCKPIT_EYE_ANCHOR;
    expect(Math.abs(eyeX)).toBeLessThan(0.1);
    expect(eyeHeight).toBeGreaterThan(0.738);
    expect(eyeHeight).toBeLessThan(0.86);
    expect(eyeDepth).toBeGreaterThan(-0.06);
    expect(eyeDepth).toBeLessThan(0.3);
    expect(camera.camera.fov).toBe(70);

    const [windshieldTop, steeringWheelTop] = expectLandmarksInFrame(camera, [
      [0, 0.86, -0.1],
      [0.39, 0.738, -0.06],
    ]);
    const windshieldBottom = projectLandmark(camera, [0, 0.29, -0.55]);
    const steeringWheelLower = projectLandmark(camera, [0.39, 0.56, -0.06]);

    expect(windshieldTop!.y).toBeGreaterThan(0);
    expect(windshieldBottom.y).toBeLessThan(-1);
    expect(steeringWheelTop!.x).toBeGreaterThan(0.8);
    expect(steeringWheelTop!.y).toBeLessThan(-0.5);
    expect(steeringWheelTop!.y).toBeGreaterThan(-0.7);
    expect(steeringWheelLower.y).toBeLessThan(-1);
  });

  it('smoothly widens the lens with speed and eases into an interior look-around', () => {
    const camera = new CockpitCamera(COCKPIT_CAMERA_CONFIG, 1);
    camera.snapTo(pose(), telemetry());
    const forwardOrientation = camera.camera.quaternion.clone();
    camera.lookBySwipe(180, -30, 720);

    for (let frame = 0; frame < 24; frame += 1) {
      camera.update(1 / 60, pose(), telemetry({ speedMps: 52 }));
    }

    expect(camera.camera.fov).toBeGreaterThan(COCKPIT_CAMERA_CONFIG.baseFov + 1);
    expect(camera.camera.fov).toBeLessThanOrEqual(COCKPIT_CAMERA_CONFIG.maxFov);
    expect(camera.camera.quaternion.angleTo(forwardOrientation)).toBeGreaterThan(0.5);
  });

  it('keeps steering and corner motion restrained, and resetLook returns gaze to forward', () => {
    const camera = new CockpitCamera(COCKPIT_CAMERA_CONFIG, 1);
    camera.snapTo(pose(), telemetry());
    camera.lookBySwipe(240, 0, 720);

    for (let frame = 0; frame < 30; frame += 1) {
      camera.update(
        1 / 60,
        pose(),
        telemetry({ steerAngle: 0.6, lateralAcceleration: 24, longitudinalAcceleration: 8 }),
      );
    }
    const cornerOrientation = camera.camera.quaternion.clone();
    expect(cornerOrientation.angleTo(new Quaternion())).toBeLessThan(1.4);

    camera.resetLook();
    camera.snapTo(pose(), telemetry());
    expect(camera.camera.quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 6);
  });
});
