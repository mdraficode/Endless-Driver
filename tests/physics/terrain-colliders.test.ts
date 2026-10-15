import { beforeAll, describe, expect, it } from 'vitest';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { createTerrainSampler } from '../../src/world/terrain-height';

/**
 * Physics heightfield contracts: the collider window exists where the planner says, and
 * Rapier's heightfield orientation matches the sampler — a ray cast down must meet the
 * ground at the height the visual chunks draw. This is the test that pins the heightfield
 * axis convention empirically instead of trusting documentation readings.
 */

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

/** Rapier answers queries from the pipeline built by the last step: step once after syncing. */
function syncAndStep(physics: PhysicsWorld, x: number, z: number): void {
  physics.syncTerrain({ x, y: 0, z });
  physics.update(1 / 60);
}

function raycastGroundHeight(physics: PhysicsWorld, x: number, z: number): number | null {
  const ray = new rapier.Ray({ x, y: 400, z }, { x: 0, y: -1, z: 0 });
  const hit = physics.world.castRay(ray, 800, true);
  return hit === null ? null : 400 - hit.timeOfImpact;
}

describe('terrain heightfield colliders', () => {
  it('builds the 3x3 window and slides it with the focus', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(sampler);
    syncAndStep(physics, 0, 0);
    expect(physics.terrainColliderChunks).toBe(9);
    // Same window again: no churn.
    syncAndStep(physics, 40, -30);
    expect(physics.terrainColliderChunks).toBe(9);
    // Three chunks east: the window slides, still 3x3.
    syncAndStep(physics, 400, 0);
    expect(physics.terrainColliderChunks).toBe(9);
    expect(raycastGroundHeight(physics, 400, 0)).not.toBeNull();
    expect(raycastGroundHeight(physics, 0, 0)).toBeNull();
    physics.dispose();
  });

  it('meets downward rays at the sampled height (axis convention)', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(sampler);
    syncAndStep(physics, 300, -300);
    // Probes inside the window, off the plateau where the ground actually rolls. The
    // heightfield is a triangle mesh at 2 m spacing, so agreement is within the
    // interpolation slack of the smooth sampler, not bit-exact.
    for (const [x, z] of [
      [300, -300],
      [260.5, -341.25],
      [390, -210],
      [205, -395],
    ] as const) {
      const hit = raycastGroundHeight(physics, x, z);
      expect(hit).not.toBeNull();
      expect(Math.abs((hit ?? 0) - sampler.heightAt(x, z))).toBeLessThan(0.6);
    }
    physics.dispose();
  });

  it('holds the car spawn plateau at exactly y=0', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const physics = new PhysicsWorld({ rapier });
    physics.enableTerrain(sampler);
    syncAndStep(physics, 0, 0);
    expect(raycastGroundHeight(physics, 0, 0)).toBeCloseTo(0, 3);
    expect(raycastGroundHeight(physics, 25, -18)).toBeCloseTo(0, 3);
    physics.dispose();
  });
});
