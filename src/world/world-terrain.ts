import type { TerrainConfig } from '../config/terrain';
import type { RoadNetworkConfig } from '../config/roads';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import { createTerrainSampler, terrainNormalAt, type TerrainSampler } from './terrain-height';
import { buildRoadNetwork, roadInfluence } from './road-network';

/** Phase 10 pass 2: the flat deck shelf extends this many metres past the shoulder. */
const BRIDGE_DECK_SHOULDER_EXTRA = 5;

export interface CityPlateau {
  readonly x: number;
  readonly z: number;
  readonly flatRadiusMeters: number;
  readonly blendRadiusMeters: number;
}

/**
 * The world sampler the game actually uses: base terrain with the road network carved in.
 *
 * Carving lives in the height function itself — not in a visual trick — so the heightfield
 * colliders, the chunk meshes, and the surface query all see the same flattened,
 * grade-limited road corridor. `createTerrainSampler` stays road-free for tests and for
 * any future biome that has no roads; the composition happens here, once, in Application.
 *
 * `cityPlateau` moves the levelled urban core (Phase 10: the generated home city); omitted,
 * it stays at the hand-placed Aohara position so existing callers keep today's behaviour.
 */
export interface TerrainPit {
  readonly x: number;
  readonly z: number;
  readonly radiusMeters: number;
  readonly depthMeters: number;
}

/**
 * `pits` (Phase 10.2): local depressions carved out of the heightfield — the sunken garage
 * floors. Applied after the road carve so a road can never dip through a pit.
 */
export function createWorldTerrainSampler(
  terrainConfig: TerrainConfig,
  roadConfig: RoadNetworkConfig,
  cityPlateau?: CityPlateau,
  pits: readonly TerrainPit[] = [],
): TerrainSampler {
  const plateau: CityPlateau = cityPlateau ?? {
    x: AOHARA_DISTRICT_CONFIG.centerX,
    z: AOHARA_DISTRICT_CONFIG.centerZ,
    flatRadiusMeters: AOHARA_DISTRICT_CONFIG.flatRadiusMeters,
    blendRadiusMeters: AOHARA_DISTRICT_CONFIG.terrainBlendRadiusMeters,
  };
  // The country elevation fades out around the city anchor so the plateau blend never meets
  // a cliff ring; the base sampler is rebuilt with the fade centred on the real city.
  const base = createTerrainSampler({
    ...terrainConfig,
    elevationFadeCenter: [plateau.x, plateau.z],
  });
  const cityElevation = base.heightAt(plateau.x, plateau.z);
  // The city core is a bounded graded plain, not a second terrain/physics surface. A smooth
  // radial transition restores the original seeded heightfield before the district edge.
  const baseHeightAt = (x: number, z: number): number => {
    const distance = Math.hypot(x - plateau.x, z - plateau.z);
    if (distance <= plateau.flatRadiusMeters) {
      return cityElevation;
    }
    const naturalHeight = base.heightAt(x, z);
    if (distance >= plateau.blendRadiusMeters) {
      return naturalHeight;
    }
    const t =
      (distance - plateau.flatRadiusMeters) /
      (plateau.blendRadiusMeters - plateau.flatRadiusMeters);
    const blend = t * t * (3 - 2 * t);
    return cityElevation + (naturalHeight - cityElevation) * blend;
  };
  const network = buildRoadNetwork(roadConfig, baseHeightAt);

  const pitDepthAt = (x: number, z: number): number => {
    let depth = 0;
    for (const pit of pits) {
      const distance = Math.hypot(x - pit.x, z - pit.z);
      if (distance >= pit.radiusMeters) {
        continue;
      }
      // Full depth at the centre, smooth rim out to the radius.
      const t = distance / pit.radiusMeters;
      const blend = (1 - t) * (1 - t) * (3 - 2 * (1 - t));
      depth = Math.max(depth, pit.depthMeters * blend);
    }
    return depth;
  };

  const heightAt = (x: number, z: number): number => {
    const road = network.sample(x, z);
    const baseHeight = baseHeightAt(x, z);
    let height: number;
    if (road === null) {
      height = baseHeight;
    } else {
      const influence = roadInfluence(
        roadConfig,
        road.distance,
        road.halfWidthMeters,
        road.shoulderMeters,
      );
      if (influence <= 0) {
        height = baseHeight;
      } else {
        height = baseHeight + (road.elevation - baseHeight) * influence;
      }
      // Phase 10 pass 2: a bridge deck reads as a structure — the flat shelf extends a
      // few metres past the shoulder before blending back to the natural valley, while
      // the height under the road stays the deck (the physics surface the car rides).
      if (road.onBridge) {
        const deckInfluence = roadInfluence(
          roadConfig,
          road.distance,
          road.halfWidthMeters,
          road.shoulderMeters + BRIDGE_DECK_SHOULDER_EXTRA,
        );
        if (deckInfluence > influence) {
          height = baseHeight + (road.elevation - baseHeight) * deckInfluence;
        }
      }
    }
    if (pits.length > 0) {
      height -= pitDepthAt(x, z);
    }
    return height;
  };

  return {
    heightAt,
    normalAt: (x: number, z: number) => terrainNormalAt(heightAt, x, z),
    config: terrainConfig,
    roadAt: (x: number, z: number) => network.sample(x, z),
    roadNetwork: network,
  };
}
