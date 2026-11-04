/**
 * Distance to the nearest road centreline, shared by every system that must stay
 * clear of the carved corridors (wilderness tracks, fauna charges). The road's
 * terrain blend is 30 m wide around the centreline, so callers add their own
 * margin on top of the distance returned here.
 */
import { ROAD_NETWORK_CONFIG } from '../config/roads';

export interface RoadSegment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly dx: number;
  readonly dz: number;
  readonly lengthSq: number;
}

export const ROAD_SEGMENTS: readonly RoadSegment[] = (() => {
  const nodeById = new Map(ROAD_NETWORK_CONFIG.nodes.map((node) => [node.id, node]));
  const segments: RoadSegment[] = [];
  for (const edge of ROAD_NETWORK_CONFIG.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const points: readonly (readonly [number, number])[] = [
      [from.x, from.z],
      ...(edge.via ?? []),
      [to.x, to.z],
    ];
    for (let i = 0; i + 1 < points.length; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      segments.push({
        ax: a[0],
        az: a[1],
        bx: b[0],
        bz: b[1],
        dx,
        dz,
        lengthSq: dx * dx + dz * dz,
      });
    }
  }
  return segments;
})();

/** Metres from (x, z) to the nearest road centreline. */
export function roadDistanceAt(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of ROAD_SEGMENTS) {
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.lengthSq || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + s.dx * t - x;
    const pz = s.az + s.dz * t - z;
    const d = Math.hypot(px, pz);
    if (d < best) {
      best = d;
      if (best <= 20) break;
    }
  }
  return best;
}
