#!/usr/bin/env node
/**
 * Copies the browser decoders the runtime needs out of `node_modules` and into `public/`.
 *
 * Two things have to be served to the browser for a derived model to load, and neither is content:
 *
 * - **The Basis transcoder** (`basis_transcoder.js` + `.wasm`), which turns the KTX2 textures inside
 *   the model into whatever compressed format the GPU actually supports. `KTX2Loader` fetches it at
 *   runtime by URL, so it has to be a *file the site serves*, not a module the bundler can inline.
 * - **The meshopt decoder** is a plain ES module, which the bundler resolves from `three/addons`, so
 *   it needs no copy.
 *
 * These are build inputs, not assets: they are MIT-licensed runtime code from three.js, they arrive
 * with the toolchain, and they belong to no artwork pipeline. That is why they are copied here at
 * build time — and gitignored rather than committed — instead of going through the asset pipeline
 * that `docs/ASSET_POLICY.md` governs, which exists to keep *content* licences honest.
 *
 * Runs automatically before `dev` and `build` (npm's `predev`/`prebuild` hooks).
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_DIR = join(ROOT, 'public', 'decoders', 'basis');

/** The transcoder's entry point and its WebAssembly binary, both shipped by the `three` package. */
const FILES = ['basis_transcoder.js', 'basis_transcoder.wasm'];

// `three` does not export its package.json, so the package root is found by resolving a file it
// *does* export and walking up from there.
const sourceDir = join(
  dirname(dirname(require.resolve('three/addons/loaders/KTX2Loader.js'))),
  'libs',
  'basis',
);
const threeManifest = join(dirname(dirname(dirname(dirname(sourceDir)))), 'package.json');

await mkdir(TARGET_DIR, { recursive: true });
for (const file of FILES) {
  await copyFile(join(sourceDir, file), join(TARGET_DIR, file));
}

// A version stamp, so a stale copy from an older three is visible rather than mysterious: the
// transcoder and the loader that drives it must come from the same release.
const version = JSON.parse(await readFile(threeManifest, 'utf8')).version;
await writeFile(
  join(TARGET_DIR, 'README.md'),
  [
    '# Basis transcoder (generated)',
    '',
    `Copied from \`three@${version}\` by \`scripts/copy-decoders.mjs\`. Do not edit; do not commit.`,
    '',
    'The KTX2 textures inside the derived models are decoded by this transcoder at runtime, which',
    'transcodes them on the fly into a GPU-compressed format (BC7, ASTC, ETC2) instead of expanding',
    'them into full-size images. It is MIT-licensed code from the three.js project, not content.',
    '',
  ].join('\n'),
);

console.log(`decoders: copied ${FILES.length} Basis transcoder files from three@${version}`);
