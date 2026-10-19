/**
 * Bounded Aohara Metropolis placement and road-grid contract (Phase 9).
 *
 * The city is an addition to rural Hinode, centred east of Sakura Avenue. Its 640 m square
 * 5×5 street grid sits inside a gently levelled 1 km-diameter core; a smooth transition restores
 * the original terrain before the district edge. Existing terrain streaming and physics use the
 * same sampler, so the city adds no separate ground authority.
 */
export const AOHARA_DISTRICT_CONFIG = {
  id: 'aohara-metropolis',
  label: 'Aohara Metropolis',
  centerX: 1250,
  centerZ: -430,
  /** Keeps the outer grid corners inside the zero-vegetation core; influence fades beyond it. */
  radiusMeters: 920,
  gridSpacingMeters: 160,
  /** Keeps outer street corners and sidewalks on the levelled urban core. */
  flatRadiusMeters: 500,
  /** Smooth return to seeded Hinode terrain outside the metropolitan plateau. */
  terrainBlendRadiusMeters: 620,
  arterialHalfWidthMeters: 10,
  localStreetHalfWidthMeters: 7.5,
  accessHalfWidthMeters: 8,
  shoulderMeters: 2.2,
} as const;

/** Five north-to-south grid axes; row/column labels form stable graph node ids. */
export const AOHARA_GRID_ROWS = [
  { id: 'north-outer', offset: -2 },
  { id: 'north', offset: -1 },
  { id: 'middle', offset: 0 },
  { id: 'south', offset: 1 },
  { id: 'south-outer', offset: 2 },
] as const;

export const AOHARA_GRID_COLUMNS = [
  { id: 'west-outer', offset: -2 },
  { id: 'west', offset: -1 },
  { id: 'center', offset: 0 },
  { id: 'east', offset: 1 },
  { id: 'east-outer', offset: 2 },
] as const;

/** Stable identity shared by the road graph, city placement, tests and diagnostics. */
export const AOHARA_JUNCTION_NODE_ID = 'aohara-center';
