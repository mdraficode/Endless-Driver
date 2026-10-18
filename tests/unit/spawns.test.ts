import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { SPAWN_POINTS, resolveSpawnPoint } from '../../src/config/spawns';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { terrainSurfaceWeights } from '../../src/world/terrain-height';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

/**
 * Session starts: the car must not always wake up on the same terrain. The
 * curated starts sit in different districts, on drivable road (except the
 * home meadow's flat pad), and never on snow.
 */
describe('session spawn points', () => {
  it('offers starts in several different places, all on drivable ground', () => {
    expect(SPAWN_POINTS.length).toBeGreaterThanOrEqual(5);
    const ids = new Set(SPAWN_POINTS.map((point) => point.id));
    expect(ids.size).toBe(SPAWN_POINTS.length);
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    for (const point of SPAWN_POINTS) {
      const surface = sampleTerrainSurface(sampler, point.x, point.z);
      // Never a snow start, whatever the season of the player's first load.
      expect(surface.weights[3]).toBeLessThan(0.5);
      if (point.id !== 'home-meadow') {
        // Road starts: the pavement itself, not a verge or a field.
        expect(surface.id).toBe('asphalt');
      } else {
        expect(surface.id).toBe('grass');
      }
    }
  });

  it('pins a requested start and otherwise spreads the pick across all starts', () => {
    expect(resolveSpawnPoint('Kiri-cedar', 0).id).toBe('Kiri-cedar');
    expect(resolveSpawnPoint('yuhi-town', 0.99).id).toBe('yuhi-town');
    const picked = new Set<string>();
    for (let step = 0; step < SPAWN_POINTS.length; step += 1) {
      picked.add(resolveSpawnPoint(undefined, step / SPAWN_POINTS.length).id);
    }
    expect(picked.size).toBe(SPAWN_POINTS.length);
    // Unknown ids fall back to the session pick instead of crashing the boot.
    expect(resolveSpawnPoint('atlantis', 0).id).toBe(SPAWN_POINTS[0]!.id);
  });

  describe('spawn views contain no snow ground', () => {
    // A start's point being snow-free is not enough: the whole 360-degree camera
    // view must remain green/soil/rock. Snow is removed from gameplay terrain entirely.
    it('keeps the reserved snow splat at zero within 250 m of every start', () => {
      const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
      for (const spawn of SPAWN_POINTS) {
        for (let x = spawn.x - 250; x <= spawn.x + 250; x += 25) {
          for (let z = spawn.z - 250; z <= spawn.z + 250; z += 25) {
            const height = sampler.heightAt(x, z);
            const slope = 1 - sampler.normalAt(x, z).y;
            const weights = terrainSurfaceWeights(TERRAIN_CONFIG, height, slope, 0, 0);
            expect(weights[3], `${spawn.id} at (${x}, ${z})`).toBe(0);
          }
        }
      }
    });
  });
});
