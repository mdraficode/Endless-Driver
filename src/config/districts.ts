/**
 * District layout for Hinode Prefecture (VISUAL_TARGET §5), keyed to the road
 * network that already exists (src/config/roads.ts): each district is a soft disc
 * of influence over the eternal world map. Districts never touch the height
 * function — they govern what grows and (next increment) what gets built inside
 * them, so the terrain the car drives on stays one deterministic function while
 * the *places* layer on top.
 *
 * Species ids are the vegetation vocabulary shared by the resolver
 * (src/world/districts.ts) and the instanced scatter (src/world/vegetation.ts).
 */
export type VegetationSpecies = 'conifer' | 'broadleaf' | 'sakura' | 'bamboo' | 'rock';

export interface DistrictConfig {
  readonly id: string;
  readonly label: string;
  readonly centerX: number;
  readonly centerZ: number;
  /** Full-influence radius is 55% of this; influence fades to zero at the edge. */
  readonly radiusMeters: number;
  /** Per-species density multiplier inside the district (background rules are 1). */
  readonly speciesDensity: Partial<Record<VegetationSpecies, number>>;
  /**
   * Macro ground tint (multiplier on the terrain vertex colour) so districts
   * read as different ground, not just different trees (owner report,
   * 2026-10-16: "no diversity on different terrain"). Applied at 65% strength.
   */
  readonly groundTint: readonly [number, number, number];
}

export const DISTRICTS: readonly DistrictConfig[] = [
  {
    // Kiri Pass (霧峠): the touge — canyon walls of sugi cedar around the pass road.
    id: 'Kiri-cedar',
    label: 'Kiri Pass',
    centerX: -430,
    centerZ: -1010,
    radiusMeters: 720,
    speciesDensity: { conifer: 3.2, broadleaf: 0.5, rock: 1.4 },
    groundTint: [0.8, 0.93, 0.79],
  },
  {
    // Sakura Avenue along the eastern road into town: blossom trees crowd the verge.
    id: 'sakura-avenue',
    label: 'Sakura Avenue',
    centerX: 620,
    centerZ: -430,
    radiusMeters: 420,
    speciesDensity: { sakura: 3.4, broadleaf: 1.2, conifer: 0.4 },
    groundTint: [1.07, 0.94, 0.95],
  },
  {
    // Take-no-Michi (竹の道): the bamboo lane leaving the junction southward.
    id: 'takenomichi',
    label: 'Take-no-Michi',
    centerX: 130,
    centerZ: 90,
    radiusMeters: 300,
    speciesDensity: { bamboo: 4.2, broadleaf: 0.7, conifer: 0.3 },
    groundTint: [0.84, 1.03, 0.85],
  },
  {
    // Yūhi Town (夕陽町): garden trees only — buildings carry this district (5b).
    id: 'yuhi-town',
    label: 'Yūhi Town',
    centerX: 540,
    centerZ: 300,
    radiusMeters: 340,
    speciesDensity: { conifer: 0.15, broadleaf: 0.55, sakura: 0.8, bamboo: 0.2, rock: 0.1 },
    groundTint: [1.03, 0.99, 0.9],
  },
  {
    // Shirasagi Terraces (白鷺の棚田): open farmland — trees are events, not cover.
    id: 'shirasagi-fields',
    label: 'Shirasagi Terraces',
    centerX: 60,
    centerZ: 620,
    radiusMeters: 680,
    speciesDensity: { conifer: 0.1, broadleaf: 0.35, sakura: 0.15, rock: 0.4 },
    groundTint: [1.13, 1.03, 0.76],
  },
  {
    // hokuto-side highlands west: wind-bent broadleaf and exposed rock.
    id: 'west-highlands',
    label: 'West Highlands',
    centerX: -620,
    centerZ: 330,
    radiusMeters: 560,
    speciesDensity: { conifer: 0.7, broadleaf: 0.8, rock: 2.2 },
    groundTint: [0.99, 0.93, 0.79],
  },
];

/** Vegetation placement tuning (world/vegetation.ts consumes this). */
export interface VegetationConfig {
  /** Candidate grid pitch in metres: one placement candidate per cell. */
  readonly cellMeters: number;
  /** Chunks of scatter around the focus chunk (terrain chunks are 128 m). */
  readonly radiusChunks: number;
  /** Base keep-probability per species before district/biome multipliers. */
  readonly baseDensity: Record<VegetationSpecies, number>;
  /** Nothing grows within this distance of a road centreline (the corridor). */
  readonly roadClearanceMeters: number;
  /** The spawn pad stays clear inside this radius of (0, 0). */
  readonly spawnClearanceMeters: number;
  /** Trees stop at the snowline; rock continues higher. */
  readonly treeLineMeters: number;
}

export const VEGETATION_CONFIG: VegetationConfig = {
  cellMeters: 6.5,
  radiusChunks: 3,
  baseDensity: { conifer: 0.16, broadleaf: 0.13, sakura: 0.05, bamboo: 0.05, rock: 0.05 },
  roadClearanceMeters: 7.5,
  spawnClearanceMeters: 55,
  treeLineMeters: 150,
};

/**
 * How vegetation answers being hit (world/tree-collision.ts consumes this).
 * `hitPoints` is spent by impact speed: each hit costs roughly
 * 10 x impactSpeed(m/s) points, so a conifer shrugs off a 3 m/s nudge (bend),
 * snaps around 10 m/s, and a single hit at `shatterSpeed` or beyond destroys
 * it outright regardless of remaining points.
 *
 * The speed loss is a momentum model, not a free-floating cap. A standing
 * tree is rooted into the ground, so while it remains intact the car meets
 * the tree-plus-soil system and loses essentially all of its normal closing
 * speed (plus the small rebound in `TREE_COLLISION`). When the trunk fails,
 * `snapSpeedLossFraction` / `shatterSpeedLossFraction` say how much of the
 * closing speed the failure takes out of the car; `impactMassKg` is the
 * trunk/crown mass that can carry momentum away as debris, so the visible
 * reaction can be derived from the same impulse that slows the car.
 */
export interface TreeDamageConfig {
  readonly hitPoints: number;
  /** Fraction of closing speed removed when this hit snaps the trunk. */
  readonly snapSpeedLossFraction: number;
  /** Fraction of closing speed removed when this hit shatters the trunk. */
  readonly shatterSpeedLossFraction: number;
  /** Trunk/crown mass (kg at scale 1) that can receive reaction momentum. */
  readonly impactMassKg: number;
  readonly shatterSpeed: number;
  /** Trunk radius in metres (collision + visual scale multiplies it). */
  readonly trunkRadius: number;
}

export const TREE_DAMAGE: Record<VegetationSpecies, TreeDamageConfig> = {
  conifer: {
    hitPoints: 100,
    snapSpeedLossFraction: 0.74,
    shatterSpeedLossFraction: 0.58,
    impactMassKg: 300,
    shatterSpeed: 13,
    trunkRadius: 0.24,
  },
  broadleaf: {
    hitPoints: 85,
    snapSpeedLossFraction: 0.7,
    shatterSpeedLossFraction: 0.54,
    impactMassKg: 240,
    shatterSpeed: 12,
    trunkRadius: 0.26,
  },
  sakura: {
    hitPoints: 70,
    snapSpeedLossFraction: 0.64,
    shatterSpeedLossFraction: 0.5,
    impactMassKg: 180,
    shatterSpeed: 11,
    trunkRadius: 0.22,
  },
  bamboo: {
    hitPoints: 34,
    snapSpeedLossFraction: 0.48,
    shatterSpeedLossFraction: 0.38,
    impactMassKg: 75,
    shatterSpeed: 9,
    trunkRadius: 0.3,
  },
  rock: {
    hitPoints: Number.POSITIVE_INFINITY,
    snapSpeedLossFraction: 1,
    shatterSpeedLossFraction: 1,
    impactMassKg: Number.POSITIVE_INFINITY,
    shatterSpeed: Number.POSITIVE_INFINITY,
    trunkRadius: 0.95,
  },
};

/** Collision/destruction tuning shared by the field and the visuals. */
export const TREE_COLLISION = {
  /** Trees are tracked for collision inside this radius of the car (metres). */
  activeRadiusMeters: 56,
  /** A hit below this closing speed (m/s) is a brush, not an impact. */
  minImpactSpeed: 0.9,
  /** The same tree cannot register two hits inside this window (seconds). */
  hitCooldownSeconds: 0.3,
  /** Damage points charged per (m/s) of impact speed. */
  damagePerSpeed: 10,
  /**
   * Rebound fraction for a rooted tree that does not break: the car loses
   * `1 + standingRestitution` times its closing speed along the normal, so it
   * leaves at `standingRestitution` of the closing speed. 0.08 is a dull
   * wooden thud, not a rubber bounce.
   */
  standingRestitution: 0.08,
  /**
   * Share of the car's lost momentum that becomes visible trunk/crown motion
   * when a tree fails. The rest is genuinely dissipated — splintering wood,
   * tearing roots, deforming soil — which is why this is well below 1.
   */
  momentumTransferFraction: 0.26,
  /** Share of the geometric yaw lever that becomes angular impulse. */
  yawImpulseFraction: 0.16,
  /** Crown debris and fragments persist at most this long (seconds). */
  debrisLifetimeSeconds: 22,
} as const;
