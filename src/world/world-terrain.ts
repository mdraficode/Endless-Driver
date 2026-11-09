import type { TerrainConfig } from '../config/terrain';
import type { RoadNetworkConfig } from '../config/roads';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import { createTerrainSampler, terrainNormalAt, type TerrainSampler } from './terrain-height';
import { buildRoadNetwork, roadInfluence, type RoadSample } from './road-network';

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
  let network = buildRoadNetwork(roadConfig, baseHeightAt);

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

  // Phase 11.1: the pit rectangles (SDF-rounded boxes in local coords) — the carve must
  // not lift the pit floor: inside a pit the ground stays at the base (pit) height, and
  // street blends from the rim never mound the floor.
  const insidePitAt = (x: number, z: number): boolean => {
    for (const pit of garagePits) {
      const sin = Math.sin(pit.yaw);
      const cos = Math.cos(pit.yaw);
      const wx = x - pit.x;
      const wz = z - pit.z;
      const lz = wx * sin + wz * cos;
      const lx = wx * -cos + wz * sin;
      if (Math.abs(lx) < pit.halfWidth + 4 && Math.abs(lz) < pit.halfDepth + 4) {
        return true;
      }
    }
    return false;
  };

  const heightAt = (x: number, z: number): number => {
    // Phase 10 pass 4: the garage pits are part of the base (the aisle roads run on the
    // pit floor); the hideout bowls are still subtracted after the carve (roads pass
    // over them as causeways).
    const natural = baseHeightAt(x, z);
    const baseHeight = natural - garagePitDepthAt(x, z, natural);
    // Phase 10 pass 4: garage surfaces are authoritative. The entrance ramp runs
    // alongside its street in the grid cities, so where a garage edge overlaps a
    // street corridor the garage profile wins instead of the two carves alternating.
    const road = network.sample(x, z);
    if (nearAnyGarage(x, z)) {
      const garage = garageProfileAt(x, z);
      if (garage !== null) {
        // A street whose own pavement contains this point stays authoritative
        // over the garage blend. On the co-linear driveway the street's
        // centreline ties the ramp's in distance; letting the ramp win would
        // sink the ground under the street it runs alongside (a floating
        // ribbon at the severance). The frontage cut ends the street at the
        // 18 m apron; past that the ramp owns the surface again.
        let owned: number | null = null;
        let ownedDist = Infinity;
        for (const r of network.sampleAll(x, z)) {
          if (r.roadClass === 'garage') continue;
          if (
            r.distance <= r.halfWidthMeters + r.shoulderMeters &&
            r.distance <= garage.distance &&
            r.distance < ownedDist
          ) {
            owned = r.elevation;
            ownedDist = r.distance;
          }
        }
        // Phase 11.0a: a street crossing the ramp's DESCENT must not hold its level
        // across the ramp corridor. The ramp is a structure — it drops LEVEL_DROP
        // (5 m) from street level into the pit; a street pavement at street height
        // over a descending ramp buries the ramp ribbon (a visible step at the
        // entrance). The co-linear driveway case the street-wins rule was written for
        // is level: the ramp there sits at street height, so the descent test is
        // false and the driveway keeps its pavement.
        if (owned !== null && garage.y < owned - 0.5) {
          owned = null;
        }
        if (owned !== null) {
          if (pits.length > 0) {
            return owned - pitDepthAt(x, z);
          }
          return owned;
        }
        const onRampPavement =
          road !== null && road.roadClass === 'garage' && road.edgeId.endsWith('-ramp');
        const influence = onRampPavement
          ? 1
          : garageInfluence(garage.distance, GARAGE_RAMP_HALF_WIDTH, GARAGE_RAMP_SHOULDER);
        const height =
          influence <= 0 ? baseHeight : baseHeight + (garage.y - baseHeight) * influence;
        if (pits.length > 0) {
          return height - pitDepthAt(x, z);
        }
        return height;
      }
    }
    // Phase 11.1 — the union carve. The old single-nearest carve let two ribbons
    // disagree: at a point inside several influence ranges only the nearest
    // centreline's profile shaped the ground, so a 30 m-parallel street six metres
    // lower sank the ground under the higher road (a floating ribbon) and a crossing
    // street cut a slot through the other's embankment at the ribbon level of the
    // lower road.
    //
    // The carve is now sequential, highest road first: each candidate pulls the
    // current ground toward its own surface over its influence. The highest ribbon
    // owns the surface; a lower ribbon crossing it cuts its channel into that
    // surface (the layout's crossing-junction pass keeps crossing streets at one
    // elevation, so in practice the pulls agree); a lower ribbon merely parallel to
    // a higher one keeps its own channel without touching the higher road's ground.
    // Garage-class ribbons are excluded — the ramp/aisle surfaces are owned by the
    // authority branch above (their wide blends would mound the pit floor).
    // The primary ribbon: the closest candidate, full tip semantics — its profile
    // owns the surface exactly (embankment where it is above the ground, cut channel
    // where below). sampleAll matters off the pavement: beyond the nearest ribbon's
    // shoulder a *higher* neighbouring ribbon's embankment can still reach the point,
    // and the union keeps the upper envelope there (the single-nearest carve let a
    // 30 m-parallel street sink the ground under the higher road).
    // One candidate per edge: a winding road's far segments are other places on the
    // same ribbon — counting them as neighbours would let the road 30 m along its own
    // length lift (or sink) the ground at a point it actually passes through. The
    // entrance ramp stays excluded (its wide blend would mound the pit rim); the aisle
    // roads are kept — they sit at pit-floor level and hold the floor crisp in the rim
    // blend zone.
    const byEdge = new Map<string, RoadSample>();
    for (const r of network.sampleAll(x, z)) {
      if (r.roadClass === 'garage' && r.edgeId.endsWith('-ramp')) continue;
      const kept = byEdge.get(r.edgeId);
      if (kept === undefined || r.distance < kept.distance) byEdge.set(r.edgeId, r);
    }
    const candidates = [...byEdge.values()];
    let primary: RoadSample | null = null;
    for (const r of candidates) {
      if (primary === null || r.distance < primary.distance) primary = r;
    }
    let height = baseHeight;
    if (primary !== null) {
      // A bridge deck's flat shelf reaches a few metres past the shoulder; the deck
      // owns that shelf exactly like its pavement.
      const deckExtra = primary.onBridge ? BRIDGE_DECK_SHOULDER_EXTRA : 0;
      const influence = roadInfluence(
        roadConfig,
        primary.distance,
        primary.halfWidthMeters,
        primary.shoulderMeters + deckExtra,
      );
      const ownsSurface =
        influence > 0 &&
        primary.distance <= primary.halfWidthMeters + primary.shoulderMeters + deckExtra;
      if (ownsSurface) {
        // The road owns its pavement (and the deck shelf) exactly: embankment where it
        // sits above the ground, cut channel where below. No neighbour may override it —
        // a cliff or embankment behind the road rises *behind* the ribbon, never over
        // its pavement, and a parallel ribbon six metres lower must not sink the ground
        // under a higher road (the single-nearest carve's failure mode in reverse).
        height = primary.elevation;
      } else if (influence > 0) {
        // Off the pavement: the primary's shoulder blend shapes the ground, and higher
        // ribbons reaching the point from beyond the shoulder lift it (the upper
        // envelope of embankments between the roads).
        height = baseHeight + (primary.elevation - baseHeight) * influence;
        for (const r of candidates) {
          if (r.edgeId === primary.edgeId) continue;
          const extra = r.onBridge ? BRIDGE_DECK_SHOULDER_EXTRA : 0;
          const inf = roadInfluence(
            roadConfig,
            r.distance,
            r.halfWidthMeters,
            r.shoulderMeters + extra,
          );
          if (inf <= 0) continue;
          const target = baseHeight + (r.elevation - baseHeight) * inf;
          if (target > height) height = target;
        }
      }
    }
    // Phase 11.1 pit mask: the pit floor is authoritative — street blends from the rim
    // must not mound the floor. Roads on their pavement keep their surface (a frontage
    // street runs along the pit edge at street level; the aisles are garage-class and
    // already handled by the authority branch).
    if (
      insidePitAt(x, z) &&
      (primary === null || primary.distance > primary.halfWidthMeters + primary.shoulderMeters)
    ) {
      height = Math.min(height, baseHeight);
    }
    if (pits.length > 0) {
      height -= pitDepthAt(x, z);
    }
    return height;
  };

  // Phase 10 pass 3 fix: the tunnel cap's edges must sit on the VISIBLE (carved)
  // terrain. The solver sampled the pre-carve natural at each cap edge, but at the
  // edge the carve's lateral blend is not always fully faded (on a curve the
  // perpendicular offset lands inside the influence), which left the cap edge
  // floating metres above the ground on mountainsides. Re-sample the final height
  // at the stored edge positions so the cap seam closes everywhere.
  if (network.tunnelSpans.length > 0) {
    network = {
      ...network,
      tunnelSpans: network.tunnelSpans.map((span) => ({
        ...span,
        points: span.points.map((p) => ({
          ...p,
          leftY: heightAt(p.leftX, p.leftZ),
          rightY: heightAt(p.rightX, p.rightZ),
        })),
      })),
    };
  }

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
