import { BufferAttribute, BufferGeometry } from 'three';

import type { RoadEdge, RoadNetwork, RoadPoint } from './road-network';

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
  points.forEach((point, index) => {
    const side = sideOf(tangentAt(points, index));
    const centreX = point.x + side.x * centerOffsetMeters;
    const centreZ = point.z + side.z * centerOffsetMeters;
    const left = index * 2;
    const right = left + 1;
    positions[left * 3] = centreX - side.x * half;
    positions[left * 3 + 1] = point.y + yOffset;
    positions[left * 3 + 2] = centreZ - side.z * half;
    positions[right * 3] = centreX + side.x * half;
    positions[right * 3 + 1] = point.y + yOffset;
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
 * Centreline dashes for the whole network as one geometry: 3 m painted, 6 m gap,
 * sampled at exact profile distances and kept clear of every junction approach.
 */
export function buildDashGeometry(network: RoadNetwork, yOffset: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const dashLength = 3;
  const cycle = 9;
  const halfWidth = 0.09;
  const junctionClearance = ROAD_MARKING_JUNCTION_CLEARANCE_METERS;
  for (const edge of network.edges) {
    if (edge.roadClass === 'urban-alley') {
      continue;
    }
    const { points } = edge;
    // Rural/connector/local streets use one centre dash. The wider Aohara avenue has
    // two same-direction lane dividers; its double amber centreline is batched separately.
    const laneOffsets = edge.roadClass === 'urban-arterial' ? [-3.4, 3.4] : [0];
    for (const laneOffset of laneOffsets) {
      for (
        let along = junctionClearance;
        along + dashLength < edge.lengthMeters - junctionClearance;
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
