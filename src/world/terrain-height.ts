import type { TerrainConfig } from '../config/terrain';
import type { RoadNetwork, RoadSample } from './road-network';
import type { CityPlateau, TerrainPit } from './world-terrain';
import { terrainOctave, terrainOctaveGrad } from './noise';

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
  /**
   * The city plateau and sunken-garage pits this sampler was built with
   * (`world-terrain.ts`). Carried on the sampler so off-thread chunk generation can
   * rebuild the identical sampler from configs alone — the ground you see must be the
   * ground you drive on, whichever thread builds a chunk.
   */
  readonly plateau?: CityPlateau;
  readonly pits?: readonly TerrainPit[];
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

/**
 * Fractal sum: broad hills down to metre-scale roughness. Amplitudes sum to ~1.
 * Phase 11.0b: the per-octave noise is OpenSimplex2S (`terrainOctave`, pre-scaled
 * to the old value noise's band) instead of bilerp value noise — same octave
 * structure, same seeds, smoother C³ relief.
 */
function fbm(x: number, z: number, baseCell: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.55;
  let cell = baseCell;
  for (let octave = 0; octave < 5; octave += 1) {
    sum += amplitude * terrainOctave(x, z, cell, seed + octave * 101);
    cell *= 0.5;
    amplitude *= 0.55;
  }
  return sum;
}

/** `fbm` with its analytic gradient (chain rule over the octaves). */
function fbmGrad(
  x: number,
  z: number,
  baseCell: number,
  seed: number,
): { value: number; gradX: number; gradZ: number } {
  let sum = 0;
  let gradX = 0;
  let gradZ = 0;
  let amplitude = 0.55;
  let cell = baseCell;
  for (let octave = 0; octave < 5; octave += 1) {
    const s = terrainOctaveGrad(x, z, cell, seed + octave * 101);
    sum += amplitude * s.value;
    gradX += amplitude * s.gradX;
    gradZ += amplitude * s.gradZ;
    cell *= 0.5;
    amplitude *= 0.55;
  }
  return { value: sum, gradX, gradZ };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Derivative of `smoothstep` with respect to its value: 6t(1−t)/(edge1−edge0)
 * inside the window, 0 outside (the clamped region is constant). Works for
 * inverted windows (edge1 < edge0) — the edges are only an interval.
 */
function smoothstepGrad(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return (6 * t * (1 - t)) / (edge1 - edge0);
}

/**
 * Phase 10.1 country elevation: kilometre-scale rolling hills, escarpments and steep-cut
 * valleys, layered above the metre-scale hills.
 *
 * Shape: a domain-warped fBm (the warp bends the ridgelines so high ground reads as folded
 * hills instead of noise), shaped through a smootherstep so lowlands stay broad and the high
 * third gains relief, then cut by a separate low-frequency mask into steep-walled valleys.
 * The whole layer fades to zero inside the city anchor so the urban plateau never meets a
 * cliff ring, and the volcano sits on top of it as before. Pure in (config, x, z): the
 * integer-hash noise keeps the determinism contract.
 */
function countryElevationAt(x: number, z: number, config: TerrainConfig, seed: number): number {
  if (config.elevationAmplitudeMeters <= 0) {
    return 0;
  }
  const fadeCenterX = config.elevationFadeCenter[0];
  const fadeCenterZ = config.elevationFadeCenter[1];
  const distanceToCity = Math.hypot(x - fadeCenterX, z - fadeCenterZ);
  const cityFade =
    1 -
    smoothstep(config.elevationFadeInnerMeters, config.elevationFadeOuterMeters, distanceToCity);
  const strength = (1 - cityFade) * config.elevationAmplitudeMeters;
  if (strength <= 0.01) {
    return 0;
  }
  // Domain warp: two independent low-frequency fields bend the sample coordinate, so the
  // ridgelines meander the way real hill country does.
  const warpX =
    fbm(x, z, config.elevationWavelengthMeters * 0.8, seed + 505) * config.elevationWarpMeters;
  const warpZ =
    fbm(x + 4471.2, z - 2903.7, config.elevationWavelengthMeters * 0.8, seed + 606) *
    config.elevationWarpMeters;
  const warped =
    fbm(x + warpX, z + warpZ, config.elevationWavelengthMeters, seed + 707) * 0.5 + 0.5;
  // Smootherstep: broad, gentle lowlands; the upper third of the field carries the relief.
  const shaped = warped * warped * (3 - 2 * warped);
  // Steep-cut valleys: a separate mask carves the high ground down along meandering lines,
  // leaving walls instead of a gradual slope.
  const gorge = terrainOctave(
    x - 913.4,
    z + 1757.1,
    config.elevationWavelengthMeters * 0.42,
    seed + 808,
  );
  const gorgeCut = smoothstep(0.42, 0.18, gorge) * smoothstep(0.02, 0.3, warped);
  const relief = shaped * (1 - 0.62 * gorgeCut);
  // Offset 0.42 below the field mean so most of the country stays a lowland; the peaks of
  // the shaped field reach roughly +0.9 * amplitude.
  return (relief - 0.42) * strength * 1.8;
}

/**
 * `countryElevationAt` with its analytic gradient. Same pipeline, differentiated:
 * the domain warp goes through the full Jacobian (the warped sample coordinate
 * depends on x and z), the city fade through the radial distance, and every
 * smoothstep through 6t(1−t)/(edge1−edge0) (zero outside its window).
 */
function countryElevationGrad(
  x: number,
  z: number,
  config: TerrainConfig,
  seed: number,
): { value: number; gradX: number; gradZ: number } {
  if (config.elevationAmplitudeMeters <= 0) {
    return { value: 0, gradX: 0, gradZ: 0 };
  }
  const fadeCenterX = config.elevationFadeCenter[0];
  const fadeCenterZ = config.elevationFadeCenter[1];
  const distanceToCity = Math.hypot(x - fadeCenterX, z - fadeCenterZ);
  // strength = smoothstep(inner, outer, d) * amplitude (the value path's early-out
  // returns 0 below 0.01 m of strength, so the gradient is 0 there too).
  const strength =
    smoothstep(config.elevationFadeInnerMeters, config.elevationFadeOuterMeters, distanceToCity) *
    config.elevationAmplitudeMeters;
  if (strength <= 0.01) {
    return { value: 0, gradX: 0, gradZ: 0 };
  }
  const citySmooth =
    distanceToCity > 1e-9
      ? smoothstepGrad(
          config.elevationFadeInnerMeters,
          config.elevationFadeOuterMeters,
          distanceToCity,
        )
      : 0;
  const dStrengthDX =
    config.elevationAmplitudeMeters * citySmooth * ((x - fadeCenterX) / distanceToCity);
  const dStrengthDZ =
    config.elevationAmplitudeMeters * citySmooth * ((z - fadeCenterZ) / distanceToCity);

  const wavelength = config.elevationWavelengthMeters;
  const warpMeters = config.elevationWarpMeters;
  const warpXField = fbmGrad(x, z, wavelength * 0.8, seed + 505);
  const warpZField = fbmGrad(x + 4471.2, z - 2903.7, wavelength * 0.8, seed + 606);
  const warpX = warpXField.value * warpMeters;
  const warpZ = warpZField.value * warpMeters;
  // warped = 0.5 * fbm(X, Z) + 0.5 with X = x + warpX, Z = z + warpZ (full Jacobian).
  const field = fbmGrad(x + warpX, z + warpZ, wavelength, seed + 707);
  const warped = field.value * 0.5 + 0.5;
  const dWarpXDX = warpXField.gradX * warpMeters;
  const dWarpXDZ = warpXField.gradZ * warpMeters;
  const dWarpZDX = warpZField.gradX * warpMeters;
  const dWarpZDZ = warpZField.gradZ * warpMeters;
  const dWarpedDX = 0.5 * (field.gradX * (1 + dWarpXDX) + field.gradZ * dWarpZDX);
  const dWarpedDZ = 0.5 * (field.gradX * dWarpXDZ + field.gradZ * (1 + dWarpZDZ));

  // shaped = smootherstep(warped): derivative 6w(1-w).
  const shaped = warped * warped * (3 - 2 * warped);
  const dShapedDX = 6 * warped * (1 - warped) * dWarpedDX;
  const dShapedDZ = 6 * warped * (1 - warped) * dWarpedDZ;

  const gorge = terrainOctaveGrad(x - 913.4, z + 1757.1, wavelength * 0.42, seed + 808);
  const cut1 = smoothstep(0.42, 0.18, gorge.value);
  const cut1Grad = smoothstepGrad(0.42, 0.18, gorge.value);
  const cut2 = smoothstep(0.02, 0.3, warped);
  const cut2Grad = smoothstepGrad(0.02, 0.3, warped);
  const gorgeCut = cut1 * cut2;
  const dCutDX = cut1Grad * gorge.gradX * cut2 + cut1 * cut2Grad * dWarpedDX;
  const dCutDZ = cut1Grad * gorge.gradZ * cut2 + cut1 * cut2Grad * dWarpedDZ;

  const relief = shaped * (1 - 0.62 * gorgeCut);
  const dReliefDX = dShapedDX * (1 - 0.62 * gorgeCut) - 0.62 * shaped * dCutDX;
  const dReliefDZ = dShapedDZ * (1 - 0.62 * gorgeCut) - 0.62 * shaped * dCutDZ;

  // value = (relief - 0.42) * strength * 1.8
  return {
    value: (relief - 0.42) * strength * 1.8,
    gradX: 1.8 * (dReliefDX * strength + (relief - 0.42) * dStrengthDX),
    gradZ: 1.8 * (dReliefDZ * strength + (relief - 0.42) * dStrengthDZ),
  };
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
    height += countryElevationAt(x, z, config, seed);
    // Ridged detail: fBm alone reads as dunes. One-minus-absolute noise makes crests and
    // broken skylines; squared, it stays quiet in the valleys and speaks on the ridges.
    const ridgeBroad = 1 - Math.abs(terrainOctave(x, z, 210, seed + 303));
    const ridgeFine = 1 - Math.abs(terrainOctave(x - 1173.9, z + 941.2, 96, seed + 404));
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

  /**
   * `rawHeight` with its analytic gradient (Phase 11.0b). Every layer is
   * differentiated: hills pass straight through; the country layer carries its
   * domain-warp Jacobian (see `countryElevationGrad`); the ridged terms use
   * d(1−|n|)/dx = −sign(n)·n′ with sign(0) = 0 — a documented kink exactly where
   * the old finite differences were undefined too; the volcano cone
   * d/dt[(1−t)²(1+2t)] = −6t(1−t) along the radial direction, zero past the rim;
   * the floor clamp and the spawn pad are applied by the caller (see
   * `normalAt`).
   */
  const rawHeightGrad = (x: number, z: number): { value: number; gradX: number; gradZ: number } => {
    const hillsA = fbmGrad(x, z, config.hillWavelengthMeters, seed);
    const hillsB = fbmGrad(x + 3917.3, z - 2718.1, config.hillWavelengthMeters * 2.7, seed + 77);
    const hillScaleA = config.hillAmplitudeMeters;
    const hillScaleB = config.hillAmplitudeMeters * 1.6;
    let height = hillsA.value * hillScaleA + hillsB.value * hillScaleB;
    let gradX = hillsA.gradX * hillScaleA + hillsB.gradX * hillScaleB;
    let gradZ = hillsA.gradZ * hillScaleA + hillsB.gradZ * hillScaleB;

    const country = countryElevationGrad(x, z, config, seed);
    height += country.value;
    gradX += country.gradX;
    gradZ += country.gradZ;

    const nBroad = terrainOctaveGrad(x, z, 210, seed + 303);
    const nFine = terrainOctaveGrad(x - 1173.9, z + 941.2, 96, seed + 404);
    const sBroad = nBroad.value > 0 ? 1 : nBroad.value < 0 ? -1 : 0;
    const sFine = nFine.value > 0 ? 1 : nFine.value < 0 ? -1 : 0;
    const ridgeBroad = 1 - Math.abs(nBroad.value);
    const ridgeFine = 1 - Math.abs(nFine.value);
    const dRidgeBroadX = -sBroad * nBroad.gradX;
    const dRidgeBroadZ = -sBroad * nBroad.gradZ;
    const dRidgeFineX = -sFine * nFine.gradX;
    const dRidgeFineZ = -sFine * nFine.gradZ;
    height += ridgeBroad * ridgeBroad * 6.5 + ridgeFine * ridgeFine * 2.1;
    gradX += 2 * ridgeBroad * dRidgeBroadX * 6.5 + 2 * ridgeFine * dRidgeFineX * 2.1;
    gradZ += 2 * ridgeBroad * dRidgeBroadZ * 6.5 + 2 * ridgeFine * dRidgeFineZ * 2.1;

    const dx = x - vx;
    const dz = z - vz;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const t = Math.min(1, distance / config.volcano.radiusMeters);
    const cone = (1 - t) * (1 - t) * (1 + 2 * t);
    const dConeDt = -6 * t * (1 - t);
    const radialScale =
      t < 1 && distance > 1e-9 ? dConeDt / (config.volcano.radiusMeters * distance) : 0;
    const dConeX = radialScale * dx;
    const dConeZ = radialScale * dz;
    const volcanoScale = config.volcano.heightMeters + ridgeBroad * 26;
    height += cone * volcanoScale;
    gradX += dConeX * volcanoScale + cone * 26 * dRidgeBroadX;
    gradZ += dConeZ * volcanoScale + cone * 26 * dRidgeBroadZ;

    return { value: height, gradX, gradZ };
  };

  const heightAt = (x: number, z: number): number => {
    let raw = rawHeight(x, z);
    // The gameplay floor: below `floorMeters` the ground flattens out instead of falling
    // past the vehicle's out-of-bounds reset line.
    if (raw < config.floorMeters) {
      raw = config.floorMeters;
    }
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

  /**
   * Analytic surface normal (Phase 11.0b): the old central-difference normal
   * cost five full `heightAt` evaluations (≈ 125 noise samples) per call — this
   * is one `rawHeightGrad` plus the same clamp/pad rules `heightAt` applies:
   * below the floor the surface is flat except for the spawn-pad blend (the
   * clamped value is constant, so only the pad factor differentiates), and the
   * pad multiplies the height radially.
   */
  const normalAt = (x: number, z: number): { x: number; y: number; z: number } => {
    const field = rawHeightGrad(x, z);
    let raw = field.value;
    let dRawX = field.gradX;
    let dRawZ = field.gradZ;
    if (raw < config.floorMeters) {
      raw = config.floorMeters;
      dRawX = 0;
      dRawZ = 0;
    }
    const distance = Math.sqrt(x * x + z * z);
    const pad = smoothstep(
      config.spawnPad.flatRadiusMeters,
      config.spawnPad.blendRadiusMeters,
      distance,
    );
    const dPadDd = smoothstepGrad(
      config.spawnPad.flatRadiusMeters,
      config.spawnPad.blendRadiusMeters,
      distance,
    );
    const radial = distance > 1e-9 ? dPadDd / distance : 0;
    const heightX = dRawX * pad + raw * radial * x;
    const heightZ = dRawZ * pad + raw * radial * z;
    const length = Math.sqrt(heightX * heightX + 1 + heightZ * heightZ);
    return { x: -heightX / length, y: 1 / length, z: -heightZ / length };
  };

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
 * Which surfaces live at a point, as normalised [grass, soil, rock, reserved] weights.
 * The fourth component stays in the vertex layout for compatibility, but is deliberately
 * fixed at zero: gameplay terrain has no snow material or white ground layer.
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
  trail = 0,
): TerrainSplatWeights {
  // There is no snow layer in the gameplay world. Above the alpine transition the same
  // high ground is exposed dark rock and soil instead, so neither distant macro colour nor
  // near scanned textures can turn the terrain into a white field.
  const altitude = smoothstep(
    config.alpineRocklineMeters,
    config.alpineRocklineMeters + 55,
    height,
  );
  const alpineExposure = smoothstep(0.05, 0.45, patch * 0.72 + variation * 0.48);
  const rockSlope = smoothstep(0.22, 0.42, slope);
  const alpineRock = altitude * (0.28 + (1 - alpineExposure) * 0.28);
  const rockOutcrop =
    smoothstep(0.32, 0.62, patch) * smoothstep(0.012, 0.045, slope) * (1 - altitude * 0.5) * 0.85;
  let rock = Math.min(1, Math.max(rockSlope, alpineRock, rockOutcrop));

  // Dry soil patches break up the flat lowland grass at hectare scale. On high ground,
  // the alpine field adds exposed soil among the rock; no snow texture is involved.
  const soilSlope = smoothstep(0.07, 0.22, slope) * (1 - rockSlope);
  const drySoilPatch = smoothstep(0.02, 0.45, variation) * (1 - rock) * (1 - altitude) * 0.8;
  const alpineSoil = altitude * (0.12 + alpineExposure * 0.1) * (1 - rock);
  let soil = Math.min(1, Math.max(soilSlope, drySoilPatch) + alpineSoil);

  // Keep lowlands green; progressively expose soil and rock at high altitude.
  let grass = Math.max(0, 1 - rock - soil);
  grass *= 1 - altitude * 0.48;
  // Worn trail dirt: off-road routes read as a packed-earth band — soil-dominant
  // in the middle, grass reclaiming the feathered edge. The same numbers feed physics
  // (terrain-surface.ts), so the band a car sees is the dirt grip it feels.
  if (trail > 0) {
    const packed = Math.min(1, trail);
    grass *= 1 - packed * 0.8;
    rock *= 1 - packed * 0.7;
    soil = Math.max(soil * (1 - packed), packed * 0.9);
  }
  const total = grass + soil + rock;
  if (total <= 1e-6) {
    return [1, 0, 0, 0];
  }
  return [grass / total, soil / total, rock / total, 0];
}

/**
 * Splat weights → vertex colour. Pure and shared by every chunk, so two chunks meeting at
 * a border colour their shared edge identically (the heights agree there by construction;
 * the colours must too, or the seam shows even when the geometry does not).
 *
 * The macro tint half of the Phase 4 splat: green grass lowlands, soil on worked slopes,
 * and dark exposed rock at altitude or on steep ground. The scanned CC0 sets supply the
 * near detail (see TerrainWorld); this tint carries the hundred-metre colour story and the
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
  trail = 0,
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

  const [grassWeight, soilWeight, rockWeight] = terrainSurfaceWeights(
    config,
    height,
    slope,
    variation,
    patch,
    trail,
  );
  const shade = Math.min(1.08, Math.max(0.8, occlusion));
  const color = [
    (grass[0] * grassWeight + soil[0] * soilWeight + rock[0] * rockWeight) * shade * groundTint[0],
    (grass[1] * grassWeight + soil[1] * soilWeight + rock[1] * rockWeight) * shade * groundTint[1],
    (grass[2] * grassWeight + soil[2] * soilWeight + rock[2] * rockWeight) * shade * groundTint[2],
  ] as const;
  return color;
}
