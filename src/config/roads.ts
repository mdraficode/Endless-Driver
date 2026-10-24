/**
 * Phase 4/9 road network definition: the original Hinode rural graph plus Aohara Metropolis's
 * connected 5×5 urban street grid. Road geometry, the terrain carve, physics surface response, and
 * the minimap all consume the same solved graph.
 */
import {
  AOHARA_BACKSTREET_BLOCKS,
  AOHARA_BACKSTREET_CONFIG,
  type AoharaBackstreetAccess,
} from './aohara-backstreets';
import {
  AOHARA_DISTRICT_CONFIG,
  AOHARA_GRID_COLUMNS,
  AOHARA_GRID_ROWS,
  AOHARA_JUNCTION_NODE_ID,
} from './urban-district';

export type RoadClass =
  | 'rural'
  | 'touge'
  | 'city-access'
  | 'urban-local'
  | 'urban-arterial'
  | 'urban-alley';

/** Optional volcano-side switchback start; the default remains Aohara Central Avenue. */
export const HINODE_TOUGE_START = {
  id: 'volcano-view',
  x: -880,
  z: -1420,
  yaw: 1.24,
} as const;

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
  /** Optional per-edge grade cap; omit to inherit the network-wide maximum. */
  readonly maxGrade?: number;
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

function aoharaNodeId(rowId: string, columnId: string): string {
  return rowId === 'middle' && columnId === 'center'
    ? AOHARA_JUNCTION_NODE_ID
    : `aohara-${rowId}-${columnId}`;
}

const AOHARA_GRID_NODES: readonly RoadNodeConfig[] = AOHARA_GRID_ROWS.flatMap((row) =>
  AOHARA_GRID_COLUMNS.map((column) => ({
    id: aoharaNodeId(row.id, column.id),
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

const touge = (
  from: string,
  to: string,
  via: readonly (readonly [number, number])[],
): RoadEdgeConfig => ({
  from,
  to,
  via,
  roadClass: 'touge',
  maxGrade: 0.18,
  halfWidthMeters: 3.4,
  shoulderMeters: 1.2,
});

const AOHARA_BACKSTREET_ACCESSES: readonly AoharaBackstreetAccess[] =
  AOHARA_BACKSTREET_BLOCKS.flatMap((block) => Object.values(block.accesses));

const AOHARA_BACKSTREET_ACCESS_NODES: readonly RoadNodeConfig[] = [
  ...new Map(
    AOHARA_BACKSTREET_ACCESSES.map((access) => [
      access.nodeId,
      { id: access.nodeId, x: access.worldX, z: access.worldZ },
    ] as const),
  ).values(),
];

const AOHARA_BACKSTREET_INTERNAL_NODES: readonly RoadNodeConfig[] =
  AOHARA_BACKSTREET_BLOCKS.flatMap((block) => [
    { id: block.hubNodeId, x: block.hubWorldX, z: block.hubWorldZ },
    {
      id: block.courtyardNodeId,
      x: block.courtyardWorldX,
      z: block.courtyardWorldZ,
    },
  ]);

function accessesForGridEdge(
  edgeAxis: AoharaBackstreetAccess['edgeAxis'],
  gridRowIndex: number,
  gridColumnIndex: number,
): readonly AoharaBackstreetAccess[] {
  const unique = new Map<string, AoharaBackstreetAccess>();
  for (const access of AOHARA_BACKSTREET_ACCESSES) {
    if (
      access.edgeAxis === edgeAxis &&
      access.gridRowIndex === gridRowIndex &&
      access.gridColumnIndex === gridColumnIndex
    ) {
      unique.set(access.nodeId, access);
    }
  }
  return [...unique.values()].sort((first, second) => first.fractionThirds - second.fractionThirds);
}

function splitGridEdge(
  from: string,
  to: string,
  accessNodes: readonly AoharaBackstreetAccess[],
  createEdge: (from: string, to: string) => RoadEdgeConfig,
): readonly RoadEdgeConfig[] {
  const nodes: { readonly id: string; readonly fraction: number }[] = [
    { id: from, fraction: 0 },
    ...accessNodes.map((access) => ({ id: access.nodeId, fraction: access.fractionThirds })),
    { id: to, fraction: 3 },
  ];
  return nodes.slice(0, -1).map((node, index) => createEdge(node.id, nodes[index + 1]!.id));
}

const AOHARA_GRID_EDGES: readonly RoadEdgeConfig[] = [
  ...AOHARA_GRID_ROWS.flatMap((row, rowIndex) =>
    AOHARA_GRID_COLUMNS.slice(0, -1).flatMap((column, columnIndex) => {
      const nextColumn = AOHARA_GRID_COLUMNS[columnIndex + 1]!;
      const createEdge = row.id === 'middle' ? arterial : localStreet;
      return splitGridEdge(
        aoharaNodeId(row.id, column.id),
        aoharaNodeId(row.id, nextColumn.id),
        accessesForGridEdge('horizontal', rowIndex, columnIndex),
        createEdge,
      );
    }),
  ),
  ...AOHARA_GRID_COLUMNS.flatMap((column, columnIndex) =>
    AOHARA_GRID_ROWS.slice(0, -1).flatMap((row, rowIndex) => {
      const nextRow = AOHARA_GRID_ROWS[rowIndex + 1]!;
      const createEdge = column.id === 'center' ? arterial : localStreet;
      return splitGridEdge(
        aoharaNodeId(row.id, column.id),
        aoharaNodeId(nextRow.id, column.id),
        accessesForGridEdge('vertical', rowIndex, columnIndex),
        createEdge,
      );
    }),
  ),
];

function createBackstreetSpoke(
  block: (typeof AOHARA_BACKSTREET_BLOCKS)[number],
  access: AoharaBackstreetAccess,
): RoadEdgeConfig {
  const sideIndex = (['north', 'east', 'south', 'west'] as const).indexOf(access.side);
  const crossingOffset = 30 + ((block.rowIndex * 5 + block.columnIndex * 3 + sideIndex) % 2) * 4;
  const blockCenterX = AOHARA_DISTRICT_CONFIG.centerX + block.centerLocalX;
  const blockCenterZ = AOHARA_DISTRICT_CONFIG.centerZ + block.centerLocalZ;
  const firstBend = [
    access.worldX + access.inwardX * 23,
    access.worldZ + access.inwardZ * 23,
  ] as const;
  let secondBendX: number;
  let secondBendZ: number;
  if (access.side === 'north' || access.side === 'south') {
    secondBendX = access.worldX;
    secondBendZ = blockCenterZ + (access.side === 'north' ? -crossingOffset : crossingOffset);
  } else {
    const radialSide = access.side === 'east' ? 1 : -1;
    const tangentSide = Math.sign(access.localZ - block.centerLocalZ) || 1;
    secondBendX = blockCenterX + radialSide * crossingOffset;
    secondBendZ = blockCenterZ + tangentSide * crossingOffset;
  }
  const secondBend = [secondBendX, secondBendZ] as const;
  // The second turn crosses the block at a safe setback, then returns to the small inner hub.
  // This dogleg lets the passages weave around the authored high-rise footprints instead of
  // cutting straight through their collision envelopes.
  const thirdBend = [blockCenterX, secondBendZ] as const;
  return {
    from: access.nodeId,
    to: block.hubNodeId,
    via: [firstBend, secondBend, thirdBend],
    roadClass: 'urban-alley',
    maxGrade: AOHARA_BACKSTREET_CONFIG.alleyMaximumGrade,
    halfWidthMeters: AOHARA_BACKSTREET_CONFIG.passageHalfWidthMeters,
    shoulderMeters: AOHARA_BACKSTREET_CONFIG.passageShoulderMeters,
  };
}

const AOHARA_BACKSTREET_EDGES: readonly RoadEdgeConfig[] = AOHARA_BACKSTREET_BLOCKS.flatMap(
  (block) => [
    ...Object.values(block.accesses).map((access) => createBackstreetSpoke(block, access)),
    {
      from: block.hubNodeId,
      to: block.courtyardNodeId,
      roadClass: 'urban-alley' as const,
      maxGrade: AOHARA_BACKSTREET_CONFIG.alleyMaximumGrade,
      halfWidthMeters: AOHARA_BACKSTREET_CONFIG.courtyardHalfWidthMeters,
      shoulderMeters: AOHARA_BACKSTREET_CONFIG.passageShoulderMeters,
    },
  ],
);

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
    { id: 'touge-north-1', x: -1230, z: -1540 },
    { id: 'touge-east-1', x: -1100, z: -1670 },
    { id: 'touge-north-2', x: -1370, z: -1760 },
    { id: 'touge-east-2', x: -1190, z: -1880 },
    { id: 'touge-south-1', x: -1410, z: -2010 },
    { id: 'touge-east-3', x: -1190, z: -2120 },
    { id: 'touge-south-2', x: -1050, z: -1930 },
    { id: 'east-plain', x: 620, z: -430 },
    { id: 'town-site', x: 540, z: 300 },
    { id: 'south-fields', x: 60, z: 620 },
    { id: 'west-fields', x: -620, z: 330 },
    ...AOHARA_GRID_NODES,
    ...AOHARA_BACKSTREET_ACCESS_NODES,
    ...AOHARA_BACKSTREET_INTERNAL_NODES,
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
    // Optional Hinode Touge: a narrow, connected switchback loop climbing around Hinode-dake.
    // Its own road class keeps the Aohara grid and the original rural roads unchanged.
    touge(HINODE_TOUGE_START.id, 'touge-north-1', [
      [-920, -1480],
      [-820, -1640],
      [-990, -1780],
      [-1170, -1730],
      [-1280, -1620],
    ]),
    touge('touge-north-1', 'touge-east-1', [[-1260, -1610]]),
    touge('touge-east-1', 'touge-north-2', [
      [-1200, -1740],
      [-1020, -1790],
      [-1010, -1950],
      [-1230, -1980],
      [-1370, -1870],
    ]),
    touge('touge-north-2', 'touge-east-2', [[-1340, -1850]]),
    touge('touge-east-2', 'touge-south-1', [
      [-1270, -1960],
      [-1080, -1940],
      [-1010, -2070],
      [-1190, -2180],
      [-1360, -2140],
    ]),
    touge('touge-south-1', 'touge-east-3', [[-1290, -2070]]),
    touge('touge-east-3', 'touge-south-2', [
      [-1110, -2080],
      [-900, -2140],
      [-830, -1980],
    ]),
    touge('touge-south-2', HINODE_TOUGE_START.id, [
      [-900, -2000],
      [-680, -1850],
      [-640, -1600],
      [-920, -1780],
    ]),
    {
      from: 'east-plain',
      to: aoharaNodeId('middle', 'west-outer'),
      roadClass: 'city-access',
      halfWidthMeters: AOHARA_DISTRICT_CONFIG.accessHalfWidthMeters,
      shoulderMeters: AOHARA_DISTRICT_CONFIG.shoulderMeters,
    },
    ...AOHARA_GRID_EDGES,
    ...AOHARA_BACKSTREET_EDGES,
  ],
};
