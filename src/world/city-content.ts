/**
 * Phase 10 — plan-driven city content (pure).
 *
 * The world plan decides WHERE every city sits; this module turns that into concrete
 * content: the home city's road graph (the hand-tuned Aohara kit, translated to the
 * generated anchor), the spawn point, and the "massing" specs for every other urban
 * region (towers, infill, lamps) that the streamed massing renderer draws.
 *
 * Everything here is a pure function of the plan — deterministic per seed, no three.js.
 */
import type { RoadEdgeConfig, RoadNodeConfig } from '../config/roads';
import { AOHARA_KIT_EDGES, AOHARA_KIT_NODES } from '../config/roads';
import { AOHARA_DISTRICT_CONFIG, aoharaRowOffsetMeters } from '../config/urban-district';
import type { RegionPlan, WorldPlan } from './world-plan';
import { plotSpotsForBlock } from './urban-plots';
import {
  clearSubBlockCenters,
  footprintTouchesBlockRoads,
  urbanBlockDetail,
} from './urban-block-detail';

// ---------------------------------------------------------------------------
// Home city: the Aohara kit, moved.
// ---------------------------------------------------------------------------

export interface HomeCityAnchor {
  /** World position of the city centre (the plan's home district centre). */
  readonly x: number;
  readonly z: number;
  /** Terrain plateau radii that keep the city on a levelled urban core. */
  readonly flatRadiusMeters: number;
  readonly blendRadiusMeters: number;
}

/** Where the home city sits: the plan's home district, always at the origin's cell. */
export function homeCityAnchor(plan: WorldPlan): HomeCityAnchor {
  const district = plan.regionAtCell(0, 0).district;
  return {
    x: district.centerX,
    z: district.centerZ,
    flatRadiusMeters: AOHARA_DISTRICT_CONFIG.flatRadiusMeters,
    blendRadiusMeters: AOHARA_DISTRICT_CONFIG.terrainBlendRadiusMeters,
  };
}

/**
 * The Aohara kit graph (grid + alley access + backstreets + boulevard) translated to the
 * anchor. Node ids are preserved verbatim: the city's traffic, signals and facade placement
 * reference them, and the kit's own clearance math is translation-invariant.
 */
export function homeCityRoadGraph(anchor: HomeCityAnchor): {
  readonly nodes: readonly RoadNodeConfig[];
  readonly edges: readonly RoadEdgeConfig[];
} {
  const dx = anchor.x - AOHARA_DISTRICT_CONFIG.centerX;
  const dz = anchor.z - AOHARA_DISTRICT_CONFIG.centerZ;
  return {
    nodes: AOHARA_KIT_NODES.map((node) => ({ id: node.id, x: node.x + dx, z: node.z + dz })),
    edges: AOHARA_KIT_EDGES.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.roadClass !== undefined ? { roadClass: edge.roadClass } : {}),
      ...(edge.halfWidthMeters !== undefined ? { halfWidthMeters: edge.halfWidthMeters } : {}),
      ...(edge.shoulderMeters !== undefined ? { shoulderMeters: edge.shoulderMeters } : {}),
      ...(edge.maxGrade !== undefined ? { maxGrade: edge.maxGrade } : {}),
      ...(edge.via !== undefined
        ? { via: edge.via.map(([x, z]) => [x + dx, z + dz] as [number, number]) }
        : {}),
    })),
  };
}

export interface ProceduralSpawn {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  /** Heading in radians; 0 faces -Z. */
  readonly yaw: number;
}

/** Central Avenue, midway between the central intersection and the north street — today's start. */
export function proceduralSpawn(anchor: HomeCityAnchor): ProceduralSpawn {
  return {
    id: 'procedural-city',
    label: 'Home City — Central Avenue',
    x: anchor.x,
    z: anchor.z + aoharaRowOffsetMeters(1) / 2,
    yaw: 0,
  };
}

// ---------------------------------------------------------------------------
// Massing cities: the other urban regions, drawn light but real.
// ---------------------------------------------------------------------------

/** Tower palette — Aohara's facade tones, so the generated skyline reads as the same city. */
const MASSING_FACADE_PALETTE = [0x202b36, 0x27333e, 0x30343e, 0x3a3735] as const;
/** Heights in metres, Aohara's skyline ladder. */
const MASSING_TOWER_HEIGHTS = [34, 44, 58, 72, 90, 116, 142] as const;
const MASSING_ROOF_COLORS = [0x263039, 0x1c2029, 0x2a2f38] as const;

/** Infallible 3-input hash in [0, 1) — same pattern as the terrain's value noise. */
function stableUnit(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0x100000000;
}

export interface MassingCrown {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly offsetX?: number;
  readonly offsetZ?: number;
}

export interface MassingTower {
  /** District-local coordinates, metres. */
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly color: number;
  readonly crown: MassingCrown | null;
}

export interface MassingInfill {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly color: number;
}

/** A lamp slot on a grid node; the renderer budgets which actually light up. */
export interface MassingLamp {
  readonly x: number;
  readonly z: number;
}

/** A building lot front (Phase 10.2): the driveway ends here, the massing builds the front here. */
export interface MassingPlot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly kind: 'garage' | 'house' | 'shop';
  readonly widthMeters: number;
  readonly depthMeters: number;
}

/** A block's dressing flag: dense blocks run claustrophobic (Phase 10.2). */
export interface MassingBlock {
  readonly x: number;
  readonly z: number;
  readonly dense: boolean;
}

export interface MassingCitySpec {
  /** Phase 10 pass 2: 0 = normal, 1 = fully dim — the slum-colony's window light. */
  readonly windowDimming?: number;
  /** Phase 10 pass 2: street-prop density multiplier (1 = normal, the colony runs ~1.6). */
  readonly clutterDensity?: number;
  readonly regionId: string;
  /** District centre (world), where the region's road grid sits. */
  readonly x: number;
  readonly z: number;
  readonly streetSpacing: number;
  readonly gridNodes: number;
  readonly towers: readonly MassingTower[];
  readonly infill: readonly MassingInfill[];
  readonly lamps: readonly MassingLamp[];
  readonly plots: readonly MassingPlot[];
  readonly blocks: readonly MassingBlock[];
}

/**
 * Generates the massing content for one urban region (megacity or urban-fringe).
 * Pure in the region: the same plan always yields the same city.
 */
export interface MassingCityOptions {
  /**
   * Phase 10 pass 3: the solved road network. When present, placements are also cleared
   * against the real pavements — the sub-division/alley corridors plus any city-access or
   * ring connector that the generated graph routed across the block field.
   */
  readonly network?: {
    sample(
      x: number,
      z: number,
    ): { readonly distance: number; readonly halfWidthMeters: number } | null;
  };
}

export function massingCityForRegion(
  region: RegionPlan,
  options: MassingCityOptions = {},
): MassingCitySpec {
  const network = options.network;
  const clearOfRoads = (x: number, z: number, halfWidth: number, halfDepth: number): boolean => {
    if (network === undefined) {
      return true;
    }
    const probes: readonly (readonly [number, number])[] = [
      [0, 0],
      [halfWidth, 0],
      [-halfWidth, 0],
      [0, halfDepth],
      [0, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, -halfDepth],
    ];
    for (const [dx, dz] of probes) {
      const sample = network.sample(x + dx, z + dz);
      // Outside the pavement: a corner may kiss the curb, never stand on the asphalt.
      if (sample !== null && sample.distance <= sample.halfWidthMeters) {
        return false;
      }
    }
    return true;
  };
  if (region.archetype !== 'megacity' && region.archetype !== 'urban-fringe') {
    return {
      regionId: region.id,
      x: region.district.centerX,
      z: region.district.centerZ,
      streetSpacing: 0,
      gridNodes: 0,
      towers: [],
      infill: [],
      lamps: [],
      plots: [],
      blocks: [],
    };
  }
  const isMegacity = region.archetype === 'megacity';
  // Phase 10 pass 2: the slum-colony grid matches the road layout's tighter 240 m blocks.
  const isSlum = region.subArchetype === 'slum-colony';
  const n = isMegacity ? 9 : 6;
  const spacing = isMegacity ? 240 : isSlum ? 240 : 320;
  const seed = region.seed;
  const districtX = region.district.centerX;
  const districtZ = region.district.centerZ;
  const half = ((n - 1) / 2) * spacing;

  const towers: MassingTower[] = [];
  const infill: MassingInfill[] = [];
  const lamps: MassingLamp[] = [];
  const plots: MassingPlot[] = [];
  const blocks: MassingBlock[] = [];

  // Lamps at every grid node (the renderer trims to tier budget).
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      lamps.push({ x: (c - (n - 1) / 2) * spacing, z: (r - (n - 1) / 2) * spacing });
    }
  }

  // One block at a time, in a fixed order (deterministic).
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const blockSeed = r * 131 + c * 17;
      const blockCenterX = (c - (n - 1) / 2) * spacing + spacing / 2;
      const blockCenterZ = (r - (n - 1) / 2) * spacing + spacing / 2;
      // Blocks closer to the district core run taller and denser.
      const coreDistance = Math.hypot(blockCenterX, blockCenterZ) / half;
      const coreBoost = Math.max(0, 1 - coreDistance);

      const u = (k: number): number => stableUnit(blockSeed, k, seed);
      // Phase 10.2: ~a quarter of blocks are dense backstreet blocks — claustrophobic,
      // low, and pushed to the block edges.
      const dense = u(77) < (isSlum ? 0.6 : 0.25);
      // Phase 10 pass 3: the same sub-division/alley roll the road layout makes for this
      // block — buildings are placed in the clear spans, never on the corridor.
      const blockDetail = urbanBlockDetail(seed, region.ix, region.iz, r, c, isSlum);
      const blockRelMinX = (c - (n - 1) / 2) * spacing;
      const blockRelMinZ = (r - (n - 1) / 2) * spacing;
      const relCenter = spacing / 2;
      // The clear candidate spots for this block: the sub-block centre grid, each kept
      // only if it clears the block's own corridors AND (when a network is supplied) the
      // real solved pavements. Every building in the block picks from this list.
      const xGrid = clearSubBlockCenters(blockDetail, spacing, 1);
      const zGrid = clearSubBlockCenters(blockDetail, spacing, 0);
      const clearSpots: { x: number; z: number }[] = [];
      for (const gx of xGrid) {
        for (const gz of zGrid) {
          if (footprintTouchesBlockRoads(blockDetail, spacing, gx, gz, 6, 6)) {
            continue;
          }
          if (!clearOfRoads(districtX + blockRelMinX + gx, districtZ + blockRelMinZ + gz, 6, 6)) {
            continue;
          }
          clearSpots.push({ x: gx, z: gz });
        }
      }
      blocks.push({ x: blockCenterX, z: blockCenterZ, dense });
      // The lot fronts: the same plotSpotsForBlock the road layout aims driveways at, so a
      // driveway always ends in front of a building the massing actually places.
      const blockRect = {
        minX: (c - (n - 1) / 2) * spacing,
        minZ: (r - (n - 1) / 2) * spacing,
        maxX: (c - (n - 1) / 2 + 1) * spacing,
        maxZ: (r - (n - 1) / 2 + 1) * spacing,
      };
      for (const p of plotSpotsForBlock(region.ix, region.iz, r, c, blockRect, seed, 3.2)) {
        plots.push({
          x: p.x,
          z: p.z,
          yaw: p.yaw,
          kind: p.kind,
          widthMeters: p.widthMeters,
          depthMeters: p.depthMeters,
        });
      }
      // Towers: two per block in the megacity, ~70% of blocks elsewhere. The
      // slum-colony packs two or three low, narrow masses into nearly every block.
      const towerCount = isMegacity
        ? 2
        : isSlum
          ? u(1) < 0.9
            ? 2 + (u(59) < 0.4 ? 1 : 0)
            : 1
          : u(1) < 0.7
            ? 1
            : 0;
      for (let t = 0; t < towerCount; t += 1) {
        const side = t === 0 ? -1 : 1;
        const ut = (k: number): number => stableUnit(blockSeed, t * 31 + k, seed);
        const heightBudget = isSlum
          ? 0.3 + coreBoost * 0.15
          : (isMegacity ? 1 : 0.65) + coreBoost * (isMegacity ? 0.5 : 0.35);
        const heightIndex = Math.min(
          MASSING_TOWER_HEIGHTS.length - 1,
          Math.floor(ut(11) * MASSING_TOWER_HEIGHTS.length * heightBudget),
        );
        // The colony's towers are not towers at all: a 2–5 storey sea of low masses.
        const height = isSlum
          ? 9 + ut(19) * 7
          : (MASSING_TOWER_HEIGHTS[heightIndex] ?? MASSING_TOWER_HEIGHTS[0]!);
        let towerWidth = isSlum
          ? 12 + ut(13) * 8
          : (isMegacity ? 28 : 22) + ut(13) * (isMegacity ? 8 : 6);
        const towerDepth = Math.min(30 + ut(17) * 10, spacing / 3 - 9);
        // Phase 10 pass 3: sit in a clear spot of the sub-block — never on the sub-division,
        // the alley, or a connector the generated graph routed across the block. Without
        // any corridor the classic ±35 m offset stands, with a nearer fallback.
        // With corridors, the clear spots are the candidates; the classic ±35 m offset is
        // an extra candidate for the no-corridor block (and its near fallback).
        const spotCandidates: { x: number; z: number }[] =
          clearSpots.length > 0
            ? [...clearSpots].sort(
                (a, b) =>
                  (side === -1 ? a.x - b.x : b.x - a.x) ||
                  Math.abs(a.z - relCenter) - Math.abs(b.z - relCenter),
              )
            : [
                { x: relCenter + side * 35 + (ut(7) - 0.5) * 6, z: relCenter },
                { x: relCenter + side * 12 + (ut(7) - 0.5) * 6, z: relCenter },
              ];
        let towerRelX: number | undefined;
        let towerRelZ: number | undefined;
        for (const cand of spotCandidates) {
          if (
            footprintTouchesBlockRoads(
              blockDetail,
              spacing,
              cand.x,
              cand.z,
              towerWidth / 2,
              towerDepth / 2,
            )
          ) {
            continue;
          }
          if (
            !clearOfRoads(
              districtX + blockRelMinX + cand.x,
              districtZ + blockRelMinZ + cand.z,
              towerWidth / 2,
              towerDepth / 2,
            )
          ) {
            continue;
          }
          towerRelX = cand.x;
          towerRelZ = cand.z;
          break;
        }
        // A narrow mass still fits where the full width would straddle a corridor.
        if (towerRelX === undefined) {
          for (const cand of spotCandidates) {
            if (
              footprintTouchesBlockRoads(blockDetail, spacing, cand.x, cand.z, 6, towerDepth / 2)
            ) {
              continue;
            }
            if (
              !clearOfRoads(
                districtX + blockRelMinX + cand.x,
                districtZ + blockRelMinZ + cand.z,
                6,
                towerDepth / 2,
              )
            ) {
              continue;
            }
            towerRelX = cand.x;
            towerRelZ = cand.z;
            towerWidth = 12;
            break;
          }
        }
        if (towerRelX === undefined || towerRelZ === undefined) {
          continue; // the block is too crowded for this mass; the next one still stands
        }
        const crownStyle = ut(23);
        const crown: MassingCrown =
          crownStyle < 0.5
            ? {
                width: towerWidth * (0.58 + 0.22 * ut(29)),
                depth: towerDepth * (0.58 + 0.22 * ut(31)),
                height: Math.max(10, height * (0.15 + 0.1 * ut(37))),
              }
            : crownStyle < 0.75
              ? {
                  width: towerWidth * (0.5 + 0.18 * ut(29)),
                  depth: towerDepth * (0.5 + 0.18 * ut(31)),
                  height: Math.max(10, height * (0.15 + 0.1 * ut(37))),
                  offsetX: (ut(41) < 0.5 ? -1 : 1) * towerWidth * 0.25 * ut(43),
                  offsetZ: (ut(47) < 0.5 ? -1 : 1) * towerDepth * 0.25 * ut(49),
                }
              : {
                  width: towerWidth * (0.8 + 0.1 * ut(29)),
                  depth: towerDepth * (0.8 + 0.1 * ut(31)),
                  height: 8 + 4 * ut(37),
                };
        towers.push({
          x: blockRelMinX + towerRelX,
          z: blockRelMinZ + towerRelZ,
          width: towerWidth,
          depth: towerDepth,
          height,
          color:
            MASSING_FACADE_PALETTE[Math.floor(ut(53) * MASSING_FACADE_PALETTE.length)] ?? 0x202b36,
          crown,
        });
      }

      // Infill: two to four low buildings per block, denser in the core; dense blocks add
      // two more low masses hugging the block edges, and never crowd a lot front.
      const infillCount = isSlum
        ? 4 + Math.floor(u(61) * 3) + (dense ? 2 : 0)
        : 2 + Math.floor(u(61) * (2 + coreBoost * 2)) + (dense ? 2 : 0);
      for (let i = 0; i < infillCount; i += 1) {
        const ui = (k: number): number => stableUnit(blockSeed, 71 + i * 13 + k, seed);
        let ix = blockCenterX + (ui(1) - 0.5) * (spacing - 40);
        let iz = blockCenterZ + (ui(2) - 0.5) * (spacing - 40);
        if (dense || isSlum) {
          const side = Math.floor(ui(8) * 4);
          const along = (ui(9) - 0.5) * (spacing - 30);
          if (side === 0) iz = blockCenterZ - spacing / 2 + 16;
          else if (side === 1) ix = blockCenterX + spacing / 2 - 16;
          else if (side === 2) iz = blockCenterZ + spacing / 2 - 16;
          else ix = blockCenterX - spacing / 2 + 16;
          if (side === 0 || side === 2) ix = blockCenterX + along;
          else iz = blockCenterZ + along;
        }
        const crowded = plots.some(
          (p) =>
            p.x >= blockRect.minX &&
            p.x <= blockRect.maxX &&
            p.z >= blockRect.minZ &&
            p.z <= blockRect.maxZ &&
            Math.hypot(p.x - ix, p.z - iz) < 14,
        );
        if (crowded) continue;
        const iw = (isSlum ? 8 : 10) + ui(3) * (isSlum ? 6 : 8);
        const id = (isSlum ? 8 : 10) + ui(4) * (isSlum ? 6 : 8);
        // Phase 10 pass 3: never sit on a sub-division, an alley, or a routed connector —
        // move into the nearest clear spot, or drop the mass rather than straddle a road.
        let relIx = ix - blockRelMinX;
        let relIz = iz - blockRelMinZ;
        const clearHere =
          !footprintTouchesBlockRoads(blockDetail, spacing, relIx, relIz, iw / 2, id / 2) &&
          clearOfRoads(districtX + ix, districtZ + iz, iw / 2, id / 2);
        if (!clearHere) {
          const ordered = [...clearSpots].sort(
            (a, b) => Math.hypot(a.x - relIx, a.z - relIz) - Math.hypot(b.x - relIx, b.z - relIz),
          );
          let placed = false;
          for (const spot of ordered) {
            if (
              footprintTouchesBlockRoads(blockDetail, spacing, spot.x, spot.z, iw / 2, id / 2) ||
              !clearOfRoads(
                districtX + blockRelMinX + spot.x,
                districtZ + blockRelMinZ + spot.z,
                iw / 2,
                id / 2,
              )
            ) {
              continue;
            }
            relIx = spot.x;
            relIz = spot.z;
            placed = true;
            break;
          }
          if (!placed) continue;
        }
        infill.push({
          x: blockRelMinX + relIx,
          z: blockRelMinZ + relIz,
          width: iw,
          depth: id,
          height: isSlum || dense ? 4 + ui(5) * 4 : 5 + ui(5) * (isMegacity ? 9 : 6),
          color: MASSING_ROOF_COLORS[Math.floor(ui(6) * MASSING_ROOF_COLORS.length)] ?? 0x263039,
        });
      }
    }
  }

  return {
    ...(isSlum ? { windowDimming: 0.6, clutterDensity: 1.6 } : {}),
    regionId: region.id,
    x: districtX,
    z: districtZ,
    streetSpacing: spacing,
    gridNodes: n,
    towers,
    infill,
    lamps,
    plots,
    blocks,
  };
}
