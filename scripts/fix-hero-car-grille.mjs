#!/usr/bin/env node
/**
 * One-off repair for the shipped hero car: its `front-grille-texture` is 987×268, and ETC1S
 * textures are specified in multiples of four — three.js logs
 * "THREE.KTX2Loader: ETC1S and UASTC textures should use multiple-of-four dimensions." on every
 * boot because of it.
 *
 * The full hero-car pipeline cannot be re-run here (it is pinned to Blender 4.3.2 plus the
 * non-committed 80 MB user archive), so this performs the minimal possible repair: it swaps only
 * the grille's KTX2 image bytes inside the committed GLB. To keep the change surgical — no
 * geometry, no buffer layout, no re-quantisation — the replacement KTX2 is written into the
 * original bufferView's exact byte span: the re-encoded texture is shorter, so zero padding is
 * appended after the last KTX2 level (which the parser never reads) to fill the span.
 *
 * Where the pixels come from matters. The Node build of the basis transcoder wasm (the same
 * `public/decoders/basis/` files the game ships) decodes this particular ETC1S file
 * non-deterministically: in some Node processes it returns the correct image, in others an
 * all-zero RGB plane. The browser — the actual consumer — decodes it correctly and
 * deterministically (verified 6/6). The repair therefore takes its source pixels from a
 * byte-exact decode made in the browser:
 *
 *   1. serve this repo's dist/ (e.g. `npm run preview -- --port 4173`);
 *   2. open e2e/browser-decode-probe.html (copied into dist/) — it transcodes
 *      dist/probe-grille.ktx2 and exposes the raw RGBA as `window.__PROBE_RESULT__`;
 *   3. save the raw bytes to /tmp/grille-authoritative.raw (987×268×4 = 1,058,064 bytes;
 *      sanity values: R channel sum 1,543,985 / A channel sum 45,866,062 / R max 187).
 *
 * Steps:
 *   1. verify the committed GLB matches the manifest and the browser decode is present + sane;
 *   2. edge-pad 987→988 (nearest-neighbour — one duplicated border column);
 *   3. re-encode to KTX2 ETC1S at quality 170 with mips (the pipeline's albedo settings);
 *   4. write the KTX2 into the original byte span (in place, same length, zero tail);
 *   5. verify: the replacement is a valid KTX2 at 988×268, every other byte of the file is
 *      unchanged, and extensions/triangle count are intact;
 *   6. update the asset manifest (bytes + sha256).
 *
 * Final visual acceptance happens in the browser: decode the repaired KTX2 and compare it
 * against the padded source (see e2e/browser-decode-probe.html), then confirm the car in a
 * clean-scene frame.
 *
 * The pipeline itself is hardened separately (`scripts/lib/ktx2.mjs` pads before encoding), so a
 * future rebuild can never regress this.
 *
 * Usage: node scripts/fix-hero-car-grille.mjs [--check]
 *   --check  verify the committed GLB is already repaired and the manifest agrees; exit non-zero
 *            if not. No writes.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_PATH = 'assets/models/hero-car-mmc-generic-sport-coupe.glb';
const MODEL_ID = 'hero-car-mmc-generic-sport-coupe';
const MANIFEST_PATH = join(ROOT, 'public', 'assets', 'manifest.json');
const GRILLE_NAME = 'front-grille-texture';
const QUALITY = 170;
const BROWSER_DECODE_PATH = '/tmp/grille-authoritative.raw';
const EXPECTED_BYTES = 987 * 268 * 4;
const EXPECTED_R_SUM = 1_543_985;
const EXPECTED_A_SUM = 45_866_062;
const EXPECTED_R_MAX = 187;

const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(`fix-hero-car-grille: ${message}`);
  process.exit(1);
}
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const ceilTo4 = (n) => Math.ceil(n / 4) * 4;

function parseGlbJson(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return {
    json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')),
    binStart: binChunkStart(buffer),
  };
}
function binChunkStart(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return 20 + jsonLength + (jsonLength % 4 ? 4 - (jsonLength % 4) : 0) + 8;
}
const ktx2Dimensions = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const magic = Buffer.from(view.subarray(0, 12)).toString('hex');
  if (magic !== 'ab4b5458203230bb0d0a1a0a') throw new Error('not a KTX2 container');
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  return { width: dv.getUint32(20, true), height: dv.getUint32(24, true) };
};

function runEncoder(binary, args) {
  return new Promise((res, rej) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('error', rej);
    child.on('close', (code) =>
      code === 0
        ? res(out)
        : rej(new Error(`basisu exited ${code}:\n${out.trim().split('\n').slice(-6).join('\n')}`)),
    );
  });
}

async function main() {
  const modelPath = join(ROOT, 'public', MODEL_PATH);
  const original = await readFile(modelPath);
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const entry = manifest.assets.find((a) => a.id === MODEL_ID);
  const fileEntry = entry?.files.find((f) => f.path === MODEL_PATH);
  if (fileEntry === undefined) fail('manifest has no entry for the hero car model');
  if (fileEntry.sha256 !== sha256(original) || fileEntry.bytes !== original.length) {
    fail('the committed GLB does not match the manifest; resolve the drift first');
  }

  const { json, binStart } = parseGlbJson(original);
  const grille = json.images.find((i) => i.name === GRILLE_NAME);
  if (grille === undefined) fail('the grille texture is not in the model');
  const bv = json.bufferViews[grille.bufferView];
  const spanStart = binStart + bv.byteOffset;
  const span = original.subarray(spanStart, spanStart + bv.byteLength);
  const dims = ktx2Dimensions(span);
  console.log(
    `grille: ${dims.width}×${dims.height} KTX2, ${bv.byteLength} bytes at BIN+${bv.byteOffset}`,
  );

  if (dims.width % 4 === 0 && dims.height % 4 === 0) {
    console.log('already repaired: grille texture is multiple-of-4');
    return;
  }
  if (checkOnly) fail('grille texture is still non-multiple-of-4 (run without --check to repair)');
  if (dims.width !== 987 || dims.height !== 268)
    fail(`unexpected grille size ${dims.width}×${dims.height}`);

  // 1. The browser decode of the current texture (see header). It is the only trusted source of
  //    pixels: the Node transcoder build decodes this file non-deterministically (all-zero RGB in
  //    some processes), so no decode-based check is run in Node at all.
  let source;
  try {
    source = new Uint8Array(await readFile(BROWSER_DECODE_PATH));
  } catch {
    fail(
      `missing browser decode at ${BROWSER_DECODE_PATH} — export it with e2e/browser-decode-probe.html` +
        ' (see the header comment for the three-step recipe)',
    );
  }
  if (source.length !== EXPECTED_BYTES)
    fail(`browser decode is ${source.length} bytes, expected ${EXPECTED_BYTES}`);
  let rSum = 0,
    aSum = 0,
    rMax = 0;
  for (let k = 0; k < source.length; k += 4) {
    rSum += source[k];
    aSum += source[k + 3];
    if (source[k] > rMax) rMax = source[k];
  }
  if (rSum !== EXPECTED_R_SUM || aSum !== EXPECTED_A_SUM || rMax !== EXPECTED_R_MAX) {
    fail(
      `browser decode sanity check failed (Rsum ${rSum} / Asum ${aSum} / Rmax ${rMax}; expected ${EXPECTED_R_SUM} / ` +
        `${EXPECTED_A_SUM} / ${EXPECTED_R_MAX}) — re-export it from e2e/browser-decode-probe.html`,
    );
  }

  // 2. Edge-pad 987→988 (nearest: the last column is duplicated — a black border, visually inert).
  const paddedW = ceilTo4(987);
  const paddedH = ceilTo4(268);
  const paddedPng = await sharp(source, { raw: { width: 987, height: 268, channels: 4 } })
    .resize({ width: paddedW, height: paddedH, fit: 'fill', kernel: 'nearest' })
    .png()
    .toBuffer();

  // 3. Re-encode (pipeline albedo settings: ETC1S quality 170, mips, RGBA).
  const { basisuAvailable } = await import('./lib/ktx2.mjs');
  const { path: binary, ok } = await basisuAvailable();
  if (!ok) fail('the Basis encoder is unavailable');
  await chmod(binary, 0o755);
  const work = await mkdtemp(join(tmpdir(), 'ed-grille-enc-'));
  let repaired;
  try {
    const input = join(work, 'g.png');
    const output = join(work, 'g.ktx2');
    await writeFile(input, paddedPng);
    await runEncoder(binary, [
      '-ktx2',
      '-mipmap',
      '-q',
      String(QUALITY),
      '-output_file',
      output,
      input,
    ]);
    repaired = new Uint8Array(await readFile(output));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  const rd = ktx2Dimensions(repaired);
  if (rd.width !== paddedW || rd.height !== paddedH)
    fail(`re-encoded ${rd.width}×${rd.height}, expected ${paddedW}×${paddedH}`);
  if (repaired.length > bv.byteLength) {
    fail(
      `re-encoded KTX2 (${repaired.length} bytes) exceeds the original span (${bv.byteLength}); cannot do an in-place swap`,
    );
  }
  console.log(
    `re-encoded: ${paddedW}×${paddedH} KTX2, ${repaired.length} bytes (span ${bv.byteLength})`,
  );

  // 4. Same-length in-place swap: pad after the last level (never read by the parser).
  const patched = new Uint8Array(original);
  patched.set(repaired, spanStart);
  patched.fill(0, spanStart + repaired.length, spanStart + bv.byteLength);

  // 5. Verify.
  if (patched.length !== original.length) fail('file length changed');
  let changedOutside = 0;
  for (let i = 0; i < original.length; i++) {
    const inSpan = i >= spanStart && i < spanStart + bv.byteLength;
    if (!inSpan && patched[i] !== original[i]) changedOutside++;
  }
  if (changedOutside > 0) fail(`${changedOutside} bytes outside the grille span changed`);
  for (const extension of [
    'EXT_meshopt_compression',
    'KHR_texture_basisu',
    'KHR_mesh_quantization',
  ]) {
    if (!(json.extensionsUsed ?? []).includes(extension)) fail(`model is missing ${extension}`);
  }
  const lod0 = (json.nodes ?? []).findIndex((n) => n.name === 'lod0');
  if (lod0 < 0) fail('lod0 node missing');
  let tris = 0;
  const visit = (idx) => {
    const n = json.nodes[idx];
    if (n.mesh !== undefined)
      for (const p of json.meshes[n.mesh].primitives) tris += json.accessors[p.indices].count / 3;
    for (const c of n.children ?? []) visit(c);
  };
  visit(lod0);
  if (tris !== fileEntry.triangles)
    fail(`lod0 triangles ${tris} disagree with manifest ${fileEntry.triangles}`);
  console.log(`lod0 triangles: ${tris} (manifest agrees); only the grille span changed`);

  // 6. Update the manifest, then write the model.
  fileEntry.bytes = patched.length;
  fileEntry.sha256 = sha256(patched);
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(modelPath, patched);
  console.log(
    `manifest updated: ${fileEntry.bytes} bytes, sha256 ${fileEntry.sha256.slice(0, 12)}…`,
  );
  console.log(
    'repair complete — next: rebuild (npm run build), extract the new grille KTX2, and verify in the ' +
      'browser with e2e/browser-decode-probe.html (decode must be 988×268 and close to the padded source)',
  );
}

main().catch((error) => fail(error.stack ?? String(error)));
