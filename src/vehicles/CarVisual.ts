import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type BufferGeometry,
  type Material,
} from 'three';
import { VEHICLE_CONFIG, type VehicleConfig } from '../config/vehicle';
import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicle-effects';
import {
  createAutomotivePaintMaterial,
  createExhaustInteriorMaterial,
  createExhaustMetalMaterial,
  createHeadlightMaterial,
  createMarkerMaterial,
  createRubberMaterial,
  createTintedCabinMaterial,
  createWheelMetalMaterial,
} from './vehicle-materials';
import type { VehiclePose } from './types';

/**
 * Placeholder low-poly car mesh driven entirely by the vehicle's interpolated pose.
 *
 * This is a visual adapter: it reads poses and never writes to physics. Front wheels take the
 * steering angle, all four wheels spin from the rolling velocity, and wheel height follows the
 * simulated suspension length, so suspension travel is visible on screen.
 *
 * Phase 6 swaps the primitive bodies for a licensed GLB model; the wheel-node contract
 * (steer, spin, suspension offset) stays the same, which is why it lives behind this class.
 */
export class CarVisual {
  readonly root: Group;
  readonly #config: VehicleConfig;
  readonly #wheels: { pivot: Group; spinner: Group }[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #materials: Material[] = [];

  constructor(config: VehicleConfig = VEHICLE_CONFIG) {
    this.#config = config;
    this.root = new Group();
    this.root.name = 'car';

    const [halfWidth, halfHeight, halfLength] = config.chassis.halfExtents;

    const paint = this.#track(createAutomotivePaintMaterial());
    const glass = this.#track(createTintedCabinMaterial());
    const tire = this.#track(createRubberMaterial());
    const hub = this.#track(createWheelMetalMaterial());
    const marker = this.#track(createMarkerMaterial());
    const light = this.#track(createHeadlightMaterial());

    // The hull is deliberately narrower than the physics collider (0.9 half-width) so the wheels,
    // which sit at the simulated half-track, stay visible outside the bodywork.
    const body = new Mesh(
      this.#track(new BoxGeometry(halfWidth * 1.72, halfHeight * 2, halfLength * 2)),
      paint,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);

    const cabin = new Mesh(
      this.#track(new BoxGeometry(halfWidth * 1.32, halfHeight * 1.25, halfLength * 1.05)),
      glass,
    );
    cabin.position.set(0, halfHeight * 1.35, halfLength * 0.14);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    this.root.add(cabin);

    for (const side of [-1, 1]) {
      const headlight = new Mesh(
        this.#track(new BoxGeometry(halfWidth * 0.42, halfHeight * 0.28, 0.08)),
        light,
      );
      headlight.position.set(side * halfWidth * 0.55, halfHeight * 0.25, -halfLength);
      this.root.add(headlight);
    }

    const exhaustSteel = this.#track(createExhaustMetalMaterial());
    const exhaustInterior = this.#track(createExhaustInteriorMaterial());
    const exhaustGeometry = this.#track(new CylinderGeometry(0.066, 0.078, 0.28, 8));
    exhaustGeometry.rotateX(Math.PI / 2);
    const exhaustOpeningGeometry = this.#track(new CylinderGeometry(0.041, 0.041, 0.006, 8));
    exhaustOpeningGeometry.rotateX(Math.PI / 2);
    for (const outlet of VEHICLE_EFFECTS_CONFIG.exhaust.outlets) {
      const pipe = new Mesh(exhaustGeometry, exhaustSteel);
      pipe.position.set(outlet.x, outlet.y, outlet.z - 0.14);
      pipe.castShadow = true;
      const opening = new Mesh(exhaustOpeningGeometry, exhaustInterior);
      opening.position.set(outlet.x, outlet.y, outlet.z + 0.002);
      this.root.add(pipe, opening);
    }

    // Wheels are a pivot (steering, yaw) holding a spinner (rolling, pitch), so the two never fight.
    const wheelGeometry = this.#track(
      new CylinderGeometry(config.wheels.radius, config.wheels.radius, config.wheels.width, 20),
    );
    wheelGeometry.rotateZ(Math.PI / 2);
    const hubGeometry = this.#track(
      new CylinderGeometry(
        config.wheels.radius * 0.45,
        config.wheels.radius * 0.45,
        config.wheels.width * 1.05,
        12,
      ),
    );
    hubGeometry.rotateZ(Math.PI / 2);
    const markerGeometry = this.#track(
      new BoxGeometry(config.wheels.width * 0.6, config.wheels.radius * 0.22, 0.06),
    );

    const layout = [
      { side: -1, z: config.wheels.frontZ },
      { side: 1, z: config.wheels.frontZ },
      { side: -1, z: config.wheels.rearZ },
      { side: 1, z: config.wheels.rearZ },
    ];

    for (const wheel of layout) {
      const pivot = new Group();
      pivot.position.set(wheel.side * config.wheels.halfTrack, config.wheels.anchorY, wheel.z);

      const spinner = new Group();
      const tireMesh = new Mesh(wheelGeometry, tire);
      tireMesh.castShadow = true;
      const hubMesh = new Mesh(hubGeometry, hub);
      // Offset marker makes rolling motion readable at a glance, even at low speed.
      const markerMesh = new Mesh(markerGeometry, marker);
      markerMesh.position.set(0, config.wheels.radius * 0.45, 0);
      spinner.add(tireMesh, hubMesh, markerMesh);

      pivot.add(spinner);
      this.root.add(pivot);
      this.#wheels.push({ pivot, spinner });
    }
  }

  /** Applies an interpolated physics pose to the mesh. */
  sync(pose: VehiclePose): void {
    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);

    const { anchorY } = this.#config.wheels;
    for (let index = 0; index < this.#wheels.length; index += 1) {
      const target = this.#wheels[index];
      const wheel = pose.wheels[index];
      if (!target || !wheel) {
        continue;
      }
      target.pivot.position.y = anchorY - wheel.suspensionLength;
      target.pivot.rotation.y = wheel.steerAngle;
      target.spinner.rotation.x = wheel.spinAngle;
    }
  }

  dispose(): void {
    for (const geometry of this.#geometries) {
      geometry.dispose();
    }
    for (const material of this.#materials) {
      material.dispose();
    }
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.root.clear();
  }

  #track<T extends BufferGeometry | Material>(resource: T): T {
    if ('isBufferGeometry' in resource) {
      this.#geometries.push(resource as BufferGeometry);
    } else {
      this.#materials.push(resource as Material);
    }
    return resource;
  }
}
