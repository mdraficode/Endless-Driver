import { BufferAttribute, BufferGeometry, BoxGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { RoadEdge, RoadNetwork, RoadNode, RoadPoint, TunnelSpan } from './road-network';

/**
 * Road ribbon construction from solved spline profiles.
 *
 * A ribbon is two vertices per profile point, offset along the horizontal normal, with the
 * profile elevation plus a small stand-off so the pavement sits just above the carved
 * terrain (which is flattened to the same profile — the offset only has to beat depth
 * precision, not geography). UVs run across [0, 1] and along in metres/6, the tile size
 * the asphalt and gravel scans are sampled at.
 */

export const ROAD_MARKING_JUNCTION_CLEARANCE_METERS = 14;

function tangentAt(points: readonly RoadPoint[], index: number): { x: number; z: number } {
  const previous = points[Math.max(0, index - 1)] as RoadPoint;
  const next = points[Math.min(points.length - 1, index + 1)] as RoadPoint;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function pointAtDistance(points: readonly RoadPoint[], distance: number): RoadPoint {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('A road ribbon requires at least one profile point');
  }
  if (distance <= first.alongMeters) {
    return first;
  }
  if (distance >= last.alongMeters) {
    return last;
  }

  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((points[middle]?.alongMeters ?? 0) <= distance) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const start = points[low] as RoadPoint;
  const end = points[high] as RoadPoint;
  const span = Math.max(1e-9, end.alongMeters - start.alongMeters);
  const t = Math.min(1, Math.max(0, (distance - start.alongMeters) / span));
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
    alongMeters: distance,
  };
}

/**
 * Returns a profile clipped back from each junction, with interpolated end points so road paint
 * stops cleanly before cross traffic rather than continuing through the middle of the crossing.
 */
export function trimRoadEdge(
  edge: RoadEdge,
  startTrimMeters: number,
  endTrimMeters = startTrimMeters,
): RoadEdge | null {
  if (edge.points.length < 2) {
    return null;
  }
  const firstDistance = edge.points[0]?.alongMeters ?? 0;
  const lastDistance = edge.points.at(-1)?.alongMeters ?? edge.lengthMeters;
  const startTrim = Number.isFinite(startTrimMeters) ? Math.max(0, startTrimMeters) : 0;
  const endTrim = Number.isFinite(endTrimMeters) ? Math.max(0, endTrimMeters) : 0;
  const startDistance = Math.min(lastDistance, firstDistance + startTrim);
  const endDistance = Math.max(firstDistance, lastDistance - endTrim);
  if (endDistance - startDistance < 0.01) {
    return null;
  }

  const interior = edge.points.filter(
    (point) => point.alongMeters > startDistance + 1e-4 && point.alongMeters < endDistance - 1e-4,
  );
  const points = [pointAtDistance(edge.points, startDistance), ...interior];
  points.push(pointAtDistance(edge.points, endDistance));
  return { ...edge, points };
}

/** Side direction (centre → right edge) for a tangent: rotate -90° about Y. */
function sideOf(tangent: { x: number; z: number }): { x: number; z: number } {
  return { x: tangent.z, z: -tangent.x };
}

/**
 * Per-network precompute for `markingTrimsForEdge`: which edges meet each node, and a spatial
 * index over the nodes. Without it the trim solver is O(E²) per network, which a dense
 * procedural grid (thousands of short edges) would make a multi-second build.
 */
const TRIM_NODE_INDEX_CELL_METERS = 32;

interface TrimPrecompute {
  readonly edgeAdjacency: ReadonlyMap<string, readonly RoadEdge[]>;
  readonly nodeCells: ReadonlyMap<string, readonly RoadNode[]>;
}
const trimPrecomputeCache = new WeakMap<RoadNetwork, TrimPrecompute>();
function trimPrecomputeFor(network: RoadNetwork): TrimPrecompute {
  const cached = trimPrecomputeCache.get(network);
  if (cached !== undefined) {
    return cached;
  }
  const edgeAdjacency = new Map<string, RoadEdge[]>();
  for (const edge of network.edges) {
    for (const nodeId of [edge.from, edge.to]) {
      const list = edgeAdjacency.get(nodeId) ?? [];
      list.push(edge);
      edgeAdjacency.set(nodeId, list);
    }
  }
  const nodeCells = new Map<string, RoadNode[]>();
  for (const node of network.nodes) {
    const key = `${Math.floor(node.x / TRIM_NODE_INDEX_CELL_METERS)},${Math.floor(node.z / TRIM_NODE_INDEX_CELL_METERS)}`;
    const list = nodeCells.get(key) ?? [];
    list.push(node);
    nodeCells.set(key, list);
  }
  const precompute: TrimPrecompute = { edgeAdjacency, nodeCells };
  trimPrecomputeCache.set(network, precompute);
  return precompute;
}

/** Neighbours of a node within `radiusMeters`, from the precomputed cell index. */
function nodesNear(
  node: RoadNode,
  precompute: TrimPrecompute,
  radiusMeters: number,
): readonly RoadNode[] {
  const cellSpan = Math.ceil(radiusMeters / TRIM_NODE_INDEX_CELL_METERS);
  const cx = Math.floor(node.x / TRIM_NODE_INDEX_CELL_METERS);
  const cz = Math.floor(node.z / TRIM_NODE_INDEX_CELL_METERS);
  const result: RoadNode[] = [];
  for (let dx = -cellSpan; dx <= cellSpan; dx += 1) {
    for (let dz = -cellSpan; dz <= cellSpan; dz += 1) {
      const bucket = precompute.nodeCells.get(`${cx + dx},${cz + dz}`);
      if (bucket === undefined) {
        continue;
      }
      for (const other of bucket) {
        result.push(other);
      }
    }
  }
  return result;
}

/**
 * Closest point on a solved profile to a world position, with the local tangent and the
 * perpendicular distance. Paint rules need the approach geometry at a junction even where the
 * junction node is not the nearest profile sample.
 */
export function nearestOnProfile(
  points: readonly RoadPoint[],
  x: number,
  z: number,
): {
  readonly point: RoadPoint;
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly distance: number;
} {
  const first = points[0];
  if (first === undefined) {
    throw new Error('A road profile requires at least one point');
  }
  const second = points[1] ?? first;
  const firstLength = Math.hypot(second.x - first.x, second.z - first.z) || 1;
  let best = {
    point: first,
    tangentX: (second.x - first.x) / firstLength,
    tangentZ: (second.z - first.z) / firstLength,
    distance: Math.hypot(first.x - x, first.z - z),
  };
  for (let index = 0; index + 1 < points.length; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const span = Math.max(1e-9, dx * dx + dz * dz);
    const t = Math.min(1, Math.max(0, ((x - start.x) * dx + (z - start.z) * dz) / span));
    const px = start.x + dx * t;
    const pz = start.z + dz * t;
    const distance = Math.hypot(px - x, pz - z);
    if (distance < best.distance) {
      const length = Math.hypot(dx, dz) || 1;
      best = { point: start, tangentX: dx / length, tangentZ: dz / length, distance };
    }
  }
  return best;
}

/**
 * Phase 8.4b: end trims (metres back from each endpoint) that keep an edge's paint clear of
 * the paved right-of-way (asphalt + shoulder) of every road meeting it at that endpoint.
 *
 * A flat clearance is correct at orthogonal junctions, but where the grand boulevard crosses a
 * street at an angle the far right-of-way reaches further along the approach than a
 * perpendicular width would suggest; the derived window is larger, so no painted line or dash
 * ever crosses the avenue's asphalt. The result is floored at the standard junction clearance
 * so ordinary intersections keep their established paint gap.
 */
export function markingTrimsForEdge(
  network: RoadNetwork,
  edge: RoadEdge,
  lateralOffsetMeters: number,
): { readonly startMeters: number; readonly endMeters: number } {
  const precompute = trimPrecomputeFor(network);
  const trimForEndpoint = (nodeId: string, endpointTangent: { x: number; z: number }): number => {
    const node = network.nodeById(nodeId);
    if (node === null) {
      return ROAD_MARKING_JUNCTION_CLEARANCE_METERS;
    }
    const endpointNormal = sideOf(endpointTangent);
    let windowMeters = 0;
    for (const other of precompute.edgeAdjacency.get(nodeId) ?? []) {
      if (other === edge || other.roadClass === 'urban-alley') {
        continue;
      }
      const approach = nearestOnProfile(other.points, node.x, node.z);
      const cross = Math.abs(
        endpointTangent.x * approach.tangentZ - endpointTangent.z * approach.tangentX,
      );
      if (cross < 0.15) {
        continue; // continuation of the same street, not a crossing
      }
      const otherNormal = sideOf({ x: approach.tangentX, z: approach.tangentZ });
      const lateralProjection = Math.abs(
        endpointNormal.x * otherNormal.x + endpointNormal.z * otherNormal.z,
      );
      const rightOfWayMeters = other.halfWidthMeters + other.shoulderMeters;
      windowMeters = Math.max(
        windowMeters,
        (rightOfWayMeters + lateralOffsetMeters * lateralProjection) / cross,
      );
    }
    // Paint also keeps the standard gap from every neighbouring node: a passage mouth can sit
    // just past an avenue junction, where the flat clearance would leave a line a few metres
    // from the mouth. Solve for the far end of the clearance interval around each node.
    const clearanceSquared =
      (ROAD_MARKING_JUNCTION_CLEARANCE_METERS - 0.05) *
      (ROAD_MARKING_JUNCTION_CLEARANCE_METERS - 0.05);
    for (const otherNode of nodesNear(node, precompute, 80)) {
      if (otherNode.id === nodeId) {
        continue;
      }
      const vx = otherNode.x - node.x;
      const vz = otherNode.z - node.z;
      if (vx * vx + vz * vz > 6400) {
        continue; // 80 m: a passage mouth can sit a third of a long block past an avenue junction
      }
      for (const sign of [-1, 1] as const) {
        const offX = endpointNormal.x * lateralOffsetMeters * sign;
        const offZ = endpointNormal.z * lateralOffsetMeters * sign;
        const a = endpointTangent.x * (offX - vx) + endpointTangent.z * (offZ - vz);
        const b = offX * offX + offZ * offZ - 2 * (offX * vx + offZ * vz) + vx * vx + vz * vz;
        const discriminant = a * a - b + clearanceSquared;
        if (discriminant < 0) {
          continue;
        }
        windowMeters = Math.max(windowMeters, -a + Math.sqrt(discriminant));
      }
    }
    return Math.max(ROAD_MARKING_JUNCTION_CLEARANCE_METERS, windowMeters);
  };

  const firstSegment = edge.points[1] ?? edge.points[0]!;
  const firstStart = edge.points[0]!;
  const lastPoint = edge.points.at(-1)!;
  const lastStart = edge.points.at(-2) ?? edge.points[0]!;
  const normalize = (from: RoadPoint, to: RoadPoint) => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: dx / length, z: dz / length };
  };
  // Tangents point away from the endpoint node into the edge, so the trim windows are solved
  // along the painted approach rather than behind the node.
  return {
    startMeters: trimForEndpoint(edge.from, normalize(firstStart, firstSegment)),
    endMeters: trimForEndpoint(edge.to, normalize(lastPoint, lastStart)),
  };
}

/**
 * Design speed per road class, m/s — what the banking assumes traffic is doing at a corner.
 * Bank = (v² · halfWidth) / (g · R): the lateral offset that keeps a car at that speed level
 * through the corner, applied as a left/right height split. Capped so a tight alley never
 * tips its ribbon.
 */
const BANK_DESIGN_SPEED: Readonly<Record<RoadEdge['roadClass'], number>> = {
  rural: 24,
  touge: 14,
  'city-access': 18,
  'urban-local': 16,
  'urban-arterial': 26,
  'urban-alley': 8,
  highway: 30,
  garage: 5, // parking speed
};
const GRAVEITY_METER_PER_SECOND_SQUARED = 9.81;
const MAX_BANK_METERS = 0.5;

/** Superelevation at profile `index`: signed metres — positive lifts the right edge
 * (right-hand corner), negative lifts the left. */
function bankAt(
  points: readonly RoadPoint[],
  index: number,
  half: number,
  roadClass: RoadEdge['roadClass'],
): number {
  const back = tangentAt(points, Math.max(0, index - 4));
  const ahead = tangentAt(points, Math.min(points.length - 1, index + 4));
  // Signed turn rate: cross2 > 0 is a right turn in three.js y-up space (x east, z south),
  // where the right edge is the inside of the corner.
  const cross = back.x * ahead.z - back.z * ahead.x;
  const lookAheadMeters = 32;
  const curvature = cross / lookAheadMeters;
  if (Math.abs(curvature) < 1e-4) {
    return 0;
  }
  const radiusMeters = 1 / Math.abs(curvature);
  const speed = BANK_DESIGN_SPEED[roadClass];
  const ideal = ((speed * speed) / (GRAVEITY_METER_PER_SECOND_SQUARED * radiusMeters)) * half;
  const magnitude = Math.min(MAX_BANK_METERS, ideal);
  // The profile's "right" vertex (centre + side·half, side = (t.z, -t.x)) is the inside of the
  // corner whenever cross < 0 — verified against an arc whose centre sits on the -z side — so
  // the lift sign runs opposite to the cross product.
  return cross > 0 ? -magnitude : magnitude;
}

export function buildRibbonGeometry(
  edge: RoadEdge,
  widthMeters: number,
  yOffset: number,
  centerOffsetMeters = 0,
): BufferGeometry {
  const { points } = edge;
  const half = widthMeters / 2;
  const positions = new Float32Array(points.length * 2 * 3);
  const uvs = new Float32Array(points.length * 2 * 2);
  // Pre-solve the bank per profile point, then feather it in/out over a few samples so the
  // superelevation never kinks at the edge of a corner.
  const banks: number[] = points.map((_, index) => bankAt(points, index, half, edge.roadClass));
  for (let pass = 0; pass < 3; pass += 1) {
    const source = banks.slice();
    for (let index = 1; index < banks.length - 1; index += 1) {
      const leftValue = source[index - 1] ?? 0;
      const middle = source[index] ?? 0;
      const rightValue = source[index + 1] ?? 0;
      banks[index] = (leftValue + 2 * middle + rightValue) / 4;
    }
  }
  points.forEach((point, index) => {
    const side = sideOf(tangentAt(points, index));
    const centreX = point.x + side.x * centerOffsetMeters;
    const centreZ = point.z + side.z * centerOffsetMeters;
    const bank = banks[index] ?? 0;
    const left = index * 2;
    const right = left + 1;
    positions[left * 3] = centreX - side.x * half;
    positions[left * 3 + 1] = point.y + yOffset - bank / 2;
    positions[left * 3 + 2] = centreZ - side.z * half;
    positions[right * 3] = centreX + side.x * half;
    positions[right * 3 + 1] = point.y + yOffset + bank / 2;
    positions[right * 3 + 2] = centreZ + side.z * half;
    uvs[left * 2] = 0;
    uvs[left * 2 + 1] = point.alongMeters / 6;
    uvs[right * 2] = 1;
    uvs[right * 2 + 1] = point.alongMeters / 6;
  });
  const indices: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A continuous concrete barrier wall along an edge (Phase 10 pass 2 highways): a vertical
 * prism ribbon — bottom and top quads on each face plus the walking top — following the
 * solved profile, offset to the edge line by `centerOffsetMeters`.
 */
export function buildBarrierGeometry(
  edge: RoadEdge,
  heightMeters: number,
  widthMeters: number,
  centerOffsetMeters = 0,
  yOffset = 0,
): BufferGeometry {
  const { points } = edge;
  const half = widthMeters / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const side = sideOf(tangentAt(points, index));
    const cx = point.x + side.x * centerOffsetMeters;
    const cz = point.z + side.z * centerOffsetMeters;
    const baseY = point.y + yOffset;
    // Four corners per sample: bottom-left, top-left, bottom-right, top-right.
    positions.push(
      cx - side.x * half,
      baseY,
      cz - side.z * half,
      cx - side.x * half,
      baseY + heightMeters,
      cz - side.z * half,
      cx + side.x * half,
      baseY,
      cz + side.z * half,
      cx + side.x * half,
      baseY + heightMeters,
      cz + side.z * half,
    );
    uvs.push(0, 0, 0, 1, 1, 0, 1, 1);
  }
  const indices: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = index * 4;
    const b = a + 4;
    // Left face, right face, top face.
    indices.push(a, a + 1, b, b, b + 1, b + 2);
    indices.push(a + 2, a + 3, b + 2, b + 2, b + 3, b + 2);
    indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Centreline dashes for the whole network as one geometry: 3 m painted, 6 m gap,
 * sampled at exact profile distances and kept clear of every junction approach.
 */
export function buildDashGeometry(network: RoadNetwork, yOffset: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const dashLength = 3;
  const cycle = 9;
  const halfWidth = 0.09;
  for (const edge of network.edges) {
    if (edge.roadClass === 'urban-alley') {
      continue;
    }
    const { points } = edge;
    // Rural/connector/local streets use one centre dash. The wider Aohara avenue has
    // two same-direction lane dividers; its double amber centreline is batched separately.
    const laneOffsets = edge.roadClass === 'urban-arterial' ? [-3.4, 3.4] : [0];
    // Phase 8.4b: per-end junction windows, so a dash never crosses the avenue's asphalt at
    // the angled crossings (the widest lane divider sets the window).
    const { startMeters, endMeters } = markingTrimsForEdge(
      network,
      edge,
      Math.max(...laneOffsets.map((offset) => Math.abs(offset))),
    );
    for (const laneOffset of laneOffsets) {
      for (
        let along = startMeters;
        along + dashLength < edge.lengthMeters - endMeters;
        along += cycle
      ) {
        const start = pointAtDistance(points, along);
        const end = pointAtDistance(points, along + dashLength);
        const startBefore = pointAtDistance(points, Math.max(0, along - 0.5));
        const endAfter = pointAtDistance(
          points,
          Math.min(edge.lengthMeters, along + dashLength + 0.5),
        );
        const startTangentLength = Math.max(
          1e-6,
          Math.hypot(start.x - startBefore.x, start.z - startBefore.z),
        );
        const endTangentLength = Math.max(1e-6, Math.hypot(endAfter.x - end.x, endAfter.z - end.z));
        const startSide = sideOf({
          x: (start.x - startBefore.x) / startTangentLength,
          z: (start.z - startBefore.z) / startTangentLength,
        });
        const endSide = sideOf({
          x: (endAfter.x - end.x) / endTangentLength,
          z: (endAfter.z - end.z) / endTangentLength,
        });
        const startX = start.x + startSide.x * laneOffset;
        const startZ = start.z + startSide.z * laneOffset;
        const endX = end.x + endSide.x * laneOffset;
        const endZ = end.z + endSide.z * laneOffset;
        const base = positions.length / 3;
        positions.push(
          startX - startSide.x * halfWidth,
          start.y + yOffset,
          startZ - startSide.z * halfWidth,
          startX + startSide.x * halfWidth,
          start.y + yOffset,
          startZ + startSide.z * halfWidth,
          endX - endSide.x * halfWidth,
          end.y + yOffset,
          endZ - endSide.z * halfWidth,
          endX + endSide.x * halfWidth,
          end.y + yOffset,
          endZ + endSide.z * halfWidth,
        );
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------
// Phase 10 pass 3: tunnel visuals — the ground cap over a carved span and the
// concrete portal frames at the surface crossings.
// ---------------------------------------------------------------------------

/**
 * The tunnel cap: a ground sheet that rebuilds the natural surface above a carved
 * tunnel run. It spans the carve's full influence footprint (pavement + shoulder +
 * blend) so its edges land exactly where the carved terrain blends back to natural
 * height, and vertex colours alternate two earth tones per 8 m world cell so the
 * sheet reads as ground rather than a slab.
 */
export function buildTunnelCapGeometry(span: TunnelSpan): BufferGeometry | null {
  const { points } = span;
  if (points.length < 2) return null;
  const cover = span.halfWidthMeters + span.shoulderMeters + span.blendWidthMeters;
  const positions: number[] = [];
  const colors: number[] = [];
  const cellHash = (x: number, z: number): number => {
    const cx = Math.floor(x / 8);
    const cz = Math.floor(z / 8);
    let h = (cx * 374761393 + cz * 668265263) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const tangent = tangentAt(points, index);
    const side = sideOf(tangent);
    for (const sideSign of [-1, 1] as const) {
      const x = point.x + side.x * cover * sideSign;
      const z = point.z + side.z * cover * sideSign;
      positions.push(x, point.baseY + TUNNEL_CAP_LIFT, z);
      const t = cellHash(x, z);
      // Grass-olive to dry-earth mix: ground, not pavement.
      colors.push(0.34 + t * 0.1, 0.42 + t * 0.06, 0.24 + t * 0.05);
    }
  }
  const indices: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = index * 2;
    const b = a + 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const TUNNEL_CAP_LIFT = 0.12;

export interface TunnelPortalGeometry {
  /** Piers and lintel — merge into the concrete barrier batch. */
  readonly concrete: BufferGeometry | null;
  /** The two lamp heads — render with an emissive material. */
  readonly lamps: BufferGeometry | null;
}

/**
 * Portal structures at both surface crossings of a tunnel run. The cap rebuilds the
 * natural ground over the carve's full footprint, so the mouth is a full-width hillside
 * wall with the road opening through the middle: side walls out to the cap edge, piers
 * framing the road, and — where the ceiling is high enough — a lintel above the opening
 * with two lamp heads on its face.
 */
export function buildTunnelPortalGeometry(span: TunnelSpan): TunnelPortalGeometry {
  const { points } = span;
  if (points.length < 2) return { concrete: null, lamps: null };
  const concreteGeometries: BufferGeometry[] = [];
  const lampGeometries: BufferGeometry[] = [];
  const cover = span.halfWidthMeters + span.shoulderMeters + span.blendWidthMeters;
  const roadHalf = span.halfWidthMeters + span.shoulderMeters;
  const mouth = (index: number, towardInterior: number): void => {
    const point = points[index]!;
    const tangent = tangentAt(points, index);
    const yaw = Math.atan2(tangent.x, tangent.z);
    const groundY = point.baseY;
    const depth = groundY - point.y;
    if (depth < 2) return; // a shallow dip: the cap edge blends into the slope on its own
    const mouthX = point.x + tangent.x * towardInterior * 1.1;
    const mouthZ = point.z + tangent.z * towardInterior * 1.1;
    const lateral = (offset: number, sideSign: number): { x: number; z: number } => ({
      x: mouthX - Math.sin(yaw) * offset * sideSign,
      z: mouthZ + Math.cos(yaw) * offset * sideSign,
    });
    // Side walls: from the road edge out to the cap edge, sealing the mouth.
    const wallWidth = cover - roadHalf - 0.3;
    if (wallWidth > 0.5) {
      const wallTop = groundY + TUNNEL_CAP_LIFT + 0.1;
      const wallBottom = point.y - 0.4;
      for (const sideSign of [-1, 1] as const) {
        const wall = new BoxGeometry(wallWidth, wallTop - wallBottom, 2.2);
        wall.rotateY(yaw);
        const center = lateral(roadHalf + 0.3 + wallWidth / 2, sideSign);
        wall.translate(center.x, wallBottom + (wallTop - wallBottom) / 2, center.z);
        concreteGeometries.push(wall);
      }
    }
    // Piers framing the road opening.
    const pierOffset = roadHalf + 1.0;
    const pierTop = groundY + 1.0;
    const pierBottom = point.y - 0.4;
    for (const sideSign of [-1, 1] as const) {
      const pier = new BoxGeometry(2.2, pierTop - pierBottom, 2.2);
      pier.rotateY(yaw);
      const center = lateral(pierOffset, sideSign);
      pier.translate(center.x, pierBottom + (pierTop - pierBottom) / 2, center.z);
      concreteGeometries.push(pier);
    }
    // Lintel above the opening, only when the ceiling leaves room for the clearance.
    const clearanceTop = point.y + 4.8; // a semi-trailer is 4 m tall
    const lampY = clearanceTop - 0.5;
    if (groundY + TUNNEL_CAP_LIFT - clearanceTop >= 0.7) {
      const lintelHeight = groundY + TUNNEL_CAP_LIFT - clearanceTop;
      const lintel = new BoxGeometry(2 * (roadHalf + 0.6), lintelHeight, 2.2);
      lintel.rotateY(yaw);
      lintel.translate(mouthX, clearanceTop + lintelHeight / 2, mouthZ);
      concreteGeometries.push(lintel);
    }
    for (const sideSign of [-1, 1] as const) {
      const lamp = new BoxGeometry(0.7, 0.35, 0.45);
      lamp.rotateY(yaw);
      const center = lateral(span.halfWidthMeters + 0.9, sideSign);
      lamp.translate(
        center.x + tangent.x * towardInterior * 0.2,
        lampY,
        center.z + tangent.z * towardInterior * 0.2,
      );
      lampGeometries.push(lamp);
    }
  };
  mouth(0, 1);
  mouth(points.length - 1, -1);
  const merge = (list: BufferGeometry[]): BufferGeometry | null => {
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const geometry of list) geometry.dispose();
    return merged;
  };
  return { concrete: merge(concreteGeometries), lamps: merge(lampGeometries) };
}
