import { Box3, Mesh, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { CarVisual } from '../../src/vehicles/CarVisual';
import type { VehiclePose } from '../../src/vehicles/types';

function makePose(brake: number, reversing = false): VehiclePose {
  return {
    position: { x: 2, y: 0.7, z: -3 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    brake,
    reversing,
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
    return Array.isArray(names)
      ? names.filter((name): name is string => typeof name === 'string')
      : [];
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

  it('gives every body archetype a distinct silhouette while keeping the sport hero unchanged', () => {
    const bodies = ['sport', 'muscle', 'supercar', 'sedan', 'suv'] as const;
    const sizes = new Map<(typeof bodies)[number], Vector3>();
    for (const body of bodies) {
      const car = new CarVisual(body);
      sizes.set(body, new Box3().setFromObject(car.root).getSize(new Vector3()));
      car.dispose();
    }

    // Every archetype produces a sane, non-empty envelope.
    for (const size of sizes.values()) {
      expect(size.x).toBeGreaterThan(0.4);
      expect(size.y).toBeGreaterThan(0.4);
      expect(size.z).toBeGreaterThan(0.4);
      expect(size.x).toBeLessThan(6);
      expect(size.y).toBeLessThan(6);
      expect(size.z).toBeLessThan(6);
    }

    // No two archetypes share the same envelope (distinct silhouettes). Width is
    // wheel-track-bound and shared, so the distinction comes from height + length.
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = sizes.get(bodies[i]!)!;
        const b = sizes.get(bodies[j]!)!;
        const delta = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
        expect(delta).toBeGreaterThan(0.06);
      }
    }

    // The SUV reads as the tallest and longest profile of all five.
    const suv = sizes.get('suv')!;
    for (const body of bodies) {
      if (body !== 'suv') {
        expect(suv.y).toBeGreaterThan(sizes.get(body)!.y);
        expect(suv.z).toBeGreaterThan(sizes.get(body)!.z);
      }
    }

    // The sport and supercar sit below the tall muscle / sedan / suv silhouettes.
    for (const low of ['sport', 'supercar'] as const) {
      for (const tall of ['muscle', 'sedan', 'suv'] as const) {
        expect(sizes.get(low)!.y).toBeLessThan(sizes.get(tall)!.y);
      }
    }

    // The default (sport) box stays inside the documented hero range.
    const hero = sizes.get('sport')!;
    expect(hero.x).toBeGreaterThan(1.6);
    expect(hero.x).toBeLessThan(2.1);
    expect(hero.y).toBeGreaterThan(1.3);
    expect(hero.y).toBeLessThan(2);
    expect(hero.z).toBeGreaterThan(3.8);
    expect(hero.z).toBeLessThan(4.6);
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

    // 12.4f: while reversing the brake key is the reverse throttle — the lamp must not
    // read as a full brake to traffic behind.
    car.sync(makePose(1, true));
    expect(brakeLamp.material.emissiveIntensity).toBeCloseTo(0.24, 6);
    car.dispose();
  });
});
