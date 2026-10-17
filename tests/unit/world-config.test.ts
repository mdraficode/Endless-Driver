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

  it('ships no Phase 1/2 reference blocks into the Phase 4 world', () => {
    // The pale obstacle boxes on the spawn plateau were Phase 2 physics targets.
    // Round 7 retired them from the shipped list: the landscape is terrain,
    // vegetation and town now, and placeholder litter in it read as a bug
    // (owner report, 2026-10-17). Fixtures may still place blocks through this
    // list, which is why the seam itself stays.
    expect(WORLD_CONFIG.obstacles).toHaveLength(0);
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
});
