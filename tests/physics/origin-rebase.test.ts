import { beforeAll, describe, expect, it } from 'vitest';

import { ORIGIN_CONFIG } from '../../src/config/origin';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { OriginManager } from '../../src/world/origin';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import { Car } from '../../src/vehicles/Car';

/**
 * Floating-origin rebase, integrated: drive the exact sequence the application
 * runs each frame (step → maybe slide → sync by world focus) across a rebase
 * boundary and require the car to notice nothing — same world position, same
 * ground beneath it, all four wheels down. Also pins that colliders are placed
 * in local space while the planning window lives in world space.
 */

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

describe('origin rebase', () => {
  it('keeps the car grounded and world-anchored across a slide', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(sampler);
    const car = new Car({ rapier, physics });

    // Settle the car at world x = 2600 (past the 2048 m rebase threshold), in an
    // epoch where local and world still agree.
    const startY = sampler.heightAt(2600, 0);
    car.reset([2600, startY + 0.7, 0], 0);
    for (let i = 0; i < 90; i += 1) {
      physics.syncTerrain({ x: 2600, y: 0, z: 0 });
      physics.update(1 / 60);
    }
    expect(car.telemetry.contactCount).toBe(4);
    const worldBefore = car.position.x;

    // The application frame: slide, then keep syncing by world focus.
    const origin = new OriginManager(ORIGIN_CONFIG);
    const shift = origin.update(car.position.x, car.position.z);
    expect(shift).not.toBeNull();
    car.shiftBy(shift!.dx, shift!.dz);
    physics.setOriginOffset(origin.offset.x, origin.offset.z);
    for (let i = 0; i < 90; i += 1) {
      physics.syncTerrain({ x: origin.worldFromLocalX(car.position.x), y: 0, z: 0 });
      physics.update(1 / 60);
    }

    expect(physics.originOffset.x).toBe(origin.offset.x);
    // Same place in the world (within slope-creep), small numbers locally, and
    // still standing on the ground at ride height rather than sunk or falling.
    expect(origin.worldFromLocalX(car.position.x)).toBeCloseTo(worldBefore, 0);
    expect(Math.abs(car.position.x)).toBeLessThanOrEqual(64);
    expect(car.telemetry.contactCount).toBe(4);
    const groundHere = sampler.heightAt(
      origin.worldFromLocalX(car.position.x),
      origin.worldFromLocalZ(car.position.z),
    );
    expect(car.position.y).toBeGreaterThan(groundHere - 0.2);
    expect(car.position.y).toBeLessThan(groundHere + 1.2);
    expect(physics.terrainColliderChunks).toBeGreaterThan(0);

    // The surface query speaks local coordinates and answers for the world spot:
    // identical verdict to sampling the world position directly.
    const surface = physics.surfaceAt(car.position.x, car.position.z);
    const expected = sampleTerrainSurface(
      sampler,
      origin.worldFromLocalX(car.position.x),
      origin.worldFromLocalZ(car.position.z),
    );
    expect(surface).not.toBeNull();
    expect(surface!.id).toBe(expected.id);
    expect(surface!.gripModifier).toBeCloseTo(expected.gripModifier, 6);
    car.dispose();
    physics.dispose();
  });

  it('places pre-slide colliders under the world window after the offset moves first', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(sampler);
    // Origin already slid (as if the car teleported far): colliders for the world
    // window around x=2600 must land at local x≈52, not at 2600.
    physics.setOriginOffset(2560, 0);
    physics.syncTerrain({ x: 2600, y: 0, z: 0 });
    physics.update(1 / 60);
    const ray = new rapier.Ray({ x: 52, y: 400, z: 0 }, { x: 0, y: -1, z: 0 });
    const hit = physics.world.castRay(ray, 800, true);
    expect(hit).not.toBeNull();
    // Local x=52 under a 2560 m slide is world x=2612; the heightfield's triangles
    // interpolate the sampler on a 4 m grid, hence the sub-metre tolerance.
    expect(400 - hit!.timeOfImpact).toBeCloseTo(sampler.heightAt(2612, 0), 0.75);
    physics.dispose();
  });
});
