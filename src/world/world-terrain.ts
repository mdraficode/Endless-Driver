import type { TerrainConfig } from '../config/terrain';
import type { RoadNetworkConfig } from '../config/roads';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
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
  const cityElevation = base.heightAt(
    AOHARA_DISTRICT_CONFIG.centerX,
    AOHARA_DISTRICT_CONFIG.centerZ,
  );
  // The city core is a bounded graded plain, not a second terrain/physics surface. A smooth
  // radial transition restores the original seeded Hinode heightfield before the district edge.
  const baseHeightAt = (x: number, z: number): number => {
    const distance = Math.hypot(
      x - AOHARA_DISTRICT_CONFIG.centerX,
      z - AOHARA_DISTRICT_CONFIG.centerZ,
    );
    if (distance <= AOHARA_DISTRICT_CONFIG.flatRadiusMeters) {
      return cityElevation;
    }
    const naturalHeight = base.heightAt(x, z);
    if (distance >= AOHARA_DISTRICT_CONFIG.terrainBlendRadiusMeters) {
      return naturalHeight;
    }
    const t =
      (distance - AOHARA_DISTRICT_CONFIG.flatRadiusMeters) /
      (AOHARA_DISTRICT_CONFIG.terrainBlendRadiusMeters - AOHARA_DISTRICT_CONFIG.flatRadiusMeters);
    const blend = t * t * (3 - 2 * t);
    return cityElevation + (naturalHeight - cityElevation) * blend;
  };
  const network = buildRoadNetwork(roadConfig, baseHeightAt);

  const heightAt = (x: number, z: number): number => {
    const road = network.sample(x, z);
    const baseHeight = baseHeightAt(x, z);
    if (road === null) {
      return baseHeight;
    }
    const influence = roadInfluence(
      roadConfig,
      road.distance,
      road.halfWidthMeters,
      road.shoulderMeters,
    );
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
