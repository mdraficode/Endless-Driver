/**
 * Phase 10.4 (C4) — dense street clutter for the streamed massing cities: the crates,
 * barrels, bins, hydrants and debris that make a block read as lived-in instead of
 * model-kit clean. Every placement is a pure function of (region, edge, slot, seed),
 * so the same city always clutters the same way (plan §5).
 *
 * Props stand on the building side of the sidewalk walk line (the pedestrian line the
 * road layout and the NPC ecosystem share), clear of junctions, and within a tier budget
 * — the renderer turns the spec into three instanced batches (boxes, barrels, neon
 * signs), three draw calls per region regardless of the count.
 */
import type { TierId } from '../config/tiers';
import type { MassingCitySpec } from './city-content';
import type { RoadEdge, RoadNetwork } from './road-network';

export type ClutterKind = 'debris' | 'crate' | 'bin' | 'hydrant' | 'barrel';

export interface ClutterSpec {
  readonly kind: ClutterKind;
  /** District-local position (the massing city root sits at the district centre). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

export interface NeonSignSpec {
  /** District-local position; the sign plane faces the street. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly colorHex: number;
}

export interface RegionClutterData {
  readonly regionId: string;
  readonly clutter: readonly ClutterSpec[];
  readonly signs: readonly NeonSignSpec[];
}

/** Integer hash in [0, 1), the placement family. */
function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Same stand-off the rendered sidewalks use. */
const SIDEWALK_LIFT = 0.14;
const SIDEWALK_HALF = 1.6;
/** Props stand this far past the walk line, toward the buildings. */
const BUILDING_SIDE_INSET_MIN = 1.0;
const BUILDING_SIDE_INSET_MAX = 2.4;
/** No clutter inside this distance of a junction. */
const JUNCTION_CLEARANCE_METERS = 12;

const CLUTTER_BUDGET: Readonly<Record<TierId, number>> = { A: 200, B: 130, C: 70 };
const SIGN_BUDGET: Readonly<Record<TierId, number>> = { A: 48, B: 36, C: 24 };

const NEON_COLORS = [0x37e0c8, 0xe08037, 0xd0483e, 0x6b8ff0, 0x8fe037, 0xf0d037, 0xe048a8] as const;

function tangentAt(
  points: readonly { x: number; z: number }[],
  index: number,
): { x: number; z: number } {
  const previous = points[Math.max(0, index - 1)] as { x: number; z: number };
  const next = points[Math.min(points.length - 1, index + 1)] as { x: number; z: number };
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function sideOf(tangent: { x: number; z: number }): { x: number; z: number } {
  return { x: tangent.z, z: -tangent.x };
}

function isWalkableEdge(edge: RoadEdge): boolean {
  return (
    (edge.roadClass === 'urban-local' ||
      edge.roadClass === 'urban-arterial' ||
      edge.roadClass === 'urban-alley') &&
    edge.lengthMeters >= 30 &&
    edge.points.length >= 2
  );
}

/**
 * The clutter spec for one massing city: props along the building side of every
 * street inside the district lattice, and a neon sign on roughly a quarter of them.
 */
export function computeRegionClutter(
  spec: MassingCitySpec,
  network: RoadNetwork,
  tier: TierId,
  seed: number,
): RegionClutterData {
  const regionSeed = seedFromId(spec.regionId) ^ (seed >>> 0);
  const half = ((spec.gridNodes - 1) / 2) * spec.streetSpacing;
  const reach = half + spec.streetSpacing;
  const edges = network.edges.filter((edge) => {
    if (!isWalkableEdge(edge)) return false;
    const mid = edge.points[Math.floor(edge.points.length / 2)] as (typeof edge.points)[number];
    return Math.hypot(mid.x - spec.x, mid.z - spec.z) <= reach;
  });
  const clutter: ClutterSpec[] = [];
  const signs: NeonSignSpec[] = [];
  const clutterBudget = CLUTTER_BUDGET[tier] ?? 70;
  const signBudget = SIGN_BUDGET[tier] ?? 24;

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i] as RoadEdge;
    const slots = Math.min(4, Math.floor(edge.lengthMeters / 26));
    for (let slot = 0; slot < slots; slot += 1) {
      if (clutter.length >= clutterBudget) break;
      const salt = regionSeed + i * 131 + slot * 17;
      // ~70% of candidate slots actually carry a prop.
      if (pick(slot, 0x11, salt) > 0.7) continue;
      // Keep out of the junction approaches.
      const along =
        JUNCTION_CLEARANCE_METERS +
        pick(slot, 0x12, salt) * Math.max(0, edge.lengthMeters - 2 * JUNCTION_CLEARANCE_METERS);
      const pointIndex = Math.max(
        0,
        Math.min(
          edge.points.length - 1,
          Math.floor((along / edge.lengthMeters) * (edge.points.length - 1)),
        ),
      );
      const point = edge.points[pointIndex] as (typeof edge.points)[number];
      const tangent = tangentAt(edge.points, pointIndex);
      const sideVector = sideOf(tangent);
      const side: 1 | -1 = pick(slot, 0x13, salt) < 0.5 ? 1 : -1;
      const inset =
        BUILDING_SIDE_INSET_MIN +
        pick(slot, 0x14, salt) * (BUILDING_SIDE_INSET_MAX - BUILDING_SIDE_INSET_MIN);
      const walkOffset =
        edge.roadClass === 'urban-alley'
          ? edge.halfWidthMeters + 0.9
          : edge.halfWidthMeters + edge.shoulderMeters + SIDEWALK_HALF;
      const x = point.x + sideVector.x * side * (walkOffset + inset) - spec.x;
      const z = point.z + sideVector.z * side * (walkOffset + inset) - spec.z;
      const y = point.y + SIDEWALK_LIFT;
      const yaw = Math.atan2(tangent.x, tangent.z);
      const kindRoll = pick(slot, 0x15, salt);
      const kind: ClutterKind =
        kindRoll < 0.38
          ? 'debris'
          : kindRoll < 0.6
            ? 'crate'
            : kindRoll < 0.75
              ? 'barrel'
              : kindRoll < 0.9
                ? 'bin'
                : 'hydrant';
      const scale = 0.8 + pick(slot, 0x16, salt) * 0.5;
      clutter.push({ kind, x, y, z, yaw, scale });
    }
    // One neon sign on roughly a quarter of the street's building side.
    if (signs.length < signBudget && pick(i, 0x17, regionSeed) < 0.25) {
      const pointIndex = Math.floor(edge.points.length / 2);
      const point = edge.points[pointIndex] as (typeof edge.points)[number];
      const tangent = tangentAt(edge.points, pointIndex);
      const sideVector = sideOf(tangent);
      const side: 1 | -1 = pick(i, 0x18, regionSeed) < 0.5 ? 1 : -1;
      const walkOffset =
        edge.roadClass === 'urban-alley'
          ? edge.halfWidthMeters + 0.9
          : edge.halfWidthMeters + edge.shoulderMeters + SIDEWALK_HALF;
      const inset = 2.6 + pick(i, 0x19, regionSeed) * 1.2;
      signs.push({
        x: point.x + sideVector.x * side * (walkOffset + inset) - spec.x,
        y: point.y + SIDEWALK_LIFT + 2.5 + pick(i, 0x1a, regionSeed) * 3,
        z: point.z + sideVector.z * side * (walkOffset + inset) - spec.z,
        // Face the street (the walk line, i.e. toward -inset).
        yaw: Math.atan2(-sideVector.x * side, -sideVector.z * side),
        widthMeters: 1.5 + pick(i, 0x1b, regionSeed) * 2,
        heightMeters: 0.5 + pick(i, 0x1c, regionSeed) * 0.7,
        colorHex:
          NEON_COLORS[Math.floor(pick(i, 0x1d, regionSeed) * NEON_COLORS.length)] ?? 0x37e0c8,
      });
    }
  }
  return { regionId: spec.regionId, clutter, signs };
}
