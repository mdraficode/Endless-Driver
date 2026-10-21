import { BoxGeometry, BufferGeometry, CylinderGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TRAFFIC_VEHICLE_SPECS,
  type TrafficVehicleClass,
  type TrafficVehicleSpec,
} from '../config/traffic-vehicles';

export interface TrafficVehicleModel extends TrafficVehicleSpec {
  readonly geometry: BufferGeometry;
}

interface VehicleParts {
  readonly body: BufferGeometry[];
  readonly trim: BufferGeometry[];
  readonly accents: BufferGeometry[];
}

type Axis = 'x' | 'y' | 'z';

export function getTrafficVehicleSpec(type: TrafficVehicleClass): TrafficVehicleSpec {
  return TRAFFIC_VEHICLE_SPECS[type];
}

/**
 * Builds an unbadged, low-poly traffic model from reusable primitives. The merged geometry keeps
 * three material groups (paint, dark glazing/tires, and small metal/light accents) in one instanced
 * mesh per vehicle class. The material groups remain separate GPU draw calls.
 */
export function createTrafficVehicleModel(type: TrafficVehicleClass): TrafficVehicleModel {
  const spec = getTrafficVehicleSpec(type);
  const parts = createParts(type);
  const body = mergeParts(parts.body, `${type}-body`);
  const trim = mergeParts(parts.trim, `${type}-trim`);
  const accents = mergeParts(parts.accents, `${type}-accents`);
  const geometry = mergeGeometries([body, trim, accents], true);
  body.dispose();
  trim.dispose();
  accents.dispose();

  if (geometry === null) {
    throw new Error(`Unable to merge procedural traffic model: ${type}`);
  }
  geometry.name = `aohara-${type}-instanced-geometry`;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { ...spec, geometry };
}

function createParts(type: TrafficVehicleClass): VehicleParts {
  switch (type) {
    case 'passenger-car':
      return createPassengerCarParts();
    case 'city-bus':
      return createCityBusParts();
    case 'rigid-truck':
      return createRigidTruckParts();
    case 'semi-trailer-rig':
      return createSemiTrailerParts();
    case 'farm-tractor':
      return createFarmTractorParts();
  }
  throw new Error(`Unsupported traffic vehicle class: ${type}`);
}

function createPassengerCarParts(): VehicleParts {
  const parts = createEmptyParts();
  parts.body.push(box(1.78, 0.66, 4.15, 0, 0.74, 0));
  parts.body.push(box(1.52, 0.7, 2.12, 0, 1.34, -0.08));

  parts.trim.push(box(1.42, 0.4, 1.28, 0, 1.37, -0.08));
  parts.trim.push(box(0.025, 0.35, 0.95, -0.77, 1.35, -0.08));
  parts.trim.push(box(0.025, 0.35, 0.95, 0.77, 1.35, -0.08));
  parts.trim.push(box(1.34, 0.34, 0.025, 0, 1.36, -1.16));
  parts.trim.push(box(1.28, 0.32, 0.025, 0, 1.36, 0.93));
  parts.trim.push(box(1.84, 0.14, 0.1, 0, 0.55, -2.04));
  parts.trim.push(box(1.84, 0.12, 0.1, 0, 0.54, 2.04));
  parts.trim.push(box(0.74, 0.16, 0.05, 0, 0.72, -2.1));
  addWheelSet(parts, [
    { x: -0.93, y: 0.37, z: -1.35, radius: 0.34, width: 0.24 },
    { x: 0.93, y: 0.37, z: -1.35, radius: 0.34, width: 0.24 },
    { x: -0.93, y: 0.37, z: 1.35, radius: 0.34, width: 0.24 },
    { x: 0.93, y: 0.37, z: 1.35, radius: 0.34, width: 0.24 },
  ]);
  addLampAccents(parts, 1.35, -2.105, 0.2);
  return parts;
}

function createCityBusParts(): VehicleParts {
  const parts = createEmptyParts();
  parts.body.push(box(2.45, 2.88, 11.6, 0, 1.84, 0));
  parts.body.push(box(2.05, 0.25, 2.05, 0, 3.43, 0.38));
  parts.body.push(box(2.5, 0.22, 0.18, 0, 0.5, -5.8));
  parts.body.push(box(2.5, 0.22, 0.18, 0, 0.5, 5.8));

  for (const side of [-1, 1] as const) {
    parts.trim.push(box(0.025, 0.78, 8.5, side * 1.235, 2.37, 0));
    for (let index = 0; index < 8; index += 1) {
      const z = -3.72 + index * 1.06;
      parts.trim.push(box(0.04, 0.9, 0.055, side * 1.26, 2.37, z));
    }
  }
  parts.trim.push(box(1.96, 1.16, 0.035, 0, 2.43, -5.82));
  parts.trim.push(box(1.9, 0.72, 0.035, 0, 2.34, 5.82));
  parts.trim.push(box(0.05, 1.35, 0.04, 1.26, 1.45, -1.1));
  parts.trim.push(box(0.05, 1.35, 0.04, 1.26, 1.45, 0.85));
  parts.trim.push(box(1.7, 0.16, 0.08, 0, 0.5, -5.91));
  parts.trim.push(box(1.85, 0.13, 0.08, 0, 0.48, 5.91));
  addWheelSet(parts, [
    { x: -1.12, y: 0.54, z: -3.58, radius: 0.5, width: 0.32 },
    { x: 1.12, y: 0.54, z: -3.58, radius: 0.5, width: 0.32 },
    { x: -1.12, y: 0.54, z: 3.62, radius: 0.5, width: 0.32 },
    { x: 1.12, y: 0.54, z: 3.62, radius: 0.5, width: 0.32 },
  ]);
  addLampAccents(parts, 1.5, -5.91, 0.3);
  return parts;
}

function createRigidTruckParts(): VehicleParts {
  const parts = createEmptyParts();
  parts.body.push(box(2.38, 2.65, 4.85, 0, 1.7, 1.1));
  parts.body.push(box(2.18, 2.18, 2.45, 0, 1.45, -2.52));
  parts.body.push(box(2.25, 0.22, 0.18, 0, 0.51, -3.78));
  parts.body.push(box(2.35, 0.18, 0.18, 0, 0.5, 3.63));

  parts.trim.push(box(1.78, 1.15, 0.04, 0, 1.85, -3.76));
  parts.trim.push(box(0.035, 1.02, 1.55, -1.11, 1.86, -2.48));
  parts.trim.push(box(0.035, 1.02, 1.55, 1.11, 1.86, -2.48));
  parts.trim.push(box(1.2, 0.1, 0.04, 0, 2.91, -3.76));
  parts.trim.push(box(1.92, 0.2, 0.09, 0, 0.55, -3.87));

  for (const side of [-1, 1] as const) {
    parts.trim.push(box(0.025, 0.9, 4.3, side * 1.21, 1.68, 1.14));
    parts.trim.push(box(0.04, 0.12, 4.45, side * 1.23, 0.59, 1.12));
  }
  addWheelSet(parts, [
    { x: -1.08, y: 0.5, z: -2.65, radius: 0.46, width: 0.3 },
    { x: 1.08, y: 0.5, z: -2.65, radius: 0.46, width: 0.3 },
    { x: -1.1, y: 0.5, z: 2.1, radius: 0.48, width: 0.32 },
    { x: 1.1, y: 0.5, z: 2.1, radius: 0.48, width: 0.32 },
    { x: -1.1, y: 0.5, z: 2.95, radius: 0.48, width: 0.32 },
    { x: 1.1, y: 0.5, z: 2.95, radius: 0.48, width: 0.32 },
  ]);
  addLampAccents(parts, 1.2, -3.85, 0.22);
  return parts;
}

function createSemiTrailerParts(): VehicleParts {
  const parts = createEmptyParts();
  parts.body.push(box(2.46, 3.42, 11, 0, 2.5, 2.85));
  parts.body.push(box(2.34, 2.58, 2.72, 0, 1.62, -4.18));
  parts.body.push(box(2.32, 0.2, 1.7, 0, 0.61, -1.85));
  parts.body.push(box(2.4, 0.22, 0.16, 0, 0.53, -5.58));
  parts.body.push(box(2.45, 0.2, 0.16, 0, 0.54, 8.35));

  parts.trim.push(box(1.92, 1.22, 0.04, 0, 1.96, -5.57));
  parts.trim.push(box(0.035, 1.0, 1.65, -1.2, 1.96, -4.16));
  parts.trim.push(box(0.035, 1.0, 1.65, 1.2, 1.96, -4.16));
  parts.trim.push(box(1.3, 0.12, 0.045, 0, 2.93, -5.57));
  parts.trim.push(box(0.04, 0.22, 10.3, -1.25, 0.93, 2.9));
  parts.trim.push(box(0.04, 0.22, 10.3, 1.25, 0.93, 2.9));
  parts.trim.push(box(0.04, 1.0, 0.05, 1.25, 2.35, -1.85));
  parts.trim.push(box(1.9, 0.18, 0.08, 0, 0.55, -5.68));

  addWheelSet(parts, [
    { x: -1.08, y: 0.52, z: -4.9, radius: 0.48, width: 0.3 },
    { x: 1.08, y: 0.52, z: -4.9, radius: 0.48, width: 0.3 },
    { x: -1.08, y: 0.52, z: -2.88, radius: 0.48, width: 0.32 },
    { x: 1.08, y: 0.52, z: -2.88, radius: 0.48, width: 0.32 },
    { x: -1.08, y: 0.52, z: -2.02, radius: 0.48, width: 0.32 },
    { x: 1.08, y: 0.52, z: -2.02, radius: 0.48, width: 0.32 },
    { x: -1.1, y: 0.54, z: 6.35, radius: 0.5, width: 0.32 },
    { x: 1.1, y: 0.54, z: 6.35, radius: 0.5, width: 0.32 },
    { x: -1.1, y: 0.54, z: 7.3, radius: 0.5, width: 0.32 },
    { x: 1.1, y: 0.54, z: 7.3, radius: 0.5, width: 0.32 },
  ]);
  addLampAccents(parts, 1.2, -5.68, 0.23);
  return parts;
}

function createFarmTractorParts(): VehicleParts {
  const parts = createEmptyParts();
  parts.body.push(box(1.42, 0.88, 1.92, 0, 1.0, -0.52));
  parts.body.push(box(1.55, 0.16, 1.32, 0, 0.82, 0.62));
  parts.body.push(box(0.52, 0.13, 1.08, -0.69, 0.9, 0.72));
  parts.body.push(box(0.52, 0.13, 1.08, 0.69, 0.9, 0.72));
  parts.body.push(box(0.68, 0.16, 0.2, 0, 0.37, -1.58));

  // A simple open-cab roll frame distinguishes the tractor without adding a heavy cab shell.
  parts.trim.push(box(0.075, 1.22, 0.075, -0.4, 1.72, 0.63));
  parts.trim.push(box(0.075, 1.22, 0.075, 0.4, 1.72, 0.63));
  parts.trim.push(box(0.88, 0.08, 0.08, 0, 2.32, 0.63));
  parts.trim.push(box(0.08, 0.9, 0.08, 0.43, 1.45, -0.72));
  parts.trim.push(box(0.13, 0.14, 0.46, 0, 0.52, 0.52));
  parts.trim.push(box(0.68, 0.12, 0.46, 0, 0.62, 0.42));
  parts.trim.push(box(1.32, 0.14, 0.1, 0, 0.58, -1.5));
  addCylinder(parts.trim, 0.055, 0.055, 0.78, 0.43, 1.91, -0.8, 'y', 10);

  addWheelSet(parts, [
    { x: -1.04, y: 0.63, z: 0.77, radius: 0.62, width: 0.4 },
    { x: 1.04, y: 0.63, z: 0.77, radius: 0.62, width: 0.4 },
    { x: -0.86, y: 0.36, z: -1.22, radius: 0.35, width: 0.27 },
    { x: 0.86, y: 0.36, z: -1.22, radius: 0.35, width: 0.27 },
  ]);
  addLampAccents(parts, 0.92, -1.5, 0.2);
  return parts;
}

interface WheelPart {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly width: number;
}

function addWheelSet(parts: VehicleParts, wheels: readonly WheelPart[]): void {
  for (const wheel of wheels) {
    addCylinder(
      parts.trim,
      wheel.radius,
      wheel.radius,
      wheel.width,
      wheel.x,
      wheel.y,
      wheel.z,
      'x',
      16,
    );
    for (const side of [-1, 1] as const) {
      addCylinder(
        parts.accents,
        wheel.radius * 0.35,
        wheel.radius * 0.35,
        0.04,
        wheel.x + side * (wheel.width * 0.51),
        wheel.y,
        wheel.z,
        'x',
        12,
      );
    }
  }
}

function addLampAccents(parts: VehicleParts, halfWidth: number, frontZ: number, y: number): void {
  for (const side of [-1, 1] as const) {
    parts.accents.push(box(0.28, 0.12, 0.045, side * halfWidth * 0.62, y, frontZ));
  }
}

function addCylinder(
  target: BufferGeometry[],
  radiusTop: number,
  radiusBottom: number,
  height: number,
  x: number,
  y: number,
  z: number,
  axis: Axis,
  radialSegments: number,
): void {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1);
  if (axis === 'x') {
    geometry.rotateZ(Math.PI / 2);
  } else if (axis === 'z') {
    geometry.rotateX(Math.PI / 2);
  }
  geometry.translate(x, y, z);
  target.push(geometry);
}

function box(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}

function createEmptyParts(): VehicleParts {
  return { body: [], trim: [], accents: [] };
}

function mergeParts(parts: readonly BufferGeometry[], name: string): BufferGeometry {
  const geometry = mergeGeometries([...parts], false);
  for (const part of parts) {
    part.dispose();
  }
  if (geometry === null) {
    throw new Error(`Unable to merge procedural traffic geometry: ${name}`);
  }
  geometry.name = name;
  return geometry;
}
