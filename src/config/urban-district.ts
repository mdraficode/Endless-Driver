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
  /** Keeps outer street corners and sidewalks on the levelled urban core. */
  flatRadiusMeters: 500,
  /** Smooth return to seeded Hinode terrain outside the metropolitan plateau. */
  terrainBlendRadiusMeters: 620,
  arterialHalfWidthMeters: 10,
  localStreetHalfWidthMeters: 7.5,
  accessHalfWidthMeters: 8,
  shoulderMeters: 2.2,
} as const;

/**
 * Five north-to-south grid axes; row/column labels form stable graph node ids.
 *
 * Phase 8.4a: the grid is deliberately NON-uniform (the "grid of identical blocks" was the last
 * box cue). The centre row and column stay at 0 — the main avenue, the signalized cross street
 * and the central intersection keep their geometry; the outer streets move so the blocks come
 * out 140–200 m wide and 140–170 m deep.
 */
export const AOHARA_GRID_ROWS = [
  { id: 'north-outer', offsetMeters: -320 },
  { id: 'north', offsetMeters: -150 },
  { id: 'middle', offsetMeters: 0 },
  { id: 'south', offsetMeters: 170 },
  { id: 'south-outer', offsetMeters: 310 },
] as const;

export const AOHARA_GRID_COLUMNS = [
  { id: 'west-outer', offsetMeters: -350 },
  { id: 'west', offsetMeters: -200 },
  { id: 'center', offsetMeters: 0 },
  { id: 'east', offsetMeters: 190 },
  { id: 'east-outer', offsetMeters: 330 },
] as const;

/** Street offset from the district centre along the row (z) axis. */
export function aoharaRowOffsetMeters(rowIndex: number): number {
  const row = AOHARA_GRID_ROWS[rowIndex];
  if (row === undefined) {
    throw new RangeError(`invalid Aohara grid row index ${rowIndex}`);
  }
  return row.offsetMeters;
}

/** Street offset from the district centre along the column (x) axis. */
export function aoharaColumnOffsetMeters(columnIndex: number): number {
  const column = AOHARA_GRID_COLUMNS[columnIndex];
  if (column === undefined) {
    throw new RangeError(`invalid Aohara grid column index ${columnIndex}`);
  }
  return column.offsetMeters;
}

/** Block centre (district-local) and edge-to-edge size between two grid streets. */
export function aoharaBlockLocal(
  rowIndex: number,
  columnIndex: number,
): {
  readonly centerLocalX: number;
  readonly centerLocalZ: number;
  readonly widthMeters: number;
  readonly depthMeters: number;
} {
  const west = aoharaColumnOffsetMeters(columnIndex);
  const east = aoharaColumnOffsetMeters(columnIndex + 1);
  const north = aoharaRowOffsetMeters(rowIndex);
  const south = aoharaRowOffsetMeters(rowIndex + 1);
  return {
    centerLocalX: (west + east) / 2,
    centerLocalZ: (north + south) / 2,
    widthMeters: east - west,
    depthMeters: south - north,
  };
}

/** Stable identity shared by the road graph, city placement, tests and diagnostics. */
export const AOHARA_JUNCTION_NODE_ID = 'aohara-center';
