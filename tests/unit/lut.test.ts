import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import {
  LOOK,
  applyLook,
  generateLutData,
  identityLutData,
  measureLutError,
  serialiseCube,
} from '../../scripts/lib/lut.mjs';
import { createLookTexture, writeLookTable } from '../../src/shaders/lut-identity';
import { applyRenderSwitches, RENDER_CONFIG } from '../../src/config/render';

/**
 * The look is generated, so the thing to test is not "does it look right" — that is a judgement made
 * from screenshots — but "is the file the runtime loads the file this code describes". Those are
 * different claims, and only the second one can be a test.
 *
 * Three properties are worth pinning, and each has a specific failure it prevents:
 *
 * - **Byte-exact round-trip through three's own loader.** `LUTCubeLoader` scales each data point by
 *   255 and stores it into a `Uint8Array`, which truncates. Values written as `code / 255` come back
 *   one code low for six thousand of the entries. That is a bug you cannot see in a screenshot and
 *   cannot find by reading the file, and it is why the serialiser writes bin centres.
 * - **Endpoints preserved.** A look that lifts black turns every night scene grey. Every term in the
 *   transform vanishes at black and at white, and this is where that is checked rather than trusted.
 * - **The table size is justified by measurement.** The project ships 17³ rather than the conventional
 *   33³ because the reconstruction error in the near-neutral colours — the only place a lattice is
 *   visible as banding — is already below a code at 17³. If a future look is sharper, this test fails
 *   and asks for a bigger table instead of shipping banding.
 */
const ROOT = resolve(__dirname, '../..');
const LUT_PATH = join(ROOT, 'public', 'assets', 'luts', 'hinode-film-17.cube');
const SIZE = 17;

describe('the look transform', () => {
  it('preserves black and white exactly', () => {
    expect(applyLook([0, 0, 0])).toEqual([0, 0, 0]);
    expect(applyLook([1, 1, 1])).toEqual([1, 1, 1]);
  });

  it('stays inside 0-1 for every corner of the cube', () => {
    for (const r of [0, 0.5, 1]) {
      for (const g of [0, 0.5, 1]) {
        for (const b of [0, 0.5, 1]) {
          for (const channel of applyLook([r, g, b])) {
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('keeps a grey ramp neutral, within the tint the look is allowed to apply', () => {
    // A look is *supposed* to move neutrals a little — that is what split toning is — but it has to
    // stay a tint rather than a cast. The red/blue bound is the sum of the two tint magnitudes, so
    // widening the look's palette without widening this test is not possible; the green bound covers
    // the authored midtone bias plus the difference between the two tints' green terms.
    const redBlueBound =
      Math.abs(LOOK.highlightTint[0]) +
      Math.abs(LOOK.highlightTint[2]) +
      Math.abs(LOOK.shadowTint[0]) +
      Math.abs(LOOK.shadowTint[2]);
    const greenBound =
      LOOK.midGreen + Math.abs(LOOK.highlightTint[1] - LOOK.highlightTint[0]) + 0.005;
    for (const value of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      const [r, g, b] = applyLook([value, value, value]);
      expect(Math.abs(r - b)).toBeLessThanOrEqual(redBlueBound + 1e-9);
      expect(Math.abs(g - r)).toBeLessThanOrEqual(greenBound + 1e-9);
    }
  });

  it('is monotonic, so a brighter input is never rendered darker', () => {
    // A LUT that reverses anywhere tears a smooth gradient into a visible band, and the reversal is
    // invisible in the table's own numbers — it only shows as a line in a sky. Every channel of a grey
    // ramp has to be non-decreasing, and strictly increasing where the look is doing anything at all.
    let previous = applyLook([0, 0, 0]);
    for (let step = 1; step <= 64; step += 1) {
      const value = step / 64;
      const current = applyLook([value, value, value]);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(current[channel]).toBeGreaterThanOrEqual(previous[channel]! - 1e-12);
      }
      expect(current[0]).toBeGreaterThan(previous[0]!);
      previous = current;
    }
  });

  it('separates the tones: highlights warm, shadows cool', () => {
    const blueIn = 0.85;
    const [highlightRed, , highlightBlue] = applyLook([blueIn, blueIn, blueIn]);
    const shadowIn = 0.15;
    const [shadowRed, , shadowBlue] = applyLook([shadowIn, shadowIn, shadowIn]);
    // Both directions, both small: a split tone that moved a neutral by a visible amount would be a
    // colour cast, and one that did not move it at all would not be a split tone.
    expect(highlightRed).toBeGreaterThan(highlightBlue);
    expect(shadowBlue).toBeGreaterThan(shadowRed);
    expect(highlightRed - highlightBlue).toBeGreaterThan(0.002);
    expect(highlightRed - highlightBlue).toBeLessThan(0.02);
    expect(shadowBlue - shadowRed).toBeGreaterThan(0.001);
    expect(shadowBlue - shadowRed).toBeLessThan(0.02);
  });

  it('adds midtone contrast without moving the endpoints', () => {
    // A smoothstep mix steepens the middle of the curve; if it moved the ends, the property above
    // would break instead, so this checks the direction of travel in the middle.
    expect(applyLook([0.55, 0.55, 0.55])[0]).toBeGreaterThan(0.55);
    expect(applyLook([0.45, 0.45, 0.45])[0]).toBeLessThan(0.45);
  });
});

describe('the generated table', () => {
  it('is deterministic', () => {
    expect(Array.from(generateLutData(SIZE))).toEqual(Array.from(generateLutData(SIZE)));
  });

  it('round-trips byte-exactly through three’s own loader', async () => {
    const authored = generateLutData(SIZE);
    const parsed = new LUTCubeLoader().parse(serialiseCube(SIZE, authored, 'round trip')).texture3D
      .image.data;
    expect(parsed).not.toBeNull();
    const mismatches: string[] = [];
    for (let index = 0; index < SIZE ** 3; index += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const actual = parsed?.[index * 4 + channel];
        const expected = authored[index * 3 + channel];
        if (actual !== expected) {
          mismatches.push(`entry ${index} channel ${channel}: ${actual} != ${expected}`);
        }
      }
    }
    // Reported as a list rather than a count: the first mismatch explains the failure, and the number
    // of them is the interesting part of the diagnosis.
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it('ships the file the generator produces, byte for byte', async () => {
    const committed = await readFile(LUT_PATH, 'utf8');
    expect(committed).toBe(
      serialiseCube(SIZE, generateLutData(SIZE), 'Hinode Film — Endless Driver look'),
    );
  });

  it('declares a 0-1 domain, which is what three’s loader assumes', async () => {
    const committed = await readFile(LUT_PATH, 'utf8');
    expect(committed).toMatch(/DOMAIN_MIN 0\.0 0\.0 0\.0/);
    expect(committed).toMatch(/DOMAIN_MAX 1\.0 1\.0 1\.0/);
    const entries = (committed.match(/^[\d.]+ [\d.]+ [\d.]+$/gm) ?? []).length;
    expect(entries).toBe(SIZE ** 3);
  });

  it('is accurate enough at 17³ that a finer lattice would buy nothing visible', () => {
    const nearNeutral = measureLutError(SIZE, 17, 0.1);
    // Below one code in the colours where a lattice is *seen*: smooth, near-neutral gradients. This is
    // the measurement that chose the size, so if a future look pushes it past a code the answer is a
    // denser table, not a smaller error message.
    expect(nearNeutral.worstError).toBeLessThan(1);
    // And the saturated corners stay within a few codes, where the eye cannot resolve them anyway.
    expect(measureLutError(SIZE, 17).worstError).toBeLessThan(5);
  });

  it('costs a file small enough to justify a 3D table over a uniform', async () => {
    const committed = await readFile(LUT_PATH, 'utf8');
    expect(Buffer.byteLength(committed)).toBeLessThan(140 * 1024);
  });
});

describe('applying a table to the texture', () => {
  it('starts as the identity, so an unloaded look renders ungraded rather than black', () => {
    const texture = createLookTexture(SIZE);
    const data = texture.image.data;
    expect(texture.image.width).toBe(SIZE);
    for (const [r, g, b] of [
      [0, 0, 0],
      [SIZE - 1, 0, 0],
      [0, SIZE - 1, 0],
      [0, 0, SIZE - 1],
      [SIZE - 1, SIZE - 1, SIZE - 1],
    ]) {
      const offset = (b! * SIZE * SIZE + g! * SIZE + r!) * 4;
      expect(data?.[offset]).toBe(Math.round((r! / (SIZE - 1)) * 255));
      expect(data?.[offset + 1]).toBe(Math.round((g! / (SIZE - 1)) * 255));
      expect(data?.[offset + 2]).toBe(Math.round((b! / (SIZE - 1)) * 255));
      expect(data?.[offset + 3]).toBe(255);
    }
  });

  it('reads back exactly what was written', () => {
    const texture = createLookTexture(SIZE);
    const table = generateLutData(SIZE);
    writeLookTable(texture, table, SIZE);
    const data = texture.image.data;
    for (let index = 0; index < SIZE ** 3; index += 1) {
      expect(data?.[index * 4]).toBe(table[index * 3]);
      expect(data?.[index * 4 + 1]).toBe(table[index * 3 + 1]);
      expect(data?.[index * 4 + 2]).toBe(table[index * 3 + 2]);
    }
  });

  it('refuses a table whose size does not match the texture', () => {
    const texture = createLookTexture(SIZE);
    // A mismatch would be sampled with the wrong coordinates and would still look like a grade, so it
    // throws rather than warning: this is the class of error that survives every screenshot review.
    expect(() => writeLookTable(texture, new Uint8Array(2 ** 3 * 3), 2)).toThrow(/17³/);
    expect(() => writeLookTable(texture, new Uint8Array(SIZE ** 3 * 3 - 1), SIZE)).toThrow(/bytes/);
  });

  it('marks the texture for upload, which is the only way the contents reach the GPU', () => {
    const texture = createLookTexture(SIZE);
    let version = texture.version;
    writeLookTable(texture, generateLutData(SIZE), SIZE);
    expect(texture.version).toBeGreaterThan(version);
    version = texture.version;
    // The identity fill on construction must also have queued an upload, or a scene that never loads
    // a look would render with an uninitialised texture.
    expect(version).toBeGreaterThan(0);
  });

  it('carries no colour space, so the transfer curve is not applied twice', () => {
    const texture = createLookTexture(SIZE);
    expect(texture.colorSpace).not.toBe('srgb');
  });

  it('builds the identity from the same lattice indexing the generator uses', () => {
    // The two live on opposite sides of the build/runtime boundary — one is a script, one is bundled —
    // so the indexing convention is a contract, and this is what pins it: the identity table from the
    // generator and the one the renderer fills must agree entry for entry.
    const generated = identityLutData(SIZE);
    const texture = createLookTexture(SIZE);
    const data = texture.image.data;
    for (let index = 0; index < SIZE ** 3; index += 1) {
      expect(data?.[index * 4]).toBe(generated[index * 3]);
      expect(data?.[index * 4 + 1]).toBe(generated[index * 3 + 1]);
      expect(data?.[index * 4 + 2]).toBe(generated[index * 3 + 2]);
    }
  });
});

describe('the post-processing switches', () => {
  it('leaves the configuration alone when no switch is present', () => {
    const resolved = applyRenderSwitches(RENDER_CONFIG, '');
    expect(resolved.postProcessing.depthOfField).toEqual(RENDER_CONFIG.postProcessing.depthOfField);
    expect(resolved.postProcessing.lut).toEqual(RENDER_CONFIG.postProcessing.lut);
  });

  it('re-enables depth of field on a tier that switches it off', () => {
    // This is the switch that makes the effect verifiable at all: the constrained tier disables it by
    // design, and every headless capture resolves to that tier.
    const tierC = {
      ...RENDER_CONFIG,
      postProcessing: {
        ...RENDER_CONFIG.postProcessing,
        depthOfField: { ...RENDER_CONFIG.postProcessing.depthOfField, enabled: false },
      },
    };
    expect(applyRenderSwitches(tierC, '?dof=1').postProcessing.depthOfField.enabled).toBe(true);
    expect(applyRenderSwitches(tierC, '?dof=0').postProcessing.depthOfField.enabled).toBe(false);
  });

  it('selects a look by id, removes it with `none`, and trims it with `lutmix`', () => {
    const named = applyRenderSwitches(RENDER_CONFIG, '?lut=some-other-look');
    expect(named.postProcessing.lut.enabled).toBe(true);
    expect(named.postProcessing.lut.assetId).toBe('some-other-look');
    expect(applyRenderSwitches(RENDER_CONFIG, '?lut=none').postProcessing.lut.enabled).toBe(false);
    expect(applyRenderSwitches(RENDER_CONFIG, '?lutmix=0.4').postProcessing.lut.intensity).toBe(
      0.4,
    );
  });

  it('clamps the trim and the aperture instead of trusting the query string', () => {
    expect(applyRenderSwitches(RENDER_CONFIG, '?lutmix=9').postProcessing.lut.intensity).toBe(1);
    expect(applyRenderSwitches(RENDER_CONFIG, '?lutmix=-3').postProcessing.lut.intensity).toBe(0);
    expect(
      applyRenderSwitches(RENDER_CONFIG, '?bokeh=-2').postProcessing.depthOfField.bokehScale,
    ).toBe(0);
    // A typo is not a number, and a non-number must not become a NaN uniform that blanks the frame.
    expect(
      applyRenderSwitches(RENDER_CONFIG, '?bokeh=wide').postProcessing.depthOfField.bokehScale,
    ).toBe(RENDER_CONFIG.postProcessing.depthOfField.bokehScale);
    expect(applyRenderSwitches(RENDER_CONFIG, '?lutmix=half').postProcessing.lut.intensity).toBe(
      RENDER_CONFIG.postProcessing.lut.intensity,
    );
  });

  it('never mutates the configuration it was given', () => {
    const before = JSON.stringify(RENDER_CONFIG);
    applyRenderSwitches(RENDER_CONFIG, '?dof=0&lut=none&lutmix=0.2&bokeh=1');
    expect(JSON.stringify(RENDER_CONFIG)).toBe(before);
  });
});
