import { DISTRICTS, type DistrictConfig, type VegetationSpecies } from '../config/districts';

export const VEGETATION_SPECIES: readonly VegetationSpecies[] = [
  'conifer',
  'broadleaf',
  'sakura',
  'bamboo',
  'rock',
];

/**
 * District influence at a world point: full strength inside 55% of a district's
 * radius, smoothstepping to zero at its edge. Districts never move and the world
 * is deterministic, so this is a pure function of position — the same world the
 * sampler describes, annotated with its places. Overlapping districts blend by
 * taking the strongest influence per species slot rather than summing, so two
 * neighbouring districts cannot double-plant their shared border.
 */
export function speciesMultipliersAt(x: number, z: number): Record<VegetationSpecies, number> {
  const result: Record<VegetationSpecies, number> = {
    conifer: 1,
    broadleaf: 1,
    sakura: 1,
    bamboo: 1,
    rock: 1,
  };
  for (const district of DISTRICTS) {
    const dx = x - district.centerX;
    const dz = z - district.centerZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= district.radiusMeters) {
      continue;
    }
    const t = distance / district.radiusMeters;
    // 1 inside 0.55R, smoothstep to 0 at R.
    const edge = t <= 0.55 ? 1 : 1 - ((t - 0.55) / 0.45) ** 2 * (3 - 2 * ((t - 0.55) / 0.45));
    for (const species of VEGETATION_SPECIES) {
      const multiplier = district.speciesDensity[species];
      if (multiplier === undefined) {
        continue;
      }
      const blended = 1 + (multiplier - 1) * edge;
      // Take the strongest deviation from background (per species), not the sum.
      if (Math.abs(blended - 1) > Math.abs(result[species] - 1)) {
        result[species] = blended;
      }
    }
  }
  return result;
}

/** The district whose core contains the point, if any (diagnostics/UI naming). */
export function districtAt(x: number, z: number): DistrictConfig | null {
  let best: DistrictConfig | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const district of DISTRICTS) {
    const distance = Math.hypot(x - district.centerX, z - district.centerZ);
    if (distance < district.radiusMeters * 0.55 && distance < bestDistance) {
      best = district;
      bestDistance = distance;
    }
  }
  return best;
}

/** District edge influence (0..1) shared by the ground-tint resolver. */
function districtEdge(district: DistrictConfig, x: number, z: number): number {
  const distance = Math.hypot(x - district.centerX, z - district.centerZ);
  if (distance >= district.radiusMeters) {
    return 0;
  }
  const t = distance / district.radiusMeters;
  if (t <= 0.55) {
    return 1;
  }
  const u = (t - 0.55) / 0.45;
  return 1 - u * u * (3 - 2 * u);
}

const NEUTRAL_TINT: readonly [number, number, number] = [1, 1, 1];

/**
 * Macro ground tint at a point: the strongest district's tint, mixed from
 * neutral at 65% of its edge influence. Outside every district the ground
 * keeps the prefecture-wide palette.
 */
export function groundTintAt(x: number, z: number): readonly [number, number, number] {
  let tint: readonly [number, number, number] = NEUTRAL_TINT;
  let strongest = 0;
  for (const district of DISTRICTS) {
    const edge = districtEdge(district, x, z);
    if (edge > strongest) {
      strongest = edge;
      tint = district.groundTint;
    }
  }
  const mixAmount = strongest * 0.65;
  return [
    1 + (tint[0] - 1) * mixAmount,
    1 + (tint[1] - 1) * mixAmount,
    1 + (tint[2] - 1) * mixAmount,
  ];
}
