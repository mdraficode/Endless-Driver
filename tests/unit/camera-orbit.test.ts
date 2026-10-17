import { describe, expect, it } from 'vitest';
import {
  applyOrbitSwipe,
  CHASE_ORBIT_CONFIG,
  clampOrbit,
  NEUTRAL_ORBIT,
  orbitOffsetVec3,
} from '../../src/cameras/camera-orbit';

const config = CHASE_ORBIT_CONFIG;

describe('swipe-to-orbit mapping', () => {
  it('follows the grab-the-world convention', () => {
    const right = applyOrbitSwipe(NEUTRAL_ORBIT, 100, 0, config);
    expect(right.yaw).toBeGreaterThan(0);
    const down = applyOrbitSwipe(NEUTRAL_ORBIT, 0, 100, config);
    expect(down.pitch).toBeGreaterThan(0);
  });

  it('is a no-op for a still finger', () => {
    expect(applyOrbitSwipe(NEUTRAL_ORBIT, 0, 0, config)).toEqual(NEUTRAL_ORBIT);
  });

  it('accumulates swipes and clamps at the configured box', () => {
    let orbit = NEUTRAL_ORBIT;
    for (let i = 0; i < 50; i += 1) {
      orbit = applyOrbitSwipe(orbit, 100, 100, config);
    }
    expect(orbit.yaw).toBeCloseTo(config.maxYawRadians);
    expect(orbit.pitch).toBeCloseTo(config.maxPitchUpRadians);
    const floored = clampOrbit({ yaw: -9, pitch: -9 }, config);
    expect(floored.yaw).toBeCloseTo(-config.maxYawRadians);
    expect(floored.pitch).toBeCloseTo(-config.maxPitchDownRadians);
  });

  it('gives a phone-width swipe a broadside view', () => {
    // ~220 px of thumb travel must reach most of the way to the yaw limit, or the
    // gesture feels dead (owner request 2026-10-17).
    const swipe = applyOrbitSwipe(NEUTRAL_ORBIT, 220, 0, config);
    expect(swipe.yaw).toBeGreaterThan(config.maxYawRadians * 0.9);
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
