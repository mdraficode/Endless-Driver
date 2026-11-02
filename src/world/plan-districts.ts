/**
 * Phase 10 — plan-driven districts.
 *
 * The hand-placed Hinode districts (config/districts.ts) become the plan's: every macro-cell
 * carries one soft-disc district (see `world-plan.ts`), so a new world gets new forests, new
 * blossom avenues, new rock fields — with the same soft-disc math the original used.
 *
 * The seam is a module-level provider set once by `DrivingWorld` when a plan exists. Callers
 * keep their signatures (`speciesMultipliersAt(x, z)` etc.): with no provider they fall back
 * to the static districts, which is what unit fixtures and the standalone scenes use.
 */
import type { VegetationSpecies } from '../config/districts';
import {
  canopyScaleAt as staticCanopyScaleAt,
  groundTintAt as staticGroundTintAt,
  speciesMultipliersAt as staticSpeciesMultipliersAt,
  VEGETATION_SPECIES,
} from './districts';
import { REGION_CELL_METERS, type WorldPlan } from './world-plan';

interface PlanDistrictShape {
  readonly centerX: number;
  readonly centerZ: number;
  readonly radiusMeters: number;
  readonly speciesDensity: Partial<Record<VegetationSpecies, number>>;
  readonly groundTint: readonly [number, number, number];
  readonly canopyScale?: number;
}

let planQuery: ((x: number, z: number) => readonly PlanDistrictShape[]) | null = null;

/** Installs the plan's district source. Pass null to restore the static districts. */
export function setPlanDistricts(plan: WorldPlan | null): void {
  if (plan === null) {
    planQuery = null;
    return;
  }
  planQuery = (x, z) => {
    // A district can reach ~2.3 cells from its centre, so test the point's cell plus the
    // eight neighbours. Cheap: nine region lookups, each a handful of hashes.
    const ix = Math.floor(x / REGION_CELL_METERS + 0.5);
    const iz = Math.floor(z / REGION_CELL_METERS + 0.5);
    const found: PlanDistrictShape[] = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const region = plan.regionAtCell(ix + dx, iz + dz);
        found.push({
          centerX: region.district.centerX,
          centerZ: region.district.centerZ,
          radiusMeters: region.district.radiusMeters,
          speciesDensity: region.district.speciesDensity,
          groundTint: region.district.groundTint,
          ...(region.district.canopyScale !== undefined
            ? { canopyScale: region.district.canopyScale }
            : {}),
        });
      }
    }
    return found;
  };
}

function districtsAt(x: number, z: number): readonly PlanDistrictShape[] {
  return planQuery === null ? [] : planQuery(x, z);
}

function edgeInfluence(district: PlanDistrictShape, x: number, z: number): number {
  const distance = Math.hypot(x - district.centerX, z - district.centerZ);
  if (distance >= district.radiusMeters) {
    return 0;
  }
  const t = distance / district.radiusMeters;
  return t <= 0.55 ? 1 : 1 - ((t - 0.55) / 0.45) ** 2 * (3 - 2 * ((t - 0.55) / 0.45));
}

/** Species density multipliers at a point (plan districts, else the static Hinode set). */
export function speciesMultipliersAt(x: number, z: number): Record<VegetationSpecies, number> {
  if (planQuery === null) {
    return staticSpeciesMultipliersAt(x, z);
  }
  const result: Record<VegetationSpecies, number> = {
    conifer: 1,
    broadleaf: 1,
    sakura: 1,
    bamboo: 1,
    rock: 1,
  };
  for (const district of districtsAt(x, z)) {
    const edge = edgeInfluence(district, x, z);
    if (edge <= 0) continue;
    for (const species of VEGETATION_SPECIES) {
      const multiplier = district.speciesDensity[species];
      if (multiplier === undefined) continue;
      const blended = 1 + (multiplier - 1) * edge;
      if (Math.abs(blended - 1) > Math.abs(result[species] - 1)) {
        result[species] = blended;
      }
    }
  }
  return result;
}

/** Ground tint at a point (plan districts, else the static Hinode set). */
export function groundTintAt(x: number, z: number): readonly [number, number, number] {
  if (planQuery === null) {
    return staticGroundTintAt(x, z);
  }
  let tint: readonly [number, number, number] = [1, 1, 1];
  let strongest = 0;
  for (const district of districtsAt(x, z)) {
    const edge = edgeInfluence(district, x, z);
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

/** Canopy scale at a point (plan districts, else the static Hinode set). */
export function canopyScaleAt(x: number, z: number): number {
  if (planQuery === null) {
    return staticCanopyScaleAt(x, z);
  }
  let scale = 1;
  let strongest = 0;
  for (const district of districtsAt(x, z)) {
    const canopy = district.canopyScale ?? 1;
    if (canopy === 1) continue;
    const edge = edgeInfluence(district, x, z);
    if (edge > strongest) {
      strongest = edge;
      scale = canopy;
    }
  }
  return 1 + (scale - 1) * strongest;
}

/**
 * The nearest small-town district to the origin, for re-anchoring the rural town kit
 * (Yūhi) onto a generated small town. Null when the road window holds no small town.
 */
export function nearestSmallTownDistrict(plan: WorldPlan, windowCells: number) {
  let best: { x: number; z: number; radius: number } | null = null;
  let bestDistance = Infinity;
  for (let iz = -windowCells; iz <= windowCells; iz += 1) {
    for (let ix = -windowCells; ix <= windowCells; ix += 1) {
      if (ix === 0 && iz === 0) continue;
      const region = plan.regionAtCell(ix, iz);
      if (region.archetype !== 'small-town') continue;
      const distance = Math.hypot(region.district.centerX, region.district.centerZ);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = {
          x: region.district.centerX,
          z: region.district.centerZ,
          radius: region.district.radiusMeters,
        };
      }
    }
  }
  return best;
}
