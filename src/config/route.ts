/**
 * The 2 km validation route: fixed camera bookmarks over an authored look-dev strip.
 *
 * This is a Phase 3 deliverable (`PROJECT_PLAN.md` Phase 3, deliverable 8; `docs/VISUAL_TARGET.md`
 * §4), and it is deliberately *not* Phase 4 content. There is no terrain generation, no road
 * network, and no streaming here: the strip is flat, finite, and built from literals, because its
 * job is to be the same picture every phase can be measured against. Phase 4 replaces the
 * *content* under these cameras; the bookmarks — positions, targets, and hours — are the contract
 * that survives that replacement, which is why they live in `config/` as data and are asserted by
 * tests rather than buried in a scene builder.
 *
 * Twelve bookmarks: three stations along the route, each shot at dawn, noon, dusk, and night. The
 * `weather` and `season` fields are part of the bookmark contract from the start — Phase 7 owns
 * rain, snow, and seasons, and a bookmark table that grew those fields later would silently
 * change what "the same 12 screenshots" means. They are pinned to the only values that exist
 * today and widen when the systems do.
 */

/** Time-of-day phases every station is captured at, in the order a day passes through them. */
export type RouteDayPhase = 'dawn' | 'noon' | 'dusk' | 'night';

/** Weather states a bookmark may name. Phase 7 widens this; today only `clear` exists. */
export type RouteWeather = 'clear';

/** Seasons a bookmark may name. Phase 7 widens this; today only `summer` exists. */
export type RouteSeason = 'summer';

export interface RouteBookmark {
  /** Stable id, used in URLs (`?bookmark=canopy-dawn`), file names, and the baseline manifest. */
  readonly id: string;
  /** Human label for reports. */
  readonly label: string;
  /** Station this bookmark belongs to: one of the ids in `ROUTE_STATIONS`. */
  readonly station: string;
  readonly phase: RouteDayPhase;
  /** Distance of the station along the route, in metres from the start line. */
  readonly distanceMeters: number;
  /** Camera position in world metres (+X right, +Y up, route runs toward −Z). */
  readonly camera: readonly [number, number, number];
  /** What the camera looks at, in world metres. */
  readonly target: readonly [number, number, number];
  /** Time of day in hours, 0–24, applied through the normal clock. */
  readonly hour: number;
  readonly weather: RouteWeather;
  readonly season: RouteSeason;
}

export interface RouteStation {
  readonly id: string;
  readonly label: string;
  /** Distance along the route, in metres from the start line (the station's Z is its negation). */
  readonly distanceMeters: number;
  readonly camera: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface RouteConfig {
  /** Route length in metres. The world content is built for exactly this span. */
  readonly lengthMeters: number;
  /** Width of the drivable strip in metres. */
  readonly roadWidthMeters: number;
  /** Width of the ground plane; the length follows `lengthMeters` plus margins. */
  readonly groundWidthMeters: number;
  /** Extra ground beyond each end of the route, in metres. */
  readonly groundMarginMeters: number;
  /** Distance between the small marker posts along both road edges, in metres. */
  readonly markerSpacingMeters: number;
  /** Start of the overhead-slat canopy section, in metres along the route. */
  readonly canopyStartMeters: number;
  /** End of the canopy section. God rays are judged here: slats are shadow casters by design. */
  readonly canopyEndMeters: number;
  /** Height of the canopy slats above the road, in metres. */
  readonly canopyHeightMeters: number;
  /** Field of view of the bookmark cameras, in degrees. Longer than the chase camera's on purpose. */
  readonly cameraFov: number;
}

export const ROUTE_CONFIG: RouteConfig = {
  lengthMeters: 2000,
  roadWidthMeters: 8,
  groundWidthMeters: 700,
  groundMarginMeters: 300,
  markerSpacingMeters: 100,
  canopyStartMeters: 600,
  canopyEndMeters: 720,
  canopyHeightMeters: 5.5,
  cameraFov: 55,
};

/** The hour each phase is captured at. Night is late enough that the sun is fully down. */
export const ROUTE_PHASE_HOURS: Readonly<Record<RouteDayPhase, number>> = {
  dawn: 6.8,
  noon: 12.5,
  dusk: 17.4,
  night: 23.8,
};

/** Phase order within each station, matching the order a day passes through them. */
export const ROUTE_PHASES: readonly RouteDayPhase[] = ['dawn', 'noon', 'dusk', 'night'];

/**
 * The three compositions every phase is judged at.
 *
 * - `start` looks down the full 2 km from just behind the start line: the aerial-perspective
 *   composition, with the volcano silhouette closing the view.
 * - `canopy` stands at the slatted section: the god-ray composition at dawn and dusk, and the
 *   shadow-quality composition at noon.
 * - `summit` is near the far end, close to the road, looking back along it: the near-field
 *   composition — road surface, markers, and barriers at reading distance.
 */
export const ROUTE_STATIONS: readonly RouteStation[] = [
  {
    id: 'start',
    label: 'Start line, looking down the route',
    distanceMeters: 0,
    camera: [-7.5, 2.4, 16],
    target: [0, 1.4, -80],
  },
  {
    id: 'canopy',
    label: 'Canopy section, looking through the slats',
    distanceMeters: 650,
    camera: [8.5, 1.7, -566],
    target: [0, 3.2, -690],
  },
  {
    id: 'summit',
    label: 'Far end, looking back along the road',
    distanceMeters: 1850,
    camera: [9, 4.5, -1788],
    target: [0, 1.2, -1960],
  },
];

/** The 12 bookmarks: every station at every phase, station-major so a day reads down each group. */
export const ROUTE_BOOKMARKS: readonly RouteBookmark[] = ROUTE_STATIONS.flatMap((station) =>
  ROUTE_PHASES.map((phase) => ({
    id: `${station.id}-${phase}`,
    label: `${station.label} — ${phase}`,
    station: station.id,
    phase,
    distanceMeters: station.distanceMeters,
    camera: station.camera,
    target: station.target,
    hour: ROUTE_PHASE_HOURS[phase],
    weather: 'clear' as const,
    season: 'summer' as const,
  })),
);

/** Bookmark shown when none is requested: the full-route composition at the default hour. */
export const DEFAULT_BOOKMARK_ID = 'start-noon';

/** Finds a bookmark by id, or returns `null` so a typo can fall back instead of failing start-up. */
export function findRouteBookmark(id: string | null | undefined): RouteBookmark | null {
  if (id === null || id === undefined || id === '') {
    return null;
  }
  return ROUTE_BOOKMARKS.find((bookmark) => bookmark.id === id) ?? null;
}
