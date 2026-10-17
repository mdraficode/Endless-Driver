/**
 * Off-road trail network — drivable dirt routes through country the paved road
 * never enters (owner request, 2026-10-18: "drivable routes off-road starting
 * from within the deep jungle with high tree canopy").
 *
 * A trail is NOT a road: nothing is flattened, nothing is paved. The corridor
 * only (a) clears understory so a car can physically pass, (b) keeps tall
 * canopy trees at the verges so the route tunnels under the crowns, and (c)
 * wears the ground to packed earth in the surface splat so the line reads as
 * a route from the seat. Grip/rolling come from the soil weights, so a trail
 * drives like dry dirt — slower than asphalt, firmer than deep grass.
 *
 * Waypoints are hand-authored polylines in world metres; the module in
 * world/trails.ts derives segments, distances and the minimap polyline from
 * exactly these numbers, on every thread, forever.
 */

export interface TrailRoute {
  readonly id: string;
  readonly label: string;
  /** Centreline waypoints, world metres, in driving order. */
  readonly points: readonly (readonly [number, number])[];
}

export interface TrailNetworkConfig {
  /** Half-width of the worn dirt band (metres from the centreline). */
  readonly halfWidthMeters: number;
  /** Feather from the dirt band edge back to untouched ground. */
  readonly featherMeters: number;
  /** Inside this distance from the centreline nothing grows at all. */
  readonly clearInnerMeters: number;
  /** Between clearInner and this radius only tall canopy trees may stand. */
  readonly canopyOuterMeters: number;
  /** Minimum placement scale for a tree allowed inside the canopy band. */
  readonly canopyMinScale: number;
  readonly routes: readonly TrailRoute[];
}

export const TRAIL_NETWORK_CONFIG: TrailNetworkConfig = {
  halfWidthMeters: 1.7,
  featherMeters: 3.4,
  clearInnerMeters: 4.6,
  canopyOuterMeters: 9.5,
  canopyMinScale: 1.02,
  routes: [
    {
      // Junction verge into the Kuroha jungle floor, ending at the shrine clearing.
      id: 'kuroha-michi',
      label: 'Kuroha Trail',
      points: [
        [0, -155],
        [-90, -95],
        [-185, -70],
        [-275, -110],
        [-350, -180],
        [-420, -250],
        [-495, -300],
        [-560, -330],
      ],
    },
    {
      // The deep-jungle loop: leaves the trail head, circles the tall canopy
      // core and rejoins the entry route above the shrine.
      id: 'kuroha-loop',
      label: 'Kuroha Loop',
      points: [
        [-560, -330],
        [-615, -240],
        [-585, -140],
        [-500, -95],
        [-415, -130],
        [-380, -215],
        [-430, -290],
        [-495, -300],
      ],
    },
  ],
};
