#!/usr/bin/env node
/**
 * Derives runtime models from pinned CC0 sources.
 *
 * `scripts/fetch-assets.mjs` covers assets that ship exactly as published — an HDRI or a texture set
 * is committed byte-for-byte as the archive released it. A model is different: what the archive
 * publishes is a `.gltf` plus a `.bin` plus a folder of JPEGs, several megabytes of it, and none of
 * that is what the runtime should download. It has to be *derived*: geometry simplified into levels,
 * attributes quantized, buffers meshopt-compressed, textures resized and transcoded to KTX2.
 *
 * So this script owns one asset end to end: it fetches the pinned source into an uncommitted cache,
 * runs the derivation, checks the result against `scripts/asset-budgets.mjs`, writes the runtime
 * files under `public/assets/models/`, and records everything it did in the same manifest the rest of
 * the project reads — including the source URLs and hashes, so the output stays reproducible and the
 * licence register stays true.
 *
 * Usage:
 *   node scripts/build-models.mjs                 # build every entry whose output is missing
 *   node scripts/build-models.mjs --force         # rebuild everything and refetch sources
 *   node scripts/build-models.mjs --only <id>     # build one entry
 *
 * The source cache lives in `.asset-cache/` and is deliberately not committed: it is reproducible
 * from the pinned URLs below, and it is five times the size of the derived output.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  cloneDocument,
  dedup,
  meshopt,
  prune,
  quantize,
  simplifyPrimitive,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import {
  MODEL_LOD_RATIOS,
  MODEL_SIMPLIFY_ERROR,
  MODEL_TEXTURE,
  formatBytes,
  requireBudget,
} from './asset-budgets.mjs';
import { encodeKtx2, basisuAvailable } from './lib/ktx2.mjs';
import { copyPrimitiveInto, countMeshTriangles, mergePositionSeams } from './lib/geometry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
// The source cache is reproducible and five times the derived output, so it stays uncommitted.
// It defaults to the repository, but a build that derives a 456 MB scanned conifer wants real disk
// rather than a memory-backed checkout: ED_MODEL_CACHE redirects it (CI and small builds unset).
const CACHE_DIR = process.env.ED_MODEL_CACHE
  ? resolve(process.env.ED_MODEL_CACHE)
  : join(ROOT, '.asset-cache', 'models');
const MANIFEST_PATH = join(PUBLIC_DIR, 'assets', 'manifest.json');
const BASE_URL = 'https://dl.polyhaven.org/file/ph-assets';

/**
 * Pinned model sources.
 *
 * Every URL and MD5 below is fixed here rather than queried from the API at build time, so an API
 * change or outage can never alter what this project builds. The MD5s are the archive's own, and are
 * checked on download: a source file that does not match is a different file, and the build stops
 * rather than deriving from something unverified.
 */
const MODEL_ENTRIES = [
  {
    id: 'model-boulder-01',
    name: 'Boulder 01 — 1K scanned prop',
    assetClass: 'prop',
    sourceUrl: 'https://polyhaven.com/a/boulder_01',
    creator: 'James Ray Cock',
    licence: 'CC0-1.0',
    attribution: '',
    role: 'First real mesh through the derivation pipeline, and a rock for the Hinode Prefecture forest floor (Phase 5).',
    /** Root file, plus every dependency the glTF references, with the archive's sizes and MD5s. */
    sources: [
      {
        path: 'boulder_01_1k.gltf',
        url: `${BASE_URL}/Models/gltf/1k/boulder_01/boulder_01_1k.gltf`,
        bytes: 2773,
        md5: '26e2eef4a1f68c9557c65cd375b21d6c',
      },
      {
        path: 'boulder_01.bin',
        // Shared across resolutions: the mesh is identical at every texture size, so the archive
        // publishes one buffer and points every variant at it.
        url: `${BASE_URL}/Models/gltf/8k/boulder_01/boulder_01.bin`,
        bytes: 2938808,
        md5: '27a19fa031d8b4c3a09261f19c444dc5',
      },
      {
        path: 'textures/boulder_01_diff_1k.jpg',
        url: `${BASE_URL}/Models/jpg/1k/boulder_01/boulder_01_diff_1k.jpg`,
        bytes: 987467,
        md5: '25f8a843f13369d56d37f49db05ea8c3',
      },
      {
        path: 'textures/boulder_01_nor_gl_1k.jpg',
        url: `${BASE_URL}/Models/jpg/1k/boulder_01/boulder_01_nor_gl_1k.jpg`,
        bytes: 1183552,
        md5: '0c4da644d901144b53e4fe2446f3c389',
      },
      {
        path: 'textures/boulder_01_arm_1k.jpg',
        url: `${BASE_URL}/Models/jpg/1k/boulder_01/boulder_01_arm_1k.jpg`,
        bytes: 659386,
        md5: 'd632159982cc3121ed3d69b89a122146',
      },
    ],
  },
  {
    id: 'model-tree-stump-01',
    name: 'Tree Stump 01 — 1K scanned stump',
    assetClass: 'prop',
    sourceUrl: 'https://polyhaven.com/a/tree_stump_01',
    creator: 'Rob Tuytel',
    licence: 'CC0-1.0',
    attribution: '',
    role: 'Cut-stump scatter for felled verges and forest edges; replaces the procedural cylinder stumps with a scanned surface (Phase 5).',
    sources: [
      {
        path: 'tree_stump_01_1k.gltf',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/tree_stump_01/tree_stump_01_1k.gltf`,
        bytes: 2793,
        md5: 'fedfc620634a8dbaf6345413b13abe1a',
      },
      {
        path: 'tree_stump_01.bin',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/tree_stump_01/tree_stump_01.bin`,
        bytes: 965380,
        md5: 'acb292727949126b92e58217fd50fca9',
      },
      {
        path: 'textures/tree_stump_01_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/tree_stump_01/tree_stump_01_diff_1k.jpg`,
        bytes: 907451,
        md5: 'c71fe60400276a37b8847048cbec3720',
      },
      {
        path: 'textures/tree_stump_01_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/tree_stump_01/tree_stump_01_nor_gl_1k.jpg`,
        bytes: 1238404,
        md5: 'cc2a3c6e4682a521b15cccc61a416bbf',
      },
      {
        path: 'textures/tree_stump_01_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/tree_stump_01/tree_stump_01_arm_1k.jpg`,
        bytes: 825646,
        md5: '09b7aa228dccb93f5cf4188ba5530578',
      },
    ],
  },
  {
    id: 'model-island-tree-01',
    name: 'Island Tree 01 — 1K scanned broadleaf',
    assetClass: 'tree',
    sourceUrl: 'https://polyhaven.com/a/island_tree_01',
    creator: 'Rob Tuytel, Rico Cilliers',
    licence: 'CC0-1.0',
    attribution: '',
    role: 'Broadleaf canopy for meadow edges and roadside shade; the deciduous half of the Hinode tree scatter (Phase 5).',
    sources: [
      {
        path: 'island_tree_01_1k.gltf',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/island_tree_01/island_tree_01_1k.gltf`,
        bytes: 8576,
        md5: 'fbc0c570ebd71ea88cedc1f9d5edb835',
      },
      {
        path: 'textures/island_tree_01_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_nor_gl_1k.jpg`,
        bytes: 1207134,
        md5: '3871f67863453a16b866950202fa2b7f',
      },
      {
        path: 'textures/island_tree_01_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_diff_1k.jpg`,
        bytes: 791327,
        md5: '8a67489846657df6b859d97e0b80fcf4',
      },
      {
        path: 'textures/island_tree_01_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_arm_1k.jpg`,
        bytes: 727403,
        md5: '8077da7d1a001867c0da0cde6bc807f2',
      },
      {
        path: 'textures/island_tree_01_leaves_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_leaves_nor_gl_1k.jpg`,
        bytes: 379443,
        md5: 'a08ffb98b5ffb7dfa682e05a1639c642',
      },
      {
        path: 'textures/island_tree_01_leaves_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_leaves_diff_1k.jpg`,
        bytes: 191886,
        md5: '1356cbb5a5dd1318f9f2a01eddbf03e1',
      },
      {
        path: 'textures/island_tree_01_leaves_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_leaves_arm_1k.jpg`,
        bytes: 489476,
        md5: '27b06c4a53ff115ed7d51ee94e417257',
      },
      {
        path: 'textures/island_tree_01_branches_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_branches_nor_gl_1k.jpg`,
        bytes: 819101,
        md5: '789084affb01f4a22290a848558f5e12',
      },
      {
        path: 'textures/island_tree_01_branches_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_branches_diff_1k.jpg`,
        bytes: 528304,
        md5: '7792907fe2b2b748c129a2384192a579',
      },
      {
        path: 'textures/island_tree_01_branches_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_01/island_tree_01_branches_arm_1k.jpg`,
        bytes: 484806,
        md5: '5b6f5b3838f4a8f60fea14fa3a3fef9f',
      },
      {
        path: 'island_tree_01.bin',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/island_tree_01/island_tree_01.bin`,
        bytes: 60709812,
        md5: '8271f2d12c2727bd647ce0c242acdcec',
      },
    ],
  },
  {
    id: 'model-fir-tree-01',
    // The scan ships 6.98 M triangles in one buffer; see preDecimate() for why the JS pipeline
    // never reads that file directly.
    preDecimate: 0.08,
    name: 'Fir Tree 01 — 1K scanned conifer',
    assetClass: 'tree',
    sourceUrl: 'https://polyhaven.com/a/fir_tree_01',
    creator: 'Rob Tuytel, Rico Cilliers',
    licence: 'CC0-1.0',
    attribution: '',
    role: 'Conifer for the cedar runs and highland forest; the source file holds three scanned variants, published as three runtime models so a forest never repeats one silhouette (Phase 5).',
    variants: [
      { meshIndex: 0, idSuffix: '-a', nameSuffix: ' — variant A' },
      { meshIndex: 1, idSuffix: '-b', nameSuffix: ' — variant B' },
      { meshIndex: 2, idSuffix: '-c', nameSuffix: ' — variant C' },
    ],
    sources: [
      {
        path: 'fir_tree_01_1k.gltf',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fir_tree_01/fir_tree_01_1k.gltf`,
        bytes: 30279,
        md5: '0a184431efdba9e4bf76900d8d56504d',
      },
      {
        path: 'textures/fir_tree_01_bark_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_bark_nor_gl_1k.jpg`,
        bytes: 1137533,
        md5: '978d32ec721696e45b38a72411c4edf4',
      },
      {
        path: 'textures/fir_tree_01_bark_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_bark_diff_1k.jpg`,
        bytes: 776567,
        md5: '93265c0d9fbd3cf17deabdb68aa8b5e9',
      },
      {
        path: 'textures/fir_tree_01_bark_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_bark_arm_1k.jpg`,
        bytes: 789264,
        md5: '4e48a7fa876a1ad47401fe86277a4373',
      },
      {
        path: 'textures/fir_tree_01_trunk_a_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_trunk_a_nor_gl_1k.jpg`,
        bytes: 997355,
        md5: '41b92112b3b9a48eb2e1b4b3562dd937',
      },
      {
        path: 'textures/fir_tree_01_trunk_a_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_trunk_a_diff_1k.jpg`,
        bytes: 789806,
        md5: '304f688bc8212f90a39a3b77f6065ee5',
      },
      {
        path: 'textures/fir_tree_01_trunk_a_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_trunk_a_arm_1k.jpg`,
        bytes: 788967,
        md5: 'e68adf3bf077b1552b5acff7f9d7bebf',
      },
      {
        path: 'textures/fir_tree_01_twig_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_twig_nor_gl_1k.jpg`,
        bytes: 472604,
        md5: '1ef6c0d7c2dc74cc073a8c33f58f3795',
      },
      {
        path: 'textures/fir_tree_01_twig_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_twig_diff_1k.jpg`,
        bytes: 371741,
        md5: 'd267b1117a5d6dbbbd620bd997fb498e',
      },
      {
        path: 'textures/fir_tree_01_twig_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_twig_arm_1k.jpg`,
        bytes: 407309,
        md5: 'b0d09189350cb716533c1590fec8f8a4',
      },
      {
        path: 'textures/fir_tree_01_trunk_b_nor_gl_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_trunk_b_nor_gl_1k.jpg`,
        bytes: 915273,
        md5: '310666823cba305dd25d1494fbe73877',
      },
      {
        path: 'textures/fir_tree_01_trunk_b_diff_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_trunk_b_diff_1k.jpg`,
        bytes: 687662,
        md5: '00ad0c0643a4e6b34914b8ac05cc28cb',
      },
      {
        path: 'textures/fir_tree_01_trunk_b_arm_1k.jpg',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fir_tree_01/fir_tree_01_trunk_b_arm_1k.jpg`,
        bytes: 732269,
        md5: '2bd8df9326c28b68d8ace5d52adfd4f4',
      },
      {
        path: 'fir_tree_01.bin',
        url: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/fir_tree_01/fir_tree_01.bin`,
        bytes: 478462204,
        md5: '26d2bf6d4d2e32d3524e8fa3760f643f',
      },
    ],
  },
];

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'endless-driver-asset-pipeline' } });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}) for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Streams a source file straight to disk and hashes it on the way back, never holding it in
 * memory. Scanned conifers publish a single 456 MB geometry buffer; buffering that through
 * `fetch().arrayBuffer()` plus a `Buffer.from` copy peaked near a gigabyte and got the build
 * OOM-killed on a 2 GB machine. Hashing streams too, so the pinned-MD5 check costs no RAM either.
 */
async function downloadToFile(url, target) {
  const response = await fetch(url, { headers: { 'User-Agent': 'endless-driver-asset-pipeline' } });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}) for ${url}`);
  }
  const { createWriteStream } = await import('node:fs');
  const { finished } = await import('node:stream/promises');
  const { Readable } = await import('node:stream');
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(target)));
}

async function hashFile(target) {
  const { createReadStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const md5Hash = createHash('md5');
  const shaHash = createHash('sha256');
  let bytes = 0;
  await pipeline(createReadStream(target), async function (source) {
    for await (const chunk of source) {
      bytes += chunk.length;
      md5Hash.update(chunk);
      shaHash.update(chunk);
    }
  });
  return { bytes, md5: md5Hash.digest('hex'), sha256: shaHash.digest('hex') };
}

/**
 * Resolves a *native* gltfpack binary for the pre-decimation pass.
 *
 * Scanned trees publish geometry in the millions of triangles; every JavaScript or WASM route
 * through a file that size (fetch buffers, the glTF-Transform graph, gltfpack's WASM build) peaks
 * past a 2 GB machine and gets OOM-killed, while the native binary streams the same work through a
 * few hundred MB. Resolution order: ED_GLTFPACK, then the tool cache next to the model cache, then
 * a pinned release download into that cache — so CI and a fresh checkout converge on one binary.
 */
const GLTFPACK_RELEASE = {
  url: 'https://github.com/zeux/meshoptimizer/releases/download/v1.3/gltfpack-ubuntu.zip',
  version: '1.3',
};

async function ensureGltfpack() {
  if (process.env.ED_GLTFPACK && existsSync(process.env.ED_GLTFPACK)) {
    return process.env.ED_GLTFPACK;
  }
  const toolsDirectory = join(dirname(CACHE_DIR), 'tools');
  const binary = join(toolsDirectory, 'gltfpack');
  if (existsSync(binary)) {
    return binary;
  }
  const { spawnSync } = await import('node:child_process');
  await mkdir(toolsDirectory, { recursive: true });
  const archive = join(toolsDirectory, 'gltfpack.zip');
  const buffer = await download(GLTFPACK_RELEASE.url);
  await writeFile(archive, buffer);
  const unzip = spawnSync('unzip', ['-o', '-q', archive, '-d', toolsDirectory], {
    stdio: 'inherit',
  });
  if (unzip.status !== 0 || !existsSync(binary)) {
    throw new Error(`could not unpack the pinned gltfpack release into ${toolsDirectory}`);
  }
  await chmod(binary, 0o755);
  return binary;
}

/**
 * Pre-decimates a scanned source before the JS pipeline ever sees it.
 *
 * `preDecimate` is the gltfpack `-si` ratio. The pass keeps named nodes, named materials and the
 * original texture *references* (`-kn -km -tr`), so variant selection, material identity and the
 * KTX2 stage downstream all still see the archive's own structure — only the triangle count drops
 * by an order of magnitude. The decimated file is cached beside the sources; it is derived, not
 * pinned, so it can always be rebuilt from the pinned archive.
 */
async function preDecimate(sources, entry) {
  const root = entry.sources.find((source) => source.path.endsWith('.gltf'));
  const input = join(sources.directory, root.path);
  const output = join(sources.directory, root.path.replace(/\.gltf$/, '.decimated.gltf'));
  if (existsSync(output)) {
    return { ...root, path: basename(output) };
  }
  const binary = await ensureGltfpack();
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(
    binary,
    [
      '-i',
      input,
      '-o',
      output,
      '-si',
      String(entry.preDecimate),
      '-se',
      '0.02',
      '-kn',
      '-km',
      '-tr',
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0 || !existsSync(output)) {
    throw new Error(`gltfpack pre-decimation of ${entry.id} failed (exit ${run.status})`);
  }
  return { ...root, path: basename(output) };
}

/** Fetches one entry's sources into the cache, verifying every file against its pinned MD5. */
async function fetchSources(entry) {
  const directory = join(CACHE_DIR, entry.id);
  await mkdir(join(directory, 'textures'), { recursive: true });
  const fetched = [];

  for (const source of entry.sources) {
    const target = join(directory, source.path);
    if (FORCE || !existsSync(target)) {
      await mkdir(dirname(target), { recursive: true });
      await downloadToFile(source.url, target);
    }
    const digest = await hashFile(target);
    if (digest.md5 !== source.md5) {
      throw new Error(
        `${entry.id}: ${source.path} is ${digest.md5}, expected ${source.md5}. ` +
          'The pinned source changed; review it before updating the pin.',
      );
    }
    if (digest.bytes !== source.bytes) {
      throw new Error(
        `${entry.id}: ${source.path} is ${digest.bytes} bytes, expected ${source.bytes}`,
      );
    }
    fetched.push({ ...source, sha256: digest.sha256 });
  }

  const totalBytes = fetched.reduce((total, file) => total + file.bytes, 0);
  return { directory, files: fetched, totalBytes };
}

/**
 * Runs the derivation on one source document and returns one mesh per level of detail, plus the
 * textures they share.
 *
 * The stages are ordered, and each order is load-bearing:
 *
 * 1. **Source hygiene.** Collapse duplicate accessors, drop what the scene graph never reaches, and
 *    weld bitwise-identical vertices.
 * 2. **Deeper levels, on their own copies.** Each level from 1 up is derived on a full deep clone of
 *    the prepared document — `cloneDocument()`, not `mesh.clone()`, which shares accessors and
 *    would let one level's simplification corrupt another's geometry. Deeper levels merge position
 *    seams first; see `MODEL_LOD_RATIOS` and `scripts/lib/geometry.mjs` for why that is the
 *    difference between reaching a ratio and stalling at 82% of the source.
 * 3. **The closest level, in place.** It is simplified last, on the document that will be written,
 *    and it keeps its seams.
 * 4. **Textures, once.** The geometry is settled by now, and the shared texture set is resized and
 *    transcoded to KTX2 a single time — the reason every level lives in one file. Three files would
 *    carry three copies of the same half-megabyte of textures.
 * 5. **Quantize and compress.** Applied to every level at once.
 */
async function derive(io, sources, entry, budget, variant = { meshIndex: 0 }) {
  const root = entry.preDecimate
    ? await preDecimate(sources, entry)
    : entry.sources.find((source) => source.path.endsWith('.gltf'));
  const document = await io.read(join(sources.directory, root.path));

  // Scanned assets sometimes ship several models in one file: Poly Haven's fir is three tree
  // variants sharing a texture set. The variant selects one source mesh; everything else in the
  // file is disposed *before* pruning so the orphaned materials and textures of the siblings are
  // dropped here, and only this variant's texture set is resized and transcoded.
  const gltf = document.getRoot();
  const allMeshes = gltf.listMeshes();
  const sourceMesh = allMeshes[variant.meshIndex] ?? allMeshes[0];
  for (const node of gltf.listNodes()) {
    const mesh = node.getMesh();
    if (mesh && mesh !== sourceMesh) {
      node.dispose();
    }
  }
  for (const mesh of allMeshes) {
    if (mesh !== sourceMesh) {
      mesh.dispose();
    }
  }

  await document.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({
      encoder: sharp,
      resize: [MODEL_TEXTURE.maxSize, MODEL_TEXTURE.maxSize],
      targetFormat: 'jpeg',
      quality: MODEL_TEXTURE.intermediateJpegQuality,
    }),
  );

  const sourceNode = gltf.listNodes().find((node) => node.getMesh() === sourceMesh) ?? null;
  const material = sourceMesh.listPrimitives()[0]?.getMaterial() ?? null;
  // Deeper levels copy primitives out of a cloned document, whose materials are clone-local
  // objects: referencing one directly would connect two property graphs. Names are stable across
  // cloneDocument, so the copy resolves each primitive's material back into this document.
  const localMaterial = new Map(
    gltf.listMaterials().map((candidate) => [candidate.getName(), candidate]),
  );
  const materialFor = (primitive) =>
    localMaterial.get(primitive.getMaterial()?.getName() ?? '') ?? material;
  const sourceTriangles = countMeshTriangles(sourceMesh);
  // A ratio of the source is meaningless for a scan that arrives at millions of triangles, so
  // classes that name absolute per-level targets (the tree class) derive their ratio from them;
  // everything else keeps the measured ratios in MODEL_LOD_RATIOS.
  const ratioFor = (level) =>
    Math.min(
      MODEL_LOD_RATIOS[level],
      budget.lodTriangles ? budget.lodTriangles[level] / Math.max(1, sourceTriangles) : 1,
    );
  const scene = gltf.listScenes()[0] ?? document.createScene('scene');
  const levelCount = Math.min(budget.maxLods, MODEL_LOD_RATIOS.length);
  const levels = [];

  const addLevel = (level, mesh, triangles, seamMerged, verticesRemoved) => {
    const node = document.createNode(`lod${level}`).setMesh(mesh);
    if (sourceNode) {
      node
        .setTranslation(sourceNode.getTranslation())
        .setRotation(sourceNode.getRotation())
        .setScale(sourceNode.getScale());
    }
    scene.addChild(node);
    levels.push({
      level,
      ratio: ratioFor(level),
      seamMerged,
      verticesRemoved,
      triangles,
    });
  };

  // Two derivation orders, chosen by whether the budget names absolute targets:
  //
  // - **Sequential (absolute targets, i.e. scanned trees).** The source is simplified in place to
  //   the LOD0 target, then each deeper level clones the *previous*, already-small level. With
  //   absolute targets there is no compounding error to avoid — every level aims at its own
  //   triangle count — and peak memory stays at one source mesh plus one small clone. Cloning the
  //   raw scan per level instead (4.2 M triangles, three clones) exceeded a 2 GB machine and got
  //   the build OOM-thrashed for twenty minutes.
  // - **Parallel clones (ratio targets, i.e. authored props).** Every level derives from the same
  //   unsimplified source, because a ratio chain (0.4 of 0.8 of the source) would compound the
  //   simplifier's error and lose the shape by LOD2.
  if (budget.lodTriangles) {
    for (const primitive of sourceMesh.listPrimitives()) {
      simplifyPrimitive(primitive, {
        simplifier: MeshoptSimplifier,
        ratio: ratioFor(0),
        error: MODEL_SIMPLIFY_ERROR,
      });
    }
    addLevel(0, sourceMesh, countMeshTriangles(sourceMesh), false, 0);
    for (let level = 1; level < levelCount; level += 1) {
      // Every deeper level derives from the settled LOD0 mesh (36k triangles at most), never from
      // the raw scan and never chained: at that size a clone is cheap, and deriving each level
      // from the same settled shape keeps their silhouettes concentric. Mesh order survives both
      // gltfpack and cloneDocument, so the variant index addresses the clone reliably — names do
      // not, because gltfpack's pre-decimation drops unnamed mesh names.
      const clone = cloneDocument(document);
      const cloneMesh = clone.getRoot().listMeshes()[variant.meshIndex] ?? sourceMesh;
      let seamVerticesRemoved = 0;
      const fromTriangles = Math.max(1, countMeshTriangles(cloneMesh));
      for (const primitive of cloneMesh.listPrimitives()) {
        seamVerticesRemoved += mergePositionSeams(primitive).removed;
        simplifyPrimitive(primitive, {
          simplifier: MeshoptSimplifier,
          ratio: Math.min(MODEL_LOD_RATIOS[level], budget.lodTriangles[level] / fromTriangles),
          error: MODEL_SIMPLIFY_ERROR,
        });
      }
      const mesh = document.createMesh(`lod${level}`);
      for (const primitive of cloneMesh.listPrimitives()) {
        mesh.addPrimitive(copyPrimitiveInto(primitive, document, materialFor(primitive)));
      }
      addLevel(level, mesh, countMeshTriangles(mesh), true, seamVerticesRemoved);
    }
    levels.sort((a, b) => a.level - b.level);
    sourceNode?.dispose();
    const sequential = await encodeKtx2(document, {
      quality: MODEL_TEXTURE.etc1sQuality,
      linearPattern: /arm|rough|occlusion|metal/i,
    });
    await document.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    return {
      document,
      levels,
      sourceTriangles,
      textures: sequential.textures,
    };
  }

  // Stages 2 and 3: deeper levels on deep clones, the closest level in place. The clones are taken
  // before anything is simplified so that every level derives from the same source geometry — an
  // LOD chain built by simplifying the previous level compounds its error and loses the shape.
  for (let level = 1; level < levelCount; level += 1) {
    const clone = cloneDocument(document);
    const cloneMesh = clone.getRoot().listMeshes()[0];
    let seamVerticesRemoved = 0;
    for (const primitive of cloneMesh.listPrimitives()) {
      seamVerticesRemoved += mergePositionSeams(primitive).removed;
      simplifyPrimitive(primitive, {
        simplifier: MeshoptSimplifier,
        ratio: ratioFor(level),
        error: MODEL_SIMPLIFY_ERROR,
      });
    }

    const mesh = document.createMesh(`lod${level}`);
    for (const primitive of cloneMesh.listPrimitives()) {
      // Each primitive keeps its own material: a scanned tree is bark, branches and foliage, and
      // collapsing them into the first primitive's material would paint the needles as bark.
      mesh.addPrimitive(copyPrimitiveInto(primitive, document, materialFor(primitive)));
    }
    addLevel(level, mesh, countMeshTriangles(mesh), true, seamVerticesRemoved);
    // The clone is unreferenced from here on; its geometry was copied into the output document.
  }

  for (const primitive of sourceMesh.listPrimitives()) {
    simplifyPrimitive(primitive, {
      simplifier: MeshoptSimplifier,
      ratio: ratioFor(0),
      error: MODEL_SIMPLIFY_ERROR,
    });
  }
  addLevel(0, sourceMesh, countMeshTriangles(sourceMesh), false, 0);
  levels.sort((a, b) => a.level - b.level);

  // The original node is replaced by the named level nodes above; leaving it would double the model.
  sourceNode?.dispose();

  // Stage 4: textures, once.
  const { textures } = await encodeKtx2(document, {
    quality: MODEL_TEXTURE.etc1sQuality,
    // Packed data maps rather than colour: occlusion/roughness/metalness. Normal maps are matched
    // separately inside the encoder, by the naming the archives actually use.
    linearPattern: /arm|rough|occlusion|metal/i,
  });

  // Stage 5: every level, in one pass.
  await document.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));

  return { document, levels, sourceTriangles, textures };
}

/**
 * Re-reads a written GLB and confirms the compression it was supposed to receive is actually in the
 * file.
 *
 * This exists because of a specific, silent failure mode: an extension the writer has not been
 * registered for is dropped from the output with nothing louder than a one-line warning, so a build
 * can "succeed" and produce geometry several times the size it promised. Checking the bytes on disk
 * is the only assertion that would have caught it.
 */
async function verifyOutput(io, path, levels, textures) {
  const buffer = await readFile(path);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const used = json.extensionsUsed ?? [];
  const missing = [
    'EXT_meshopt_compression',
    ...(textures > 0 ? ['KHR_texture_basisu'] : []),
  ].filter((name) => !used.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `${path} was written without ${missing.join(', ')} — the writer dropped an extension it was ` +
        'not registered for, and the geometry or textures are uncompressed.',
    );
  }
  const images = json.images ?? [];
  if (images.some((image) => image.mimeType !== 'image/ktx2')) {
    throw new Error(`${path} contains a non-KTX2 image, expected every texture to be transcodable`);
  }

  // Reading it back decodes every meshopt buffer and every KTX2 texture — which is what the runtime
  // loader will do — and lets the triangle counts be checked against what the pipeline believed it
  // built. Hashing the file only proves the bytes are stable; this proves they mean what we think.
  const reread = await io.read(path);
  const seen = new Map();
  for (const node of reread.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh) {
      seen.set(node.getName(), countMeshTriangles(mesh));
    }
  }
  for (const level of levels) {
    const actual = seen.get(`lod${level.level}`);
    if (actual === undefined) {
      throw new Error(`${path} has no node named "lod${level.level}"`);
    }
    if (actual !== level.triangles) {
      throw new Error(
        `${path}: lod${level.level} decodes to ${actual} triangles, expected ${level.triangles}`,
      );
    }
  }
  return { extensionsUsed: used, images: images.length, nodes: [...seen.keys()] };
}

/** Writes the manifest entry for a built model from what the run actually produced. */
function buildManifestEntry(entry, sources, levels, file, verification, notes) {
  return {
    id: entry.id,
    kind: 'model',
    name: entry.name,
    assetClass: entry.assetClass,
    source: {
      url: entry.sourceUrl,
      creator: entry.creator,
      licence: entry.licence,
      attribution: entry.attribution,
      retrieved: new Date().toISOString().slice(0, 10),
      pinnedUrl: entry.sources[0].url,
    },
    role: entry.role,
    pipeline: {
      resolution: String(MODEL_TEXTURE.maxSize),
      sourceBytes: sources.totalBytes,
      outputBytes: file.bytes,
      reductions: [
        'dedup + prune + weld',
        `simplify (ratios ${MODEL_LOD_RATIOS.slice(0, levels.length).join(', ')}; levels 1+ merge position seams first)`,
        'KHR_mesh_quantization',
        'EXT_meshopt_compression',
        'KHR_texture_basisu (KTX2, ETC1S)',
      ],
      /** One entry per level: the node the runtime switches to, and what it costs. */
      lods: levels.map((level) => ({
        level: level.level,
        node: `lod${level.level}`,
        triangles: level.triangles,
        ratio: level.ratio,
        seamMerged: level.seamMerged,
      })),
      notes,
    },
    /** Kept so the derivation can be audited and reproduced without the cache. */
    sourceFiles: sources.files.map((file) => ({
      path: file.path,
      url: file.url,
      bytes: file.bytes,
      md5: file.md5,
      sha256: file.sha256,
    })),
    /** A single file holds every level, so the texture set is stored and downloaded once. */
    files: [file],
    verification,
  };
}

async function main() {
  const entries = ONLY ? MODEL_ENTRIES.filter((entry) => entry.id === ONLY) : MODEL_ENTRIES;
  if (entries.length === 0) {
    throw new Error(`--only ${ONLY} matched no entry`);
  }

  const basisu = await basisuAvailable();
  if (!basisu.ok) {
    throw new Error(
      `the KTX2 encoder is unavailable (${basisu.reason}). Textures must be KTX2 — ` +
        'the runtime expects it — so this build refuses to produce a model without it.',
    );
  }
  console.log(`KTX2 encoder: ${basisu.version}`);

  // `ALL_EXTENSIONS`, not `KHRONOS_EXTENSIONS`. The latter omits vendor extensions, including
  // `EXT_meshopt_compression` — and an unregistered extension is not an error, it is a *warning*,
  // followed by the writer silently dropping the compressed buffers and emitting a file several
  // times the intended size. Everything downstream is then measured against a lie.
  //
  // Meshopt compression is deferred to write time, and the extension reaches for its encoder
  // through an I/O dependency rather than through the transform that configured it — so the encoder
  // has to be registered here, and the decoder alongside it so the result can be re-read and
  // verified. Without this, writing a compressed document throws an error naming a codec method
  // rather than a missing dependency.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const assets = [...manifest.assets];

  for (const entry of entries) {
    const budget = requireBudget(entry.assetClass);
    // One source entry may derive several runtime models: a scanned file that holds more than one
    // model (Poly Haven's fir ships three tree variants) declares them as `variants`, each with
    // the source mesh it derives from and the id/name suffix it publishes under.
    const variants = entry.variants ?? [{ meshIndex: 0, idSuffix: '', nameSuffix: '' }];
    const outputDirectory = join(PUBLIC_DIR, 'assets', 'models');
    const pathFor = (variantEntry) => {
      const slug = variantEntry.id.replace(/^model-/, '');
      return {
        outputPath: join(outputDirectory, `${slug}.glb`),
        relativePath: `assets/models/${slug}.glb`,
      };
    };
    const pending = variants
      .map((variant) => ({
        variant,
        variantEntry: {
          ...entry,
          id: entry.id + variant.idSuffix,
          name: entry.name + variant.nameSuffix,
        },
      }))
      .filter(({ variantEntry }) => FORCE || !existsSync(pathFor(variantEntry).outputPath));
    if (pending.length === 0) {
      console.log(`${entry.id}: up to date (use --force to rebuild)`);
      continue;
    }

    console.log(`${entry.id}: fetching pinned source …`);
    const sources = await fetchSources(entry);
    console.log(`  source: ${formatBytes(sources.totalBytes)} in ${sources.files.length} files`);

    for (const { variant, variantEntry } of pending) {
      const { outputPath, relativePath } = pathFor(variantEntry);
      const { document, levels, sourceTriangles, textures } = await derive(
        io,
        sources,
        variantEntry,
        budget,
        variant,
      );
      await mkdir(outputDirectory, { recursive: true });
      await io.write(outputPath, document);

      const info = await stat(outputPath);
      const file = {
        slot: 'model',
        path: relativePath,
        bytes: info.size,
        sha256: sha256(await readFile(outputPath)),
        format: 'glb',
        triangles: levels[0].triangles,
        textures,
      };

      for (const level of levels) {
        console.log(
          `  lod${level.level}: ${level.triangles.toLocaleString('en-US')} tris ` +
            `(${Math.round((level.triangles / Math.max(1, sourceTriangles)) * 100)}% of source)` +
            (level.seamMerged
              ? `, ${level.verticesRemoved.toLocaleString('en-US')} duplicate vertices merged`
              : ''),
        );
      }
      const reductionPercent = (1 - info.size / sources.totalBytes) * 100;
      console.log(
        `  file: ${formatBytes(info.size)}, ${textures} KTX2 texture${textures === 1 ? '' : 's'} ` +
          `— from ${formatBytes(sources.totalBytes)} of source (${reductionPercent.toFixed(1)}% smaller)`,
      );

      // Budgets are a gate, not a report: an asset that exceeds one does not get committed.
      const problems = [];
      if (levels[0].triangles > budget.maxTriangles) {
        problems.push(
          `lod0 has ${levels[0].triangles} triangles, budget is ${budget.maxTriangles}`,
        );
      }
      if (info.size > budget.maxBytes) {
        problems.push(
          `file is ${formatBytes(info.size)}, budget is ${formatBytes(budget.maxBytes)}`,
        );
      }
      if (levels.length < budget.minLods) {
        problems.push(`${levels.length} level(s) of detail, minimum is ${budget.minLods}`);
      }
      for (const [index, level] of levels.slice(1).entries()) {
        if (level.triangles >= levels[index].triangles) {
          problems.push(
            `lod${level.level} has ${level.triangles} triangles, not fewer than lod${levels[index].level}'s ${levels[index].triangles}`,
          );
        }
      }
      if (problems.length > 0) {
        throw new Error(
          `${variantEntry.id} exceeds its budget:\n    - ${problems.join('\n    - ')}`,
        );
      }

      const verification = await verifyOutput(io, outputPath, levels, textures);
      console.log(`  verified: decodes to ${verification.nodes.join(', ')}`);

      const manifestEntry = buildManifestEntry(
        variantEntry,
        sources,
        levels,
        file,
        verification,
        [
          `${levels.length} levels of detail share one texture set in one file; the runtime picks a`,
          'level by distance, so the closest keeps its full detail and the farthest costs a fraction of',
          'it. Textures are KTX2 (Basis ETC1S), transcoded on the GPU to BC7/ASTC/ETC2 so the browser',
          'never holds a decoded 1K RGBA image per texture, and colour-space aware — albedo is sRGB,',
          'normal and packed maps are linear.',
        ].join(' '),
      );
      const existing = assets.findIndex((candidate) => candidate.id === manifestEntry.id);
      if (existing >= 0) {
        assets[existing] = manifestEntry;
      } else {
        assets.push(manifestEntry);
      }
    }
  }

  assets.sort((a, b) => a.id.localeCompare(b.id));
  manifest.assets = assets;
  manifest.updated = new Date().toISOString().slice(0, 10);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest written: ${assets.length} assets`);

  // The licence register is derived from the manifest, so it is regenerated here rather than edited.
  const { spawnSync } = await import('node:child_process');
  const credits = spawnSync(process.execPath, ['scripts/fetch-assets.mjs', '--credits'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (credits.status !== 0) {
    throw new Error('CREDITS.md regeneration failed');
  }
}

await main().catch((error) => {
  console.error(`model build failed: ${error.message}`, error.stack);
  process.exit(1);
});
