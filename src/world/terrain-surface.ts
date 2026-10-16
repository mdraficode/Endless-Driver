import { ROAD_NETWORK_CONFIG } from '../config/roads';
import {
  terrainPatchAt,
  terrainSurfaceWeights,
  terrainVariationAt,
  type TerrainSampler,
} from './terrain-height';

/**
 * The driving surface at a point: what the ground is made of, for the tire model.
 *
 * This is the Phase 2 surface-query contract finally fed by a generator: the visual splat
 * and the physics response read the same weights (`terrainSurfaceWeights`), and the
 * response numbers below are weighted from them — never sampled from a texture. A slope
 * that looks like grass grips like grass because both systems asked the same question,
 * not because one of them looked at a picture of the other.
 */
export type TerrainSurfaceId = 'grass' | 'soil' | 'rock' | 'snow' | 'asphalt' | 'gravel';

export interface TerrainSurfaceSample {
  readonly id: TerrainSurfaceId;
  /** Normalised [grass, soil, rock, snow] weights the response was mixed from. */
  readonly weights: readonly [number, number, number, number];
  /** Multiplier on the tire model's dry-asphalt friction coefficient. */
  readonly gripModifier: number;
  /** Rolling-resistance coefficient (force per newton of wheel load). */
  readonly rollingResistance: number;
}

const SURFACE_IDS: readonly TerrainSurfaceId[] = ['grass', 'soil', 'rock', 'snow'];
/**
 * Relative grip by surface: grass holds less than the asphalt the tire model is tuned on.
 * Soil is dry compacted dirt (~0.72-0.75 of asphalt): with soil patches now covering whole
 * fields, the old 0.64 put a slippery grip step under the tyres at every patch edge.
 */
const GRIP: readonly [number, number, number, number] = [0.8, 0.74, 0.95, 0.4];
/** Rolling resistance by surface: soft ground drinks momentum; rock barely resists. */
const ROLLING: readonly [number, number, number, number] = [0.035, 0.05, 0.02, 0.08];

export function sampleTerrainSurface(
  sampler: TerrainSampler,
  x: number,
  z: number,
): TerrainSurfaceSample {
  // The road corridor outranks the natural splat: pavement grips like the asphalt the
  // tire model is tuned on, the gravel shoulder is looser and draggier than grass.
  const road = sampler.roadAt?.(x, z);
  if (road) {
    if (road.distance <= ROAD_NETWORK_CONFIG.halfWidthMeters) {
      return {
        id: 'asphalt',
        weights: [0, 0, 0, 0],
        gripModifier: 1,
        rollingResistance: 0.015,
      };
    }
    if (road.distance <= ROAD_NETWORK_CONFIG.halfWidthMeters + ROAD_NETWORK_CONFIG.shoulderMeters) {
      return {
        id: 'gravel',
        weights: [0, 1, 0, 0],
        gripModifier: 0.72,
        rollingResistance: 0.045,
      };
    }
  }
  const { config } = sampler;
  const height = sampler.heightAt(x, z);
  const normal = sampler.normalAt(x, z);
  const weights = terrainSurfaceWeights(
    config,
    height,
    1 - normal.y,
    terrainVariationAt(config, x, z),
    terrainPatchAt(config, x, z),
  );
  let dominant = 0;
  for (let index = 1; index < 4; index += 1) {
    if ((weights[index] ?? 0) > (weights[dominant] ?? 0)) {
      dominant = index;
    }
  }
  const mix = (table: readonly [number, number, number, number]): number =>
    table[0] * weights[0] + table[1] * weights[1] + table[2] * weights[2] + table[3] * weights[3];
  return {
    id: SURFACE_IDS[dominant] ?? 'grass',
    weights,
    gripModifier: mix(GRIP),
    rollingResistance: mix(ROLLING),
  };
}
