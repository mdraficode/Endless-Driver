/**
 * The world plan: the single source of truth for "what is this world" (Phase 10).
 *
 * A world is `seed + generator version` (plan §5). The plane is tiled into 4 km macro-cells;
 * each cell's archetype, city grid lines, district soft-disc and spawn are pure functions of
 * (seed, cell) with separate deterministic streams, so travelling order cannot change the plan
 * and neighbouring cells always agree (grid lines and district edges are functions of world
 * coordinates, not of the cell that draws them).
 *
 * Pure module: no three.js, no Rapier, no DOM — the plan is unit-testable and generates in a
 * few hundred milliseconds at load. The road layout (road-layout.ts) consumes `WorldPlan` and
 * emits the existing `RoadNetworkConfig` shape, so the road solver, terrain carve, ribbons,
 * physics and minimap stay untouched downstream.
 */

import { createTerrainSampler } from './terrain-height';
import { TERRAIN_CONFIG, type TerrainConfig } from '../config/terrain';

/** Bump whenever plan semantics change; the world key is seed + version (plan §5). */
export const WORLD_PLAN_VERSION = 3;

/** Macro-cell edge, metres. Regions tile the plane on this lattice. */
export const REGION_CELL_METERS = 4000;

/**
 * The heightfield seed for a world: its own stream off the world seed, so the same world
 * always gets the same terrain and every launch gets different terrain.
 */
export function terrainSeedFor(worldSeed: number): number {
  return (Math.imul(worldSeed, 0x9e3779b9) ^ 0x7e55d) | 0;
}

/** Highest terrain point over a cell (5×5 probe). A world's passes live where the ground is high. */
const cellMaxHeight = (
  sampler: ReturnType<typeof createTerrainSampler>,
  ix: number,
  iz: number,
): number => {
  const cx = ix * REGION_CELL_METERS;
  const cz = iz * REGION_CELL_METERS;
  let max = 0;
  for (let dz = -2; dz <= 2; dz += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      max = Math.max(max, sampler.heightAt(cx + dx * 800, cz + dz * 800));
    }
  }
  return max;
};

/** Cells reaching this height are pass country regardless of the urbanness roll — this is
 * what puts a real mountain pass next to the volcano in every world (the old Kiri geography). */
const PASS_MAX_HEIGHT_METERS = 180;

/** Global city block lattice, metres — megacity road lines sit on 50 m world lines. */
export const MEGACITY_BLOCK_METERS = 50;

/** Global urban-fringe block lattice, metres (wider residential blocks). */
export const URBAN_FRINGE_BLOCK_METERS = 80;

export type RegionArchetype =
  'megacity' | 'urban-fringe' | 'small-town' | 'rural' | 'mountain-pass';

/** Phase 10 pass 2: the colony's dense, dim, backstreets-first variant. */
export type RegionSubArchetype = 'slum-colony';

/** Soft-disc district influence (same shape as config/districts.ts districts). */
export interface PlannedDistrict {
  readonly id: string;
  readonly label: string;
  readonly centerX: number;
  readonly centerZ: number;
  /** Full-influence radius is 55% of this; influence fades to zero at the edge. */
  readonly radiusMeters: number;
  readonly speciesDensity: Partial<Record<string, number>>;
  readonly groundTint: readonly [number, number, number];
  readonly canopyScale?: number;
}

/** The city grid descriptor for an urban cell (roads live on global lattice lines). */
export interface CityGrid {
  readonly blockMeters: number;
  /**
   * Class of a grid line at lattice coordinate `line` (line * blockMeters = world offset).
   * Pure in the line coordinate, so adjacent cells agree on shared lines.
   */
  readonly lineClass: (line: number) => 'urban-arterial' | 'urban-local';
}

export interface RegionPlan {
  readonly id: string;
  readonly ix: number;
  readonly iz: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly archetype: RegionArchetype;
  /** Region seed: a separate stream from the world seed (plan §5). */
  readonly seed: number;
  /** Phase 10 pass 2: urban-fringe cells only. */
  readonly subArchetype?: RegionSubArchetype;
  /** Urban cells only. */
  readonly cityGrid?: CityGrid;
  /** One soft-disc district per cell. */
  readonly district: PlannedDistrict;
}

export interface WorldPlan {
  readonly seed: number;
  readonly generatorVersion: number;
  /** The plan for the macro-cell containing world point (x, z). */
  readonly regionAt: (x: number, z: number) => RegionPlan;
  /** The plan for a macro-cell by integer coordinates. */
  readonly regionAtCell: (ix: number, iz: number) => RegionPlan;
  /**
   * The spawn: always inside the home city (cell 0,0 is forced urban), on the global city
   * lattice near the origin. The road layout places the exact spawn edge; this is the target.
   */
  readonly spawn: {
    readonly x: number;
    readonly z: number;
    readonly region: RegionArchetype;
    /** Road class the layout should prefer for the spawn edge. */
    readonly preferredClass: 'urban-arterial' | 'urban-local';
  };
}

// ---------------------------------------------------------------------------
// Deterministic primitives (same integer-hash family as terrain-height.ts).
// ---------------------------------------------------------------------------

/** 32-bit integer hash of a lattice point and stream seed → [0, 1). */
function hash2(ix: number, iz: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ Math.imul(ix | 0, 0x27d4eb2d), 0x165667b1);
  h = Math.imul(h ^ Math.imul(iz | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 32-bit integer hash → a 32-bit integer (for region seeds). */
function hashInt(ix: number, iz: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ Math.imul(ix | 0, 0x27d4eb2d), 0x165667b1);
  h = Math.imul(h ^ Math.imul(iz | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Two-octave value noise over the macro-cell lattice → [0, 1). */
function rawUrbanness(ix: number, iz: number, worldSeed: number): number {
  const seed = (worldSeed ^ 0x51ab7e3d) | 0;
  const sample = (scale: number, stream: number): number => {
    const fx = ix / scale;
    const fz = iz / scale;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fade(fx - x0);
    const tz = fade(fz - z0);
    const a = hash2(x0, z0, seed ^ stream);
    const b = hash2(x0 + 1, z0, seed ^ stream);
    const c = hash2(x0, z0 + 1, seed ^ stream);
    const d = hash2(x0 + 1, z0 + 1, seed ^ stream);
    const ab = a + (b - a) * tx;
    const cd = c + (d - c) * tx;
    return ab + (cd - ab) * tz;
  };
  const coarse = sample(3, 0x10001);
  const fine = sample(1.5, 0x20002);
  return coarse * 0.72 + fine * 0.28;
}

/**
 * Urbanness with one spreading pass: a cell borrows 30% of its strongest direct neighbour.
 * City cores grow by a cell ring instead of scattering as isolated patches (a vast city
 * should read as a vast city), while rural pockets stay bounded.
 */
function urbannessAtCell(ix: number, iz: number, worldSeed: number): number {
  const own = rawUrbanness(ix, iz, worldSeed);
  const maxNeighbour = Math.max(
    rawUrbanness(ix + 1, iz, worldSeed),
    rawUrbanness(ix - 1, iz, worldSeed),
    rawUrbanness(ix, iz + 1, worldSeed),
    rawUrbanness(ix, iz - 1, worldSeed),
  );
  return own * 0.8 + maxNeighbour * 0.2;
}

// ---------------------------------------------------------------------------
// Archetype rules.
//
// Thresholds over `u = urbannessAtCell` (mostly-urban mix, per the owner's "vast city"
// direction): megacity ≥ 0.76, urban-fringe ≥ 0.48, small-town ≥ 0.34, rural ≥ 0.10,
// otherwise mountain-pass. The home cell (0,0) is forced urban so every world starts in
// a city (today's Central Avenue vibe).
// ---------------------------------------------------------------------------

function archetypeAtCell(ix: number, iz: number, worldSeed: number): RegionArchetype {
  // The home cell is always the megacity core: every world starts in the vast city,
  // on a boulevard (today's Central Avenue vibe), whatever the seed rolls.
  if (ix === 0 && iz === 0) return 'megacity';
  const u = urbannessAtCell(ix, iz, worldSeed);
  if (u >= 0.76) return 'megacity';
  if (u >= 0.52) return 'urban-fringe';
  if (u >= 0.36) return 'small-town';
  if (u >= 0.14) return 'rural';
  return 'mountain-pass';
}

/**
 * Class of a city grid line at lattice coordinate `line`, world line at
 * `line * blockMeters`. Arterials form seeded boulevards: a line is arterial when its
 * hash falls in the arterial fraction — pure in the line coordinate, so every cell that
 * contains the line agrees.
 */
function cityLineClass(
  line: number,
  regionSeed: number,
  arterialFraction: number,
): 'urban-arterial' | 'urban-local' {
  return hash2(line, 0x9e37, regionSeed) < arterialFraction ? 'urban-arterial' : 'urban-local';
}

// ---------------------------------------------------------------------------
// District parameters per archetype (generalized from the hand-placed districts).
// ---------------------------------------------------------------------------

interface ArchetypeDistrictSpec {
  readonly labelPrefix: string;
  /** Radius fraction of the cell (0..1). */
  readonly radiusFraction: number;
  readonly speciesDensity: Partial<Record<string, number>>;
  readonly groundTint: readonly [number, number, number];
  readonly canopyScale?: number;
}

const DISTRICT_SPECS: Record<RegionArchetype, ArchetypeDistrictSpec> = {
  // The core has no wild vegetation (Aohara's rule).
  megacity: {
    labelPrefix: 'Metropolis',
    radiusFraction: 0.55,
    speciesDensity: { conifer: 0, broadleaf: 0, sakura: 0, bamboo: 0, rock: 0 },
    groundTint: [1, 1, 1],
  },
  // Residential fringe: sparse planting, warm ground.
  'urban-fringe': {
    labelPrefix: 'Colony',
    radiusFraction: 0.7,
    // Suburban planting — the old world's fringe ran at full base density.
    speciesDensity: { conifer: 0.6, broadleaf: 1.2, sakura: 1.4, bamboo: 0.4, rock: 0.3 },
    groundTint: [1.02, 1.0, 0.92],
  },
  // Garden town (Yūhi's rule: buildings carry the district, garden trees only).
  'small-town': {
    labelPrefix: 'Town',
    radiusFraction: 0.75,
    speciesDensity: { conifer: 0.4, broadleaf: 1.0, sakura: 1.2, bamboo: 0.5, rock: 0.3 },
    groundTint: [1.02, 1.0, 0.92],
  },
  // Open countryside. In the generated world this archetype IS the countryside (the old
  // world's base density, a little richer), never the sparse spot-district the old
  // Shirasagi terraces were — 3x sparser than the old countryside read as "empty"
  // (owner report 2026-11-02).
  rural: {
    labelPrefix: 'Fields',
    radiusFraction: 0.9,
    speciesDensity: { conifer: 1.5, broadleaf: 1.3, sakura: 0.5, bamboo: 0.4, rock: 0.7 },
    groundTint: [1.02, 1.0, 0.95],
  },
  // Canyon pass (Kiri's rule: sugi cedar and exposed rock around the pass road).
  'mountain-pass': {
    labelPrefix: 'Pass',
    radiusFraction: 0.9,
    speciesDensity: { conifer: 3.4, broadleaf: 0.8, sakura: 0.3, bamboo: 0.2, rock: 1.5 },
    groundTint: [0.82, 0.95, 0.8],
    canopyScale: 1.3,
  },
};

/** A few name stems so districts read as places, not coordinates. */
const NAME_STEMS = [
  'Aoba',
  'Hinode',
  'Kiri',
  'Sakura',
  'Take',
  'Yūhi',
  'Shirasagi',
  'Kuroha',
  'Aohara',
  'Hokuto',
  'Minami',
  'Kitagawa',
] as const;

function districtName(seed: number, prefix: string): string {
  const stem = NAME_STEMS[Math.floor(hash2(0x77, 0x77, seed) * NAME_STEMS.length)];
  return `${stem} ${prefix}`;
}

// ---------------------------------------------------------------------------
// Plan construction.
// ---------------------------------------------------------------------------

/**
 * Builds the world plan for a seed. Generation is a few hash evaluations per cell — the plan
 * itself is generated on demand (regionAtCell is called by the streamers), so constructing it
 * is O(1).
 */
export function createWorldPlan(seed: number): WorldPlan {
  const worldSeed = seed | 0;
  // Built lazily on the first high cell probe; pure math, no renderer needed.
  let terrainSampler: ReturnType<typeof createTerrainSampler> | null = null;
  const probeTerrain = (): ReturnType<typeof createTerrainSampler> => {
    if (terrainSampler === null) {
      const config: TerrainConfig = { ...TERRAIN_CONFIG, seed: terrainSeedFor(worldSeed) };
      terrainSampler = createTerrainSampler(config);
    }
    return terrainSampler;
  };
  // Regions are immutable per seed; the plan is queried point-by-point by the vegetation
  // and terrain tint paths, so memoise instead of re-rolling the hashes.
  const regionCache = new Map<string, RegionPlan>();

  const regionAtCell = (ix: number, iz: number): RegionPlan => {
    const key = `${ix},${iz}`;
    const cached = regionCache.get(key);
    if (cached !== undefined) return cached;
    const regionSeed = hashInt(ix, iz, worldSeed ^ 0x5eed5eed);
    let archetype = archetypeAtCell(ix, iz, worldSeed);
    // High ground is pass country no matter what the urbanness roll says: this is what puts
    // a real mountain pass (and its cedar forest) in every world, next to the big volcano —
    // the old world's Kiri sat right against the city, and the generated one does too.
    if (archetype !== 'megacity') {
      if (cellMaxHeight(probeTerrain(), ix, iz) > PASS_MAX_HEIGHT_METERS) {
        archetype = 'mountain-pass';
      }
    }
    // The lattice is centred on the origin: cell (0,0) spans [-2000, 2000) so the home
    // city (and the spawn) sits at its centre, not on a corner.
    const centerX = ix * REGION_CELL_METERS;
    const centerZ = iz * REGION_CELL_METERS;
    const id = `r${ix}-${iz}`;

    let cityGrid: CityGrid | undefined;
    if (archetype === 'megacity' || archetype === 'urban-fringe') {
      const blockMeters =
        archetype === 'megacity' ? MEGACITY_BLOCK_METERS : URBAN_FRINGE_BLOCK_METERS;
      const arterialFraction = archetype === 'megacity' ? 0.3 : 0.18;
      cityGrid = {
        blockMeters,
        lineClass: (line: number) => cityLineClass(line, regionSeed, arterialFraction),
      };
    }

    let spec = DISTRICT_SPECS[archetype];
    // The old world's Kuroha Jungle signature: bamboo and broadleaf under a tall canopy.
    // ~45% of rural cells grow into a grove so every world has its deep forest.
    if (archetype === 'rural' && hash2(0xe7, 0x7e, regionSeed) < 0.45) {
      spec = {
        labelPrefix: 'Grove',
        radiusFraction: 0.95,
        speciesDensity: { conifer: 0.4, broadleaf: 1.9, sakura: 0.9, bamboo: 2.4, rock: 0.4 },
        groundTint: [0.9, 1.02, 0.86],
        canopyScale: 1.45,
      };
    }
    // The home district hugs the spawn: a large core with small jitter, so the start is
    // always in the middle of the vast city, not at its edge.
    // Phase 10 pass 2: ~a third of the colonies grow into slum-colonies — dense,
    // narrow, dim, backstreets-first. Deterministic per region seed.
    let subArchetype: RegionSubArchetype | undefined;
    if (archetype === 'urban-fringe' && hash2(0x51, 0x52, regionSeed) < 0.35) {
      subArchetype = 'slum-colony';
    }
    const jitter = ix === 0 && iz === 0 ? 0.15 : 0.35;
    const district: PlannedDistrict = {
      id: `d-${id}`,
      label: districtName(regionSeed, spec.labelPrefix),
      centerX: centerX + (hash2(0xa1, 0xb2, regionSeed) - 0.5) * 2 * jitter * REGION_CELL_METERS,
      centerZ: centerZ + (hash2(0xb3, 0xa4, regionSeed) - 0.5) * 2 * jitter * REGION_CELL_METERS,
      radiusMeters:
        spec.radiusFraction * REGION_CELL_METERS * (0.85 + 0.3 * hash2(0xc5, 0xd6, regionSeed)),
      speciesDensity: spec.speciesDensity,
      groundTint: spec.groundTint,
      ...(spec.canopyScale !== undefined ? { canopyScale: spec.canopyScale } : {}),
    };

    const region: RegionPlan = {
      id,
      ix,
      iz,
      centerX,
      centerZ,
      archetype,
      seed: regionSeed,
      ...(subArchetype !== undefined ? { subArchetype } : {}),
      ...(cityGrid !== undefined ? { cityGrid } : {}),
      district,
    };
    regionCache.set(key, region);
    return region;
  };

  const regionAt = (x: number, z: number): RegionPlan =>
    regionAtCell(
      Math.floor(x / REGION_CELL_METERS + 0.5),
      Math.floor(z / REGION_CELL_METERS + 0.5),
    );

  return {
    seed: worldSeed,
    generatorVersion: WORLD_PLAN_VERSION,
    regionAt,
    regionAtCell,
    spawn: {
      x: 0,
      z: 0,
      // The home cell is always the megacity core: the start reads as a boulevard.
      region: 'megacity',
      preferredClass: 'urban-arterial',
    },
  };
}

/**
 * Archetype histogram over a square of macro-cells centred on the origin — for diagnostics
 * and the plan summary in the report.
 */
export function planArchetypeCounts(
  plan: WorldPlan,
  radiusCells: number,
): Record<RegionArchetype, number> {
  const counts: Record<RegionArchetype, number> = {
    megacity: 0,
    'urban-fringe': 0,
    'small-town': 0,
    rural: 0,
    'mountain-pass': 0,
  };
  for (let ix = -radiusCells; ix <= radiusCells; ix += 1) {
    for (let iz = -radiusCells; iz <= radiusCells; iz += 1) {
      counts[plan.regionAtCell(ix, iz).archetype] += 1;
    }
  }
  return counts;
}
