import { describe, expect, it } from 'vitest';
import {
  applyOrbitSwipe,
  CHASE_ORBIT_CONFIG,
  clampOrbit,
  isDriveInputActive,
  NEUTRAL_ORBIT,
  orbitOffsetVec3,
  shouldRecenterOrbitForDriveStart,
  wrapOrbitYaw,
} from '../../src/cameras/camera-orbit';

const config = CHASE_ORBIT_CONFIG;
const viewportWidth = 400;

describe('swipe-to-orbit mapping', () => {
  it('follows the grab-the-world convention', () => {
    const right = applyOrbitSwipe(NEUTRAL_ORBIT, 100, 0, viewportWidth, config);
    expect(right.yaw).toBeGreaterThan(0);
    const down = applyOrbitSwipe(NEUTRAL_ORBIT, 0, 100, viewportWidth, config);
    expect(down.pitch).toBeGreaterThan(0);
  });

  it('is a no-op for a still finger', () => {
    expect(applyOrbitSwipe(NEUTRAL_ORBIT, 0, 0, viewportWidth, config)).toEqual(NEUTRAL_ORBIT);
  });

  it('keeps yaw unwrapped across turns while clamping pitch', () => {
    let orbit = NEUTRAL_ORBIT;
    for (let i = 0; i < 50; i += 1) {
      orbit = applyOrbitSwipe(orbit, 100, 100, viewportWidth, config);
    }
    expect(orbit.yaw).toBeCloseTo(25 * Math.PI);
    expect(orbit.pitch).toBeCloseTo(config.maxPitchUpRadians);

    const floored = clampOrbit({ yaw: -9, pitch: -9 }, config);
    expect(floored.yaw).toBe(-9);
    expect(floored.pitch).toBeCloseTo(-config.maxPitchDownRadians);
    expect(wrapOrbitYaw(3 * Math.PI)).toBeCloseTo(-Math.PI);
  });

  it('can see a complete 360-degree surroundings sweep in one viewport width', () => {
    const halfTurn = applyOrbitSwipe(NEUTRAL_ORBIT, viewportWidth / 2, 0, viewportWidth, config);
    expect(Math.abs(halfTurn.yaw)).toBeCloseTo(Math.PI);

    const fullTurn = applyOrbitSwipe(halfTurn, viewportWidth / 2, 0, viewportWidth, config);
    expect(fullTurn.yaw).toBeCloseTo(Math.PI * 2, 8);
  });

  it('uses throttle or reverse/brake as the camera-recenter driving intent', () => {
    expect(isDriveInputActive(0.024, 0, config)).toBe(false);
    expect(isDriveInputActive(config.driveInputThreshold, 0, config)).toBe(true);
    expect(isDriveInputActive(0, config.driveInputThreshold, config)).toBe(true);
  });

  it('recenters only when driving starts, not on every active input frame', () => {
    expect(shouldRecenterOrbitForDriveStart(false, 0.1, 0, config)).toBe(true);
    expect(shouldRecenterOrbitForDriveStart(true, 0.1, 0, config)).toBe(false);
    expect(shouldRecenterOrbitForDriveStart(false, 0, 0, config)).toBe(false);
  });
});

describe('orbiting a chase offset', () => {
  const offset = { x: 0, y: 3.2, z: 10.2 };

  it('keeps the framing distance', () => {
    const orbited = orbitOffsetVec3(offset, { yaw: 1, pitch: 0.3 }, config);
    const before = Math.hypot(offset.x, offset.y, offset.z);
    const after = Math.hypot(orbited.x, orbited.y, orbited.z);
    expect(after).toBeCloseTo(before, 6);
  });

  it('swings the azimuth and raises the elevation', () => {
    const sideways = orbitOffsetVec3(offset, { yaw: Math.PI / 2, pitch: 0 }, config);
    expect(sideways.x).toBeGreaterThan(9);
    expect(Math.abs(sideways.z)).toBeLessThan(0.001);
    const higher = orbitOffsetVec3(offset, { yaw: 0, pitch: 0.4 }, config);
    expect(higher.y).toBeGreaterThan(offset.y);
  });

  it('never orbits into the ground', () => {
    const dug = orbitOffsetVec3(offset, { yaw: 0, pitch: -5 }, config);
    const radius = Math.hypot(offset.x, offset.y, offset.z);
    expect(dug.y / radius).toBeGreaterThanOrEqual(Math.sin(config.minElevationRadians) - 1e-9);
  });

  it('leaves a neutral orbit untouched', () => {
    expect(orbitOffsetVec3(offset, NEUTRAL_ORBIT, config)).toEqual(offset);
  });
});
