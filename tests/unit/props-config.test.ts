import { describe, expect, it } from 'vitest';
import {
  PROPS_CONFIG,
  lineupBackdropDistance,
  lineupCameraPose,
  lineupCentre,
  lineupFocusPose,
  lineupHalfWidth,
  lineupSlotOffset,
  lineupSpan,
  studioCoverage,
  type ModelSize,
} from '../../src/config/props';

/**
 * The prop inspector's layout is pure geometry, so the things that decide whether it is *readable* can
 * be asserted without a GPU.
 *
 * Every failure this file guards against has already happened once in the scene: a model stood up by
 * its bounding-sphere radius, which hangs it in the air with its shadow on the floor beneath it; a
 * backdrop sized from the lineup's width, which leaves the frame the moment the camera moves close;
 * and a floor sized the same way, whose far edge enters the picture when the camera pulls back. None
 * of those look like bugs in a screenshot — they look like a rendering style — and all three are
 * arithmetic.
 *
 * What makes these checks worth writing rather than eyeballing: the coverage rule is *exact*, not
 * approximate. The backdrop has to contain all four corners of the frame at the backdrop's own plane,
 * and the floor has to reach the farthest visible point in the frame. Anything less shows a band of
 * empty sky under the wall or past the floor's edge, and "less" is what a tuned constant gives at
 * every camera position except the one it was tuned at.
 */
const ASPECT = 16 / 9;
const FOV = PROPS_CONFIG.camera.fov;
const BOULDER: ModelSize = { radius: 1.2213, height: 0.62 };

type Triple = readonly [number, number, number];

const unit = (v: number[]): number[] => {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / length, v[1]! / length, v[2]! / length];
};
const cross = (a: number[], b: number[]): number[] => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];

/** The camera's four corner rays, in world space, for an unrolled camera looking at a target. */
function cornerRays(
  camera: Triple,
  target: Triple,
  fovDegrees: number,
  aspect: number,
): number[][] {
  const forward = unit([target[0] - camera[0], target[1] - camera[1], target[2] - camera[2]]);
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanVertical = Math.tan((fovDegrees * Math.PI) / 360);
  const tanHorizontal = tanVertical * aspect;
  const rays: number[][] = [];
  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      rays.push(
        unit([
          forward[0]! + right[0]! * signX * tanHorizontal + up[0]! * signY * tanVertical,
          forward[1]! + right[1]! * signX * tanHorizontal + up[1]! * signY * tanVertical,
          forward[2]! + right[2]! * signX * tanHorizontal + up[2]! * signY * tanVertical,
        ]),
      );
    }
  }
  return rays;
}

describe('prop lineup layout', () => {
  it('rests the lineup on the floor rather than on the bounding sphere', () => {
    // Each copy is moved by the bottom of its bounding box, so the floor line is y = 0 and the visual
    // centre is half the model's height — not the sphere's centre, which for a squat rock sits a
    // different distance off the ground entirely.
    expect(lineupCentre(BOULDER)).toEqual({ x: 0, y: BOULDER.height / 2, z: 0 });
    expect(lineupCentre(BOULDER).y).toBeLessThan(BOULDER.radius);
  });

  it('spaces copies symmetrically about the lineup centre', () => {
    for (const count of [1, 2, 3, 4]) {
      const offsets = Array.from({ length: count }, (_, index) =>
        lineupSlotOffset(index, count, BOULDER.radius),
      );
      expect(offsets.reduce((sum, offset) => sum + offset, 0)).toBeCloseTo(0, 9);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    }
  });

  it('separates neighbouring copies by the configured gap', () => {
    const spacing = lineupSlotOffset(1, 2, BOULDER.radius) - lineupSlotOffset(0, 2, BOULDER.radius);
    expect(spacing).toBeCloseTo(BOULDER.radius * 2 * PROPS_CONFIG.gapFactor, 9);
  });

  it('fits the whole lineup inside the frame the camera pose produces', () => {
    const pose = lineupCameraPose(3, BOULDER, ASPECT, FOV);
    const distance = Math.hypot(
      pose.position[0] - pose.target[0],
      pose.position[2] - pose.target[2],
    );
    const visibleWidth = 2 * distance * Math.tan((FOV * Math.PI) / 360) * ASPECT;
    // The copies are compared side by side, so all of them have to be in the picture at once: a
    // lineup whose last copy is cropped is a comparison of two models and a third one's absence.
    expect(visibleWidth).toBeGreaterThanOrEqual(lineupSpan(3, BOULDER.radius));
  });

  it('frames a close-up at the same fill fraction and elevation as the overview', () => {
    const overview = lineupCameraPose(3, BOULDER, ASPECT, FOV);
    const close = lineupFocusPose(lineupSlotOffset(0, 3, BOULDER.radius), BOULDER, FOV);
    const elevationOf = (pose: { position: number[]; target: number[] }) =>
      Math.atan2(
        pose.position[1]! - pose.target[1]!,
        Math.hypot(pose.position[2]! - pose.target[2]!, pose.position[0]! - pose.target[0]!),
      );
    expect(elevationOf(close)).toBeCloseTo(elevationOf(overview), 9);
    // The camera stays above the floor and off the model's own centre line, which is what keeps the
    // ground — and therefore the contact shadow — in the picture.
    expect(close.position[1]).toBeGreaterThan(BOULDER.height / 2);
    expect(close.position[2]).toBeGreaterThan(0);
  });

  it('keeps the model in the middle of the frame when zoomed in, not against an edge', () => {
    const copy = lineupSlotOffset(2, 3, BOULDER.radius);
    const pose = lineupFocusPose(copy, BOULDER, FOV);
    expect(pose.target[0]).toBeCloseTo(copy, 9);
    expect(pose.position[0]).toBeCloseTo(copy, 9);
  });
});

describe('studio coverage', () => {
  const target: Triple = [0, BOULDER.height / 2, 0];
  const backdropDistance = lineupBackdropDistance(3, BOULDER.radius);
  const cameras: Triple[] = [
    [0, 3.5, 16.2],
    [0, 2.1, 5.3],
    [-14, 6, 24],
    [31, 8, -4],
    [0.4, 0.9, 0.6],
  ];

  const coverageFor = (camera: Triple) =>
    studioCoverage({
      camera,
      target,
      backdropDistance,
      fovDegrees: FOV,
      aspect: ASPECT,
      // The scene's own margin, so the checks below are the checks the renderer passes: at a margin of
      // one the wall meets the frame's corners *exactly*, which is correct and one rounding away from
      // a visible seam.
      margin: PROPS_CONFIG.surfaceMargin,
    });

  /** Where a ray from the camera meets the wall's plane, and where that lands in the wall's own rect. */
  function projectOntoWall(camera: Triple, ray: number[]) {
    const coverage = coverageFor(camera);
    const normal = [Math.sin(coverage.yaw), 0, Math.cos(coverage.yaw)];
    const axis = [normal[2]!, 0, -normal[0]!];
    const [cx, cy, cz] = camera;
    const gap = (cx - coverage.centre[0]) * normal[0]! + (cz - coverage.centre[2]) * normal[2]!;
    const denominator = ray[0]! * normal[0]! + ray[2]! * normal[2]!;
    // The camera is on the wall's front side, so a ray that reaches the wall travels against the
    // normal. Read the sign the other way and the intersection lands behind the camera, mirrored
    // through it: a rectangle that is nearly the right size, in the wrong place.
    expect(denominator).toBeLessThan(-1e-9);
    const t = -gap / denominator;
    const hit = [cx + ray[0]! * t, cy + ray[1]! * t, cz + ray[2]! * t];
    return {
      coverage,
      axisOffset:
        (hit[0]! - coverage.centre[0]) * axis[0]! + (hit[2]! - coverage.centre[2]) * axis[2]!,
      heightOffset: hit[1]! - coverage.centre[1],
      floorHeight: hit[1]!,
      distance: Math.hypot(hit[0]! - cx, hit[2]! - cz),
    };
  }

  // One test per camera rather than a table: a camera is a value the rule is *asked about*, and a
  // failure reads far better as "from [0, 2.1, 5.3]" than as a row of arguments.
  for (const camera of cameras) {
    const where = `${camera[0]}, ${camera[1]}, ${camera[2]}`;

    it(`covers the whole frame with the backdrop from ${where}`, () => {
      for (const ray of cornerRays(camera, target, FOV, ASPECT)) {
        const hit = projectOntoWall(camera, ray);
        expect(Math.abs(hit.axisOffset)).toBeLessThanOrEqual(hit.coverage.width / 2);
        // A camera aimed steeply down puts the frame's lower corners below the floor line at the
        // wall's plane — under the floor, where the floor itself is what shows. The wall is required
        // to meet the floor, not to be built a storey underground, so those corners are exempt from
        // the height check and are checked against the floor's reach instead.
        if (hit.floorHeight >= 0) {
          expect(Math.abs(hit.heightOffset)).toBeLessThanOrEqual(hit.coverage.height / 2);
        } else {
          expect(hit.distance).toBeLessThanOrEqual(hit.coverage.floorRadius);
        }
      }
    });

    it(`reaches every visible point with the floor from ${where}`, () => {
      for (const ray of cornerRays(camera, target, FOV, ASPECT)) {
        const hit = projectOntoWall(camera, ray);
        expect(hit.distance).toBeLessThanOrEqual(hit.coverage.floorRadius);
      }
    });
  }

  it('keeps the wall behind the subject from every azimuth, including behind it', () => {
    for (const camera of cameras) {
      const coverage = coverageFor(camera);
      // The wall's centre lies on the far side of the target from the camera, so the subject is always
      // between the lens and the wall. A wall placed once, facing one way, would disappear the moment
      // automatic mode orbits — which is exactly the mode that moves the camera.
      const dot =
        (coverage.centre[0] - target[0]) * -camera[0] +
        (coverage.centre[2] - target[2]) * -camera[2];
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('stands the wall on the floor instead of floating it above', () => {
    for (const camera of cameras) {
      const coverage = coverageFor(camera);
      const bottom = coverage.centre[1] - coverage.height / 2;
      // A cyclorama that does not meet its floor is a poster: the gap under it reads as a bright band
      // of sky exactly where the eye expects the floor line.
      expect(bottom).toBeLessThanOrEqual(1e-6);
    }
  });

  it('backs the wall off the lineup far enough to clear the outermost copy', () => {
    const halfWidth = lineupHalfWidth(3, BOULDER.radius);
    expect(backdropDistance).toBeGreaterThan(halfWidth);
    for (const camera of cameras) {
      const coverage = coverageFor(camera);
      const offsetFromTarget = Math.hypot(coverage.centre[0], coverage.centre[2]);
      expect(offsetFromTarget).toBeGreaterThanOrEqual(backdropDistance - 1e-9);
    }
  });

  it('grows the surfaces as the camera pulls back rather than showing an edge', () => {
    const near = coverageFor([0, 2.1, 5.3]);
    const far = coverageFor([0, 2.1, 32]);
    expect(far.width).toBeGreaterThan(near.width);
    expect(far.height).toBeGreaterThan(near.height);
    expect(far.floorRadius).toBeGreaterThan(near.floorRadius);
  });

  it('is stable for a camera sitting on the target, where the azimuth is undefined', () => {
    const coverage = studioCoverage({
      camera: [0, BOULDER.height / 2, 0],
      target,
      backdropDistance,
      fovDegrees: FOV,
      aspect: ASPECT,
    });
    expect(Number.isFinite(coverage.width)).toBe(true);
    expect(Number.isFinite(coverage.height)).toBe(true);
    expect(coverage.width).toBeGreaterThan(0);
    expect(coverage.height).toBeGreaterThan(0);
  });
});
