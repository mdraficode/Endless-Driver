/**
 * Shared world-scale contract: one Three.js world unit represents one metre, matching Rapier's
 * default SI length unit. Physics poses can therefore be copied directly into the render scene.
 */
export const METERS_PER_THREE_UNIT = 1;

export type MeterPoint3 = readonly [x: number, y: number, z: number];
export type ThreePoint3 = [x: number, y: number, z: number];

/** Convert a physical distance in metres to the equivalent Three.js world-space distance. */
export function metersToThreeUnits(meters: number): number {
  return meters / METERS_PER_THREE_UNIT;
}

/** Convert a Three.js world-space distance back to metres. */
export function threeUnitsToMeters(units: number): number {
  return units * METERS_PER_THREE_UNIT;
}

/** Convert a position authored in metres at the scene boundary. */
export function metersToThreePoint(point: MeterPoint3): ThreePoint3 {
  return [metersToThreeUnits(point[0]), metersToThreeUnits(point[1]), metersToThreeUnits(point[2])];
}
