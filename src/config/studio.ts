/**
 * The look-dev material set: what the studio scene puts on the grid, and the room it stands in.
 *
 * Values here are *physical*, not stylistic. Base colours are sRGB hex, metalness and roughness are
 * 0-1, and the odd-looking numbers are the point of the exercise: asphalt is not `0x808080`, and
 * snow is not white. Every one of these will be checked in the studio before it is used in the
 * world, which is why they live in `config/` where they can be read and asserted rather than buried
 * in a mesh builder.
 *
 * Sources for the values: published PBR calibration charts and material reference tables
 * (filmic-world / physicallybased.info class references), plus the measured values in the archive
 * textures already in the manifest.
 */
export interface SurfaceMaterialConfig {
  /** Stable id, used as the mesh name and in diagnostics. */
  readonly id: string;
  /** Human label shown on the studio panel. */
  readonly label: string;
  /** sRGB hex base colour. */
  readonly color: number;
  /** 0 = dielectric, 1 = metal. Anything between is a blend and usually wrong. */
  readonly metalness: number;
  /** Microsurface roughness; drives how tight the highlights are. */
  readonly roughness: number;
  /** Clearcoat: the lacquer layer on automotive paint. Not available on every material. */
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  /**
   * Transmission: light passing through (glass, water). Rendered by `MeshPhysicalNodeMaterial` and
   * substantially more expensive than an opaque surface, so it is opt-in per material.
   */
  readonly transmission?: number;
  /** Index of refraction; only meaningful with transmission. Air is 1, water 1.33, glass 1.5. */
  readonly ior?: number;
  /** One line on what this material is for, shown under the grid label. */
  readonly note: string;
}

/**
 * The grid, in reading order: three automotive paints across the top, then the hard surfaces, then
 * the ground materials of the Hinode Prefecture world this is all for.
 *
 * The paints share a base-coat colour and differ only in flake and clearcoat, which is exactly the
 * comparison the studio exists to make: under the same sky, at the same hour, a rough clearcoat and
 * a mirror one are visibly different materials.
 */
export const SURFACE_MATERIALS: readonly SurfaceMaterialConfig[] = [
  {
    id: 'paint-solid',
    label: 'Paint · solid',
    color: 0xb3221f,
    metalness: 0,
    roughness: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    note: 'Single-stage lacquer over pigment. The baseline car paint',
  },
  {
    id: 'paint-metallic',
    label: 'Paint · metallic',
    color: 0x2e4a63,
    metalness: 0.35,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    note: 'Aluminium flake under clearcoat: darker, sharper highlights',
  },
  {
    id: 'paint-matte',
    label: 'Paint · matte',
    color: 0x30343a,
    metalness: 0,
    roughness: 0.62,
    clearcoat: 0.15,
    clearcoatRoughness: 0.55,
    note: 'Satin finish; no mirror, but still a coated surface',
  },
  {
    id: 'chrome',
    label: 'Chrome',
    color: 0xf2f2f2,
    metalness: 1,
    roughness: 0.04,
    note: 'Trim and badges. Reflects the sky, so it must be checked at every hour',
  },
  {
    id: 'aluminium',
    label: 'Brushed aluminium',
    color: 0xd8dadc,
    metalness: 1,
    roughness: 0.28,
    note: 'Wheels and body trim: metal with a direction to its reflections',
  },
  {
    id: 'rubber',
    label: 'Tire rubber',
    color: 0x121214,
    metalness: 0,
    roughness: 0.85,
    note: 'Near-black and very rough. Where the tire physics meets the eye',
  },
  {
    id: 'glass',
    label: 'Glass',
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    ior: 1.52,
    note: 'Windows and lamps. Refractive, so it distorts what is behind it',
  },
  {
    id: 'water',
    label: 'Water',
    color: 0x2f4a52,
    metalness: 0,
    roughness: 0.02,
    transmission: 0.85,
    ior: 1.33,
    note: 'Rice paddy and ditch water. Animated surface arrives with weather',
  },
  {
    id: 'asphalt',
    label: 'Asphalt',
    color: 0x3c3c3e,
    metalness: 0,
    roughness: 0.72,
    note: 'The road surface. Slightly darker and smoother than gravel',
  },
  {
    id: 'gravel',
    label: 'Gravel',
    color: 0x6a655c,
    metalness: 0,
    roughness: 0.9,
    note: 'Shoulder and forest track. Detail textures arrive in Phase 5',
  },
  {
    id: 'soil',
    label: 'Soil',
    color: 0x51402c,
    metalness: 0,
    roughness: 0.95,
    note: 'Bare earth beside the road; the base layer under vegetation',
  },
  {
    id: 'grass',
    label: 'Grass',
    color: 0x3f5a24,
    metalness: 0,
    roughness: 0.88,
    note: 'Flat layer now; splat-blended terrain arrives in Phase 4',
  },
  {
    id: 'snow',
    label: 'Snow',
    color: 0xe9eef2,
    metalness: 0,
    roughness: 0.42,
    note: 'Winter ground. Slightly blue, never pure white',
  },
  {
    id: 'cedar',
    label: 'Cedar planks (scanned)',
    color: 0xffffff,
    metalness: 0,
    roughness: 1,
    note: 'The archived PBR set: albedo, normal, roughness, and AO from the manifest',
  },
];

export interface StudioConfig {
  /** Sphere radius on the grid, in metres. Sized for a 0.35 m eyeball distance. */
  readonly sphereRadius: number;
  /** Gap between sphere centres, in metres. */
  readonly spacing: number;
  /** Spheres per row before wrapping. */
  /**
   * Spheres per row.
   *
   * Wider than it is deep on purpose. Looking down a grid at an angle compresses each row into the
   * one behind it, and past two rows the back of the grid is simply hidden — which is the wrong
   * failure for a comparison rig, because a material you cannot see is a material nobody approved.
   */
  readonly columns: number;
  /** How many segments the spheres are built with. */
  readonly segments: number;
  /**
   * Height of the grid centre above the floor.
   *
   * Set to the sphere radius, which is what puts the spheres *on* the floor rather than in the air.
   * It matters more than it sounds: a floating sphere throws a shadow metres away from its own
   * contact point, which hides exactly the contact shadow and occlusion the floor is there to show.
   */
  readonly gridHeight: number;
  /** Where the grid starts along +X, relative to the room centre. */
  readonly originX: number;

  /** Matte grey floor: the exposure and shadow reference the grid stands on. */
  readonly floorColor: number;
  readonly floorRoughness: number;
  readonly floorSize: number;
  /** A wall behind the grid, so the spheres read against something other than sky. */
  readonly backdropColor: number;
  readonly backdropDistance: number;
  readonly backdropHeight: number;

  readonly camera: {
    readonly fov: number;
    /**
     * How far above the grid the camera looks down from, in degrees.
     *
     * An angle rather than a height, because what decides whether the second and third rows are
     * readable is the viewing angle, not the distance: from low down, every row hides behind the one
     * in front of it, and some materials are only distinguishable in the back row.
     */
    readonly elevationDegrees: number;
    /**
     * Extra gap left between the panel's edge and the grid, as a fraction of the free width.
     *
     * The camera both backs off and slides across when part of the frame is covered, so the grid ends
     * up fully inside what is left. This is the margin on top of that, so the outermost sphere is not
     * touching the panel.
     */
    readonly panelClearance: number;
    /**
     * How much of the frame's height the focused sphere fills, in the close-up view.
     *
     * About a third: the sphere has to be large enough to judge a clearcoat on, and small enough
     * that its neighbours are still in frame for comparison. A sphere that fills the frame is a
     * sphere nobody can compare anything to.
     */
    readonly focusFillFraction: number;
    readonly minDistance: number;
    readonly maxDistance: number;
    readonly maxPolarAngle: number;
    readonly dampingFactor: number;
  };
}

export const STUDIO_CONFIG: StudioConfig = {
  sphereRadius: 0.5,
  spacing: 1.35,
  columns: 7,
  segments: 64,
  gridHeight: 0.5,
  originX: -2.7,

  floorColor: 0x5d5d60,
  floorRoughness: 0.75,
  floorSize: 60,
  backdropColor: 0x45484d,
  backdropDistance: 8,
  backdropHeight: 12,

  camera: {
    // Narrow on purpose: a long lens flattens perspective, so equal-sized spheres across the grid
    // read as equal and a highlight's shape is a property of the material rather than of how far
    // from the frame centre it happens to sit.
    fov: 32,
    elevationDegrees: 20,
    panelClearance: 1.04,
    focusFillFraction: 0.36,
    minDistance: 1.2,
    maxDistance: 24,
    maxPolarAngle: Math.PI / 2 - 0.02,
    dampingFactor: 0.08,
  },
};

/**
 * Where a material sits on the grid, in metres.
 *
 * Layout is a pure function of the index so the studio can be asserted without a GPU: row 0 is the
 * paints, and the grid grows to the left and right of the origin.
 */
export function gridSlotPosition(
  index: number,
  config: StudioConfig = STUDIO_CONFIG,
): { x: number; y: number; z: number } {
  const column = index % config.columns;
  const row = Math.floor(index / config.columns);
  return {
    x: config.originX + column * config.spacing,
    y: config.gridHeight,
    // Rows recede from the camera, so the first row is the nearest and therefore the largest on
    // screen. The materials are ordered most-important-first for exactly that reason: the paints
    // and the metals are what gets inspected, and they must not be the particles at the back.
    z: -row * config.spacing,
  };
}

/** How many rows the configured material set needs. */
export function gridRows(materialCount: number, config: StudioConfig = STUDIO_CONFIG): number {
  return Math.max(1, Math.ceil(materialCount / config.columns));
}

/** Centre of the occupied grid: where the camera looks and where the shadows focus. */
export function gridCentre(
  materialCount: number,
  config: StudioConfig = STUDIO_CONFIG,
): { x: number; y: number; z: number } {
  const columns = Math.min(materialCount, config.columns);
  const rows = gridRows(materialCount, config);
  return {
    x: config.originX + ((columns - 1) * config.spacing) / 2,
    y: config.gridHeight,
    z: -((rows - 1) * config.spacing) / 2,
  };
}

/**
 * How far back the camera stands to frame the whole grid.
 *
 * Derived from the grid's actual size rather than fixed, so the framing survives materials being
 * added or the column count changing. The horizontal field of view is what constrains a wide grid,
 * so it is derived from the vertical one and the viewport aspect; the margin keeps the outer spheres
 * clear of the frame edge.
 */
export function framingDistance(
  materialCount: number,
  aspect: number,
  fovDegrees: number,
  config: StudioConfig = STUDIO_CONFIG,
): number {
  const columns = Math.min(materialCount, config.columns);
  const width = columns * config.spacing;
  const depth = gridRows(materialCount, config) * config.spacing;
  const vertical = (fovDegrees * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.1, aspect));

  // Two constraints, and the larger one wins. Looking down at an angle compresses the grid's depth
  // into a vertical screen extent, so a deep grid needs the camera further back than its width alone
  // suggests — which is the mistake that leaves the far row half out of frame.
  const byWidth = width / 2 / Math.tan(horizontal / 2);
  const projectedDepth =
    depth * Math.sin((config.camera.elevationDegrees * Math.PI) / 180) + config.sphereRadius * 2;
  const byDepth = projectedDepth / 2 / Math.tan(vertical / 2);
  return Math.max(byWidth, byDepth) * 1.03;
}

/**
 * Where the studio camera stands and what it looks at.
 *
 * The camera sits slightly above the grid centre and looks down at it, which is how a person
 * inspects a surface: high enough to see the floor contact and the shadow, level enough to see the
 * horizon reflected in the sphere rather than only the floor.
 */
export function studioCameraPose(
  materialCount: number,
  aspect: number,
  fovDegrees: number,
  config: StudioConfig = STUDIO_CONFIG,
  occludedFraction = 0,
): { position: [number, number, number]; target: [number, number, number] } {
  const centre = gridCentre(materialCount, config);
  // The panel occupies the left of the frame and must not cover the grid. Both corrections follow
  // from that one number: the camera backs off so the grid fits in what is left, and then slides the
  // whole rig — camera and target together — so the grid sits in the middle of the free area. The
  // slide is a translation rather than a yaw, which keeps every sphere square to the lens and its
  // highlight symmetric, so materials stay comparable to each other.
  const free = Math.max(0.3, 1 - Math.max(0, Math.min(0.6, occludedFraction)));
  const distance =
    (framingDistance(materialCount, aspect, fovDegrees, config) / free) *
    config.camera.panelClearance;
  const visibleWidth = 2 * distance * Math.tan(horizontalFieldOfView(aspect, fovDegrees) / 2);
  const offset = visibleWidth * (1 - free) * 0.5;
  const elevation = (config.camera.elevationDegrees * Math.PI) / 180;
  return {
    position: [centre.x - offset, centre.y + distance * Math.tan(elevation), centre.z + distance],
    target: [centre.x - offset, centre.y, centre.z],
  };
}

/**
 * A close-up pose on a single material.
 *
 * Judging a paint means filling the frame with one sphere: at grid distance a 1 m sphere is a few
 * hundred pixels across, which is enough to spot a colour that is wrong and not enough to judge
 * whether a clearcoat is too rough. The close-up keeps the same low, level angle as the grid view so
 * the two are comparable.
 */
export function materialFocusPose(
  index: number,
  fovDegrees: number,
  config: StudioConfig = STUDIO_CONFIG,
): { position: [number, number, number]; target: [number, number, number] } {
  const slot = gridSlotPosition(index, config);
  // Stand off far enough that the sphere fills the configured share of the frame height. Derived
  // from the lens rather than fixed, so changing the field of view cannot silently turn the close-up
  // into a extreme macro or a wide shot.
  const vertical = (fovDegrees * Math.PI) / 180;
  const frameHeight = (config.sphereRadius * 2) / config.camera.focusFillFraction;
  const distance = frameHeight / 2 / Math.tan(vertical / 2);
  return {
    position: [slot.x, slot.y + 0.22, slot.z + distance],
    target: [slot.x, slot.y, slot.z],
  };
}

/** Horizontal field of view in radians, from the vertical field of view and the viewport aspect. */
function horizontalFieldOfView(aspect: number, verticalFovDegrees: number): number {
  const vertical = (verticalFovDegrees * Math.PI) / 180;
  return 2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.1, aspect));
}
