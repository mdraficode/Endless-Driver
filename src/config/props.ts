/**
 * Configuration for the prop inspection scene (`?scene=props`).
 *
 * A third look-dev scene beside the driving world and the material grid, and the one that answers a
 * question the other two cannot: *does a model that came out of the derivation pipeline survive
 * contact with the renderer?* Materials are judged on spheres, the world is judged from a chase
 * camera, and only this scene shows a real asset up close, at scale, on the same floor and under the
 * same light as everything else.
 *
 * The layout is a line of copies of the same model — one per level of detail — spaced in multiples of
 * the model's own bounding radius. Measuring rather than assuming is what lets the scene inspect a
 * 0.4 m stone and a 6 m boulder without a second set of numbers: the camera distance, the spacing,
 * and the floor all follow from what the file actually contains.
 */
export interface PropsConfig {
  readonly camera: {
    readonly fov: number;
    readonly elevationDegrees: number;
    /** Share of the frame height the lineup should fill. */
    readonly fillFraction: number;
    /** Extra distance so the lineup never touches the panel. */
    readonly panelClearance: number;
  };
  /** Gap between neighbouring copies, as a multiple of the model's bounding radius. */
  readonly gapFactor: number;
  readonly floorColor: number;
  readonly floorRoughness: number;
  readonly backdropColor: number;
  /**
   * Extra size on the covered frame, as a multiple of it.
   *
   * The floor and the wall are sized from the camera's own frustum rather than from a guess, so the
   * surfaces are *exactly* as large as the frame needs — and a margin keeps the edge outside it even
   * when the frame moves between the measurement and the draw.
   */
  readonly surfaceMargin: number;
  /** Gap between the lineup and the backdrop, as a multiple of the model's radius. */
  readonly backdropGapRadii: number;
  /**
   * Distance at which the scene switches from showing every level side by side to showing one
   * distance-selected instance, in multiples of the model radius. Used by the "auto" mode, which
   * exercises the selection rule the streamed world will use.
   */
  readonly autoOrbitRadii: number;
}

export const PROPS_CONFIG: PropsConfig = {
  camera: {
    // The studio's long lens, kept deliberately: a model judged at 60° is judged through a
    // distorting lens, and props in the world are seen at a distance through a narrower one.
    fov: 32,
    elevationDegrees: 12,
    // 0.82 of the free frame: the lineup fills it without touching the edges, and the copies stay
    // large enough that a difference between two levels is visible in one capture.
    fillFraction: 0.82,
    panelClearance: 1.02,
  },
  // 1.9 radii between centres: the copies are separated by nearly a radius of empty floor, which is
  // enough that a crack in one silhouette cannot be mistaken for a crack in the next one's, and close
  // enough that all three stay large in the frame. Spacing them further reads well in a diagram and
  // badly in a screenshot — the whole point is to compare the silhouettes at a size where a difference
  // is visible.
  gapFactor: 1.9,
  floorColor: 0x5d5d60,
  floorRoughness: 0.75,
  /**
   * The backdrop is a *contrast reference*, so it is deliberately darker than the studio's wall.
   *
   * The studio's grid is bright — metals, paint, polished wood — and a mid-grey wall reads correctly
   * behind it. A scanned rock is dark and matte, and the same wall renders *brighter* than the model,
   * which is the one thing a backdrop must not do: it inverts the silhouette the scene exists to show.
   */
  backdropColor: 0x23262b,
  // Six per cent past the frame. The floor and the wall both follow the camera, so this is not a
  // guess at how far the camera will travel — it only has to absorb a resize between measurement and
  // draw, and anything larger would put the floor's far edge into shots that do not need it.
  surfaceMargin: 1.06,
  // The wall stands just behind the copies, not at the floor's edge: a wall nineteen metres away is
  // not a backdrop, it is scenery, and scenery competes with the thing being inspected.
  backdropGapRadii: 0.75,
  autoOrbitRadii: 26,
};

/** Horizontal offset of one copy in the lineup, relative to the lineup's centre. */
export function lineupSlotOffset(
  index: number,
  count: number,
  radius: number,
  config: PropsConfig = PROPS_CONFIG,
): number {
  if (count <= 1) {
    return 0;
  }
  const spacing = radius * 2 * config.gapFactor;
  return (index - (count - 1) / 2) * spacing;
}

/** Half-width of the lineup, used to size the floor and frame the camera. */
export function lineupHalfWidth(
  count: number,
  radius: number,
  config: PropsConfig = PROPS_CONFIG,
): number {
  if (count <= 1) {
    return radius;
  }
  return ((count - 1) / 2) * radius * 2 * config.gapFactor + radius;
}

/** The two measurements of the model the layout needs. Both measured, neither assumed. */
export interface ModelSize {
  /** Enclosing-sphere radius: how large the model appears, and how far apart copies stand. */
  readonly radius: number;
  /** Bounding-box height. Everything rests on y = 0, so the visual centre is half of this. */
  readonly height: number;
}

/**
 * Centre of the lineup, in world units — where the camera looks and the shadows focus.
 *
 * Everything in the lineup rests on the floor, so the visual centre is half the model's height above
 * it. Taking the bounding sphere's centre instead would be a different point entirely — the sphere is
 * fitted to the whole model, including its depth — and a wide, flat rock would then be framed by a
 * point below its floor line, which puts it in the lower third of every shot.
 */
export function lineupCentre(size: ModelSize): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return { x: 0, y: size.height / 2, z: 0 };
}

/** Full width of the lineup, corner to corner. */
export function lineupSpan(
  count: number,
  radius: number,
  config: PropsConfig = PROPS_CONFIG,
): number {
  return lineupHalfWidth(count, radius, config) * 2;
}

/**
 * How far behind the lineup's centre the backdrop stands, in world units.
 *
 * Half the lineup's own width, so the wall clears the outermost copy at every count, plus a gap of a
 * fraction of a radius — enough to separate the two silhouettes, close enough to stay a wall.
 */
export function lineupBackdropDistance(
  count: number,
  radius: number,
  config: PropsConfig = PROPS_CONFIG,
): number {
  return lineupHalfWidth(count, radius, config) + radius * config.backdropGapRadii;
}

/**
 * Camera pose that frames the lineup.
 *
 * The same two corrections the material grid uses, for the same reasons: the camera backs off so the
 * lineup fits within whatever the panel has left of the frame, then slides — camera and target
 * together — so the lineup sits in the middle of the free area rather than under the panel. The
 * distance comes from the lens, so changing the field of view cannot silently reframe the shot.
 */
export function lineupCameraPose(
  count: number,
  size: ModelSize,
  aspect: number,
  fovDegrees: number,
  config: PropsConfig = PROPS_CONFIG,
  occludedFraction = 0,
): { position: [number, number, number]; target: [number, number, number] } {
  const centre = lineupCentre(size);
  const free = Math.max(0.3, 1 - Math.max(0, Math.min(0.6, occludedFraction)));
  const width = lineupHalfWidth(count, size.radius, config) * 2;
  // Height is the box, not the sphere: the sphere is fitted to the model's depth too, so framing the
  // lineup by it would push the camera back by about a third of the frame for nothing.
  const height = size.height;

  const vertical = (fovDegrees * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.1, aspect));

  // Whichever edge runs out first decides the distance; fitting on height alone crops the line on a
  // portrait screen, and fitting on width alone leaves a desktop window half empty.
  const fitWidth = width / config.camera.fillFraction / 2 / Math.tan(horizontal / 2);
  const fitHeight = height / config.camera.fillFraction / 2 / Math.tan(vertical / 2);
  const distance = (Math.max(fitWidth, fitHeight) / free) * config.camera.panelClearance;

  const visibleWidth = 2 * distance * Math.tan(horizontal / 2);
  const offset = visibleWidth * (1 - free) * 0.5;
  const elevation = (config.camera.elevationDegrees * Math.PI) / 180;

  return {
    position: [centre.x - offset, centre.y + distance * Math.tan(elevation), centre.z + distance],
    target: [centre.x - offset, centre.y, centre.z],
  };
}

/** Close-up pose on one copy, for judging a single level on its own. */
export function lineupFocusPose(
  offset: number,
  size: ModelSize,
  fovDegrees: number,
  config: PropsConfig = PROPS_CONFIG,
): { position: [number, number, number]; target: [number, number, number] } {
  // The same fill fraction, elevation, and vertical centre as the lineup view, so a close-up and the
  // overview are the same photograph at two distances: a change in the model cannot be confused with a
  // change in the camera, and the floor under the model stays in frame, which is where its shadow is.
  const centreY = size.height / 2;
  const frameHeight = size.height / config.camera.fillFraction;
  const distance = frameHeight / 2 / Math.tan((fovDegrees * Math.PI) / 360);
  const elevation = (config.camera.elevationDegrees * Math.PI) / 180;
  return {
    position: [offset, centreY + distance * Math.tan(elevation), distance],
    target: [offset, centreY, 0],
  };
}

/**
 * Where the floor and the wall must be, for a camera at a given place, to fill the frame behind the
 * subject — the photographic cyclorama, derived instead of guessed.
 *
 * The earlier version of this scene sized both surfaces from the lineup's width and hoped. It worked
 * for the overview, which is what it was tuned on, and failed everywhere else: the close-up put the
 * camera inside the wall's own gap, so the wall's edges entered the frame and the void beyond them
 * came with it, and the automatic orbit crossed the floor's edge entirely. Sizing surfaces from a
 * fixed multiple of the model can only ever be right for the one distance it was tuned at.
 *
 * So the frustum decides. The four corner rays of the camera are intersected with the wall's plane,
 * and the wall is built to contain every one of those points — exactly, for any lens, any aspect, and
 * any camera position — while the floor is sized to reach the farthest visible point in the frame, so
 * the horizon in every shot is either floor or wall and never the sky's absence.
 */
export function studioCoverage(options: {
  readonly camera: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  /** How far behind the target, measured horizontally, the wall stands. */
  readonly backdropDistance: number;
  readonly fovDegrees: number;
  readonly aspect: number;
  readonly margin?: number;
}): {
  /** Rotation about Y, radians, so the wall's face points back at the camera. */
  readonly yaw: number;
  readonly centre: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
  /** Floor radius around the camera that covers every visible point. */
  readonly floorRadius: number;
} {
  const margin = Math.max(1, options.margin ?? 1);
  const [cx, cy, cz] = options.camera;
  const [tx, ty, tz] = options.target;

  // The wall stands directly opposite the camera, on the far side of the subject. Its yaw comes from
  // that direction, so the orbit can go all the way round and the wall goes with it — a backdrop that
  // only covers the default azimuth is a backdrop that vanishes the first time the camera moves.
  const dx = cx - tx;
  const dz = cz - tz;
  const horizontal = Math.hypot(dx, dz);
  const away = horizontal < 1e-6 ? { x: 0, z: -1 } : { x: -dx / horizontal, z: -dz / horizontal };
  const normal = { x: -away.x, z: -away.z };
  const yaw = Math.atan2(normal.x, normal.z);
  const planeX = tx + away.x * options.backdropDistance;
  const planeZ = tz + away.z * options.backdropDistance;
  // The wall's own horizontal axis, for measuring how far its face extends either side of centre.
  const axisX = normal.z;
  const axisZ = -normal.x;
  // Distance from the camera to the wall's plane along the plane's normal.
  const planeGap = (cx - planeX) * normal.x + (cz - planeZ) * normal.z;

  const forward = normalise([tx - cx, ty - cy, tz - cz]);
  const right = normalise(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanVertical = Math.tan((options.fovDegrees * Math.PI) / 360);
  const tanHorizontal = tanVertical * Math.max(0.1, options.aspect);

  let minAxis = Infinity;
  let maxAxis = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let floorRadius = 0;
  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      const ray = normalise([
        forward[0] + right[0] * signX * tanHorizontal + up[0] * signY * tanVertical,
        forward[1] + right[1] * signX * tanHorizontal + up[1] * signY * tanVertical,
        forward[2] + right[2] * signX * tanHorizontal + up[2] * signY * tanVertical,
      ]);
      // The camera sits on the wall's front side, so `planeGap` is positive and a ray that meets the
      // wall must travel *against* the normal: the denominator is negative and `t` positive. Reading
      // the sign the other way round still produces a rectangle — the mirror image of the right one
      // through the camera — which is close enough to look plausible and wrong enough to leave a
      // corner of the frame uncovered, so the sign is asserted rather than assumed.
      const denominator = ray[0] * normal.x + ray[2] * normal.z;
      if (denominator >= -1e-9) {
        continue;
      }
      const t = -planeGap / denominator;
      const hitX = cx + ray[0] * t;
      const hitY = cy + ray[1] * t;
      const hitZ = cz + ray[2] * t;
      const axis = (hitX - planeX) * axisX + (hitZ - planeZ) * axisZ;
      minAxis = Math.min(minAxis, axis);
      maxAxis = Math.max(maxAxis, axis);
      minY = Math.min(minY, hitY);
      maxY = Math.max(maxY, hitY);
      floorRadius = Math.max(
        floorRadius,
        Math.hypot(hitX - cx, hitZ - cz),
        Math.hypot(tx - cx, tz - cz) + options.backdropDistance,
      );
    }
  }

  if (!Number.isFinite(minAxis) || !Number.isFinite(minY)) {
    // Every corner ray ran parallel to the wall, which the geometry above rules out; the camera's own
    // distance and lens are still enough to build something sound, so the scene degrades to a wall
    // sized from the frame at its own plane rather than to no wall at all.
    const distance = Math.max(1, Math.abs(planeGap));
    return {
      yaw,
      centre: [planeX, (distance * tanVertical) / 2, planeZ],
      width: distance * tanHorizontal * 2 * margin,
      height: distance * tanVertical * 2 * margin,
      floorRadius: distance * Math.hypot(tanHorizontal, 1) * margin,
    };
  }

  // The wall always reaches the floor, even when the frame's lower edge does not: a wall whose bottom
  // edge floats shows the sky under it, and a cyclorama that does not meet its floor is a poster.
  const wallMinY = Math.min(minY, 0);
  const wallMaxY = Math.max(maxY, 0);
  const height = Math.max(0.1, (wallMaxY - wallMinY) * margin);
  const width = Math.max(0.1, (maxAxis - minAxis) * margin);
  const centreAxis = (maxAxis + minAxis) / 2;
  return {
    yaw,
    centre: [planeX + axisX * centreAxis, (wallMaxY + wallMinY) / 2, planeZ + axisZ * centreAxis],
    width,
    height,
    floorRadius: Math.max(0.5, floorRadius * margin),
  };
}

function normalise(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-9 ? [v[0], v[1], v[2]] : [v[0] / length, v[1] / length, v[2] / length];
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
