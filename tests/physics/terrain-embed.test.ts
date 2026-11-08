import { beforeAll, describe, expect, it } from 'vitest';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { Car } from '../../src/vehicles/Car';

/**
 * The terrain heightfield is a one-way surface: the car rides it, but nothing blocks entry
 * from the side. The anti-embedding pass projects the body back onto the surface when it has
 * sunk below — the guarantee that keeps the car (and the camera behind it) out of the
 * "hollow mountain" where only culled backfaces remain.
 */

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

describe('terrain anti-embedding', () => {
  it('leaves a grounded car alone', () => {
    const physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(createTerrainSampler(TERRAIN_CONFIG));
    physics.syncTerrain({ x: 0, y: 0, z: 0 });
    const surface = createTerrainSampler(TERRAIN_CONFIG);
    const car = new Car({
      rapier,
      physics,
      spawnPosition: [0, surface.heightAt(0, 0) + 0.7, 0],
      spawnYaw: 0,
    });
    // Settle a few frames so the suspension rests on the ground.
    for (let i = 0; i < 90; i += 1) {
      physics.update(1 / 60);
    }
    const restingY = car.body.translation().y;
    expect(car.liftOutOfTerrain(surface, { x: 0, z: 0 })).toBe(false);
    expect(car.body.translation().y).toBe(restingY);
    car.dispose();
    physics.dispose();
  });

  it('projects a body sunk into the ground back onto the surface and kills the dive', () => {
    const physics = new PhysicsWorld({ rapier });
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    physics.enableTerrain(sampler);
    physics.syncTerrain({ x: 0, y: 0, z: 0 });
    const ground = sampler.heightAt(0, 0);
    const car = new Car({
      rapier,
      physics,
      spawnPosition: [0, ground + 0.7, 0],
      spawnYaw: 0,
    });
    // Simulate the failure mode: the chassis ends up inside the terrain (a car that has
    // been leaning into a cliff face until it clipped below the surface).
    car.body.setTranslation({ x: 0, y: ground - 1.2, z: 0 }, true);
    car.body.setLinvel({ x: 0, y: -8, z: 0 }, true);

    expect(car.liftOutOfTerrain(sampler, { x: 0, z: 0 })).toBe(true);
    const lifted = car.body.translation().y;
    // The body sits at the tolerance above the surface (not deeper, not floating).
    expect(lifted).toBeGreaterThanOrEqual(ground + 0.1);
    expect(lifted).toBeLessThanOrEqual(ground + 0.2);
    // The downward velocity into the ground is gone; nothing new was added sideways.
    const linvel = car.body.linvel();
    expect(linvel.y).toBeGreaterThanOrEqual(-0.001);
    expect(Math.abs(linvel.x)).toBeLessThan(0.001);

    // The invariant, checked where it matters: both sample points (centre and the front
    // overhang, on possibly different ground heights) are clear of the surface.
    const restingY = car.body.translation().y;
    expect(restingY).toBeGreaterThanOrEqual(sampler.heightAt(0, 0) + 0.11);
    expect(restingY).toBeGreaterThanOrEqual(sampler.heightAt(0, -2.05) + 0.11);
    car.dispose();
    physics.dispose();
  });

  it('honours the floating-origin offset when querying the terrain', () => {
    const physics = new PhysicsWorld({ rapier });
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    physics.enableTerrain(sampler);
    const offset = { x: 120, z: -60 };
    physics.setOriginOffset(offset.x, offset.z);
    const car = new Car({
      rapier,
      physics,
      spawnPosition: [0, 1, 0],
      spawnYaw: 0,
    });
    // The body at physics-space (0, y, 0) stands on the terrain at world (120, y, -60).
    const worldGround = sampler.heightAt(offset.x, offset.z);
    car.body.setTranslation({ x: 0, y: worldGround - 1.0, z: 0 }, true);
    expect(car.liftOutOfTerrain(sampler, offset)).toBe(true);
    expect(car.body.translation().y).toBeGreaterThanOrEqual(worldGround + 0.1);
    car.dispose();
    physics.dispose();
  });
});
