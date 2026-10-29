import {
  AOHARA_DISTRICT_CONFIG,
  AOHARA_GRID_COLUMNS,
  AOHARA_GRID_ROWS,
  aoharaBlockLocal,
} from './urban-district';

/**
 * Phase 8.4a: the southwest inner block (south of the main avenue, west of the cross street)
 * is an open plaza instead of a built block — no frontage, no infill, no winding passages.
 * The traffic/pedestrian loop corner cuts through its centre, which reads as a street
 * crossing into the square.
 */
export const AOHARA_PLAZA_BLOCK = { rowIndex: 2, columnIndex: 1 } as const;

export function isAoharaPlazaBlock(rowIndex: number, columnIndex: number): boolean {
  return rowIndex === AOHARA_PLAZA_BLOCK.rowIndex && columnIndex === AOHARA_PLAZA_BLOCK.columnIndex;
}

export type AoharaBackstreetSide = 'north' | 'east' | 'south' | 'west';
export type AoharaAccessThird = 1 | 2;

/** Geometry and parcel rules for the winding, street-to-street Aohara service passages. */
export const AOHARA_BACKSTREET_CONFIG = {
  /** Main alley pavement is 4.5 m wide: narrow, but still usable by the player car. */
  passageHalfWidthMeters: 2.25,
  passageShoulderMeters: 0,
  /** A few passage junctions swell into small loading courts and open yards. */
  courtyardHalfWidthMeters: 6.5,
  alleyMaximumGrade: 0.05,
  frontageBuildingWidthMeters: 20,
  frontageBuildingDepthMeters: 8.5,
  frontageBuildingInsetMeters: 20.5,
  /** Four close-packed shells leave three narrow, deterministic passage/door gaps per block face. */
  frontagePositionsMeters: [-41, -13, 13, 41] as const,
  buildingClearanceMeters: 0.75,
  alleyWallClearanceMeters: 0.35,
  /** Keep infill shells in the broad inner plots, between the winding passages and street frontage. */
  innerBuildingCornerOffsetMeters: 45,
} as const;

export interface AoharaBackstreetAccess {
  readonly side: AoharaBackstreetSide;
  readonly nodeId: string;
  /** One-third or two-thirds along the shared grid street edge. */
  readonly fractionThirds: AoharaAccessThird;
  /** Local coordinates relative to the district origin. */
  readonly localX: number;
  readonly localZ: number;
  /** The authored grid segment that contains this street mouth. */
  readonly edgeAxis: 'horizontal' | 'vertical';
  readonly gridRowIndex: number;
  readonly gridColumnIndex: number;
  /** World coordinates used by the road network. */
  readonly worldX: number;
  readonly worldZ: number;
  /** Unit vector from this street mouth into its block. */
  readonly inwardX: number;
  readonly inwardZ: number;
}

export interface AoharaBackstreetBlock {
  readonly id: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly centerLocalX: number;
  readonly centerLocalZ: number;
  readonly hubNodeId: string;
  readonly hubLocalX: number;
  readonly hubLocalZ: number;
  readonly hubWorldX: number;
  readonly hubWorldZ: number;
  readonly courtyardNodeId: string;
  readonly courtyardWorldX: number;
  readonly courtyardWorldZ: number;
  /**
   * One mouth per street-facing side; a side is `undefined` where the grand
   * boulevard crosses the block corner (Phase 8.4b), keeping the street row
   * continuous past the avenue.
   */
  readonly accesses: Readonly<
    Record<AoharaBackstreetSide, AoharaBackstreetAccess | undefined>
  >;
}

/**
 * Phase 8.4b: the grand boulevard sweeps across two block corners whose passage
 * mouths would run straight into its right-of-way; those mouths stay closed so
 * the street row runs continuously past the avenue.
 */
const BOULEVARD_CLOSED_MOUTHS: ReadonlySet<string> = new Set([
  'aohara-backstreet-r3-c2:north',
  'aohara-backstreet-r3-c3:west',
]);

function isBoulevardClosedMouth(blockId: string, side: AoharaBackstreetSide): boolean {
  return BOULEVARD_CLOSED_MOUTHS.has(`${blockId}:${side}`);
}

function stableUnit(a: number, b: number, salt: number): number {
  let value = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ Math.imul(b + salt, 0xc2b2ae35), 0x27d4eb2f);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x1_0000_0000;
}

function oppositeFraction(fraction: AoharaAccessThird): AoharaAccessThird {
  return fraction === 1 ? 2 : 1;
}

function horizontalBaseFraction(rowIndex: number, columnIndex: number): AoharaAccessThird {
  return stableUnit(rowIndex, columnIndex, 1201) < 0.5 ? 1 : 2;
}

function verticalBaseFraction(rowIndex: number, columnIndex: number): AoharaAccessThird {
  return stableUnit(rowIndex, columnIndex, 1217) < 0.5 ? 1 : 2;
}

function centralTowerSafeVerticalFraction(
  rowIndex: number,
  boundaryIndex: number,
): AoharaAccessThird | null {
  if (boundaryIndex !== 2) return null;
  // The original eight central towers flank the middle avenue. Keep the upper two blocks' east/west
  // mouths on the north third and the lower two on the south third; aligned opposite mouths create
  // a small crossing, while keeping every passage clear of the authored tower footprints.
  if (rowIndex === 1) return 1;
  if (rowIndex === 2) return 2;
  return null;
}

export function aoharaHorizontalAccessNodeId(
  rowIndex: number,
  columnIndex: number,
  fraction: AoharaAccessThird,
): string {
  const row = AOHARA_GRID_ROWS[rowIndex];
  const column = AOHARA_GRID_COLUMNS[columnIndex];
  const nextColumn = AOHARA_GRID_COLUMNS[columnIndex + 1];
  if (row === undefined || column === undefined || nextColumn === undefined) {
    throw new RangeError('invalid Aohara horizontal alley access index');
  }
  return `aohara-access-x-${row.id}-${column.id}-${nextColumn.id}-${fraction === 1 ? 'third' : 'two-thirds'}`;
}

export function aoharaVerticalAccessNodeId(
  rowIndex: number,
  columnIndex: number,
  fraction: AoharaAccessThird,
): string {
  const column = AOHARA_GRID_COLUMNS[columnIndex];
  const row = AOHARA_GRID_ROWS[rowIndex];
  const nextRow = AOHARA_GRID_ROWS[rowIndex + 1];
  if (column === undefined || row === undefined || nextRow === undefined) {
    throw new RangeError('invalid Aohara vertical alley access index');
  }
  return `aohara-access-z-${column.id}-${row.id}-${nextRow.id}-${fraction === 1 ? 'third' : 'two-thirds'}`;
}

function makeAccess(
  rowIndex: number,
  columnIndex: number,
  centerLocalX: number,
  centerLocalZ: number,
  side: AoharaBackstreetSide,
  fractionThirds: AoharaAccessThird,
): AoharaBackstreetAccess {
  // Phase 8.4a: the block is no longer square — the mouth sits a third/two-thirds along the
  // actual edge length and on the actual edge line.
  const block = aoharaBlockLocal(rowIndex, columnIndex);
  const edgeLength = side === 'north' || side === 'south' ? block.widthMeters : block.depthMeters;
  const halfWidth = block.widthMeters / 2;
  const halfDepth = block.depthMeters / 2;
  const along = (fractionThirds / 3 - 0.5) * edgeLength;
  let localX: number;
  let localZ: number;
  let inwardX: number;
  let inwardZ: number;
  let nodeId: string;
  let edgeAxis: 'horizontal' | 'vertical';
  let gridRowIndex: number;
  let gridColumnIndex: number;
  switch (side) {
    case 'north':
      localX = centerLocalX + along;
      localZ = centerLocalZ - halfDepth;
      inwardX = 0;
      inwardZ = 1;
      nodeId = aoharaHorizontalAccessNodeId(rowIndex, columnIndex, fractionThirds);
      edgeAxis = 'horizontal';
      gridRowIndex = rowIndex;
      gridColumnIndex = columnIndex;
      break;
    case 'south':
      localX = centerLocalX + along;
      localZ = centerLocalZ + halfDepth;
      inwardX = 0;
      inwardZ = -1;
      nodeId = aoharaHorizontalAccessNodeId(rowIndex + 1, columnIndex, fractionThirds);
      edgeAxis = 'horizontal';
      gridRowIndex = rowIndex + 1;
      gridColumnIndex = columnIndex;
      break;
    case 'west':
      localX = centerLocalX - halfWidth;
      localZ = centerLocalZ + along;
      inwardX = 1;
      inwardZ = 0;
      nodeId = aoharaVerticalAccessNodeId(rowIndex, columnIndex, fractionThirds);
      edgeAxis = 'vertical';
      gridRowIndex = rowIndex;
      gridColumnIndex = columnIndex;
      break;
    case 'east':
      localX = centerLocalX + halfWidth;
      localZ = centerLocalZ + along;
      inwardX = -1;
      inwardZ = 0;
      nodeId = aoharaVerticalAccessNodeId(rowIndex, columnIndex + 1, fractionThirds);
      edgeAxis = 'vertical';
      gridRowIndex = rowIndex;
      gridColumnIndex = columnIndex + 1;
      break;
    default:
      throw new RangeError('invalid Aohara alley access side');
  }
  return {
    side,
    nodeId,
    fractionThirds,
    localX,
    localZ,
    edgeAxis,
    gridRowIndex,
    gridColumnIndex,
    worldX: AOHARA_DISTRICT_CONFIG.centerX + localX,
    worldZ: AOHARA_DISTRICT_CONFIG.centerZ + localZ,
    inwardX,
    inwardZ,
  };
}

function buildBlocks(): readonly AoharaBackstreetBlock[] {
  const blocks: AoharaBackstreetBlock[] = [];
  for (let rowIndex = 0; rowIndex < AOHARA_GRID_ROWS.length - 1; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < AOHARA_GRID_COLUMNS.length - 1; columnIndex += 1) {
      // Phase 8.4a: the plaza block stays an open square — no passages, no frontage, no infill.
      if (isAoharaPlazaBlock(rowIndex, columnIndex)) {
        continue;
      }
      const { centerLocalX, centerLocalZ } = aoharaBlockLocal(rowIndex, columnIndex);
      const horizontalNorthBase = horizontalBaseFraction(rowIndex, columnIndex);
      const horizontalSouthBase = horizontalBaseFraction(rowIndex + 1, columnIndex);
      const verticalWestBase = verticalBaseFraction(rowIndex, columnIndex);
      const verticalEastBase = verticalBaseFraction(rowIndex, columnIndex + 1);
      const verticalWestSafe = centralTowerSafeVerticalFraction(rowIndex, columnIndex);
      const verticalEastSafe = centralTowerSafeVerticalFraction(rowIndex, columnIndex + 1);
      const blockId = `aohara-backstreet-r${rowIndex}-c${columnIndex}`;
      const makeSide = (
        side: AoharaBackstreetSide,
        fraction: AoharaAccessThird,
      ): AoharaBackstreetAccess | undefined =>
        isBoulevardClosedMouth(blockId, side) ? undefined : makeAccess(
          rowIndex,
          columnIndex,
          centerLocalX,
          centerLocalZ,
          side,
          fraction,
        );
      const accesses: Readonly<
        Record<AoharaBackstreetSide, AoharaBackstreetAccess | undefined>
      > = {
        // Opposite thirds normally avoid face-to-face entrances; central tower-safe mouths align.
        // Phase 8.4b: the grand boulevard closes the mouths it would swallow (see above).
        north: makeSide('north', horizontalNorthBase),
        east: makeSide('east', verticalEastSafe ?? verticalEastBase),
        south: makeSide('south', oppositeFraction(horizontalSouthBase)),
        west: makeSide('west', verticalWestSafe ?? oppositeFraction(verticalWestBase)),
      };
      const hubLocalX = centerLocalX + (stableUnit(rowIndex, columnIndex, 1229) - 0.5) * 14;
      const hubLocalZ = centerLocalZ + (stableUnit(rowIndex, columnIndex, 1237) - 0.5) * 14;
      // Outer blocks have paired towers flanking east/west, so keep their short courtyard branches
      // on the north/south axis; central blocks retain all four directions around avenue towers.
      const hasCentralAvenueTowers =
        (rowIndex === 1 || rowIndex === 2) && (columnIndex === 1 || columnIndex === 2);
      const courtyardOffsets = hasCentralAvenueTowers
        ? ([
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
          ] as const)
        : ([
            [0, 1],
            [0, -1],
          ] as const);
      // Phase 8.4b: the grand boulevard sweeps across the south part of this
      // block, so the courtyard branch keeps its north side — the yard node
      // then clears the avenue's junction paint clearance.
      const courtyardDirection =
        rowIndex === 3 && columnIndex === 3
          ? courtyardOffsets.findIndex(([dx, dz]) => dx === 0 && dz === -1)
          : Math.floor(stableUnit(rowIndex, columnIndex, 1249) * courtyardOffsets.length);
      const courtyardDistance = 8 + stableUnit(rowIndex, columnIndex, 1261) * 3;
      const [courtyardDX, courtyardDZ] = courtyardOffsets[courtyardDirection]!;
      const courtyardNodeId = `${blockId}-yard`;
      blocks.push({
        id: blockId,
        rowIndex,
        columnIndex,
        centerLocalX,
        centerLocalZ,
        hubNodeId: `${blockId}-hub`,
        hubLocalX,
        hubLocalZ,
        hubWorldX: AOHARA_DISTRICT_CONFIG.centerX + hubLocalX,
        hubWorldZ: AOHARA_DISTRICT_CONFIG.centerZ + hubLocalZ,
        courtyardNodeId,
        courtyardWorldX:
          AOHARA_DISTRICT_CONFIG.centerX + hubLocalX + courtyardDX * courtyardDistance,
        courtyardWorldZ:
          AOHARA_DISTRICT_CONFIG.centerZ + hubLocalZ + courtyardDZ * courtyardDistance,
        accesses,
      });
    }
  }
  return blocks;
}

/** One fixed deterministic backstreet/courtyard network inside each of Aohara's 16 blocks. */
export const AOHARA_BACKSTREET_BLOCKS = buildBlocks();
