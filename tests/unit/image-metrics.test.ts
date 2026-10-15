import { describe, expect, it } from 'vitest';
import {
  luminance,
  meanAbsoluteDifference,
  ssim,
  temporalStability,
} from '../../scripts/lib/image-metrics.mjs';

/**
 * The harness's metrics, tested on synthetic images where the right answer is known exactly.
 * A metric that cannot reproduce 1.0 for identical images or ~10 for a ±10 flicker would make
 * every conclusion drawn from it worthless, so the metric itself is the thing under test.
 */

const WIDTH = 32;
const HEIGHT = 24;

/** Flat RGBA image of one grey value. */
function flat(value: number, width = WIDTH, height = HEIGHT): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    data[p * 4] = value;
    data[p * 4 + 1] = value;
    data[p * 4 + 2] = value;
    data[p * 4 + 3] = 255;
  }
  return data;
}

/** Left half dark, right half bright: a hard vertical edge for the gradient mask to exclude. */
function halfAndHalf(): Uint8Array {
  const data = flat(40);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = WIDTH / 2; x < WIDTH; x += 1) {
      const p = (y * WIDTH + x) * 4;
      data[p] = 180;
      data[p + 1] = 180;
      data[p + 2] = 180;
    }
  }
  return data;
}

describe('ssim', () => {
  it('scores identical images exactly 1', () => {
    expect(ssim(halfAndHalf(), halfAndHalf(), WIDTH, HEIGHT)).toBeCloseTo(1, 6);
    expect(ssim(flat(128), flat(128), WIDTH, HEIGHT)).toBeCloseTo(1, 6);
  });

  it('punishes a brightness shift less than a structural break', () => {
    const base = halfAndHalf();
    const brighter = base.map((value, index) => (index % 4 === 3 ? value : value + 12));
    // Same edge, moved: destroy the structure by flipping the image horizontally.
    const flipped = new Uint8Array(base.length);
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const from = (y * WIDTH + x) * 4;
        const to = (y * WIDTH + (WIDTH - 1 - x)) * 4;
        for (let c = 0; c < 4; c += 1) {
          flipped[to + c] = base[from + c] as number;
        }
      }
    }
    const shiftScore = ssim(base, brighter, WIDTH, HEIGHT);
    const breakScore = ssim(base, flipped, WIDTH, HEIGHT);
    expect(shiftScore).toBeGreaterThan(0.9);
    expect(shiftScore).toBeLessThan(1);
    expect(breakScore).toBeLessThan(shiftScore);
  });
});

describe('temporal stability', () => {
  it('scores a frozen burst exactly 0', () => {
    const frames = Array.from({ length: 6 }, () => halfAndHalf());
    const report = temporalStability(frames, WIDTH, HEIGHT);
    expect(report.flatMeanStd).toBe(0);
    expect(report.overallMeanStd).toBe(0);
    expect(report.frames).toBe(6);
  });

  it('measures an alternating flicker at its known amplitude', () => {
    // Alternating 118/138 has a population σ of exactly 10 everywhere.
    const frames = Array.from({ length: 8 }, (_, i) => flat(i % 2 === 0 ? 118 : 138));
    const report = temporalStability(frames, WIDTH, HEIGHT);
    expect(report.flatMeanStd).toBeCloseTo(10, 5);
    expect(report.flatFraction).toBeCloseTo(1, 6);
  });

  it('excludes edges from the flat measurement', () => {
    // Flicker only on the bright half, hard edge between the halves.
    const frames = Array.from({ length: 8 }, (_, i) => {
      const image = halfAndHalf();
      if (i % 2 === 1) {
        for (let p = 0; p < WIDTH * HEIGHT; p += 1) {
          if ((image[p * 4] as number) > 100) {
            image[p * 4] = 200;
            image[p * 4 + 1] = 200;
            image[p * 4 + 2] = 200;
          }
        }
      }
      return image;
    });
    const report = temporalStability(frames, WIDTH, HEIGHT);
    // Half the frame flickers at σ=10, so the overall mean is ~5, while flat pixels exist on
    // both sides — the flat figure blends both halves and stays in that range.
    expect(report.overallMeanStd).toBeCloseTo(5, 0);
    expect(report.flatFraction).toBeGreaterThan(0.8);
    expect(report.flatFraction).toBeLessThan(1);
  });

  it('refuses a single frame', () => {
    expect(() => temporalStability([flat(1)], WIDTH, HEIGHT)).toThrow();
  });
});

describe('supporting measures', () => {
  it('computes luminance and mean difference exactly', () => {
    expect(luminance(flat(255), WIDTH, HEIGHT)[0]).toBeCloseTo(255, 4);
    expect(meanAbsoluteDifference(flat(100), flat(112))).toBeCloseTo(12, 6);
    expect(meanAbsoluteDifference(flat(100), flat(100))).toBe(0);
  });
});
