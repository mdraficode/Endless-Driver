/**
 * Phase 4/9 road network definition: the original Hinode rural graph plus the bounded Aohara
 * Metropolis access connector and 3×3 urban street grid. Road geometry, the terrain carve, physics
 * surface response, and the minimap all consume the same solved graph.
 */
import { AOHARA_DISTRICT_CONFIG } from './urban-district';

export type RoadClass = 'rural' | 'city-access' | 'urban-local' | 'urban-arterial';

export interface RoadNodeConfig {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface RoadEdgeConfig {
  readonly from: string;
  readonly to: string;
  /** Intermediate spline control points (world x, z), in travel order. */
  readonly via?: readonly (readonly [number, number])[];
  /** Omit to inherit the rural two-lane defaults. */
  readonly roadClass?: RoadClass;
  /** Per-edge pavement half-width; defaults to the network-wide rural width. */
  readonly halfWidthMeters?: number;
  /** Per-edge shoulder width; defaults to the network-wide rural shoulder. */
  readonly shoulderMeters?: number;
}

export interface RoadNetworkConfig {
  /** Half the paved width, metres (two lanes at ~2.75 m each). */
  readonly halfWidthMeters: number;
  /** Gravel shoulder width beyond the pavement, metres. */
  readonly shoulderMeters: number;
  /** Terrain blends back to natural height across this distance from the centreline. */
  readonly blendWidthMeters: number;
  /** Dense profile sample spacing along each spline, metres. */
  readonly sampleSpacingMeters: number;
  /** Longitudinal grade cap (rise per metre): roads are smoothed until they obey it. */
  readonly maxGrade: number;
  readonly nodes: readonly RoadNodeConfig[];
  readonly edges: readonly RoadEdgeConfig[];
}

const GRID_ROWS = [
  { id: 'north', offset: -1 },
  { id: 'middle', offset: 0 },
  { id: 'south', offset: 1 },
] as const;
const GRID_COLUMNS = [
  { id: 'west', offset: -1 },
  { id: 'center', offset: 0 },
  { id: 'east', offset: 1 },
] as const;

const AOHARA_GRID_NODES: readonly RoadNodeConfig[] = GRID_ROWS.flatMap((row) =>
  GRID_COLUMNS.map((column) => ({
    id:
      row.id === 'middle' && column.id === 'center'
        ? 'aohara-center'
        : `aohara-${row.id}-${column.id}`,
    x: AOHARA_DISTRICT_CONFIG.centerX + column.offset * AOHARA_DISTRICT_CONFIG.gridSpacingMeters,
    z: AOHARA_DISTRICT_CONFIG.centerZ + row.offset * AOHARA_DISTRICT_CONFIG.gridSpacingMeters,
  })),
);

const localStreet = (from: string, to: string): RoadEdgeConfig => ({
  from,
  to,
  roadClass: 'urban-local',
  halfWidthMeters: AOHARA_DISTRICT_CONFIG.localStreetHalfWidthMeters,
  shoulderMeters: AOHARA_DISTRICT_CONFIG.shoulderMeters,
});

const arterial = (from: string, to: string): RoadEdgeConfig => ({
  from,
  to,
  roadClass: 'urban-arterial',
  halfWidthMeters: AOHARA_DISTRICT_CONFIG.arterialHalfWidthMeters,
  shoulderMeters: AOHARA_DISTRICT_CONFIG.shoulderMeters,
});

/** The core urban block: three connected parallel streets in each direction. */
const AOHARA_GRID_EDGES: readonly RoadEdgeConfig[] = [
  localStreet('aohara-north-west', 'aohara-north-center'),
  localStreet('aohara-north-center', 'aohara-north-east'),
  arterial('aohara-middle-west', 'aohara-center'),
  arterial('aohara-center', 'aohara-middle-east'),
  localStreet('aohara-south-west', 'aohara-south-center'),
  localStreet('aohara-south-center', 'aohara-south-east'),
  localStreet('aohara-north-west', 'aohara-middle-west'),
  localStreet('aohara-middle-west', 'aohara-south-west'),
  arterial('aohara-north-center', 'aohara-center'),
  arterial('aohara-center', 'aohara-south-center'),
  localStreet('aohara-north-east', 'aohara-middle-east'),
  localStreet('aohara-middle-east', 'aohara-south-east'),
];

export const ROAD_NETWORK_CONFIG: RoadNetworkConfig = {
  halfWidthMeters: 5.5,
  shoulderMeters: 2.2,
  blendWidthMeters: 30,
  sampleSpacingMeters: 8,
  maxGrade: 0.09,
  nodes: [
    { id: 'spawn-junction', x: 0, z: -170 },
    { id: 'north-bend', x: -90, z: -560 },
    { id: 'cedar-pass', x: -430, z: -1010 },
    { id: 'volcano-view', x: -880, z: -1420 },
    { id: 'east-plain', x: 620, z: -430 },
    { id: 'town-site', x: 540, z: 300 },
    { id: 'south-fields', x: 60, z: 620 },
    { id: 'west-fields', x: -620, z: 330 },
    ...AOHARA_GRID_NODES,
  ],
  edges: [
    { from: 'spawn-junction', to: 'north-bend', via: [[-30, -360]] },
    { from: 'north-bend', to: 'cedar-pass', via: [[-240, -800]] },
    { from: 'cedar-pass', to: 'volcano-view', via: [[-660, -1240]] },
    { from: 'spawn-junction', to: 'east-plain', via: [[300, -330]] },
    { from: 'east-plain', to: 'town-site', via: [[640, -40]] },
    { from: 'spawn-junction', to: 'south-fields', via: [[175, 150]] },
    { from: 'south-fields', to: 'town-site', via: [[330, 540]] },
    { from: 'spawn-junction', to: 'west-fields', via: [[-330, 60]] },
    { from: 'west-fields', to: 'south-fields', via: [[-300, 540]] },
    {
      from: 'east-plain',
      to: 'aohara-middle-west',
      roadClass: 'city-access',
      halfWidthMeters: AOHARA_DISTRICT_CONFIG.accessHalfWidthMeters,
      shoulderMeters: AOHARA_DISTRICT_CONFIG.shoulderMeters,
    },
    ...AOHARA_GRID_EDGES,
  ],
};
