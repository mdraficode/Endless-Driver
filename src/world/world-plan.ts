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

/** Bump whenever plan semantics change; the world key is seed + version (plan §5). */
export const WORLD_PLAN_VERSION = 1;

/** Macro-cell edge, metres. Regions tile the plane on this lattice. */
export const REGION_CELL_METERS = 4000;

/** Global city block lattice, metres — megacity road lines sit on 50 m world lines. */
export const MEGACITY_BLOCK_METERS = 50;

/** Global urban-fringe block lattice, metres (wider residential blocks). */
export const URBAN_FRINGE_BLOCK_METERS = 80;

export type RegionArchetype =
  'megacity' | 'urban-fringe' | 'small-town' | 'rural' | 'mountain-pass';

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
  return own * 0.7 + maxNeighbour * 0.3;
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
  if (u >= 0.72) return 'megacity';
  if (u >= 0.45) return 'urban-fringe';
  if (u >= 0.32) return 'small-town';
  if (u >= 0.1) return 'rural';
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
    speciesDensity: { conifer: 0.12, broadleaf: 0.6, sakura: 0.7, bamboo: 0.15, rock: 0.15 },
    groundTint: [1.03, 0.99, 0.9],
  },
  // Garden town (Yūhi's rule: buildings carry the district, garden trees only).
  'small-town': {
    labelPrefix: 'Town',
    radiusFraction: 0.75,
    speciesDensity: { conifer: 0.15, broadleaf: 0.55, sakura: 0.8, bamboo: 0.2, rock: 0.1 },
    groundTint: [1.03, 0.99, 0.9],
  },
  // Open countryside (Shirasagi's rule: trees are events, not cover).
  rural: {
    labelPrefix: 'Fields',
    radiusFraction: 0.85,
    speciesDensity: { conifer: 0.1, broadleaf: 0.35, sakura: 0.15, rock: 0.4 },
    groundTint: [1.13, 1.03, 0.76],
  },
  // Canyon pass (Kiri's rule: sugi cedar and exposed rock around the pass road).
  'mountain-pass': {
    labelPrefix: 'Pass',
    radiusFraction: 0.9,
    speciesDensity: { conifer: 3.2, broadleaf: 0.5, rock: 1.4 },
    groundTint: [0.8, 0.93, 0.79],
    canopyScale: 1.25,
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

  const regionAtCell = (ix: number, iz: number): RegionPlan => {
    const regionSeed = hashInt(ix, iz, worldSeed ^ 0x5eed5eed);
    const archetype = archetypeAtCell(ix, iz, worldSeed);
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

    const spec = DISTRICT_SPECS[archetype];
    // The home district hugs the spawn: a large core with small jitter, so the start is
    // always in the middle of the vast city, not at its edge.
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

    return {
      id,
      ix,
      iz,
      centerX,
      centerZ,
      archetype,
      seed: regionSeed,
      ...(cityGrid !== undefined ? { cityGrid } : {}),
      district,
    };
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
