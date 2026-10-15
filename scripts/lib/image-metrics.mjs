/**
 * Image metrics for the visual regression harness: SSIM and temporal stability.
 *
 * Pure functions over raw pixel buffers (RGBA or RGB, 8 bits per channel), with no decoder and
 * no DOM, so they run identically in the capture script, in Node tests, and anywhere else a
 * PNG has already been decoded. This is the code that turns "it looks better" and "it shimmers
 * less" into numbers the project can track (`docs/REALISM_PLAN.md` §5):
 *
 * - `ssim(a, b)` — structural similarity against an accepted baseline. It answers "did this
 *   change break the framing, exposure, or colour of a bookmark?" — the regression question.
 * - `temporalStability(frames)` — per-pixel variance across consecutive frames, measured in
 *   flat regions. It answers "how much does a still surface boil?" — the Rank 1 question, and
 *   the only honest validation temporal anti-aliasing can have, since no still frame shows it.
 */

const SSIM_K1 = 0.01;
const SSIM_K2 = 0.03;
const SSIM_RANGE = 255;

/** Extracts the luminance plane of an 8-bit RGB(A) buffer as floats in 0–255. */
export function luminance(data, width, height, channels = 4) {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += channels) {
    out[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }
  return out;
}

/** Separable Gaussian blur with a truncated 11-tap kernel (σ = 1.5), clamped edges. */
function gaussianBlur(plane, width, height) {
  const radius = 5;
  const sigma = 1.5;
  const kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(weight);
    sum += weight;
  }
  for (let i = 0; i < kernel.length; i += 1) {
    kernel[i] /= sum;
  }

  const horizontal = new Float32Array(plane.length);
  const out = new Float32Array(plane.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const cx = Math.min(width - 1, Math.max(0, x + k));
        acc += kernel[k + radius] * plane[y * width + cx];
      }
      horizontal[y * width + x] = acc;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const cy = Math.min(height - 1, Math.max(0, y + k));
        acc += kernel[k + radius] * horizontal[cy * width + x];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

function product(a, b) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] * b[i];
  }
  return out;
}

/**
 * Structural similarity between two same-sized images, in [−1, 1] with 1 = identical.
 *
 * The standard Wang et al. formulation on the luminance plane: means, variances, and covariance
 * under a Gaussian window, combined into the luminance/contrast/structure product. Computed on
 * floats at capture size — a few hundred thousand pixels, well under a second.
 */
export function ssim(a, b, width, height, channels = 4) {
  const lumA = luminance(a, width, height, channels);
  const lumB = luminance(b, width, height, channels);
  const muA = gaussianBlur(lumA, width, height);
  const muB = gaussianBlur(lumB, width, height);
  const muA2 = product(muA, muA);
  const muB2 = product(muB, muB);
  const muAB = product(muA, muB);
  const sigmaA2 = gaussianBlur(product(lumA, lumA), width, height);
  const sigmaB2 = gaussianBlur(product(lumB, lumB), width, height);
  const sigmaAB = gaussianBlur(product(lumA, lumB), width, height);

  const c1 = (SSIM_K1 * SSIM_RANGE) ** 2;
  const c2 = (SSIM_K2 * SSIM_RANGE) ** 2;
  let total = 0;
  for (let i = 0; i < lumA.length; i += 1) {
    const varA = Math.max(0, sigmaA2[i] - muA2[i]);
    const varB = Math.max(0, sigmaB2[i] - muB2[i]);
    const covar = sigmaAB[i] - muAB[i];
    const numerator = (2 * muAB[i] + c1) * (2 * covar + c2);
    const denominator = (muA2[i] + muB2[i] + c1) * (varA + varB + c2);
    total += denominator === 0 ? 1 : numerator / denominator;
  }
  return total / lumA.length;
}

/**
 * Temporal stability of a burst of same-sized frames from a static camera.
 *
 * For each pixel: the mean colour over the burst and the population standard deviation of its
 * luminance over time. The headline number is the mean deviation restricted to *flat* pixels —
 * those whose spatial gradient on the mean frame is small — because shimmer is a crime flat
 * surfaces report and textured ones hide. A perfectly stable renderer scores 0; film grain,
 * AO noise, and unresolved edges all score visibly above it.
 *
 * `flatGradientThreshold` is in luminance units per pixel (0–255 scale): 6 keeps sky, road, and
 * walls while excluding edges, markings, and the reference grid's lines.
 */
export function temporalStability(frames, width, height, channels = 4, flatGradientThreshold = 6) {
  if (frames.length < 2) {
    throw new Error('temporalStability needs at least two frames');
  }
  const pixelCount = width * height;
  const planes = frames.map((frame) => luminance(frame, width, height, channels));

  const mean = new Float32Array(pixelCount);
  for (const plane of planes) {
    for (let i = 0; i < pixelCount; i += 1) {
      mean[i] += plane[i] / planes.length;
    }
  }

  const deviation = new Float32Array(pixelCount);
  for (const plane of planes) {
    for (let i = 0; i < pixelCount; i += 1) {
      const diff = plane[i] - mean[i];
      deviation[i] += diff * diff;
    }
  }
  for (let i = 0; i < pixelCount; i += 1) {
    deviation[i] = Math.sqrt(deviation[i] / planes.length);
  }

  let flatSum = 0;
  let flatCount = 0;
  let overallSum = 0;
  const flatValues = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      overallSum += deviation[i];
      const right = mean[y * width + Math.min(width - 1, x + 1)];
      const down = mean[Math.min(height - 1, y + 1) * width + x];
      const gradient = Math.max(Math.abs(right - mean[i]), Math.abs(down - mean[i]));
      if (gradient <= flatGradientThreshold) {
        flatSum += deviation[i];
        flatCount += 1;
        flatValues.push(deviation[i]);
      }
    }
  }
  flatValues.sort((a, b) => a - b);
  const p95 = flatValues.length === 0 ? 0 : flatValues[Math.floor(flatValues.length * 0.95)];

  return {
    /** Mean per-pixel temporal σ (0–255) over flat pixels. The Rank 1 number. */
    flatMeanStd: flatCount === 0 ? 0 : flatSum / flatCount,
    /** 95th percentile flat-pixel σ: where the worst shimmer lives. */
    flatP95Std: p95,
    /** Mean σ over all pixels, edges included. */
    overallMeanStd: overallSum / pixelCount,
    /** Share of the frame classified flat; guards against a vacuous measurement. */
    flatFraction: flatCount / pixelCount,
    frames: frames.length,
  };
}

/** Mean absolute per-channel difference between two images, in code values (0–255). */
export function meanAbsoluteDifference(a, b, channels = 4) {
  const pixels = Math.min(a.length, b.length) / channels;
  let total = 0;
  for (let p = 0; p < pixels; p += 1) {
    for (let c = 0; c < 3; c += 1) {
      total += Math.abs(a[p * channels + c] - b[p * channels + c]);
    }
  }
  return total / (pixels * 3);
}
