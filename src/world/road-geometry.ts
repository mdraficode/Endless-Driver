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

function tangentAt(points: readonly RoadPoint[], index: number): { x: number; z: number } {
  const previous = points[Math.max(0, index - 1)] as RoadPoint;
  const next = points[Math.min(points.length - 1, index + 1)] as RoadPoint;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
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
 * suppressed near junctions where overlapping edge dashes would scribble.
 */
export function buildDashGeometry(network: RoadNetwork, yOffset: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const dashLength = 3;
  const cycle = 9;
  const halfWidth = 0.09;
  for (const edge of network.edges) {
    const { points } = edge;
    for (let along = 12; along + dashLength < edge.lengthMeters - 12; along += cycle) {
      const startIndex = Math.min(
        points.length - 2,
        Math.floor(along / network.config.sampleSpacingMeters),
      );
      const start = points[startIndex] as RoadPoint;
      const end = points[startIndex + 1] as RoadPoint;
      const tangent = tangentAt(points, startIndex);
      const side = sideOf(tangent);
      const base = positions.length / 3;
      const corners: [number, number][] = [
        [start.x - side.x * halfWidth, start.z - side.z * halfWidth],
        [start.x + side.x * halfWidth, start.z + side.z * halfWidth],
        [end.x - side.x * halfWidth, end.z - side.z * halfWidth],
        [end.x + side.x * halfWidth, end.z + side.z * halfWidth],
      ];
      // Dash length follows the segment direction from the sampled start point.
      const scale = dashLength / Math.max(1, Math.hypot(end.x - start.x, end.z - start.z));
      const farX = start.x + (end.x - start.x) * scale;
      const farZ = start.z + (end.z - start.z) * scale;
      corners[2] = [farX - side.x * halfWidth, farZ - side.z * halfWidth];
      corners[3] = [farX + side.x * halfWidth, farZ + side.z * halfWidth];
      for (const [x, z] of corners) {
        positions.push(x, start.y + yOffset, z);
      }
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
