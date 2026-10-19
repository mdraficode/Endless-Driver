import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { DEFAULT_SPAWN_ID, SPAWN_POINTS, resolveSpawnPoint } from '../../src/config/spawns';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { terrainSurfaceWeights } from '../../src/world/terrain-height';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

/**
 * Session starts: Aohara is the default; rural Hinode starts remain available
 * explicitly and through `?spawn=random`. All curated starts sit in different
 * districts, on drivable road (except the home meadow's flat pad), and never on snow.
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

  it('starts at Aohara by default, honours pinned ids, and keeps explicit random rotation', () => {
    expect(resolveSpawnPoint(undefined, 0).id).toBe(DEFAULT_SPAWN_ID);
    expect(resolveSpawnPoint(undefined, 0.99).id).toBe(DEFAULT_SPAWN_ID);
    expect(resolveSpawnPoint('Kiri-cedar', 0).id).toBe('Kiri-cedar');
    expect(resolveSpawnPoint('yuhi-town', 0.99).id).toBe('yuhi-town');
    expect(resolveSpawnPoint('aohara-city', 0.5).id).toBe('aohara-city');
    const picked = new Set<string>();
    for (let step = 0; step < SPAWN_POINTS.length; step += 1) {
      picked.add(resolveSpawnPoint('random', step / SPAWN_POINTS.length).id);
    }
    expect(picked.size).toBe(SPAWN_POINTS.length);
    // Unknown ids safely fall back to the requested default district.
    expect(resolveSpawnPoint('atlantis', 0).id).toBe(DEFAULT_SPAWN_ID);
  });

  it('places the default start on Aohara Central Avenue, away from the junction center', () => {
    const city = resolveSpawnPoint(undefined, 0);
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const road = sampler.roadAt?.(city.x, city.z);
    expect(city.id).toBe(DEFAULT_SPAWN_ID);
    expect(road?.roadClass).toBe('urban-arterial');
    expect(
      Math.hypot(city.x - AOHARA_DISTRICT_CONFIG.centerX, city.z - AOHARA_DISTRICT_CONFIG.centerZ),
    ).toBeCloseTo(AOHARA_DISTRICT_CONFIG.gridSpacingMeters / 2, 5);
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
