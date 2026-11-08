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

  // Phase 10 pass 4: the garage pits (rotated rounded rectangles). Unlike the hideout
  // bowls they live in the BASE height — the garage aisle roads run ON the pit floor,
  // so the carve blends from the pit floor up to the level decks, and the ground
  // outside the aisles is the pit itself.
  const garagePits = network.garages.map((garage) => garage.pit);
  /**
   * Depth to remove so the pit bottom is a flat plane at `pit.floorY`. Where the natural
   * ground is already at or below the floor, nothing is removed (the floor never rises
   * above the terrain). `natural` is the road-free base height at (x, z).
   */
  const garagePitDepthAt = (x: number, z: number, natural: number): number => {
    let depth = 0;
    for (const pit of garagePits) {
      const sin = Math.sin(pit.yaw);
      const cos = Math.cos(pit.yaw);
      const wx = x - pit.x;
      const wz = z - pit.z;
      // Local coords: +z along the ramp direction (yaw), +x to its left.
      const lz = wx * sin + wz * cos;
      const lx = wx * -cos + wz * sin;
      const qx = Math.abs(lx) - (pit.halfWidth - pit.rounding);
      const qz = Math.abs(lz) - (pit.halfDepth - pit.rounding);
      const sdf =
        Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - pit.rounding;
      // sdf <= 0 inside; the carve fades to zero `fade` metres outside the edge.
      let t = -sdf;
      if (t <= 0) {
        t = 1 + t / pit.fade;
        if (t <= 0) continue;
      } else {
        t = 1;
      }
      const blend = t * t * (3 - 2 * t);
      depth = Math.max(depth, Math.max(0, natural - pit.floorY) * blend);
    }
    return depth;
  };

  // Phase 10 pass 4: the entrance ramp is authoritative. It runs alongside its
  // entrance street in the grid cities, so where the ramp corridor overlaps a street
  // the ramp profile wins and the descent slot is carved out of the deck. The aisles
  // sit at pit-floor level (their carve is a no-op) and never override a street.
  const GARAGE_RAMP_HALF_WIDTH = 2.6;
  const GARAGE_RAMP_SHOULDER = 0.8;
  const GARAGE_RAMP_CORRIDOR_METERS = GARAGE_RAMP_HALF_WIDTH + GARAGE_RAMP_SHOULDER + 1.2;
  // The network's 30 m blend would mound the pit floor around the ramp; the ramp
  // gets a crisp 10 m transition instead (a slot with walls, not a hill).
  const GARAGE_RAMP_BLEND_METERS = 10;
  const garageRampEdges = network.edges.filter(
    (edge) => edge.roadClass === 'garage' && edge.id.endsWith('-ramp'),
  );
  const nearAnyGarage = (x: number, z: number): boolean => {
    for (const garage of network.garages) {
      if (Math.abs(x - garage.x) < 90 && Math.abs(z - garage.z) < 110) {
        return true;
      }
    }
    return false;
  };
  const garageProfileAt = (x: number, z: number): { y: number; distance: number } | null => {
    let best: { y: number; distance: number } | null = null;
    for (const edge of garageRampEdges) {
      const pts = edge.points;
      for (let i = 1; i < pts.length; i += 1) {
        const p0 = pts[i - 1]!;
        const p1 = pts[i]!;
        const abx = p1.x - p0.x;
        const abz = p1.z - p0.z;
        const len2 = abx * abx + abz * abz;
        if (len2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((x - p0.x) * abx + (z - p0.z) * abz) / len2));
        const px = p0.x + abx * t;
        const pz = p0.z + abz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d > GARAGE_RAMP_CORRIDOR_METERS) continue;
        const y = p0.y + (p1.y - p0.y) * t;
        if (best === null || d < best.distance) {
          best = { y, distance: d };
        }
      }
    }
    return best;
  };

  const garageInfluence = (
    distance: number,
    halfWidthMeters: number,
    shoulderMeters: number,
  ): number => {
    const flat = halfWidthMeters + shoulderMeters;
    if (distance <= flat) return 1;
    if (distance >= GARAGE_RAMP_BLEND_METERS) return 0;
    const t = (distance - flat) / (GARAGE_RAMP_BLEND_METERS - flat);
    const smooth = t * t * (3 - 2 * t);
    return 1 - smooth;
  };

  const heightAt = (x: number, z: number): number => {
    let road = network.sample(x, z);
    // Phase 10 pass 4: the garage pits are part of the base (the aisle roads run on the
    // pit floor); the hideout bowls are still subtracted after the carve (roads pass
    // over them as causeways).
    const natural = baseHeightAt(x, z);
    const baseHeight = natural - garagePitDepthAt(x, z, natural);
    // Phase 10 pass 4: garage surfaces are authoritative. The entrance ramp runs
    // alongside its street in the grid cities, so where a garage edge overlaps a
    // street corridor the garage profile wins instead of the two carves alternating.
    if (road?.roadClass !== 'garage' && nearAnyGarage(x, z)) {
      const garage = garageProfileAt(x, z);
      if (garage !== null) {
        road = {
          ...(road ?? {
            distance: garage.distance,
            elevation: garage.y,
            edgeId: 'garage-ramp',
            halfWidthMeters: GARAGE_RAMP_HALF_WIDTH,
            shoulderMeters: GARAGE_RAMP_SHOULDER,
            onBridge: false,
          }),
          distance: garage.distance,
          elevation: garage.y,
          roadClass: 'garage' as const,
          halfWidthMeters: GARAGE_RAMP_HALF_WIDTH,
          shoulderMeters: GARAGE_RAMP_SHOULDER,
          onBridge: false,
        };
      }
    }
    let height: number;
    if (road === null) {
      height = baseHeight;
    } else {
      // Phase 10 pass 4: garage edges (the ramp) blend over a short distance so the
      // slot stays crisp; every other road uses the network's wide blend.
      const influence =
        road.roadClass === 'garage'
          ? garageInfluence(road.distance, road.halfWidthMeters, road.shoulderMeters)
          : roadInfluence(roadConfig, road.distance, road.halfWidthMeters, road.shoulderMeters);
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
    plateau,
    pits,
  };
}
