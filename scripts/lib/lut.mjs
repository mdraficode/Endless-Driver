/**
 * The look the project's LUT bakes, and the 3D LUT that holds it.
 *
 * A LUT is not a more compact way of writing a colour multiply — the existing grade *is* that, and it
 * is already a uniform. A LUT is what a grade becomes when the transform stops being linear: split
 * toning, saturation that depends on how bright a pixel is, a contrast curve — operations that couple
 * the channels and cannot be expressed as `rgb * tint`. Baking them into a table is how every camera
 * and every finishing suite carries a look, and it is the one artefact a colourist could replace
 * without touching a line of this code.
 *
 * The table is generated rather than downloaded. Nothing here needs to be bought, and a look authored
 * from a documented formula can be re-derived, reviewed in a diff, and argued with — which is not true
 * of an opaque binary someone else made.
 */

/**
 * Authored strength of the look, before the runtime trim.
 *
 * Every term here is deliberately small. The scene is already tone mapped by ACES and graded by the
 * time of day; this sits on top of both, and a look that announces itself on top of a tone curve is a
 * look that fights the lighting instead of describing it. The intended reading is "shot on a
 * particular stock", not "a filter was applied".
 */
export const LOOK = {
  /**
   * How far the contrast curve moves each channel towards a smoothstep.
   *
   * `smoothstep(x) = 3x² − 2x³` is an S-curve that is flat at both ends: it steepens the midtones
   * without touching black, white, or the highlight roll-off the tone map just produced. Mixing
   * *towards* it rather than multiplying by a contrast factor is what keeps the endpoints exactly
   * fixed — a LUT that lifts black is a LUT that ruins every night scene.
   */
  contrast: 0.2,
  /** Saturation added in the midtones, weighted by `4·l·(1−l)` so darks and whites are untouched. */
  midSaturation: 0.1,
  /** Saturation removed from the brightest pixels, as film does as it approaches white. */
  highlightDesaturation: 0.12,
  /** Warm highlight tint, scaled by `smoothstep(0.5,1,l)·(1−l)`: zero below mid, zero at white. */
  highlightTint: [0.018, 0.006, -0.02],
  /** Cool shadow tint, scaled by `(1−smoothstep(0,0.5,l))·l`: zero at black, zero above mid. */
  shadowTint: [-0.01, 0.004, 0.016],
  /** A green lift in the midtones, the one bias that reads as Japanese stock rather than as a filter. */
  midGreen: 0.005,
};

const LUMA = [0.2126, 0.7152, 0.0722];

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * The look, as a pure function of one display-referred colour.
 *
 * Input and output are both in the 0–1 range the post chain is in when the LUT is applied: after tone
 * mapping and the sRGB transfer, which is the only place a 3D LUT may be sampled — the node reads
 * `rgb` directly as texture coordinates, so a HDR value would sample outside the table and clamp.
 *
 * Endpoints are preserved by construction, term by term: each tint is weighted by a factor that
 * vanishes at black and at white, the contrast curve fixes both ends, and saturation scales the
 * distance from grey, which is already zero at both. `black maps to black, white to white` is
 * asserted in the tests, and it is the property that lets this run over a night scene.
 */
export function applyLook(rgb) {
  const curved = rgb.map((channel) => {
    const s = channel * channel * (3 - 2 * channel);
    return channel + (s - channel) * LOOK.contrast;
  });

  const l = curved[0] * LUMA[0] + curved[1] * LUMA[1] + curved[2] * LUMA[2];
  const mid = 4 * l * (1 - l);

  let saturation = 1 + LOOK.midSaturation * mid;
  saturation *= 1 - LOOK.highlightDesaturation * smoothstep(0.75, 1, l);

  const highlightWeight = smoothstep(0.5, 1, l) * (1 - l);
  const shadowWeight = (1 - smoothstep(0, 0.5, l)) * l;

  return curved.map((channel, index) => {
    let value = l + (channel - l) * saturation;
    value += LOOK.highlightTint[index] * highlightWeight;
    value += LOOK.shadowTint[index] * shadowWeight;
    if (index === 1) {
      value += LOOK.midGreen * mid;
    }
    return clamp01(value);
  });
}

/**
 * The value at one lattice point of a 3D LUT of the given size, quantised the way the runtime stores
 * it: 8 bits per channel, which is what a `.cube` file holds and what the GPU texture holds.
 *
 * Quantisation happens *here*, at generation, rather than being measured against a float ideal. The
 * table ships as bytes, so the only error worth bounding is the difference between what the hardware
 * reconstructs between lattice points and what a byte-exact evaluation would have produced.
 */
export function lutEntry(size, r, g, b) {
  const [red, green, blue] = applyLook([r / (size - 1), g / (size - 1), b / (size - 1)]);
  return [Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)];
}

/** The whole table, in `.cube` order: red varies fastest, then green, then blue. */
export function generateLutData(size) {
  const data = new Uint8Array(size * size * size * 3);
  let offset = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const [red, green, blue] = lutEntry(size, r, g, b);
        data[offset] = red;
        data[offset + 1] = green;
        data[offset + 2] = blue;
        offset += 3;
      }
    }
  }
  return data;
}

/**
 * Samples a generated table the way the GPU does: trilinearly between the eight nearest entries.
 *
 * This exists so the size of the table can be *chosen by measurement* rather than by folklore. "Use
 * 33³ because that is what everyone uses" is a rule of thumb about transforms with sharp, hue-specific
 * behaviour; this look is smooth, and the only way to know how coarse a lattice it tolerates is to
 * reconstruct with one and compare against the exact transform at full precision.
 */
export function sampleLut(data, size, rgb) {
  const scaled = rgb.map((channel) => clamp01(channel) * (size - 1));
  const low = scaled.map((value) => Math.min(size - 2, Math.floor(value)));
  const frac = scaled.map((value, index) => value - low[index]);

  const read = (r, g, b) => {
    const offset = (b * size * size + g * size + r) * 3;
    return [data[offset], data[offset + 1], data[offset + 2]];
  };

  const out = [0, 0, 0];
  for (let corner = 0; corner < 8; corner += 1) {
    const r = low[0] + (corner & 1);
    const g = low[1] + ((corner >> 1) & 1);
    const b = low[2] + ((corner >> 2) & 1);
    const weight =
      (corner & 1 ? frac[0] : 1 - frac[0]) *
      (corner & 2 ? frac[1] : 1 - frac[1]) *
      (corner & 4 ? frac[2] : 1 - frac[2]);
    const entry = read(r, g, b);
    out[0] += entry[0] * weight;
    out[1] += entry[1] * weight;
    out[2] += entry[2] * weight;
  }
  return out;
}

/**
 * Worst-case reconstruction error of a table of this size, in 8-bit codes, over a dense grid.
 *
 * The comparison is against `lutEntry`'s own 8-bit quantisation of the exact transform, not against
 * the exact transform in floating point: the table is bytes, so byte quantisation is not error — it
 * is the format. Only the error the *lattice* adds is attributed to the size.
 */
export function measureLutError(size, steps = 17, maxChroma = Infinity) {
  const data = generateLutData(size);
  let worst = 0;
  let total = 0;
  let samples = 0;
  for (let b = 0; b < steps; b += 1) {
    for (let g = 0; g < steps; g += 1) {
      for (let r = 0; r < steps; r += 1) {
        // Offset by a third of a step so the samples land between lattice points, not on them: a grid
        // that hits the lattice exactly would report an error of zero for every size.
        const rgb = [r, g, b].map((value, index) => clamp01((value + 0.37 + index * 0.11) / steps));
        // The chroma filter is what makes the number meaningful. A lattice is coarse in proportion to
        // how far apart its points are in the dimension being interpolated, and this look's steepest
        // behaviour is in saturated corners of the cube — where the eye resolves least. Restricting
        // the measurement to near-neutral colours measures the case where a lattice would be *seen*.
        if (Math.max(...rgb) - Math.min(...rgb) > maxChroma) {
          continue;
        }
        const reconstructed = sampleLut(data, size, rgb);
        const exact = applyLook(rgb).map((channel) => Math.round(channel * 255));
        for (let channel = 0; channel < 3; channel += 1) {
          const delta = Math.abs(reconstructed[channel] - exact[channel]);
          worst = Math.max(worst, delta);
          total += delta;
          samples += 1;
        }
      }
    }
  }
  return { worstError: worst, meanError: samples === 0 ? 0 : total / samples };
}

/**
 * Serialises a table as a `.cube` file, the format `LUTCubeLoader` reads.
 *
 * The values written are **bin centres**, `(code + 0.5) / 255`, not `code / 255`.
 *
 * That is not decoration. `LUTCubeLoader` scales each data point by 255 and stores it with
 * `data[i] = value * 255` into a `Uint8Array`, and an assignment to a typed array *truncates*. So a
 * point written as `code / 255` comes back as `code - 1` whenever the loader reads the decimal back a
 * hair low — which it does for six thousand of the fifteen thousand entries in this table, at four,
 * five, six, and eight decimal places alike. Writing the middle of each bin instead leaves half a
 * code of headroom in both directions, so truncation recovers the intended byte exactly: the value
 * that ships is the value that was authored. `tests/unit/lut.test.ts` parses the committed file with
 * three's own loader and asserts that.
 *
 * Four decimal places are enough for that with bin centres, and the test proves it rather than
 * assuming it: the worst downward rounding error, `5e-5 × 255`, is `0.013` of a code against the
 * `0.5` of headroom the offset provides.
 */
export function serialiseCube(size, data, title, decimals = 4) {
  const lines = [
    `TITLE "${title}"`,
    '',
    '# Generated by scripts/build-lut.mjs — do not edit by hand.',
    '# Values are bin centres: v = (code + 0.5) / 255, which is what recovers `code` exactly.',
    '# three scales every data point by 255 and truncates into a Uint8Array; bin centres survive',
    '# that, and code/255 does not.',
    '',
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    '',
  ];
  const scale = 10 ** decimals;
  let offset = 0;
  for (let index = 0; index < size ** 3; index += 1) {
    const format = (code) => (Math.round(((code + 0.5) / 255) * scale) / scale).toFixed(decimals);
    lines.push(`${format(data[offset])} ${format(data[offset + 1])} ${format(data[offset + 2])}`);
    offset += 3;
  }
  return `${lines.join('\n')}\n`;
}

/**
 * A neutral 3D LUT of the given size: every entry maps to itself.
 *
 * This is what the renderer starts with. The look arrives from the network, and a chain that had no
 * table until it did would have to either render ungraded and pop, or refuse to render at all. An
 * identity table costs 19 KB of GPU memory at 17³ and makes "no look yet" indistinguishable from
 * "no look wanted" — which is also exactly what should happen when the file cannot be fetched at all.
 */
export function identityLutData(size) {
  const data = new Uint8Array(size * size * size * 3);
  let offset = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        data[offset] = Math.round((r / (size - 1)) * 255);
        data[offset + 1] = Math.round((g / (size - 1)) * 255);
        data[offset + 2] = Math.round((b / (size - 1)) * 255);
        offset += 3;
      }
    }
  }
  return data;
}
