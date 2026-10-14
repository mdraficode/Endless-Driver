#!/usr/bin/env node
/**
 * Builds the project's 3D LUT from `scripts/lib/lut.mjs` and writes the `.cube` the runtime loads.
 *
 * The look is authored here rather than downloaded, and the table is *generated* rather than
 * hand-edited, which makes three things possible that an opaque LUT file does not:
 *
 * 1. the look is reviewable — it is a dozen numbers and a formula, in a diff, with comments;
 * 2. the size of the table is chosen by measurement (`--analyse` reconstructs the table and reports
 *    the error a lattice of that size introduces), not by folklore;
 * 3. the committed file can be regenerated and compared byte for byte, so the artefact cannot drift
 *    from the code that claims to produce it — `--check` does exactly that, and the unit test runs it.
 *
 * The number that decides the size: at 17³ the worst reconstruction error over colours below 0.10
 * chroma — the smooth near-neutral gradients where a lattice is visible as banding — is 0.62 of an
 * 8-bit code. That is below the half-code rounding error the table's own bytes carry, so a finer
 * lattice cannot improve what a viewer could see; it would only turn 101 KB into 737 KB. Saturated
 * colours, where the error is larger (3.6 codes at 17³), are exactly where it does not read: the eye
 * resolves far less colour difference in a saturated red than in a pale sky.
 *
 * Usage:
 *   node scripts/build-lut.mjs            # write the file
 *   node scripts/build-lut.mjs --check    # fail if the committed file differs from the generator
 *   node scripts/build-lut.mjs --analyse  # report the error for a range of table sizes
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOK, applyLook, generateLutData, measureLutError, serialiseCube } from './lib/lut.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The one LUT the project ships. Its id, size, and name are mirrored in the asset manifest. */
export const LUT = {
  id: 'lut-hinode-film-17',
  name: 'Hinode Film',
  title: 'Hinode Film — Endless Driver look',
  /** Lattice size per axis. See the header comment for why 17 and not 33. */
  size: 17,
  path: join('public', 'assets', 'luts', 'hinode-film-17.cube'),
};

const args = new Set(process.argv.slice(2));

if (args.has('--analyse')) {
  console.log('size | worst error (codes) | worst below 0.10 chroma | mean | file size');
  for (const size of [9, 13, 17, 21, 25, 33]) {
    const overall = measureLutError(size);
    const nearNeutral = measureLutError(size, 17, 0.1);
    const bytes = serialiseCube(size, generateLutData(size), 'x').length;
    console.log(
      `${String(size).padStart(4)} | ${overall.worstError.toFixed(2).padStart(18)} | ` +
        `${nearNeutral.worstError.toFixed(2).padStart(22)} | ${overall.meanError.toFixed(3)} | ` +
        `${(bytes / 1024).toFixed(0)} KB`,
    );
  }
  process.exit(0);
}

const data = generateLutData(LUT.size);
const cube = serialiseCube(LUT.size, data, LUT.title);
const absolute = join(ROOT, LUT.path);

if (args.has('--check')) {
  let existing = null;
  try {
    existing = await readFile(absolute, 'utf8');
  } catch {
    console.error(`build-lut: ${LUT.path} is missing — run \`npm run assets:lut\``);
    process.exit(1);
  }
  if (existing !== cube) {
    console.error(
      `build-lut: ${LUT.path} does not match the generator. Run \`npm run assets:lut\` and commit ` +
        'the result — a look that ships without the code that describes it is an unexplainable file.',
    );
    process.exit(1);
  }
  console.log(`build-lut: ${LUT.path} matches the generator (${data.length} bytes of table)`);
  process.exit(0);
}

await mkdir(dirname(absolute), { recursive: true });
await writeFile(absolute, cube);

const bytes = Buffer.byteLength(cube);
const overall = measureLutError(LUT.size);
const nearNeutral = measureLutError(LUT.size, 17, 0.1);
console.log(`build-lut: wrote ${LUT.path}`);
console.log(`  table      ${LUT.size}³ = ${LUT.size ** 3} entries, ${bytes} bytes on disk`);
console.log(`  sha256     ${createHash('sha256').update(cube).digest('hex')}`);
console.log(
  `  error      worst ${overall.worstError.toFixed(2)} codes overall, ` +
    `${nearNeutral.worstError.toFixed(2)} codes below 0.10 chroma`,
);
console.log(
  `  endpoints  black → ${format(applyLook([0, 0, 0]))}, white → ${format(applyLook([1, 1, 1]))}`,
);
console.log(
  `  look       contrast ${LOOK.contrast}, mid saturation +${LOOK.midSaturation}, ` +
    `highlight desaturation ${LOOK.highlightDesaturation}`,
);

function format(rgb) {
  return `[${rgb.map((channel) => channel.toFixed(3)).join(', ')}]`;
}
