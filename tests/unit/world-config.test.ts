import { describe, expect, it } from 'vitest';
import { WORLD_CONFIG } from '../../src/config/world';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';

/**
 * World configuration invariants.
 *
 * `WORLD_CONFIG` is the single source for both the visual arena and the Rapier colliders, so these
 * checks guard the properties the physics world and the ground shader rely on.
 */
describe('world configuration', () => {
  it('uses a square ground with an integer color and a grid that tiles it exactly', () => {
    const { ground } = WORLD_CONFIG;
    expect(ground.size).toBeGreaterThan(0);
    expect(Number.isInteger(ground.color)).toBe(true);
    expect(ground.size % ground.grid.spacing).toBe(0);
    expect(ground.grid.lineWidth).toBeGreaterThan(0);
    expect(ground.grid.strength).toBeGreaterThan(0);
    expect(ground.grid.strength).toBeLessThanOrEqual(1);
    expect(ground.grid.fadeDistance).toBeGreaterThan(0);
    expect(ground.grid.fadeDistance).toBeLessThan(ground.size / 2);
  });

  it('puts the ground collider top face at y = 0', () => {
    // PhysicsWorld centers the ground box at -thickness / 2 so its top sits at the origin plane.
    expect(WORLD_CONFIG.ground.thickness).toBeGreaterThan(0.5);
  });

  it('defines obstacles that rest on or above the ground with unique ids', () => {
    const ids = new Set<string>();
    for (const obstacle of WORLD_CONFIG.obstacles) {
      expect(obstacle.id.length).toBeGreaterThan(0);
      expect(ids.has(obstacle.id)).toBe(false);
      ids.add(obstacle.id);

      const [x, y, z] = obstacle.position;
      const [sizeX, sizeY, sizeZ] = obstacle.size;
      for (const size of [sizeX, sizeY, sizeZ]) {
        expect(size).toBeGreaterThan(0);
      }
      for (const coordinate of [x, y, z]) {
        expect(Number.isFinite(coordinate)).toBe(true);
      }
      // Bottom face at or above the ground plane.
      expect(y - sizeY / 2).toBeGreaterThanOrEqual(0);
      // Inside the ground footprint, so nothing floats over the void.
      expect(Math.abs(x) + sizeX / 2).toBeLessThan(WORLD_CONFIG.ground.size / 2);
      expect(Math.abs(z) + sizeZ / 2).toBeLessThan(WORLD_CONFIG.ground.size / 2);
      expect(Number.isInteger(obstacle.color)).toBe(true);
    }
    expect(WORLD_CONFIG.obstacles.length).toBeGreaterThan(0);
  });

  it('keeps collision material properties physical', () => {
    expect(WORLD_CONFIG.friction).toBeGreaterThan(0);
    expect(WORLD_CONFIG.friction).toBeLessThanOrEqual(1.5);
    expect(WORLD_CONFIG.restitution).toBeGreaterThanOrEqual(0);
    expect(WORLD_CONFIG.restitution).toBeLessThan(0.5);
  });

  it('spawns the car above the ground plane with the wheels close to contact', () => {
    const [x, y, z] = VEHICLE_CONFIG.spawn.position;
    expect(y).toBeGreaterThan(0.5);
    expect(Math.abs(x)).toBeLessThan(WORLD_CONFIG.ground.size / 2);
    expect(Math.abs(z)).toBeLessThan(WORLD_CONFIG.ground.size / 2);
    // Spawn height is a short drop onto the suspension, not a fall from the sky.
    const contactHeight = VEHICLE_CONFIG.wheels.radius + VEHICLE_CONFIG.wheels.restLength;
    expect(y - contactHeight).toBeLessThan(0.6);
    expect(y).toBeGreaterThan(contactHeight - 0.2);
  });

  it('keeps the vehicle clear of the arena obstacles at spawn', () => {
    const [spawnX, , spawnZ] = VEHICLE_CONFIG.spawn.position;
    const [halfWidth, , halfLength] = VEHICLE_CONFIG.chassis.halfExtents;
    for (const obstacle of WORLD_CONFIG.obstacles) {
      const [x, y, z] = obstacle.position;
      const [sizeX, sizeY, sizeZ] = obstacle.size;
      const overlapsX = Math.abs(x - spawnX) < sizeX / 2 + halfWidth;
      const overlapsZ = Math.abs(z - spawnZ) < sizeZ / 2 + halfLength;
      const overlapsY = y - sizeY / 2 < halfWidth * 2;
      expect(overlapsX && overlapsZ && overlapsY).toBe(false);
    }
  });
});
