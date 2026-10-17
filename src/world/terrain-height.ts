import type { TerrainConfig } from '../config/terrain';
import type { RoadNetwork, RoadSample } from './road-network';

/**
 * The one height function of the world.
 *
 * Visual chunks, physics heightfields, and later the road network all sample this — if any
 * two of them disagreed by a centimetre the car would sink, float, or fall through a seam,
 * so this module is deliberately pure, allocation-light, and integer-hash deterministic:
 * the same (seed, x, z) yields bit-identical heights on every engine, which is what makes
 * "deterministic regeneration from a seed" (Phase 4 acceptance) a testable statement rather
 * than a hope. No `Math.random`, no dates, no platform transcendentals in the noise path.
 *
 * Shape, in order: rolling fBm hills; the Hinode-dake volcano cone added on top; the spawn
 * plateau blended to exactly y=0 at the origin (the car spawns there and the Phase 2
 * convention "ground top at y=0" survives).
 */
export interface TerrainSampler {
  /** Ground height in metres at world (x, z). */
  heightAt(x: number, z: number): number;
  /** Unit surface normal at (x, z), from central differences of `heightAt`. */
  normalAt(x: number, z: number): { x: number; y: number; z: number };
  readonly config: TerrainConfig;
  /**
   * Road influence at (x, z) when this sampler has the road network carved in
   * (`world-terrain.ts`): the surface query turns it into asphalt/gravel responses.
   */
  roadAt?(x: number, z: number): RoadSample | null;
  /** The carved road network, when present (road ribbon meshes are built from it). */
  readonly roadNetwork?: RoadNetwork;
}

/** Unit surface normal of any height function, by central differences. */
export function terrainNormalAt(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
): { x: number; y: number; z: number } {
  const eps = 1.5;
  const left = heightAt(x - eps, z);
  const right = heightAt(x + eps, z);
  const back = heightAt(x, z - eps);
  const front = heightAt(x, z + eps);
  const nx = left - right;
  const nz = back - front;
  const ny = 2 * eps;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return { x: nx / length, y: ny / length, z: nz / length };
}

/** 32-bit integer hash of a lattice point and the world seed → [0, 1). Deterministic. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ Math.imul(ix | 0, 0x27d4eb2d), 0x165667b1);
  h = Math.imul(h ^ Math.imul(iz | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smootherstep interpolation weight. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value noise at (x, z) with lattice spacing `cell` metres → roughly [-1, 1]. */
function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fade(fx - ix);
  const tz = fade(fz - iz);
  const top = lerp(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), tx);
  const bottom = lerp(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), tx);
  return lerp(top, bottom, tz) * 2 - 1;
}

/** Fractal sum: broad hills down to metre-scale roughness. Amplitudes sum to ~1. */
function fbm(x: number, z: number, baseCell: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.55;
  let cell = baseCell;
  for (let octave = 0; octave < 5; octave += 1) {
    sum += amplitude * valueNoise(x, z, cell, seed + octave * 101);
    cell *= 0.5;
    amplitude *= 0.55;
  }
  return sum;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createTerrainSampler(config: TerrainConfig): TerrainSampler {
  const { seed } = config;
  const [vx, vz] = config.volcano.position;

  const rawHeight = (x: number, z: number): number => {
    let height =
      fbm(x, z, config.hillWavelengthMeters, seed) * config.hillAmplitudeMeters +
      fbm(x + 3917.3, z - 2718.1, config.hillWavelengthMeters * 2.7, seed + 77) *
        config.hillAmplitudeMeters *
        1.6;
    // Ridged detail: fBm alone reads as dunes. One-minus-absolute noise makes crests and
    // broken skylines; squared, it stays quiet in the valleys and speaks on the ridges.
    const ridgeBroad = 1 - Math.abs(valueNoise(x, z, 210, seed + 303));
    const ridgeFine = 1 - Math.abs(valueNoise(x - 1173.9, z + 941.2, 96, seed + 404));
    height += ridgeBroad * ridgeBroad * 6.5 + ridgeFine * ridgeFine * 2.1;
    // Hinode-dake: a broad cone with a softened rim, broken up by the same hills and an
    // extra share of ridge noise so its silhouette is a mountain and not a party hat.
    const dx = x - vx;
    const dz = z - vz;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const t = Math.min(1, distance / config.volcano.radiusMeters);
    const cone = (1 - t) * (1 - t) * (1 + 2 * t);
    height += cone * (config.volcano.heightMeters + ridgeBroad * 26);
    return height;
  };

  const heightAt = (x: number, z: number): number => {
    const raw = rawHeight(x, z);
    const distance = Math.sqrt(x * x + z * z);
    const pad = smoothstep(
      config.spawnPad.flatRadiusMeters,
      config.spawnPad.blendRadiusMeters,
      distance,
    );
    const height = raw * pad;
    // Normalise -0 (negative raw x zero pad) so the plateau is exactly +0 everywhere:
    // spawn math and tests compare against literal zero.
    return height === 0 ? 0 : height;
  };

  const normalAt = (x: number, z: number): { x: number; y: number; z: number } =>
    terrainNormalAt(heightAt, x, z);

  return { heightAt, normalAt, config };
}

/** Large-scale ground variation in [-1, 1): wet/dry patchiness for the splat. */
export function terrainVariationAt(config: TerrainConfig, x: number, z: number): number {
  return fbm(x - 811.7, z + 613.9, 260, config.seed + 991);
}

/** Finer patch field in [-1, 1): the metre-to-hectometre breaks inside a biome. */
export function terrainPatchAt(config: TerrainConfig, x: number, z: number): number {
  return fbm(x + 1731.3, z - 2897.7, 90, config.seed + 733);
}

export type TerrainSplatWeights = readonly [number, number, number, number];

/**
 * Which surfaces live at a point, as normalised [grass, soil, rock, snow] weights.
 *
 * This is the single source the renderer and the physics surface query both read: the
 * material blends scanned textures by these weights, and grip/rolling resistance are
 * weighted from the same numbers, so what a slope looks like and how it drives can never
 * disagree. `slope` is 1 - normal.y (0 flat, ~0.1 at 26°, ~0.23 at 40°, 0.5 at 60°).
 */
export function terrainSurfaceWeights(
  config: TerrainConfig,
  height: number,
  slope: number,
  variation = 0,
  patch = 0,
): TerrainSplatWeights {
  // Snow is a patchy alpine cap, not a biome: the effective snowline wanders
  // with the large and fine patch fields, wind-scoured slopes expose rock
  // early, and even well above the line only snow-favoured patches hold a
  // full snow weight — the rest is exposed alpine rock and soil. A summit
  // therefore reads as broken grey-brown ground with snow in its hollows,
  // never as a uniform white sheet.
  const effectiveSnowline = config.snowlineMeters + variation * 22 + patch * 12;
  const altitude = smoothstep(effectiveSnowline, effectiveSnowline + 55, height);
  const snowPatch = 0.08 + 0.92 * smoothstep(0.05, 0.45, patch * 0.72 + variation * 0.48);
  const snow = altitude * (1 - smoothstep(0.16, 0.36, slope)) * snowPatch;

  const rockSlope = smoothstep(0.22, 0.42, slope);
  const alpineRock = altitude * (1 - snowPatch) * 0.62;
  const rockOutcrop =
    smoothstep(0.32, 0.62, patch) * smoothstep(0.012, 0.045, slope) * (1 - altitude * 0.5) * 0.85;
  const rock = Math.min(1, Math.max(rockSlope, alpineRock, rockOutcrop));

  // Dry soil patches break up the flat lowland grass at hectare scale, so a
  // field is a patchwork the car can see (and feel), not one green carpet.
  const soilSlope = smoothstep(0.07, 0.22, slope) * (1 - rockSlope);
  const drySoilPatch = smoothstep(0.02, 0.45, variation) * (1 - rock) * (1 - altitude) * 0.8;
  const alpineSoil = altitude * (1 - snowPatch) * 0.22 * (1 - rock);
  const soil = Math.min(1, Math.max(soilSlope, drySoilPatch) + alpineSoil);

  // Grass fades with altitude so exposed high ground goes to rock/soil,
  // never to green, when the snow patch field says "scoured".
  let grass = Math.max(0, 1 - rock - soil - snow);
  grass *= 1 - altitude * 0.65;
  const total = grass + soil + rock + snow;
  if (total <= 1e-6) {
    return [1, 0, 0, 0];
  }
  return [grass / total, soil / total, rock / total, snow / total];
}

/**
 * Splat weights → vertex colour. Pure and shared by every chunk, so two chunks meeting at
 * a border colour their shared edge identically (the heights agree there by construction;
 * the colours must too, or the seam shows even when the geometry does not).
 *
 * The macro tint half of the Phase 4 splat: grass lowlands, soil on worked slopes, rock
 * where it is steep, pale snow-rock above the snowline. The scanned CC0 sets supply the
 * detail (see TerrainWorld); this tint carries the hundred-metre colour story and the
 * far-field blend, and both read the same weights from `terrainSurfaceWeights`.
 */
export function terrainColorAt(
  config: TerrainConfig,
  height: number,
  slope: number,
  variation: number,
  occlusion = 1,
  groundTint: readonly [number, number, number] = [1, 1, 1],
  patch = 0,
): readonly [number, number, number] {
  // variation in [-1, 1]: patches of dry/wet ground at the hundred-metre scale.
  // Grass is two-tone rather than one green with a nudge: Japanese lowlands in a
  // warm season are a patchwork of living grass and dried straw, and a single hue
  // reads as a painted floor from the chase camera (owner report, 2026-10-17).
  const dryness = smoothstep(-0.15, 0.55, variation);
  const grass: readonly [number, number, number] = [
    0.07 + (0.19 - 0.07) * dryness,
    0.19 + (0.175 - 0.19) * dryness,
    0.05 + (0.085 - 0.05) * dryness,
  ];
  const soil: readonly [number, number, number] = [0.28, 0.19, 0.11];
  const rock: readonly [number, number, number] = [0.32, 0.31, 0.3];
  // Blue-grey shaded snow, deliberately well below paper white: snow that
  // sits at 0.9 luminance under a pale sky is indistinguishable from fog.
  const snow: readonly [number, number, number] = [0.6, 0.67, 0.78];

  const [grassWeight, soilWeight, rockWeight, snowWeight] = terrainSurfaceWeights(
    config,
    height,
    slope,
    variation,
    patch,
  );
  const shade = Math.min(1.08, Math.max(0.8, occlusion));
  const color = [
    (grass[0] * grassWeight + soil[0] * soilWeight + rock[0] * rockWeight + snow[0] * snowWeight) *
      shade *
      groundTint[0],
    (grass[1] * grassWeight + soil[1] * soilWeight + rock[1] * rockWeight + snow[1] * snowWeight) *
      shade *
      groundTint[1],
    (grass[2] * grassWeight + soil[2] * soilWeight + rock[2] * rockWeight + snow[2] * snowWeight) *
      shade *
      groundTint[2],
  ] as const;
  return color;
}
