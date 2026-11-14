import { afterEach, describe, expect, it } from 'vitest';

import {
  FACADE_DETAIL_OCTAVES,
  createArchitecturalMaterial,
  facadeDetailOctaveAt,
  facadeSurfaceDetail,
  getFacadeMidScale,
  setFacadeMidScale,
  type FacadeDetailOctave,
  type FacadeDetailTerm,
} from '../../src/world/architectural-materials';

/** Wavelength (metres) of one sine term: 2π/|k|. */
function termWavelength(term: FacadeDetailTerm): number {
  const magnitude = Math.hypot(term.kx, term.ky, term.kz);
  expect(magnitude).toBeGreaterThan(0);
  return (2 * Math.PI) / magnitude;
}

/** Mean wavelength of an octave's terms — its characteristic scale. */
function octaveWavelength(octave: FacadeDetailOctave): number {
  const lengths = octave.terms.map(termWavelength);
  return lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
}

/**
 * Structural fingerprint of a TSL graph: node kind + math method + children, with uniform and
 * const VALUES excluded. Two materials with identical fingerprints compile to the same shader
 * shape — i.e. the same GPU program — even when their per-material values differ.
 */
function graphShape(node: unknown, depth = 0): string {
  if (!node || typeof node !== 'object' || depth > 64) return `#${String(node)}`;
  const o = node as Record<string, unknown>;
  if (o.isNode !== true) return `#${String(o)}`;
  const children: string[] = [];
  for (const key of ['node', 'aNode', 'bNode', 'cNode', 'uniform'] as const) {
    const child = o[key];
    if (child && typeof child === 'object' && (child as { isNode?: boolean }).isNode === true) {
      children.push(graphShape(child, depth + 1));
    }
  }
  const method =
    typeof (o as { method?: unknown }).method === 'string' ? (o as { method: string }).method : '';
  return `${o.constructor?.name ?? 'Node'}${method ? `:${method}` : ''}(${children.join('|')})`;
}

afterEach(() => {
  setFacadeMidScale(1);
});

describe('FACADE_DETAIL_OCTAVES (12.4d table)', () => {
  it('has exactly the broad / mid / fine octave spread', () => {
    expect(FACADE_DETAIL_OCTAVES.map((octave) => octave.label)).toEqual(['broad', 'mid', 'fine']);
  });

  it('separates the octaves by at least 2× in wavelength each step', () => {
    const wavelengths = FACADE_DETAIL_OCTAVES.map(octaveWavelength).sort((a, b) => b - a);
    for (let i = 0; i + 1 < wavelengths.length; i += 1) {
      const larger = wavelengths[i]!;
      const smaller = wavelengths[i + 1]!;
      expect(larger / smaller).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps every term off the axis planes (no stripe bands)', () => {
    for (const octave of FACADE_DETAIL_OCTAVES) {
      for (const term of octave.terms) {
        const axes = [term.kx, term.ky, term.kz].filter((k) => k !== 0).length;
        expect(
          axes,
          `term ${JSON.stringify(term)} must mix at least two axes`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('gives the mid octave the 12.4d weights between the two anchors', () => {
    const byLabel = new Map(FACADE_DETAIL_OCTAVES.map((octave) => [octave.label, octave]));
    expect(byLabel.get('broad')?.albedoWeight).toBe(1);
    expect(byLabel.get('mid')?.albedoWeight).toBe(0.4);
    expect(byLabel.get('fine')?.albedoWeight).toBe(0.22);
    expect(byLabel.get('broad')?.roughnessWeight).toBe(0.055);
    expect(byLabel.get('mid')?.roughnessWeight).toBe(0.03);
    expect(byLabel.get('fine')?.roughnessWeight).toBe(0.018);
  });
});

describe('facadeSurfaceDetail (CPU mirror of the TSL graph)', () => {
  const SAMPLES: Array<[number, number, number]> = [
    [0, 0, 0],
    [12.5, 3, -47.2],
    [-88.1, 17.5, 203.9],
    [340.7, 8.2, -12.4],
    [-1200.3, 41.6, 888.1],
    [0.5, 6, 0.5],
    [-17.25, 21, 33],
  ];

  it('is deterministic and bounded for the full amplitude range', () => {
    const maxAlbedoWeight = FACADE_DETAIL_OCTAVES.reduce((sum, octave) => {
      // The mid octave is at most 2× in the device A/B band.
      const scale = octave.label === 'mid' ? 2 : 1;
      return sum + octave.albedoWeight * scale;
    }, 0);
    for (const [x, y, z] of SAMPLES) {
      for (const amplitude of [0.01, 0.025, 0.05]) {
        for (const roughness of [0.06, 0.5, 0.98]) {
          for (const midScale of [0, 1, 2]) {
            const a = facadeSurfaceDetail(x, y, z, roughness, amplitude, midScale);
            const b = facadeSurfaceDetail(x, y, z, roughness, amplitude, midScale);
            expect(a).toEqual(b);
            const bound = amplitude * maxAlbedoWeight;
            expect(a.albedo).toBeGreaterThanOrEqual(1 - bound - 1e-12);
            expect(a.albedo).toBeLessThanOrEqual(1 + bound + 1e-12);
            expect(a.roughness).toBeGreaterThanOrEqual(0.06);
            expect(a.roughness).toBeLessThanOrEqual(0.98);
          }
        }
      }
    }
  });

  it('clamps the roughness at the material envelope extremes', () => {
    // Sweep points until the raw sum provably exceeds the envelope on both sides.
    let sawLow = false;
    let sawHigh = false;
    for (let x = -40; x <= 40 && (!sawLow || !sawHigh); x += 1.7) {
      for (let z = -40; z <= 40; z += 2.3) {
        const detail = facadeSurfaceDetail(x, 2, z, 0, 0.05, 2);
        if (detail.roughness === 0.06) sawLow = true;
        if (detail.roughness === 0.98) sawHigh = true;
        const highRough = facadeSurfaceDetail(x, 2, z, 1, 0.05, 2);
        if (highRough.roughness === 0.98) sawHigh = true;
      }
    }
    expect(sawLow).toBe(true);
    expect(sawHigh).toBe(true);
  });

  it('reaches its full swing on every octave (no dead term)', () => {
    for (const octave of FACADE_DETAIL_OCTAVES) {
      let peak = 0;
      for (let x = -200; x <= 200; x += 1.3) {
        for (let z = -200; z <= 200; z += 1.9) {
          peak = Math.max(peak, Math.abs(facadeDetailOctaveAt(octave, x, 4, z)));
        }
      }
      expect(
        peak,
        `octave ${octave.label} must reach a large fraction of its [−1, 1] range`,
      ).toBeGreaterThan(0.6);
    }
  });

  it('has the mid octave active at its own scale (the 12.4d contribution)', () => {
    // At a point where the mid octave is strong, disabling it must change the result.
    const mid = FACADE_DETAIL_OCTAVES.find((octave) => octave.label === 'mid')!;
    let best: { point: readonly [number, number, number]; value: number } = {
      point: [0, 0, 0],
      value: 0,
    };
    for (let x = -30; x <= 30; x += 0.7) {
      for (let z = -30; z <= 30; z += 1.1) {
        const value = Math.abs(facadeDetailOctaveAt(mid, x, 5, z));
        if (value > best.value) best = { point: [x, 5, z], value };
      }
    }
    expect(best.value).toBeGreaterThan(0.9);
    const [x, y, z] = best.point;
    const withMid = facadeSurfaceDetail(x, y, z, 0.5, 0.03, 1);
    const withoutMid = facadeSurfaceDetail(x, y, z, 0.5, 0.03, 0);
    expect(Math.abs(withMid.albedo - withoutMid.albedo)).toBeGreaterThan(0.001);
    expect(Math.abs(withMid.roughness - withoutMid.roughness)).toBeGreaterThan(1e-4);
  });
});

describe('material construction (program-sharing design)', () => {
  it('keeps one shared graph shape across per-material values', () => {
    const a = createArchitecturalMaterial({
      name: 'warm-plaster',
      colorHex: 0xc9a678,
      roughness: 0.7,
      metalness: 0,
    });
    const b = createArchitecturalMaterial({
      name: 'cool-panel',
      colorHex: 0x8fa3b5,
      roughness: 0.4,
      metalness: 0.1,
      detailAmplitude: 0.03,
    });
    // Different per-material values bind as uniforms; the graph shape itself (and therefore the
    // GPU program) is shared — the 12.4d octave constants are table data, not baked literals.
    expect(a.colorNode).not.toBeNull();
    expect(a.roughnessNode).not.toBeNull();
    expect(graphShape(a.colorNode)).toBe(graphShape(b.colorNode));
    expect(graphShape(a.roughnessNode)).toBe(graphShape(b.roughnessNode));
    // The fingerprint must be non-trivial: a three-octave detail graph carries one sin per
    // argument of each term, and the colour/roughness graphs are different shapes.
    expect((graphShape(a.colorNode).match(/:sin\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(graphShape(a.colorNode)).not.toBe(graphShape(a.roughnessNode));
  });

  it('is deterministic across builds of identical materials', () => {
    const first = createArchitecturalMaterial({
      name: 'x',
      colorHex: 0x111111,
      roughness: 0.5,
      metalness: 0,
    });
    const second = createArchitecturalMaterial({
      name: 'x',
      colorHex: 0x111111,
      roughness: 0.5,
      metalness: 0,
    });
    expect(graphShape(first.colorNode)).toBe(graphShape(second.colorNode));
  });

  it('exposes the 12.4d device A/B seam', () => {
    expect(getFacadeMidScale()).toBe(1);
    setFacadeMidScale(0);
    expect(getFacadeMidScale()).toBe(0);
    setFacadeMidScale(99);
    expect(getFacadeMidScale()).toBe(2);
    setFacadeMidScale(-3);
    expect(getFacadeMidScale()).toBe(0);
  });
});
