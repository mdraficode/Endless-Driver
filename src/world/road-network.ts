import type { RoadClass, RoadNetworkConfig } from '../config/roads';

/**
 * The road graph: splines over the terrain with smoothed, grade-limited profiles.
 *
 * Pure and deterministic (no three.js, no Rapier): the same config and base height
 * function always produce the same network, which is what makes "the road network is
 * connected and its junctions agree" unit-testable. Elevations are solved globally —
 * moving-average smoothing, then junction pinning (every edge incident to a node ends at
 * exactly the node's solved elevation), then grade clamping to each edge's `maxGrade` — because a
 * road that follows raw terrain point-for-point is a rollercoaster no car should drive.
 *
 * The carved terrain height comes from blending base terrain toward these profiles
 * (`world-terrain.ts`); the ribbon meshes (`RoadWorld.ts`) are drawn from the same
 * points. One profile, three consumers: looks, collision, and grip cannot diverge.
 */
export interface RoadPoint {
  readonly x: number;
  readonly z: number;
  /** Solved road elevation at this point, metres. */
  readonly y: number;
  /** Distance along the edge from its `from` node, metres. */
  readonly alongMeters: number;
}

export interface RoadEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly roadClass: RoadClass;
  /** Maximum longitudinal grade (rise/run) authored for this edge. */
  readonly maxGrade: number;
  readonly halfWidthMeters: number;
  readonly shoulderMeters: number;
  readonly points: readonly RoadPoint[];
  readonly lengthMeters: number;
}

export interface RoadNode {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Solved junction elevation: every incident edge ends exactly here. */
  readonly y: number;
}

export interface RoadSample {
  /** Distance from the centreline, metres. */
  readonly distance: number;
  /** Road elevation at the nearest centreline point, metres. */
  readonly elevation: number;
  readonly edgeId: string;
  readonly roadClass: RoadClass;
  readonly halfWidthMeters: number;
  readonly shoulderMeters: number;
}

export interface RoadNetwork {
  readonly config: RoadNetworkConfig;
  readonly edges: readonly RoadEdge[];
  readonly nodes: readonly RoadNode[];
  readonly totalLengthMeters: number;
  /** Nearest centreline sample, or `null` when no segment is indexed near (x, z). */
  sample(x: number, z: number): RoadSample | null;
  /** Node ids reachable in one edge (graph adjacency for connectivity checks). */
  neighboursOf(nodeId: string): readonly string[];
  nodeById(nodeId: string): RoadNode | null;
}

interface MutablePoint {
  x: number;
  z: number;
  y: number;
}

const INDEX_CELL_METERS = 32;

function catmullRom(
  p0: MutablePoint,
  p1: MutablePoint,
  p2: MutablePoint,
  p3: MutablePoint,
  t: number,
): { x: number; z: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: axis(p0.x, p1.x, p2.x, p3.x), z: axis(p0.z, p1.z, p2.z, p3.z) };
}

/** Moving-average smoothing over an edge profile (endpoints untouched). */
function smoothProfile(points: MutablePoint[], radius: number, passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const source = points.map((point) => point.y);
    for (let index = 1; index < points.length - 1; index += 1) {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sample = source[index + offset];
        if (sample !== undefined) {
          sum += sample;
          count += 1;
        }
      }
      const point = points[index];
      if (point) {
        point.y = sum / count;
      }
    }
  }
}

/** Clamps longitudinal grade by walking the profile both ways (endpoints untouched). */
function clampGrade(points: MutablePoint[], maxGrade: number): void {
  // Gauss-Seidel projection onto the pairwise grade constraints, using each segment's
  // true run (spline steps are not uniformly spaced, so a fixed per-step delta would
  // silently allow steeper grades wherever the spline bunches up). Endpoints are
  // anchors — junction elevations are pinned outside and never moved here.
  for (let iteration = 0; iteration < 256; iteration += 1) {
    let worstChange = 0;
    const clampOne = (index: number, anchor: MutablePoint): void => {
      const point = points[index];
      if (!point) {
        return;
      }
      const run = Math.max(0.001, Math.hypot(point.x - anchor.x, point.z - anchor.z));
      const allowed = run * maxGrade;
      const clamped = Math.min(anchor.y + allowed, Math.max(anchor.y - allowed, point.y));
      worstChange = Math.max(worstChange, Math.abs(clamped - point.y));
      point.y = clamped;
    };
    for (let index = 1; index < points.length - 1; index += 1) {
      clampOne(index, points[index - 1] as MutablePoint);
    }
    for (let index = points.length - 2; index >= 1; index -= 1) {
      clampOne(index, points[index + 1] as MutablePoint);
    }
    if (worstChange < 1e-10) {
      break;
    }
  }
}

export function buildRoadNetwork(
  config: RoadNetworkConfig,
  baseHeightAt: (x: number, z: number) => number,
): RoadNetwork {
  const nodeConfig = new Map(config.nodes.map((node) => [node.id, node]));
  const mutableEdges: {
    id: string;
    from: string;
    to: string;
    roadClass: RoadClass;
    maxGrade: number;
    halfWidthMeters: number;
    shoulderMeters: number;
    points: MutablePoint[];
  }[] = [];

  for (const edge of config.edges) {
    const roadClass = edge.roadClass ?? 'rural';
    const maxGrade = edge.maxGrade ?? config.maxGrade;
    const halfWidthMeters = edge.halfWidthMeters ?? config.halfWidthMeters;
    const shoulderMeters = edge.shoulderMeters ?? config.shoulderMeters;
    if (!Number.isFinite(maxGrade) || maxGrade <= 0 || maxGrade > 1) {
      throw new Error(`invalid road grade for edge ${edge.from} -> ${edge.to}`);
    }
    if (
      !Number.isFinite(halfWidthMeters) ||
      halfWidthMeters <= 0 ||
      !Number.isFinite(shoulderMeters) ||
      shoulderMeters < 0 ||
      halfWidthMeters + shoulderMeters >= config.blendWidthMeters
    ) {
      throw new Error(`invalid road width for edge ${edge.from} -> ${edge.to}`);
    }
    const from = nodeConfig.get(edge.from);
    const to = nodeConfig.get(edge.to);
    if (!from || !to) {
      throw new Error(`road edge references unknown node: ${edge.from} -> ${edge.to}`);
    }
    const control: MutablePoint[] = [
      { x: from.x, z: from.z, y: 0 },
      ...(edge.via ?? []).map(([x, z]) => ({ x, z, y: 0 })),
      { x: to.x, z: to.z, y: 0 },
    ];
    const padded = [
      control[0] as MutablePoint,
      ...control,
      control[control.length - 1] as MutablePoint,
    ];
    const points: MutablePoint[] = [];
    for (let span = 0; span < control.length - 1; span += 1) {
      const p0 = padded[span] as MutablePoint;
      const p1 = padded[span + 1] as MutablePoint;
      const p2 = padded[span + 2] as MutablePoint;
      const p3 = padded[span + 3] as MutablePoint;
      const chord = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const subdivisions = Math.max(4, Math.ceil(chord / config.sampleSpacingMeters));
      for (let step = 0; step < subdivisions; step += 1) {
        const { x, z } = catmullRom(p0, p1, p2, p3, step / subdivisions);
        points.push({ x, z, y: baseHeightAt(x, z) });
      }
    }
    const last = control[control.length - 1] as MutablePoint;
    points.push({ x: last.x, z: last.z, y: baseHeightAt(last.x, last.z) });
    mutableEdges.push({
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      roadClass,
      maxGrade,
      halfWidthMeters,
      shoulderMeters,
      points,
    });
  }

  // Profile solving: smooth, pin junctions to one shared elevation, then clamp grades.
  for (const edge of mutableEdges) {
    smoothProfile(edge.points, 10, 3);
  }
  const nodeElevation = new Map<string, number>();
  for (const node of config.nodes) {
    const endings: number[] = [];
    for (const edge of mutableEdges) {
      if (edge.from === node.id) endings.push(edge.points[0]?.y ?? 0);
      if (edge.to === node.id) endings.push(edge.points[edge.points.length - 1]?.y ?? 0);
    }
    nodeElevation.set(
      node.id,
      endings.length > 0
        ? endings.reduce((sum, value) => sum + value, 0) / endings.length
        : baseHeightAt(node.x, node.z),
    );
  }
  for (const edge of mutableEdges) {
    const first = edge.points[0];
    const last = edge.points[edge.points.length - 1];
    if (first) first.y = nodeElevation.get(edge.from) ?? first.y;
    if (last) last.y = nodeElevation.get(edge.to) ?? last.y;
    clampGrade(edge.points, edge.maxGrade);
  }

  const edges: RoadEdge[] = mutableEdges.map((edge) => {
    let length = 0;
    const points: RoadPoint[] = edge.points.map((point, index) => {
      if (index > 0) {
        const previous = edge.points[index - 1] as MutablePoint;
        length += Math.hypot(point.x - previous.x, point.z - previous.z);
      }
      return { x: point.x, z: point.z, y: point.y, alongMeters: length };
    });
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      roadClass: edge.roadClass,
      maxGrade: edge.maxGrade,
      halfWidthMeters: edge.halfWidthMeters,
      shoulderMeters: edge.shoulderMeters,
      points,
      lengthMeters: length,
    };
  });
  const nodes: RoadNode[] = config.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    z: node.z,
    y: nodeElevation.get(node.id) ?? baseHeightAt(node.x, node.z),
  }));
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));

  // Spatial index over segments, expanded by the blend width so `sample` finds every
  // segment that could influence a query point.
  interface Segment {
    readonly ax: number;
    readonly az: number;
    readonly bx: number;
    readonly bz: number;
    readonly ay: number;
    readonly by: number;
    readonly edgeId: string;
    readonly roadClass: RoadClass;
    readonly halfWidthMeters: number;
    readonly shoulderMeters: number;
  }
  const segments: Segment[] = [];
  const index = new Map<string, number[]>();
  const cellKey = (cx: number, cz: number): string => `${cx},${cz}`;
  for (const edge of edges) {
    for (let indexOfPoint = 0; indexOfPoint < edge.points.length - 1; indexOfPoint += 1) {
      const a = edge.points[indexOfPoint] as RoadPoint;
      const b = edge.points[indexOfPoint + 1] as RoadPoint;
      const segmentIndex = segments.length;
      segments.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        ay: a.y,
        by: b.y,
        edgeId: edge.id,
        roadClass: edge.roadClass,
        halfWidthMeters: edge.halfWidthMeters,
        shoulderMeters: edge.shoulderMeters,
      });
      const expand = config.blendWidthMeters;
      const minCx = Math.floor((Math.min(a.x, b.x) - expand) / INDEX_CELL_METERS);
      const maxCx = Math.floor((Math.max(a.x, b.x) + expand) / INDEX_CELL_METERS);
      const minCz = Math.floor((Math.min(a.z, b.z) - expand) / INDEX_CELL_METERS);
      const maxCz = Math.floor((Math.max(a.z, b.z) + expand) / INDEX_CELL_METERS);
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cz = minCz; cz <= maxCz; cz += 1) {
          const key = cellKey(cx, cz);
          const bucket = index.get(key) ?? [];
          bucket.push(segmentIndex);
          index.set(key, bucket);
        }
      }
    }
  }

  const sample = (x: number, z: number): RoadSample | null => {
    const bucket = index.get(
      cellKey(Math.floor(x / INDEX_CELL_METERS), Math.floor(z / INDEX_CELL_METERS)),
    );
    if (!bucket) {
      return null;
    }
    let best: RoadSample | null = null;
    for (const segmentIndex of bucket) {
      const segment = segments[segmentIndex] as Segment;
      const dx = segment.bx - segment.ax;
      const dz = segment.bz - segment.az;
      const lengthSquared = dx * dx + dz * dz;
      const t =
        lengthSquared > 0
          ? Math.min(
              1,
              Math.max(0, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSquared),
            )
          : 0;
      const closestX = segment.ax + dx * t;
      const closestZ = segment.az + dz * t;
      const distance = Math.hypot(x - closestX, z - closestZ);
      if (best === null || distance < best.distance) {
        best = {
          distance,
          elevation: segment.ay + (segment.by - segment.ay) * t,
          edgeId: segment.edgeId,
          roadClass: segment.roadClass,
          halfWidthMeters: segment.halfWidthMeters,
          shoulderMeters: segment.shoulderMeters,
        };
      }
    }
    return best;
  };

  return {
    config,
    edges,
    nodes,
    totalLengthMeters: edges.reduce((sum, edge) => sum + edge.lengthMeters, 0),
    sample,
    neighboursOf(nodeId: string): readonly string[] {
      const result: string[] = [];
      for (const edge of edges) {
        if (edge.from === nodeId) result.push(edge.to);
        if (edge.to === nodeId) result.push(edge.from);
      }
      return result;
    },
    nodeById(nodeId: string): RoadNode | null {
      return nodeLookup.get(nodeId) ?? null;
    },
  };
}

/**
 * How strongly the road profile owns the terrain height at a centreline distance:
 * fully flat across pavement + shoulder, then a smooth blend back to natural ground.
 */
export function roadInfluence(
  config: RoadNetworkConfig,
  distance: number,
  halfWidthMeters = config.halfWidthMeters,
  shoulderMeters = config.shoulderMeters,
): number {
  const flat = halfWidthMeters + shoulderMeters;
  if (distance <= flat) {
    return 1;
  }
  if (distance >= config.blendWidthMeters) {
    return 0;
  }
  const t = (distance - flat) / (config.blendWidthMeters - flat);
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
}
