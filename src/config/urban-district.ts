/**
 * Bounded Aohara Metropolis placement and road-grid contract (Phase 9).
 *
 * The city is an addition to rural Hinode, centred east of Sakura Avenue. Its 320 m square
 * starter grid is placed inside a gently leveled 500 m-diameter plateau; a smooth transition
 * restores the original terrain before the district edge. Existing terrain streaming and
 * physics use the same sampler, so the city adds no separate ground authority.
 */
export const AOHARA_DISTRICT_CONFIG = {
  id: 'aohara-metropolis',
  label: 'Aohara Metropolis',
  centerX: 1250,
  centerZ: -430,
  /** Vegetation influence fades to zero at this radius; the grid corners remain in its core. */
  radiusMeters: 450,
  /** Roads and the first high-rise block sit on the levelled urban core. */
  flatRadiusMeters: 250,
  /** Smooth return to the seeded Hinode height function outside the urban core. */
  terrainBlendRadiusMeters: 430,
  gridSpacingMeters: 160,
  arterialHalfWidthMeters: 10,
  localStreetHalfWidthMeters: 7.5,
  accessHalfWidthMeters: 8,
  shoulderMeters: 2.2,
} as const;

/** Stable identity shared by the road graph, city placement, tests and diagnostics. */
export const AOHARA_JUNCTION_NODE_ID = 'aohara-center';
