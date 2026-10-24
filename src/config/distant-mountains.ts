/**
 * Static, snow-free ridgelines beyond the streamed road window. These are inexpensive
 * background geometry, generated from the shared terrain sampler and anchored outside the
 * playable road corridors; they do not add a second ground or collision authority.
 */
export interface DistantMountainRangeConfig {
  readonly id: string;
  readonly label: string;
  readonly centerX: number;
  readonly centerZ: number;
  /** Length of the ridgeline, metres. */
  readonly lengthMeters: number;
  /** Half-width of the sloping mass, metres. */
  readonly halfWidthMeters: number;
  /** Relief above the sampled natural terrain at the foot, metres. */
  readonly heightMeters: number;
  /** Rotation of the ridge axis in the world X/Z plane. */
  readonly yawRadians: number;
  /** Stable phase used to vary the broken skyline and rock tones. */
  readonly seed: number;
}

export const DISTANT_MOUNTAIN_RANGES: readonly DistantMountainRangeConfig[] = [
  {
    id: 'hinode-north-ridge',
    label: 'Hinode North Ridge',
    centerX: 850,
    centerZ: -1550,
    lengthMeters: 1850,
    halfWidthMeters: 220,
    heightMeters: 340,
    yawRadians: Math.PI / 2,
    seed: 17,
  },
  {
    id: 'aohara-east-ridge',
    label: 'Aohara East Ridge',
    centerX: 2860,
    centerZ: -430,
    lengthMeters: 2050,
    halfWidthMeters: 250,
    heightMeters: 310,
    yawRadians: Math.PI / 2,
    seed: 43,
  },
  {
    id: 'hinode-south-range',
    label: 'Hinode South Range',
    centerX: 1250,
    centerZ: 1400,
    lengthMeters: 2400,
    halfWidthMeters: 270,
    heightMeters: 360,
    yawRadians: 0,
    seed: 71,
  },
  {
    id: 'kiri-west-ridge',
    label: 'Kiri West Ridge',
    centerX: -1800,
    centerZ: -650,
    lengthMeters: 1900,
    halfWidthMeters: 230,
    heightMeters: 330,
    yawRadians: Math.PI / 2,
    seed: 97,
  },
] as const;

/** Low vertex counts keep the horizon readable on tier C as well as desktop. */
export const DISTANT_MOUNTAIN_MESH_CONFIG = {
  alongSegments: 72,
  crossSegments: 14,
  footClearanceMeters: 2,
} as const;
