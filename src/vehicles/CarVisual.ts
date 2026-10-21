import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  type Material,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createAutomotivePaintMaterial,
  createBrakeLightMaterial,
  createExhaustInteriorMaterial,
  createExhaustMetalMaterial,
  createHeadlightMaterial,
  createRubberMaterial,
  createTintedCabinMaterial,
  createVehicleInteriorMaterial,
  createWheelMetalMaterial,
} from './vehicle-materials';
import { VEHICLE_CONFIG } from '../config/vehicle';
import type { VehiclePose } from './types';

const UP = new Vector3(0, 1, 0);
const WHEEL_RADIUS = VEHICLE_CONFIG.wheels.radius;
const WHEEL_WIDTH = VEHICLE_CONFIG.wheels.width;
const WHEEL_NAMES = ['front-left', 'front-right', 'rear-left', 'rear-right'] as const;

type WheelName = (typeof WHEEL_NAMES)[number];
type WheelVisual = { readonly pivot: Group; readonly spinner: Group };
type Position3 = readonly [number, number, number];

/** Player presentation built from project-authored geometry; it does not load a third-party mesh. */
export class CarVisual {
  readonly root = new Group();

  readonly #geometries: BufferGeometry[] = [];
  readonly #materials: Material[] = [];
  readonly #wheels: WheelVisual[] = [];
  readonly #brakeLightMaterial: ReturnType<typeof createBrakeLightMaterial>;
  #steeringWheel: Group | null = null;

  constructor() {
    this.root.name = 'kaminari-gt-roadster';

    const paint = this.#track(createAutomotivePaintMaterial());
    const glass = this.#track(createTintedCabinMaterial());
    const interior = this.#track(createVehicleInteriorMaterial());
    const rubber = this.#track(createRubberMaterial());
    const wheelMetal = this.#track(createWheelMetalMaterial());
    const trim = this.#track(createExhaustInteriorMaterial());
    const exhaustMetal = this.#track(createExhaustMetalMaterial());
    const headlamp = this.#track(createHeadlightMaterial());
    this.#brakeLightMaterial = this.#track(createBrakeLightMaterial());
    glass.side = DoubleSide;

    const shell = this.#addMesh(
      'kaminari-gt-roadster-body-shell',
      createRoadsterBodyGeometry(),
      paint,
    );
    shell.castShadow = true;
    shell.receiveShadow = true;

    // Long, low hood, rear deck and subtle panel forms complete the original GT silhouette.
    this.#addRounded('kaminari-gt-hood-panel', 1.32, 0.065, 1.22, 0.025, paint, [0, 0.292, -1.12]);
    this.#addRounded('kaminari-gt-rear-deck', 1.34, 0.07, 0.56, 0.025, paint, [0, 0.265, 1.48]);
    this.#addRounded(
      'kaminari-gt-hood-ridge-left',
      0.022,
      0.018,
      0.84,
      0.008,
      paint,
      [-0.37, 0.333, -1.12],
    );
    this.#addRounded(
      'kaminari-gt-hood-ridge-right',
      0.022,
      0.018,
      0.84,
      0.008,
      paint,
      [0.37, 0.333, -1.12],
    );

    // The open cabin is deliberately visible from the chase camera; there is no fabricated glass map.
    const dashboard = this.#addRounded(
      'kaminari-gt-dashboard',
      1.28,
      0.18,
      0.34,
      0.055,
      interior,
      [0, 0.34, -0.46],
    );
    dashboard.castShadow = true;
    this.#addRounded('kaminari-gt-center-console', 0.34, 0.14, 0.82, 0.04, trim, [0, 0.14, 0.15]);

    for (const side of [-1, 1] as const) {
      const x = side * 0.36;
      this.#addRounded(`kaminari-gt-seat-${side}-cushion`, 0.5, 0.17, 0.51, 0.07, interior, [
        x,
        0.055,
        0.44,
      ]);
      this.#addRounded(
        `kaminari-gt-seat-${side}-back`,
        0.5,
        0.53,
        0.18,
        0.065,
        interior,
        [x, 0.38, 0.72],
        [0.1, 0, 0],
      );
      this.#addRounded(`kaminari-gt-seat-${side}-headrest`, 0.34, 0.2, 0.16, 0.055, interior, [
        x,
        0.73,
        0.83,
      ]);
    }

    const windshield = this.#addMesh('kaminari-gt-windshield', createWindshieldGeometry(), glass);
    windshield.castShadow = false;
    windshield.receiveShadow = true;
    this.#addRod(
      'kaminari-gt-a-pillar-left',
      [-0.62, 0.27, -0.53],
      [-0.52, 0.88, -0.08],
      0.034,
      trim,
    );
    this.#addRod(
      'kaminari-gt-a-pillar-right',
      [0.62, 0.27, -0.53],
      [0.52, 0.88, -0.08],
      0.034,
      trim,
    );
    this.#addRod(
      'kaminari-gt-roll-hoop-left',
      [-0.47, 0.27, 0.92],
      [-0.47, 0.94, 0.97],
      0.026,
      trim,
    );
    this.#addRod(
      'kaminari-gt-roll-hoop-right',
      [0.47, 0.27, 0.92],
      [0.47, 0.94, 0.97],
      0.026,
      trim,
    );
    this.#addRod(
      'kaminari-gt-roll-hoop-crossbar',
      [-0.47, 0.94, 0.97],
      [0.47, 0.94, 0.97],
      0.027,
      trim,
    );

    for (const side of [-1, 1] as const) {
      const mirror = this.#addRounded(
        `kaminari-gt-side-mirror-${side}`,
        0.17,
        0.1,
        0.14,
        0.035,
        paint,
        [side * 0.81, 0.47, -0.59],
      );
      mirror.rotation.y = side * -0.12;
      const mirrorGlass = this.#addBox(
        `kaminari-gt-side-mirror-glass-${side}`,
        0.11,
        0.06,
        0.012,
        glass,
        [side * 0.81, 0.47, -0.666],
      );
      mirrorGlass.rotation.y = side * -0.12;

      const doorSeam = this.#addMesh(
        `kaminari-gt-door-seam-${side}`,
        createDoorSeamGeometry(side),
        trim,
      );
      doorSeam.castShadow = false;
      this.#addRounded(`kaminari-gt-door-handle-${side}`, 0.045, 0.018, 0.12, 0.008, exhaustMetal, [
        side * 0.794,
        0.13,
        0.42,
      ]);
    }

    this.#addRounded(
      'kaminari-gt-front-grille',
      0.68,
      0.13,
      0.035,
      0.016,
      trim,
      [0, 0.105, -2.034],
    );
    this.#addRounded(
      'kaminari-gt-front-grille-slat',
      0.48,
      0.014,
      0.012,
      0.005,
      exhaustMetal,
      [0, 0.105, -2.057],
    );
    for (const side of [-1, 1] as const) {
      this.#addRounded(`kaminari-gt-headlamp-${side}`, 0.34, 0.105, 0.035, 0.016, headlamp, [
        side * 0.55,
        0.18,
        -2.043,
      ]);
      this.#addRounded(
        `kaminari-gt-brake-lamp-${side}`,
        0.3,
        0.075,
        0.035,
        0.015,
        this.#brakeLightMaterial,
        [side * 0.56, 0.16, 2.04],
      );
    }

    this.#createSteeringWheel(wheelMetal);
    this.#createWheels(rubber, wheelMetal);
    this.#createExhaust(exhaustMetal, trim);
    this.#mergeStaticRootMeshes();
  }

  sync(pose: VehiclePose): void {
    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);

    let frontSteerTotal = 0;
    let frontWheelCount = 0;
    for (let index = 0; index < this.#wheels.length; index += 1) {
      const wheel = this.#wheels[index];
      const state = pose.wheels[index];
      if (wheel === undefined || state === undefined) {
        continue;
      }
      wheel.pivot.position.y = VEHICLE_CONFIG.wheels.anchorY - state.suspensionLength;
      wheel.pivot.rotation.y = state.steerAngle;
      wheel.spinner.rotation.x = state.spinAngle;
      if (state.isFront) {
        frontSteerTotal += state.steerAngle;
        frontWheelCount += 1;
      }
    }

    if (this.#steeringWheel !== null && frontWheelCount > 0) {
      this.#steeringWheel.rotation.z = -(frontSteerTotal / frontWheelCount) * 2.1;
    }
    this.#brakeLightMaterial.emissiveIntensity = pose.brake > 0.03 ? 2.1 : 0.24;
  }

  dispose(): void {
    for (const geometry of this.#geometries) {
      geometry.dispose();
    }
    for (const material of this.#materials) {
      material.dispose();
    }
    this.root.clear();
  }

  #createSteeringWheel(wheelMetal: Material): void {
    const group = new Group();
    group.name = 'kaminari-gt-steering-wheel-pivot';
    group.position.set(0.39, 0.56, -0.06);
    this.root.add(group);

    const parts: BufferGeometry[] = [new TorusGeometry(0.16, 0.018, 8, 24)];
    const hub = new CylinderGeometry(0.038, 0.038, 0.055, 12);
    hub.rotateX(Math.PI / 2);
    parts.push(hub);
    for (let index = 0; index < 3; index += 1) {
      const spoke = new BoxGeometry(0.018, 0.135, 0.016);
      spoke.rotateZ((index / 3) * Math.PI * 2);
      spoke.translate(0, 0.045, 0);
      parts.push(spoke);
    }
    const geometry = mergeGeometryList(parts, 'kaminari-gt-steering-wheel-assembly');
    for (const part of parts) {
      part.dispose();
    }
    this.#addMesh('kaminari-gt-steering-wheel-assembly', geometry, wheelMetal, group);
    this.#steeringWheel = group;
  }

  #createWheels(rubber: Material, wheelMetal: Material): void {
    const tire = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 32, 1, false);
    tire.rotateZ(Math.PI / 2);
    const tread = new TorusGeometry(WHEEL_RADIUS * 0.95, 0.015, 6, 32);
    tread.rotateY(Math.PI / 2);
    const rubberGeometry = mergeGeometryList([tire, tread], 'kaminari-gt-wheel-rubber');
    tire.dispose();
    tread.dispose();

    const alloyParts: BufferGeometry[] = [];
    for (const wheelSide of [-1, 1] as const) {
      const x = wheelSide * WHEEL_WIDTH * 0.51;
      const ring = new TorusGeometry(WHEEL_RADIUS * 0.65, 0.022, 8, 28);
      ring.rotateY(Math.PI / 2);
      ring.translate(x, 0, 0);
      alloyParts.push(ring);

      const hub = new CylinderGeometry(
        WHEEL_RADIUS * 0.18,
        WHEEL_RADIUS * 0.18,
        WHEEL_WIDTH * 1.06,
        16,
      );
      hub.rotateZ(Math.PI / 2);
      hub.translate(x, 0, 0);
      alloyParts.push(hub);

      for (let spokeIndex = 0; spokeIndex < 5; spokeIndex += 1) {
        const spoke = new BoxGeometry(WHEEL_WIDTH * 1.04, WHEEL_RADIUS * 0.44, 0.026);
        spoke.rotateX((spokeIndex / 5) * Math.PI * 2);
        spoke.translate(x, WHEEL_RADIUS * 0.25, 0);
        alloyParts.push(spoke);
      }
    }
    const alloyGeometry = mergeGeometryList(alloyParts, 'kaminari-gt-wheel-alloy');
    for (const part of alloyParts) {
      part.dispose();
    }
    const geometry = mergeGeometries([rubberGeometry, alloyGeometry], true);
    rubberGeometry.dispose();
    alloyGeometry.dispose();
    if (geometry === null) {
      throw new Error('Unable to merge the roadster wheel geometry');
    }
    geometry.name = 'kaminari-gt-wheel-assembly';
    this.#track(geometry);

    for (let index = 0; index < WHEEL_NAMES.length; index += 1) {
      const name = WHEEL_NAMES[index] as WheelName;
      const isFront = index < 2;
      const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
      const pivot = new Group();
      pivot.name = `${name}-wheel-pivot`;
      pivot.position.set(
        side * VEHICLE_CONFIG.wheels.halfTrack,
        VEHICLE_CONFIG.wheels.anchorY - VEHICLE_CONFIG.wheels.restLength,
        isFront ? VEHICLE_CONFIG.wheels.frontZ : VEHICLE_CONFIG.wheels.rearZ,
      );

      const spinner = new Group();
      spinner.name = `${name}-wheel-spinner`;
      const wheel = new Mesh(geometry, [rubber, wheelMetal]);
      wheel.name = `${name}-wheel-assembly`;
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      spinner.add(wheel);
      pivot.add(spinner);
      this.root.add(pivot);
      this.#wheels.push({ pivot, spinner });
    }
  }

  #createExhaust(exhaustMetal: Material, trim: Material): void {
    for (const side of [-1, 1] as const) {
      const pipe = this.#addMesh(
        `kaminari-gt-exhaust-tip-${side}`,
        new CylinderGeometry(0.045, 0.055, 0.24, 12),
        exhaustMetal,
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.46, -0.12, 2.07);
      const inner = this.#addMesh(
        `kaminari-gt-exhaust-interior-${side}`,
        new CylinderGeometry(0.027, 0.035, 0.012, 12),
        trim,
      );
      inner.rotation.x = Math.PI / 2;
      inner.position.set(side * 0.46, -0.12, 2.198);
    }
  }

  #mergeStaticRootMeshes(): void {
    const batches = new Map<
      Material,
      { readonly geometries: BufferGeometry[]; readonly partNames: string[] }
    >();
    const originalMeshes = this.root.children.filter(
      (child): child is Mesh => child instanceof Mesh,
    );

    for (const mesh of originalMeshes) {
      if (Array.isArray(mesh.material)) {
        continue;
      }
      mesh.updateMatrix();
      mesh.geometry.applyMatrix4(mesh.matrix);
      const batch = batches.get(mesh.material) ?? { geometries: [], partNames: [] };
      batch.geometries.push(mesh.geometry);
      batch.partNames.push(mesh.name);
      batches.set(mesh.material, batch);
      this.root.remove(mesh);
    }

    for (const [material, batch] of batches) {
      const geometry = mergeGeometryList(batch.geometries, `kaminari-gt-${material.name}-batch`);
      for (const source of batch.geometries) {
        this.#releaseGeometry(source);
      }
      const mesh = new Mesh(this.#track(geometry), material);
      mesh.name = `kaminari-gt-static-${material.name}`;
      mesh.userData.partNames = batch.partNames;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }

  #releaseGeometry(geometry: BufferGeometry): void {
    geometry.dispose();
    const index = this.#geometries.indexOf(geometry);
    if (index >= 0) {
      this.#geometries.splice(index, 1);
    }
  }

  #addMesh(
    name: string,
    geometry: BufferGeometry,
    material: Material,
    parent: Group = this.root,
  ): Mesh {
    const mesh = new Mesh(this.#track(geometry), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  #addBox(
    name: string,
    width: number,
    height: number,
    depth: number,
    material: Material,
    position: Position3,
  ): Mesh {
    const mesh = this.#addMesh(name, new BoxGeometry(width, height, depth), material);
    mesh.position.set(position[0], position[1], position[2]);
    return mesh;
  }

  #addRounded(
    name: string,
    width: number,
    height: number,
    depth: number,
    radius: number,
    material: Material,
    position: Position3,
    rotation?: Position3,
  ): Mesh {
    const mesh = this.#addMesh(
      name,
      new RoundedBoxGeometry(width, height, depth, 4, radius),
      material,
    );
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation !== undefined) {
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    }
    return mesh;
  }

  #addRod(
    name: string,
    start: Position3,
    end: Position3,
    radius: number,
    material: Material,
  ): Mesh {
    const from = new Vector3(...start);
    const to = new Vector3(...end);
    const direction = to.clone().sub(from);
    const length = direction.length();
    const mesh = this.#addMesh(name, new CylinderGeometry(radius, radius, length, 10), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
  }

  #track<T extends BufferGeometry | Material>(resource: T): T {
    if ('isBufferGeometry' in resource && resource.isBufferGeometry) {
      this.#geometries.push(resource as BufferGeometry);
    } else {
      this.#materials.push(resource as Material);
    }
    return resource;
  }
}

function mergeGeometryList(
  parts: readonly BufferGeometry[],
  name: string,
  useGroups = false,
): BufferGeometry {
  const geometry = mergeGeometries([...parts], useGroups);
  if (geometry === null) {
    throw new Error(`Unable to merge vehicle geometry: ${name}`);
  }
  geometry.name = name;
  return geometry;
}

function createRoadsterBodyGeometry(): BufferGeometry {
  const profile = new Shape();
  profile.moveTo(2.05, -0.22);
  profile.lineTo(1.77, -0.22);
  profile.absarc(1.34, -0.22, 0.43, 0, Math.PI, false);
  profile.lineTo(-0.91, -0.22);
  profile.absarc(-1.34, -0.22, 0.43, 0, Math.PI, false);
  profile.lineTo(-2.03, -0.22);
  profile.lineTo(-2.05, 0.04);
  profile.quadraticCurveTo(-1.8, 0.16, -1.62, 0.2);
  profile.quadraticCurveTo(-1.2, 0.32, -0.77, 0.28);
  profile.lineTo(-0.4, 0.26);
  profile.lineTo(0.28, 0.28);
  profile.quadraticCurveTo(0.75, 0.31, 1.12, 0.26);
  profile.quadraticCurveTo(1.64, 0.19, 2.02, 0.02);
  profile.closePath();

  const geometry = new ExtrudeGeometry(profile, {
    depth: 1.52,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 10,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-0.76, 0, 0);
  geometry.computeVertexNormals();
  geometry.name = 'kaminari-gt-roadster-profiled-shell-geometry';
  return geometry;
}

function createWindshieldGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        -0.61, 0.29, -0.55, 0.61, 0.29, -0.55, 0.52, 0.86, -0.1, -0.52, 0.86, -0.1,
      ]),
      3,
    ),
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  geometry.name = 'kaminari-gt-windshield-pane-geometry';
  return geometry;
}

function createDoorSeamGeometry(side: -1 | 1): BufferGeometry {
  const points = [
    new Vector3(side * 0.78, 0.19, -0.42),
    new Vector3(side * 0.8, 0.2, 0.05),
    new Vector3(side * 0.78, 0.17, 0.82),
  ];
  const curve = new CatmullRomCurve3(points);
  const geometry = new TubeGeometry(curve, 16, 0.004, 5, false);
  geometry.name = `kaminari-gt-door-seam-${side}-geometry`;
  return geometry;
}
