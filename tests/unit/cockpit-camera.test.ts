import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import { COCKPIT_CAMERA_CONFIG, FALLBACK_COCKPIT_EYE_ANCHOR } from '../../src/config/camera';
import { CockpitCamera } from '../../src/cameras/CockpitCamera';
import type { VehiclePose, VehicleTelemetry } from '../../src/vehicles/types';

const HERO_MODEL_PATH = fileURLToPath(
  new URL('../../public/assets/models/hero-car-mmc-generic-sport-coupe.glb', import.meta.url),
);
const heroOpaqueBodyMeshes: Mesh[] = [];
const heroOpaqueBodyMaterials: MeshBasicMaterial[] = [];

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

function normalizedComponent(value: number, componentType: number, normalized: boolean): number {
  if (!normalized) return value;
  switch (componentType) {
    case 5120:
      return Math.max(value / 127, -1);
    case 5121:
      return value / 255;
    case 5122:
      return Math.max(value / 32767, -1);
    case 5123:
      return value / 65535;
    default:
      return value;
  }
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const document = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    .setVertexLayout(VertexLayout.SEPARATE)
    .read(HERO_MODEL_PATH);
  const bodyNode = document
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === 'car-body-surfaces-lod0');
  if (!bodyNode) throw new Error('hero GLB is missing car-body-surfaces-lod0');

  const bodyTransform = new Matrix4().fromArray(Array.from(bodyNode.getWorldMatrix()));
  for (const primitive of bodyNode.getMesh()?.listPrimitives() ?? []) {
    // Alpha-blended glazing is intentionally see-through; opaque body and cabin surfaces are not.
    if (primitive.getMaterial()?.getAlphaMode() === 'BLEND') continue;
    const position = primitive.getAttribute('POSITION');
    if (!position) continue;
    const source = position.getArray();
    const decoded = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 1) {
      decoded[i] = normalizedComponent(
        source[i]!,
        position.getComponentType(),
        position.getNormalized(),
      );
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(decoded, 3));
    const indices = primitive.getIndices();
    if (indices) geometry.setIndex(Array.from(indices.getArray()));
    geometry.applyMatrix4(bodyTransform);
    geometry.computeBoundingSphere();

    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.name = primitive.getMaterial()?.getName() ?? 'opaque hero body';
    heroOpaqueBodyMeshes.push(mesh);
    heroOpaqueBodyMaterials.push(material);
  }
});

afterAll(() => {
  heroOpaqueBodyMeshes.forEach((mesh) => mesh.geometry.dispose());
  heroOpaqueBodyMaterials.forEach((material) => material.dispose());
});

describe('cockpit camera', () => {
  it('places the eye at its body-relative anchor and pitches the neutral view toward the street', () => {
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
    const expectedForwardOrientation = new Quaternion(
      vehiclePose.rotation.x,
      vehiclePose.rotation.y,
      vehiclePose.rotation.z,
      vehiclePose.rotation.w,
    ).multiply(
      new Quaternion().setFromAxisAngle(
        new Vector3(1, 0, 0),
        COCKPIT_CAMERA_CONFIG.forwardPitchRadians,
      ),
    );
    expect(camera.camera.quaternion.angleTo(expectedForwardOrientation)).toBeCloseTo(0, 6);
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

  it('keeps the real hero windshield opening and forward track clear of opaque car geometry', () => {
    expect(heroOpaqueBodyMeshes.length).toBeGreaterThan(0);
    const aspect = 1568 / 704;
    const cameras = [
      new CockpitCamera(COCKPIT_CAMERA_CONFIG, aspect),
      new CockpitCamera(
        { ...COCKPIT_CAMERA_CONFIG, baseFov: COCKPIT_CAMERA_CONFIG.maxFov },
        aspect,
      ),
    ];
    const raycaster = new Raycaster();
    const viewportX = [-0.65, -0.4, -0.2, 0, 0.2, 0.4, 0.65];
    const viewportY = [-0.05, 0.15, 0.35, 0.55, 0.75];

    for (const camera of cameras) {
      camera.snapTo(pose(), telemetry());
      camera.camera.updateMatrixWorld(true);
      for (const y of viewportY) {
        for (const x of viewportX) {
          raycaster.setFromCamera(new Vector2(x, y), camera.camera);
          const blocker = raycaster
            .intersectObjects(heroOpaqueBodyMeshes, false)
            .find((hit) => hit.distance > 0.02 && hit.distance < 4.5);
          expect(blocker, `opaque hero body blocks viewport point (${x}, ${y})`).toBeUndefined();
        }
      }

      const road = expectLandmarksInFrame(camera, [
        [0, 0, -5],
        [0, 0, -10],
        [0, 0, -20],
      ]);
      road.forEach((point) => {
        expect(point.y).toBeGreaterThan(-0.2);
        expect(point.y).toBeLessThan(0.15);
      });
    }

    const [eyeX, eyeHeight, eyeDepth] = COCKPIT_CAMERA_CONFIG.eyeAnchor;
    expect(Math.abs(eyeX)).toBeLessThan(0.1);
    expect(eyeHeight).toBeGreaterThan(0.44);
    expect(eyeHeight).toBeLessThan(0.5);
    expect(eyeDepth).toBeGreaterThan(0);
    expect(eyeDepth).toBeLessThan(0.1);
    expect(COCKPIT_CAMERA_CONFIG.forwardPitchRadians).toBeGreaterThan(-0.05);
    expect(COCKPIT_CAMERA_CONFIG.forwardPitchRadians).toBeLessThan(0);
    expect(cameras[0]!.camera.fov).toBe(70);
    expect(cameras[1]!.camera.fov).toBe(COCKPIT_CAMERA_CONFIG.maxFov);
  });

  it('keeps the fallback roadster road-centered with its windshield and right-hand wheel low', () => {
    const camera = new CockpitCamera(COCKPIT_CAMERA_CONFIG, 1568 / 704);
    camera.setEyeAnchor(FALLBACK_COCKPIT_EYE_ANCHOR);
    camera.snapTo(pose(), telemetry());

    const [eyeX, eyeHeight, eyeDepth] = FALLBACK_COCKPIT_EYE_ANCHOR;
    expect(eyeX).toBeGreaterThan(0.1);
    expect(eyeX).toBeLessThan(0.3);
    expect(eyeHeight).toBeGreaterThan(0.738);
    expect(eyeHeight).toBeLessThan(0.86);
    expect(eyeDepth).toBeGreaterThan(-0.06);
    expect(eyeDepth).toBeLessThan(0.2);
    expect(camera.camera.fov).toBe(70);

    const [windshieldTop, steeringWheelTop, roadNear, roadMid, roadFar] = expectLandmarksInFrame(
      camera,
      [
        [0, 0.86, -0.1],
        [0.39, 0.738, -0.06],
        [0, 0, -5],
        [0, 0, -10],
        [0, 0, -20],
      ],
    );

    expect(windshieldTop!.y).toBeGreaterThan(0.05);
    expect(windshieldTop!.y).toBeLessThan(0.3);
    expect(steeringWheelTop!.x).toBeGreaterThan(0.65);
    expect(steeringWheelTop!.y).toBeLessThan(-0.7);
    expect(steeringWheelTop!.y).toBeGreaterThan(-1);
    for (const point of [roadNear!, roadMid!, roadFar!]) {
      expect(point.y).toBeGreaterThan(-0.25);
      expect(point.y).toBeLessThan(0.1);
    }
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
    const forwardOrientation = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      COCKPIT_CAMERA_CONFIG.forwardPitchRadians,
    );
    expect(camera.camera.quaternion.angleTo(forwardOrientation)).toBeCloseTo(0, 6);
  });
});
