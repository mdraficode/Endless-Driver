import { Box3, Mesh, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { CarVisual } from '../../src/vehicles/CarVisual';
import type { VehiclePose } from '../../src/vehicles/types';

function makePose(brake: number): VehiclePose {
  return {
    position: { x: 2, y: 0.7, z: -3 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    brake,
    wheels: [
      { isFront: true, steerAngle: 0.2, spinAngle: 1.1, suspensionLength: 0.24 },
      { isFront: true, steerAngle: 0.4, spinAngle: -0.8, suspensionLength: 0.31 },
      { isFront: false, steerAngle: 0, spinAngle: 0.7, suspensionLength: 0.42 },
      { isFront: false, steerAngle: 0, spinAngle: -0.6, suspensionLength: 0.36 },
    ],
  };
}

function mergedPartNames(car: CarVisual): string[] {
  return car.root.children.flatMap((child) => {
    if (!(child instanceof Mesh)) {
      return [];
    }
    const names = child.userData.partNames;
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : [];
  });
}

function mergedPartMesh(car: CarVisual, name: string): Mesh | undefined {
  return car.root.children.find(
    (child): child is Mesh =>
      child instanceof Mesh &&
      Array.isArray(child.userData.partNames) &&
      child.userData.partNames.includes(name),
  );
}

describe('in-house Kaminari GT player visual', () => {
  it('creates an original unbadged roadster body, open cabin, and four steer/spin pivots', () => {
    const car = new CarVisual();
    const bounds = new Box3().setFromObject(car.root);
    const size = bounds.getSize(new Vector3());
    const names: string[] = [];
    let renderMeshCount = 0;
    let triangleCount = 0;
    car.root.traverse((object) => {
      names.push(object.name);
      if (object instanceof Mesh) {
        renderMeshCount += 1;
        triangleCount +=
          (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      }
    });
    const parts = mergedPartNames(car);

    expect(car.root.name).toBe('kaminari-gt-roadster');
    expect(parts).toContain('kaminari-gt-roadster-body-shell');
    expect(parts).toContain('kaminari-gt-windshield');
    expect(parts).toContain('kaminari-gt-seat-1-back');
    expect(parts).toContain('kaminari-gt-brake-lamp-1');
    expect(names).toContain('kaminari-gt-steering-wheel-pivot');
    expect(names).toContain('kaminari-gt-steering-wheel-assembly');
    expect(names).not.toContain('kaminari-gt-emblem');
    for (const name of ['front-left', 'front-right', 'rear-left', 'rear-right']) {
      expect(names).toContain(`${name}-wheel-pivot`);
      expect(names).toContain(`${name}-wheel-assembly`);
    }
    expect(size.x).toBeGreaterThan(1.6);
    expect(size.x).toBeLessThan(2.1);
    expect(size.y).toBeGreaterThan(1.3);
    expect(size.y).toBeLessThan(2);
    expect(size.z).toBeGreaterThan(3.8);
    expect(size.z).toBeLessThan(4.6);
    expect(renderMeshCount).toBeLessThanOrEqual(12);
    expect(triangleCount).toBeGreaterThan(1_000);
    expect(triangleCount).toBeLessThan(20_000);
    expect(VEHICLE_CONFIG.wheels.halfTrack).toBeGreaterThan(0);
    car.dispose();
    expect(car.root.children).toHaveLength(0);
  });

  it('syncs suspension, steering, rolling spin, and local brake-lamp intensity from the pose', () => {
    const car = new CarVisual();
    const pose = makePose(0.7);
    car.sync(pose);

    const frontLeft = car.root.getObjectByName('front-left-wheel-pivot');
    const frontLeftSpinner = car.root.getObjectByName('front-left-wheel-spinner');
    const steeringWheel = car.root.getObjectByName('kaminari-gt-steering-wheel-pivot');
    const brakeLamp = mergedPartMesh(car, 'kaminari-gt-brake-lamp-1');
    expect(frontLeft).toBeDefined();
    expect(frontLeftSpinner).toBeDefined();
    expect(steeringWheel).toBeDefined();
    expect(brakeLamp).toBeInstanceOf(Mesh);
    if (frontLeft === undefined || frontLeftSpinner === undefined || steeringWheel === undefined) {
      throw new Error('player car visual should expose wheel and steering pivots');
    }
    if (!(brakeLamp instanceof Mesh) || !(brakeLamp.material instanceof MeshStandardNodeMaterial)) {
      throw new Error('player rear lamp should use its local emissive node material');
    }

    expect(frontLeft.position.y).toBeCloseTo(VEHICLE_CONFIG.wheels.anchorY - 0.24, 6);
    expect(frontLeft.rotation.y).toBeCloseTo(0.2, 6);
    expect(frontLeftSpinner.rotation.x).toBeCloseTo(1.1, 6);
    expect(steeringWheel.rotation.z).toBeCloseTo(-0.63, 6);
    expect(brakeLamp.material.emissiveIntensity).toBeCloseTo(2.1, 6);
    expect(brakeLamp.material.map).toBeNull();

    car.sync({ ...pose, brake: 0 });
    expect(brakeLamp.material.emissiveIntensity).toBeCloseTo(0.24, 6);
    car.dispose();
  });
});
