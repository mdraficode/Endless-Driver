/**
 * Points of interest — the places the minimap navigates between (owner request
 * 2026-10-18: "mini map showing direction to next terrain/point of interest").
 *
 * The list is the prefecture's named places: every district core plus two
 * landmarks the road network reaches (volcano view) and one only the off-road
 * trails reach (the Kuroha shrine clearing). "Next" means the nearest POI not
 * yet visited this session; driving inside a POI's radius counts as visiting.
 */
import { DISTRICTS } from './districts';

export interface PointOfInterest {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  /** Arriving inside this radius counts as visiting the place. */
  readonly radiusMeters: number;
}

const LANDMARKS: readonly PointOfInterest[] = [
  { id: 'kuroha-shrine', label: 'Kuroha Shrine', x: -565, z: -335, radiusMeters: 55 },
  { id: 'volcano-view', label: 'Volcano View', x: -880, z: -1420, radiusMeters: 90 },
];

export const POINTS_OF_INTEREST: readonly PointOfInterest[] = [
  ...DISTRICTS.map((district) => ({
    id: district.id,
    label: district.label,
    x: district.centerX,
    z: district.centerZ,
    radiusMeters: district.radiusMeters * 0.35,
  })),
  ...LANDMARKS,
];
