import { describe, expect, it } from 'vitest';
import {
  addScaledVec3,
  addVec3,
  conjugateQuat,
  copyVec3,
  crossVec3,
  dotVec3,
  identityQuat,
  lengthVec3,
  lerpQuat,
  lerpVec3,
  multiplyQuat,
  normalizeQuat,
  normalizeVec3,
  quatFromYaw,
  rotateVec3ByQuat,
  scaleVec3,
  setVec3,
  smoothingFactor,
  subtractVec3,
  vec3,
  yawFromQuat,
} from '../../src/shared/vector';

const near = (value: number, target: number, tolerance = 1e-9): boolean =>
  Math.abs(value - target) <= tolerance;

describe('shared/vector', () => {
  it('creates and copies vectors without aliasing', () => {
    const original = vec3(1, 2, 3);
    const copy = { ...original };
    setVec3(copy, 4, 5, 6);
    expect(original).toEqual({ x: 1, y: 2, z: 3 });
    copyVec3(copy, original);
    expect(copy).toEqual(original);
  });

  it('does arithmetic in place through the out parameter', () => {
    const out = vec3();
    addVec3(out, vec3(1, 2, 3), vec3(4, 5, 6));
    expect(out).toEqual({ x: 5, y: 7, z: 9 });
    subtractVec3(out, out, vec3(1, 1, 1));
    expect(out).toEqual({ x: 4, y: 6, z: 8 });
    scaleVec3(out, out, 0.5);
    expect(out).toEqual({ x: 2, y: 3, z: 4 });
    addScaledVec3(out, out, vec3(1, 0, 0), -2);
    expect(out).toEqual({ x: 0, y: 3, z: 4 });
  });

  it('computes dot, cross, and length correctly', () => {
    expect(dotVec3(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(12);
    expect(crossVec3(vec3(), vec3(1, 0, 0), vec3(0, 1, 0))).toEqual({ x: 0, y: 0, z: 1 });
    expect(near(lengthVec3(vec3(3, 4, 0)), 5)).toBe(true);
  });

  it('normalizes safely, including the zero vector', () => {
    const out = normalizeVec3(vec3(), vec3(0, 0, -7));
    expect(out).toEqual({ x: 0, y: 0, z: -1 });
    expect(normalizeVec3(vec3(), vec3(0, 0, 0))).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('lerps vectors and takes the shortest arc for rotations', () => {
    const out = lerpVec3(vec3(), vec3(0, 0, 0), vec3(10, 20, -30), 0.25);
    expect(out).toEqual({ x: 2.5, y: 5, z: -7.5 });

    // 350 degrees of yaw is 10 degrees the short way round.
    const a = quatFromYaw(0);
    const b = quatFromYaw((350 * Math.PI) / 180);
    const middle = lerpQuat(identityQuat(), a, b, 0.5);
    const yaw = yawFromQuat(middle);
    expect(Math.abs(yaw)).toBeLessThan(0.2);
  });

  it('rotates vectors by quaternions consistently with yaw', () => {
    const rotated = rotateVec3ByQuat(vec3(), vec3(0, 0, -1), quatFromYaw(Math.PI / 2));
    // A quarter turn about +Y takes forward (-Z) to -X.
    expect(near(rotated.x, -1, 1e-9)).toBe(true);
    expect(near(rotated.z, 0, 1e-9)).toBe(true);
  });

  it('multiplies and conjugates quaternions', () => {
    const composed = multiplyQuat(identityQuat(), quatFromYaw(0.5), quatFromYaw(0.5));
    expect(near(yawFromQuat(composed), 1, 1e-9)).toBe(true);

    const inverse = conjugateQuat(identityQuat(), quatFromYaw(0.5));
    const roundTrip = multiplyQuat(identityQuat(), inverse, quatFromYaw(0.5));
    expect(near(Math.abs(roundTrip.w), 1, 1e-9)).toBe(true);
  });

  it('normalizes degenerate quaternions to identity', () => {
    const out = normalizeQuat(identityQuat(), { x: 0, y: 0, z: 0, w: 0 });
    expect(out).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('keeps smoothing frame-rate independent', () => {
    // One 20 ms step must match two 10 ms steps: this is what makes handling identical at 30, 60,
    // and 144 Hz.
    const constant = 0.15;
    const singleStep = smoothingFactor(0.02, constant);
    const firstHalf = smoothingFactor(0.01, constant);
    const twoSteps = firstHalf + (1 - firstHalf) * firstHalf;
    expect(near(singleStep, twoSteps, 1e-12)).toBe(true);

    expect(smoothingFactor(0.1, 0)).toBe(1);
    expect(smoothingFactor(0, 0.1)).toBe(0);
    expect(smoothingFactor(-1, 0.1)).toBe(0);
  });

  it('returns the out parameter so callers can chain', () => {
    const out = vec3();
    expect(setVec3(out, 1, 2, 3)).toBe(out);
    expect(copyVec3(out, vec3(9, 9, 9))).toBe(out);
    expect(scaleVec3(out, out, 0)).toBe(out);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
  });
});
