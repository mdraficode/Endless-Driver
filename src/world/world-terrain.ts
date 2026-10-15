import type { TerrainConfig } from '../config/terrain';
import type { RoadNetworkConfig } from '../config/roads';
import { createTerrainSampler, terrainNormalAt, type TerrainSampler } from './terrain-height';
import { buildRoadNetwork, roadInfluence } from './road-network';

/**
 * The world sampler the game actually uses: base terrain with the road network carved in.
 *
 * Carving lives in the height function itself — not in a visual trick — so the heightfield
 * colliders, the chunk meshes, and the surface query all see the same flattened,
 * grade-limited road corridor. `createTerrainSampler` stays road-free for tests and for
 * any future biome that has no roads; the composition happens here, once, in Application.
 */
export function createWorldTerrainSampler(
  terrainConfig: TerrainConfig,
  roadConfig: RoadNetworkConfig,
): TerrainSampler {
  const base = createTerrainSampler(terrainConfig);
  const network = buildRoadNetwork(roadConfig, (x, z) => base.heightAt(x, z));

  const heightAt = (x: number, z: number): number => {
    const road = network.sample(x, z);
    const baseHeight = base.heightAt(x, z);
    if (road === null) {
      return baseHeight;
    }
    const influence = roadInfluence(roadConfig, road.distance);
    if (influence <= 0) {
      return baseHeight;
    }
    return baseHeight + (road.elevation - baseHeight) * influence;
  };

  return {
    heightAt,
    normalAt: (x: number, z: number) => terrainNormalAt(heightAt, x, z),
    config: terrainConfig,
    roadAt: (x: number, z: number) => network.sample(x, z),
    roadNetwork: network,
  };
}
