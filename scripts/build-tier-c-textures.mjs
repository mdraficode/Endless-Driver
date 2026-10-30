#!/usr/bin/env node
/**
 * Derives the tier-C (phone) 512-px derivations of the committed 1K scanned texture sets.
 *
 * The 1K sets enter through `scripts/fetch-assets.mjs`, which commits the published files
 * byte-for-byte. This script takes those committed files — the same CC0 scans, the same
 * licences — and resamples them to 512 px for the tier-C asset budget: a phone's first frame
 * should not carry 27 MB of 1K sets it samples at at most 512 texels on screen. Tiers B and A
 * keep the 1K files untouched.
 *
 * Deriving from the committed 1K files (rather than re-fetching Poly Haven's 512 uploads) keeps
 * the derivation reproducible from the repository alone: the 1K files are hash-pinned in the
 * manifest, so the 512 files they produce are fixed by the same pins.
 *
 * Usage:
 *   node scripts/build-tier-c-textures.mjs            # derive every set that has no 512 entry yet
 *   node scripts/build-tier-c-textures.mjs --force    # re-derive and overwrite
 *
 * Every derived set is recorded in `public/assets/manifest.json` under a parallel `-512` id
 * (the loader maps `tex-x-1k` -> `tex-x-512` on tier C, `src/config/asset-resolution.ts`), with
 * the same source, licence and pins as its 1K parent, and the files' own SHA-256 and byte sizes.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const MANIFEST_PATH = join(PUBLIC_DIR, 'assets', 'manifest.json');
const JPEG_QUALITY = 80;

const force = process.argv.includes('--force');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const ids = new Set(manifest.assets.map((asset) => asset.id));

const derive = [];
let wrote = 0;
let bytesOut = 0;

for (const asset of manifest.assets) {
  if (asset.kind !== 'texture' || !asset.id.endsWith('-1k')) {
    continue;
  }
  const id512 = `${asset.id.slice(0, -'1k'.length - 1)}-512`;
  if (ids.has(id512) && !force) {
    continue;
  }
  derive.push({ asset, id512 });
}

if (derive.length === 0) {
  console.log('tier-c-textures: every 1K texture set already has a 512 derivation; nothing to do.');
  process.exit(0);
}

for (const { asset, id512 } of derive) {
  const files = [];
  for (const file of asset.files) {
    // The published naming is `<name>_<res>_<slot>_<res>.jpg`; the derivation keeps the pattern
    // with the 512 budget, so a 512 file is indistinguishable in name from the published one.
    const sourceName = file.path.split('/').pop();
    const derivedName = sourceName.replace(/_1k(_|\.)/g, (match) => `_512${match.slice(3)}`);
    const derivedPath = `${dirname(file.path)}/${derivedName}`;
    const absolute = join(PUBLIC_DIR, file.path);
    const input = await readFile(absolute);
    const metadata = await sharp(input).metadata();
    const output = await sharp(input)
      .resize(512, 512, { fit: 'cover' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    await mkdir(join(PUBLIC_DIR, dirname(derivedPath)), { recursive: true });
    await writeFile(join(PUBLIC_DIR, derivedPath), output);
    files.push({
      slot: file.slot,
      path: derivedPath,
      bytes: output.length,
      sha256: sha256(output),
      colourSpace: file.colourSpace,
      format: 'jpg',
      resolution: '512',
    });
    wrote += 1;
    bytesOut += output.length;
    console.log(
      `  ${derivedName}  ${metadata.width}x${metadata.height} -> 512x512  ${(output.length / 1024).toFixed(0)} kB`,
    );
  }

  const entry = {
    id: id512,
    kind: 'texture',
    name: asset.name.replace('1K', '512px'),
    assetClass: asset.assetClass,
    source: { ...asset.source },
    role: `Tier-C budget derivation of "${asset.id}": the same CC0 scan resampled to 512 px for phone loads (the tier-C asset budget). Derived from the committed 1K files by scripts/build-tier-c-textures.mjs; tiers B and A load the 1K set.`,
    pipeline: {
      resolution: '512',
      sourceAsset: asset.id,
      jpegQuality: JPEG_QUALITY,
      notes:
        'Resampled from the committed 1K derivation (itself pinned to the Poly Haven publication); reproducible without network access.',
    },
    files,
  };

  const index = manifest.assets.findIndex((candidate) => candidate.id === id512);
  if (index === -1) {
    manifest.assets.push(entry);
  } else {
    manifest.assets[index] = entry;
  }
  console.log(`${id512}: ${files.length} files derived.`);
}

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `tier-c-textures: ${wrote} files, ${(bytesOut / (1024 * 1024)).toFixed(2)} MB total; manifest updated.`,
);

// A sanity pass the CI gate repeats: every derived file exists, and its recorded hash matches.
for (const { id512 } of derive) {
  const entry = manifest.assets.find((candidate) => candidate.id === id512);
  for (const file of entry.files) {
    const buffer = await readFile(join(PUBLIC_DIR, file.path));
    const size = await stat(join(PUBLIC_DIR, file.path)).then((info) => info.size);
    if (size !== file.bytes || sha256(buffer) !== file.sha256) {
      throw new Error(`self-check failed for ${file.path}`);
    }
  }
}
console.log('tier-c-textures: self-check passed.');
