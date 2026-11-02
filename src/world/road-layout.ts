/**
 * Phase 10 — procedural road layout.
 *
 * Turns a `WorldPlan` into the exact `RoadNetworkConfig` the existing pure solver
 * (`road-network.ts`) consumes, so the solver, carve, ribbons, physics and minimap are
 * untouched. The layout is static (one solved graph around the origin, like the hand-placed
 * network today) and fully deterministic per seed; every launch gets a different one.
 *
 * Structure, per 4 km macro-cell of the plan:
 *  - the **arterial skeleton** runs on the global cell-boundary lattice (lines at
 *    (k + 0.5) * 4000 m): one line per cell row and column, so every region is ringed by
 *    arterials that continue into its neighbours by construction;
 *  - **urban cells** carry a block grid centred on their district (9×9 megacity, 6×6
 *    fringe), sized to read like Aohara at a larger scale; grid lines are designated
 *    arterials per cell so each block cluster has its own boulevards;
 *  - **small towns** carry a 3×3 mini-grid; **rural cells** a sparse two-road web;
 *    **mountain-pass** cells a single switchback-style pass road;
 *  - everything joins the skeleton: urban grids via corner/midpoint connectors, rural
 *    roads snapped to their nearest skeleton nodes, so the whole network is one
 *    connected component;
 *  - the **spawn edge** is a straight low-grade boulevard along +Z from the origin —
 *    every world starts on a boulevard in the megacity core, as today's Central Avenue does.
 *
 * Budget: ~500–900 edges for the default 5×5-cell window (the solver is ~linear in edge
 * count; the hand-placed world is 195). Keep new road sources proportional.
 */
import type { RoadClass, RoadEdgeConfig, RoadNetworkConfig, RoadNodeConfig } from '../config/roads';
import { AOHARA_JUNCTION_NODE_ID } from '../config/urban-district';
import { homeCityAnchor, homeCityRoadGraph } from './city-content';
import { REGION_CELL_METERS, type RegionPlan, type WorldPlan } from './world-plan';

/**
 * Cells on each side of home included in the static road window (3×3 by default).
 * The solver and ribbon build scale with edge count, so pass 1 ships the 12 km window;
 * widen after the device pass confirms the load budget.
 */
export const ROAD_WINDOW_CELLS = 1;

/** Arterial half-widths, metres — tuned to Aohara's proportions. */
const URBAN_ARTERIAL_HALF_WIDTH = 7;
const URBAN_LOCAL_HALF_WIDTH = 3.2;
const CITY_ACCESS_HALF_WIDTH = 4.5;
const TOUGE_HALF_WIDTH = 3.4;

/** Grid geometry per archetype: nodes per side and street spacing, metres. */
const GRID_NODES: Readonly<Record<'megacity' | 'urban-fringe' | 'small-town', number>> = {
  megacity: 9,
  'urban-fringe': 6,
  'small-town': 3,
};
const GRID_SPACING: Readonly<Record<'megacity' | 'urban-fringe' | 'small-town', number>> = {
  megacity: 240,
  'urban-fringe': 320,
  'small-town': 220,
};

/** A simple integer hash for layout choices; pure in (a, b, seed). */
function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** Cell-boundary lattice: world coordinate of the line with index `k`. */
function lineCoord(k: number): number {
  return (k + 0.5) * REGION_CELL_METERS;
}

/** Nearest node on the skeleton grid to a world point. */
function nearestNode(nodes: readonly RoadNodeConfig[], x: number, z: number): RoadNodeConfig {
  let best = nodes[0]!;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const dx = node.x - x;
    const dz = node.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDistance) {
      bestDistance = d;
      best = node;
    }
  }
  return best;
}

export interface RoadLayout {
  readonly config: RoadNetworkConfig;
  /** Node id the spawn edge starts from, for diagnostics. */
  readonly spawnNodeId: string;
}

/**
 * Builds the procedural road layout for a plan, centred on the origin.
 * Pure in `(plan, windowCells)` — the same seed always yields the same network.
 */
export function buildRoadLayout(
  plan: WorldPlan,
  windowCells: number = ROAD_WINDOW_CELLS,
): RoadLayout {
  const W = windowCells;
  const nodes: RoadNodeConfig[] = [];
  const edges: RoadEdgeConfig[] = [];
  const nodeIndex = new Map<string, RoadNodeConfig>();

  const addNode = (id: string, x: number, z: number): RoadNodeConfig => {
    let node = nodeIndex.get(id);
    if (node === undefined) {
      node = { id, x, z };
      nodes.push(node);
      nodeIndex.set(id, node);
    }
    return node;
  };

  // ---------------------------------------------------------------------
  // 1. Arterial skeleton on the global cell-boundary lattice.
  // ---------------------------------------------------------------------
  const kMin = -W - 1;
  const kMax = W;
  const intersections = new Map<string, RoadNodeConfig>();

  const skeletonNodes: RoadNodeConfig[] = [];
  for (let k = kMin; k <= kMax; k += 1) {
    for (let m = kMin; m <= kMax; m += 1) {
      const node = addNode(`i${k}-${m}`, lineCoord(k), lineCoord(m));
      intersections.set(`${k},${m}`, node);
      skeletonNodes.push(node);
    }
  }

  const segmentClass = (x: number, z: number): RoadClass => {
    const archetype = plan.regionAt(x, z).archetype;
    if (archetype === 'megacity' || archetype === 'urban-fringe') return 'urban-arterial';
    if (archetype === 'small-town') return 'city-access';
    return 'rural';
  };
  const addSkeletonEdge = (
    from: RoadNodeConfig,
    to: RoadNodeConfig,
    x: number,
    z: number,
  ): void => {
    const cls = segmentClass(x, z);
    edges.push({
      from: from.id,
      to: to.id,
      ...(cls === 'rural'
        ? { roadClass: 'rural', maxGrade: 0.12 }
        : { roadClass: cls, halfWidthMeters: URBAN_ARTERIAL_HALF_WIDTH }),
    });
  };
  for (let k = kMin; k <= kMax; k += 1) {
    for (let m = kMin; m < kMax; m += 1) {
      const a = intersections.get(`${k},${m}`)!;
      const b = intersections.get(`${k},${m + 1}`)!;
      const zMid = lineCoord(m) + REGION_CELL_METERS / 2;
      addSkeletonEdge(a, b, lineCoord(k), zMid);
    }
  }
  for (let m = kMin; m <= kMax; m += 1) {
    for (let k = kMin; k < kMax; k += 1) {
      const a = intersections.get(`${k},${m}`)!;
      const b = intersections.get(`${k + 1},${m}`)!;
      const xMid = lineCoord(k) + REGION_CELL_METERS / 2;
      addSkeletonEdge(a, b, xMid, lineCoord(m));
    }
  }

  // ---------------------------------------------------------------------
  // 2. The home city: the hand-tuned Aohara kit translated to the generated anchor.
  // ---------------------------------------------------------------------
  const anchor = homeCityAnchor(plan);
  const kit = homeCityRoadGraph(anchor);
  for (const node of kit.nodes) {
    addNode(node.id, node.x, node.z);
  }
  for (const edge of kit.edges) {
    edges.push({ ...edge });
  }
  // The kit's outer gateway nodes join the arterial skeleton.
  for (const gatewayId of [
    'aohara-north-outer-west-outer',
    'aohara-north-outer-east-outer',
    'aohara-south-outer-west-outer',
    'aohara-south-outer-east-outer',
    'aohara-boulevard-west-outer',
  ]) {
    const from = nodeIndex.get(gatewayId);
    if (from === undefined) continue;
    const to = nearestNode(skeletonNodes, from.x, from.z);
    edges.push({
      from: from.id,
      to: to.id,
      roadClass: 'city-access',
      halfWidthMeters: CITY_ACCESS_HALF_WIDTH,
      maxGrade: 0.08,
    });
  }

  // ---------------------------------------------------------------------
  // 3. Per-region content, walking the window in a fixed (deterministic) order.
  // ---------------------------------------------------------------------
  for (let iz = -W; iz <= W; iz += 1) {
    for (let ix = -W; ix <= W; ix += 1) {
      if (ix === 0 && iz === 0) continue; // the home cell carries the Aohara kit above
      const region = plan.regionAtCell(ix, iz);
      addRegionRoads(region);
    }
  }

  function addRegionRoads(region: RegionPlan): void {
    const { ix, iz, seed: regionSeed, district, archetype } = region;
    if (archetype === 'megacity' || archetype === 'urban-fringe' || archetype === 'small-town') {
      const n = GRID_NODES[archetype];
      const spacing = GRID_SPACING[archetype];
      const gridNodes: RoadNodeConfig[] = [];
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          gridNodes.push(
            addNode(
              `g${ix}-${iz}-${r}-${c}`,
              district.centerX + (c - (n - 1) / 2) * spacing,
              district.centerZ + (r - (n - 1) / 2) * spacing,
            ),
          );
        }
      }
      const isGridArterial = (line: number, axis: 0 | 1): boolean =>
        pick(line, axis === 0 ? 0x11 : 0x22, regionSeed) < (archetype === 'megacity' ? 0.3 : 0.2);
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          const node = gridNodes[r * n + c]!;
          const edgeClass = (arterial: boolean): RoadClass =>
            archetype === 'small-town'
              ? 'urban-local'
              : arterial
                ? 'urban-arterial'
                : 'urban-local';
          if (c + 1 < n) {
            edges.push({
              from: node.id,
              to: gridNodes[r * n + c + 1]!.id,
              roadClass: edgeClass(isGridArterial(r, 0)),
              ...(isGridArterial(r, 0)
                ? { halfWidthMeters: URBAN_ARTERIAL_HALF_WIDTH }
                : { halfWidthMeters: URBAN_LOCAL_HALF_WIDTH }),
              maxGrade: 0.08,
            });
          }
          if (r + 1 < n) {
            edges.push({
              from: node.id,
              to: gridNodes[(r + 1) * n + c]!.id,
              roadClass: edgeClass(isGridArterial(c, 1)),
              ...(isGridArterial(c, 1)
                ? { halfWidthMeters: URBAN_ARTERIAL_HALF_WIDTH }
                : { halfWidthMeters: URBAN_LOCAL_HALF_WIDTH }),
              maxGrade: 0.08,
            });
          }
        }
      }
      // Connect the grid to the skeleton: corners plus edge midpoints (towns: corners only).
      const anchorPoints =
        archetype === 'small-town'
          ? [
              [0, 0],
              [0, n - 1],
              [n - 1, 0],
              [n - 1, n - 1],
            ]
          : [
              [0, 0],
              [0, Math.floor((n - 1) / 2)],
              [0, n - 1],
              [Math.floor((n - 1) / 2), 0],
              [Math.floor((n - 1) / 2), n - 1],
              [n - 1, 0],
              [n - 1, Math.floor((n - 1) / 2)],
              [n - 1, n - 1],
            ];
      for (const anchor of anchorPoints) {
        const [r, c] = anchor;
        if (r === undefined || c === undefined) continue;
        const from = gridNodes[r * n + c]!;
        const to = nearestNode(skeletonNodes, from.x, from.z);
        if (from.id === to.id) continue;
        edges.push({
          from: from.id,
          to: to.id,
          roadClass: 'city-access',
          halfWidthMeters: CITY_ACCESS_HALF_WIDTH,
          maxGrade: 0.08,
        });
      }
    } else if (archetype === 'rural') {
      // Two meandering roads per rural cell, E-W and N-S, snapped to the skeleton.
      const cx = region.centerX;
      const cz = region.centerZ;
      const eastWest = [
        {
          from: nearestNode(
            skeletonNodes,
            lineCoord(ix - 1),
            cz + (pick(1, 7, regionSeed) - 0.5) * 2400,
          ),
          to: nearestNode(skeletonNodes, lineCoord(ix), cz + (pick(2, 8, regionSeed) - 0.5) * 2400),
          via: [
            cx + (pick(3, 9, regionSeed) - 0.5) * 800,
            cz + (pick(4, 10, regionSeed) - 0.5) * 800,
          ] as [number, number],
        },
        {
          from: nearestNode(
            skeletonNodes,
            cx + (pick(5, 11, regionSeed) - 0.5) * 2400,
            lineCoord(iz - 1),
          ),
          to: nearestNode(
            skeletonNodes,
            cx + (pick(6, 12, regionSeed) - 0.5) * 2400,
            lineCoord(iz),
          ),
          via: [
            cx + (pick(7, 13, regionSeed) - 0.5) * 800,
            cz + (pick(8, 14, regionSeed) - 0.5) * 800,
          ] as [number, number],
        },
      ];
      for (const line of eastWest) {
        if (line.from.id === line.to.id) continue;
        edges.push({
          from: line.from.id,
          to: line.to.id,
          roadClass: 'rural',
          maxGrade: 0.12,
          via: [line.via],
        });
      }
    } else {
      // Mountain pass: one switchback-style pass road across the cell.
      const from = nearestNode(
        skeletonNodes,
        lineCoord(ix - 1),
        region.centerZ + (pick(21, 22, regionSeed) - 0.5) * 2000,
      );
      const to = nearestNode(
        skeletonNodes,
        lineCoord(ix),
        region.centerZ + (pick(23, 24, regionSeed) - 0.5) * 2000,
      );
      if (from.id !== to.id) {
        edges.push({
          from: from.id,
          to: to.id,
          roadClass: 'touge',
          maxGrade: 0.15,
          halfWidthMeters: TOUGE_HALF_WIDTH,
          via: [
            [
              region.centerX - 600 + (pick(25, 26, regionSeed) - 0.5) * 500,
              region.centerZ + (pick(27, 28, regionSeed) - 0.5) * 1200,
            ],
            [
              region.centerX + 600 + (pick(29, 30, regionSeed) - 0.5) * 500,
              region.centerZ + (pick(31, 32, regionSeed) - 0.5) * 1200,
            ],
          ],
        });
      }
    }
  }

  return {
    config: {
      halfWidthMeters: 2.75,
      shoulderMeters: 2.2,
      blendWidthMeters: 30,
      sampleSpacingMeters: 8,
      maxGrade: 0.09,
      nodes,
      edges,
    },
    // The kit's central intersection: every world starts on Central Avenue, which runs
    // straight through the levelled city plateau (see proceduralSpawn in city-content).
    spawnNodeId: AOHARA_JUNCTION_NODE_ID,
  };
}
