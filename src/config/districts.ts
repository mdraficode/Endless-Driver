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
  },
  {
    // Sakura Avenue along the eastern road into town: blossom trees crowd the verge.
    id: 'sakura-avenue',
    label: 'Sakura Avenue',
    centerX: 620,
    centerZ: -430,
    radiusMeters: 420,
    speciesDensity: { sakura: 3.4, broadleaf: 1.2, conifer: 0.4 },
  },
  {
    // Take-no-Michi (竹の道): the bamboo lane leaving the junction southward.
    id: 'takenomichi',
    label: 'Take-no-Michi',
    centerX: 130,
    centerZ: 90,
    radiusMeters: 300,
    speciesDensity: { bamboo: 4.2, broadleaf: 0.7, conifer: 0.3 },
  },
  {
    // Yūhi Town (夕陽町): garden trees only — buildings carry this district (5b).
    id: 'yuhi-town',
    label: 'Yūhi Town',
    centerX: 540,
    centerZ: 300,
    radiusMeters: 340,
    speciesDensity: { conifer: 0.15, broadleaf: 0.55, sakura: 0.8, bamboo: 0.2, rock: 0.1 },
  },
  {
    // Shirasagi Terraces (白鷺の棚田): open farmland — trees are events, not cover.
    id: 'shirasagi-fields',
    label: 'Shirasagi Terraces',
    centerX: 60,
    centerZ: 620,
    radiusMeters: 680,
    speciesDensity: { conifer: 0.1, broadleaf: 0.35, sakura: 0.15, rock: 0.4 },
  },
  {
    // hokuto-side highlands west: wind-bent broadleaf and exposed rock.
    id: 'west-highlands',
    label: 'West Highlands',
    centerX: -620,
    centerZ: 330,
    radiusMeters: 560,
    speciesDensity: { conifer: 0.7, broadleaf: 0.8, rock: 2.2 },
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
