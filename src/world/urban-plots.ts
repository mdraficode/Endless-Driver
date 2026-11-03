/**
 * Phase 10.1 — building plots: the logical lot every city building sits on.
 *
 * A plot is a deterministic function of (cell, block, side, regionSeed): the road layout uses
 * it to aim driveways at the lot front, and the massing uses it to place the garage, the
 * fence line and the front pathway on exactly the same ground. Because both consumers hash
 * the same inputs, a driveway always ends in front of a building that actually exists —
 * the congested, cluttered street the owner asked for, without either system knowing about
 * the other.
 */

export type PlotKind = 'garage' | 'house' | 'shop';

export interface PlotSpot {
  readonly x: number;
  readonly z: number;
  /** Facing angle, radians, this codebase's convention: yaw = atan2(-dx, -dz) of the front normal. */
  readonly yaw: number;
  readonly kind: PlotKind;
  /** 0 = min-Z street, 1 = max-X, 2 = max-Z, 3 = min-X. */
  readonly side: 0 | 1 | 2 | 3;
  /** Frontage along the street, metres. */
  readonly widthMeters: number;
  /** Set-back depth from the street front, metres. */
  readonly depthMeters: number;
  /** Pavement-edge point the driveway connects to. */
  readonly curbX: number;
  readonly curbZ: number;
}

/** Integer hash in [0, 1), same family as the layout's pick(). */
function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export interface BlockRect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/**
 * The 0–2 plot spots of one city block (the lot fronts that face the streets ringing the
 * block). Side 0 = street at the block's min-Z edge, 1 = max-X, 2 = max-Z, 3 = min-X.
 * `streetHalfWidth` is the pavement half-width of the street on that side; the curb point
 * (where a driveway meets the road) sits just beyond the pavement edge.
 */
export function plotSpotsForBlock(
  ix: number,
  iz: number,
  r: number,
  c: number,
  rect: BlockRect,
  regionSeed: number,
  streetHalfWidthMeters: number,
): readonly PlotSpot[] {
  const spots: PlotSpot[] = [];
  const cellSalt = ix * 131 + iz * 17;
  const countRoll = pick(r * 31 + c, 0x77, regionSeed + cellSalt);
  const count = countRoll < 0.28 ? 0 : countRoll < 0.72 ? 1 : 2;
  for (let spot = 0; spot < count; spot += 1) {
    const salt = regionSeed + cellSalt + r * 31 + c * 7 + spot * 101;
    const side = Math.floor(pick(spot, 0xa1, salt) * 4) as 0 | 1 | 2 | 3;
    const along = 0.18 + 0.64 * pick(spot, 0xa2, salt);
    const width = 8 + 6 * pick(spot, 0xa3, salt);
    const depth = 12 + 10 * pick(spot, 0xa4, salt);
    const kindRoll = pick(spot, 0xa5, salt);
    const kind: PlotKind = kindRoll < 0.34 ? 'garage' : kindRoll < 0.72 ? 'house' : 'shop';
    const curbOffset = streetHalfWidthMeters + 0.6;
    const lotSetback = 2.2; // building front sits this far back from the pavement edge
    let x: number;
    let z: number;
    let yaw: number;
    let curbX: number;
    let curbZ: number;
    if (side === 0) {
      x = rect.minX + (rect.maxX - rect.minX) * along;
      curbZ = rect.minZ;
      curbX = x;
      z = curbZ + curbOffset + lotSetback;
      yaw = 0; // front normal -Z (the street sits at z < rect.minZ)
    } else if (side === 1) {
      z = rect.minZ + (rect.maxZ - rect.minZ) * along;
      curbX = rect.maxX;
      curbZ = z;
      x = curbX - curbOffset - lotSetback;
      yaw = -Math.PI / 2; // front normal +X
    } else if (side === 2) {
      x = rect.minX + (rect.maxX - rect.minX) * along;
      curbZ = rect.maxZ;
      curbX = x;
      z = curbZ - curbOffset - lotSetback;
      yaw = Math.PI; // front normal +Z
    } else {
      z = rect.minZ + (rect.maxZ - rect.minZ) * along;
      curbX = rect.minX;
      curbZ = z;
      x = curbX + curbOffset + lotSetback;
      yaw = Math.PI / 2; // front normal -X
    }
    spots.push({ x, z, yaw, kind, side, widthMeters: width, depthMeters: depth, curbX, curbZ });
  }
  return spots;
}
