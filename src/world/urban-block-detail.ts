/**
 * Phase 10 pass 3 — the shared per-block detail roll.
 *
 * The road layout and the massing city must agree on what lives inside each block: a
 * sub-division (a real urban-local road splitting the block) and/or an alley (the
 * backstreet near one block edge). The roll used to live only in `road-layout.ts`, so the
 * massing renderer placed towers and infill on top of the sub-divisions it could not see —
 * buildings straddling drivable roads. This module is the single source of the roll, pure
 * in (region seed, cell, block) so both sides stay bit-identical for a given seed.
 */

export interface BlockSubDivision {
  /** 0 = the sub runs along x (a z line), 1 = along z (an x line). */
  readonly axis: 0 | 1;
  /** Position of the sub line as a fraction of the block, 1/3 or 2/3. */
  readonly fraction: number;
}

export interface BlockAlley {
  /** 0 = the alley runs along x (a z line), 1 = along z (an x line). */
  readonly axis: 0 | 1;
}

export interface UrbanBlockDetail {
  readonly sub?: BlockSubDivision;
  readonly alley?: BlockAlley;
}

const SLUM_SPACING = 240;
const URBAN_LOCAL_HALF_WIDTH = 3.2;
const URBAN_ALLEY_HALF_WIDTH = 2.25;
export const ALLEY_SETBACK_METERS = 30;
/** Clear margin kept between a building edge and the sub/alley centreline, metres. */
const BUILDING_CLEARANCE_METERS = 10;

export function subCorridorHalfWidth(): number {
  return URBAN_LOCAL_HALF_WIDTH + BUILDING_CLEARANCE_METERS;
}

export function alleyCorridorHalfWidth(): number {
  return URBAN_ALLEY_HALF_WIDTH + BUILDING_CLEARANCE_METERS;
}

function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * The block detail roll, exactly as `road-layout.ts` has always made it (same salts, same
 * sequence) — moved here so the massing city can clear its placements against the same
 * sub-divisions and alleys the road graph builds.
 */
export function urbanBlockDetail(
  regionSeed: number,
  ix: number,
  iz: number,
  r: number,
  c: number,
  isSlum: boolean,
): UrbanBlockDetail {
  const blockSalt = regionSeed + ix * 131 + iz * 17 + r * 31 + c * 7;
  const sub =
    pick(blockSalt, 0xb1, 1) < (isSlum ? 0.62 : 0.5)
      ? {
          axis: (pick(blockSalt, 0xb2, 2) < 0.5 ? 0 : 1) as 0 | 1,
          fraction: pick(blockSalt, 0xb3, 3) < 0.5 ? 1 / 3 : 2 / 3,
        }
      : undefined;
  const alley =
    pick(blockSalt, 0xb4, 4) < (isSlum ? 0.55 : 0.28)
      ? { axis: (pick(blockSalt, 0xb5, 5) < 0.5 ? 0 : 1) as 0 | 1 }
      : undefined;
  return {
    ...(sub === undefined ? {} : { sub }),
    ...(alley === undefined ? {} : { alley }),
  };
}

/**
 * The sub-division line position (block-local metres from the block's min corner) and the
 * alley line position, so consumers can test a footprint against the corridors without
 * re-deriving the roll.
 */
export function blockCorriders(
  detail: UrbanBlockDetail,
  spacingMeters: number,
): readonly (readonly [line: number, halfWidth: number, axis: 0 | 1])[] {
  const out: (readonly [number, number, 0 | 1])[] = [];
  if (detail.sub !== undefined) {
    out.push([spacingMeters * detail.sub.fraction, subCorridorHalfWidth(), detail.sub.axis]);
  }
  if (detail.alley !== undefined) {
    out.push([ALLEY_SETBACK_METERS, alleyCorridorHalfWidth(), detail.alley.axis]);
  }
  return out;
}

/**
 * Does an axis-aligned footprint (centred at `x`/`z`, given extents) touch any of the
 * block's road corridors?
 */
export function footprintTouchesBlockRoads(
  detail: UrbanBlockDetail,
  spacingMeters: number,
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
): boolean {
  for (const [line, halfWidthRoad, axis] of blockCorriders(detail, spacingMeters)) {
    if (axis === 0) {
      if (z - halfDepth < line + halfWidthRoad && z + halfDepth > line - halfWidthRoad) {
        return true;
      }
    } else if (x - halfWidth < line + halfWidthRoad && x + halfWidth > line - halfWidthRoad) {
      return true;
    }
  }
  return false;
}

/**
 * The clear sub-block centres along the given axis: split the block at every corridor line
 * and return the centre of each clear span. Used to move a placement into the nearest
 * clear span instead of dropping it (the colony keeps its density).
 */
export function clearSubBlockCenters(
  detail: UrbanBlockDetail,
  spacingMeters: number,
  axis: 0 | 1,
): number[] {
  const lines = blockCorriders(detail, spacingMeters)
    .filter(([, , a]) => a === axis)
    .map(([line]) => line)
    .sort((a, b) => a - b);
  const bounds = [0, ...lines.map((l) => l), spacingMeters];
  const centers: number[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    if (b - a > 24) {
      centers.push((a + b) / 2);
    }
  }
  return centers;
}

export const SLUM_SPACING_METERS = SLUM_SPACING;
export const URBAN_LOCAL_HALF_WIDTH_METERS = URBAN_LOCAL_HALF_WIDTH;
