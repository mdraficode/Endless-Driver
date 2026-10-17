/**
 * The trail network as pure geometry — the renderer-free half of the off-road
 * routes (config/trails.ts holds the authored waypoints). Chunk generation,
 * the surface splat, vegetation gating and the minimap all read distances
 * from here, so the trail a car drives, the dirt it sees and the line on the
 * map are one and the same route. Deterministic and allocation-light: the
 * segment table is built once per module instance.
 *
 * Trails deliberately do NOT touch elevation: an off-road route is the ground
 * as it is, worn only in colour and cleared of understory.
 */
import { TRAIL_NETWORK_CONFIG, type TrailNetworkConfig } from '../config/trails';

interface TrailSegment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly dx: number;
  readonly dz: number;
  readonly lengthSq: number;
}

export interface TrailSample {
  /** Metres from the nearest trail centreline. */
  readonly distance: number;
  readonly routeId: string;
}

function buildSegments(config: TrailNetworkConfig): readonly TrailSegment[] {
  const segments: TrailSegment[] = [];
  for (const route of config.routes) {
    for (let i = 0; i + 1 < route.points.length; i += 1) {
      const a = route.points[i]!;
      const b = route.points[i + 1]!;
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
}

const SEGMENTS: readonly TrailSegment[] = buildSegments(TRAIL_NETWORK_CONFIG);
const ROUTE_IDS: readonly string[] = (() => {
  const ids: string[] = [];
  for (const route of TRAIL_NETWORK_CONFIG.routes) {
    for (let i = 0; i + 1 < route.points.length; i += 1) {
      ids.push(route.id);
    }
  }
  return ids;
})();

/** Distance from the point to the nearest trail centreline, and which route. */
export function trailAt(x: number, z: number): TrailSample | null {
  let best = Number.POSITIVE_INFINITY;
  let bestRoute = -1;
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    const s = SEGMENTS[i]!;
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.lengthSq || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + s.dx * t - x;
    const pz = s.az + s.dz * t - z;
    const d = Math.hypot(px, pz);
    if (d < best) {
      best = d;
      bestRoute = i;
    }
  }
  if (bestRoute < 0 || best > TRAIL_NETWORK_CONFIG.canopyOuterMeters * 4) {
    // Far from every trail: report null so callers can skip the work entirely.
    return null;
  }
  return { distance: best, routeId: ROUTE_IDS[bestRoute] ?? '' };
}

/**
 * Packed-dirt influence (0..1): full inside the worn band, smoothstepping to
 * zero across the feather. The surface splat mixes soil in by this amount.
 */
export function trailInfluenceAt(x: number, z: number): number {
  const sample = trailAt(x, z);
  if (sample === null) return 0;
  const { halfWidthMeters, featherMeters } = TRAIL_NETWORK_CONFIG;
  if (sample.distance <= halfWidthMeters) return 1;
  const t = (sample.distance - halfWidthMeters) / featherMeters;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/** The authored polylines, for the minimap and any future signage. */
export function trailPolylines(
  config: TrailNetworkConfig = TRAIL_NETWORK_CONFIG,
): readonly { id: string; label: string; points: readonly (readonly [number, number])[] }[] {
  return config.routes;
}
