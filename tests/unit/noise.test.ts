import { describe, expect, it } from 'vitest';
import {
  openSimplex2S2D,
  openSimplex2S2DValue,
  os2sHash2D,
  terrainOctave,
  terrainOctaveGrad,
  OS2S_TERRAIN_SCALE,
} from '../../src/world/noise';

// 64-bit reference of the lattice hash (the Java semantics in BigInt):
// h = (seed ^ xsvp ^ ysvp) * M; h ^= h >> 58 (arithmetic); pair = bits 1..7.
const PX = 0x5205402b9270c86fn;
const PY = 0x598cd327003817b5n;
const M = 0x53a3f72deec546f5n;
const F64 = 0xffffffffffffffffn;

function hashRef(seed: number, xsb: number, ysb: number): number {
  let h =
    ((BigInt(seed) & 0xffffffffn) ^ ((BigInt(xsb) * PX) & F64) ^ ((BigInt(ysb) * PY) & F64)) & F64;
  h = (h * M) & F64;
  if (h > 2n ** 63n - 1n) {
    h -= 0x10000000000000000n; // sign-extend: `>>` on a negative BigInt is arithmetic
  }
  h = h ^ (h >> 58n);
  const hLo = Number(h & 0xffffffffn);
  return ((hLo >>> 0) >> 1) & 127;
}

describe('os2sHash2D (64-bit hash emulation)', () => {
  it('matches the BigInt reference across a wide seed/lattice range', () => {
    let rng = 987654321;
    const rand = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    let checked = 0;
    for (let i = 0; i < 500; i += 1) {
      const seed = Math.floor(rand() * 2 ** 20);
      for (let k = 0; k < 10; k += 1) {
        const xsb = Math.floor(rand() * 40000 - 20000);
        const ysb = Math.floor(rand() * 40000 - 20000);
        expect(os2sHash2D(seed, xsb, ysb)).toBe(hashRef(seed, xsb, ysb));
        checked += 1;
      }
    }
    expect(checked).toBe(5000);
  });

  it('is deterministic and bounded', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = os2sHash2D(12345, i * 7 - 31, 100 - i * 3);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(127);
      expect(p).toBe(os2sHash2D(12345, i * 7 - 31, 100 - i * 3));
    }
  });
});

describe('openSimplex2S2D', () => {
  it('value-only pass is identical to the gradient pass value', () => {
    let rng = 24681357;
    const rand = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    for (let i = 0; i < 300; i += 1) {
      const seed = Math.floor(rand() * 100000);
      const x = (rand() * 2 - 1) * 300;
      const y = (rand() * 2 - 1) * 300;
      expect(openSimplex2S2DValue(seed, x, y)).toBeCloseTo(openSimplex2S2D(seed, x, y).value, 12);
    }
  });

  it('stays in range and is continuous (no lattice jumps)', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 4000; i += 1) {
      const v = openSimplex2S2DValue(777, i * 0.37, i * 0.211 - 50);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThan(-1.2);
    expect(max).toBeLessThan(1.2);
    // Fine sweep: a 1e-8 step must change the value by at most a modest slope.
    let worst = 0;
    for (let x = -50; x <= 50; x += 0.01) {
      const a = openSimplex2S2DValue(4242, x, 13.7);
      const b = openSimplex2S2DValue(4242, x + 1e-8, 13.7);
      worst = Math.max(worst, Math.abs(b - a) / 1e-8);
    }
    expect(worst).toBeLessThan(50); // |slope| < 50 — a jump would be ~1e8
  });

  it('gradient matches central differences', () => {
    let worst = 0;
    for (let i = 0; i < 300; i += 1) {
      const seed = (i * 7919) % 99991;
      const x = ((i * 137) % 600) - 300 + 0.17;
      const y = ((i * 251) % 600) - 300 + 0.31;
      const s = openSimplex2S2D(seed, x, y);
      const e = 1e-4;
      const fdx =
        (openSimplex2S2DValue(seed, x + e, y) - openSimplex2S2DValue(seed, x - e, y)) / (2 * e);
      const fdy =
        (openSimplex2S2DValue(seed, x, y + e) - openSimplex2S2DValue(seed, x, y - e)) / (2 * e);
      const relX = Math.abs(s.gradX - fdx) / Math.max(1e-6, Math.abs(fdx));
      const relY = Math.abs(s.gradY - fdy) / Math.max(1e-6, Math.abs(fdy));
      worst = Math.max(worst, relX, relY);
    }
    expect(worst).toBeLessThan(1e-4);
  });
});

describe('terrain octave (calibrated drop-in for valueNoise)', () => {
  it('is deterministic and in-band', () => {
    const a = terrainOctave(123.4, -567.8, 10, 4242);
    expect(a).toBe(terrainOctave(123.4, -567.8, 10, 4242));
    expect(Math.abs(a)).toBeLessThan(2);
    // Gradient pass agrees with the value path and with central differences.
    const g = terrainOctaveGrad(123.4, -567.8, 10, 4242);
    expect(g.value).toBeCloseTo(a, 12);
    const e = 1e-3;
    const fdx =
      (terrainOctave(123.4 + e, -567.8, 10, 4242) - terrainOctave(123.4 - e, -567.8, 10, 4242)) /
      (2 * e);
    const fdz =
      (terrainOctave(123.4, -567.8 + e, 10, 4242) - terrainOctave(123.4, -567.8 - e, 10, 4242)) /
      (2 * e);
    expect(Math.abs(g.gradX - fdx)).toBeLessThan(2e-4);
    expect(Math.abs(g.gradZ - fdz)).toBeLessThan(2e-4);
    expect(OS2S_TERRAIN_SCALE).toBeGreaterThan(0);
  });
});
