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
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
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
const CACHE_DIR = join(ROOT, '.asset-cache', 'models');
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
];

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const md5 = (buffer) => createHash('md5').update(buffer).digest('hex');

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'endless-driver-asset-pipeline' } });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}) for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Fetches one entry's sources into the cache, verifying every file against its pinned MD5. */
async function fetchSources(entry) {
  const directory = join(CACHE_DIR, entry.id);
  await mkdir(join(directory, 'textures'), { recursive: true });
  const fetched = [];

  for (const source of entry.sources) {
    const target = join(directory, source.path);
    let buffer;
    if (FORCE || !existsSync(target)) {
      buffer = await download(source.url);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buffer);
    } else {
      buffer = await readFile(target);
    }
    const digest = md5(buffer);
    if (digest !== source.md5) {
      throw new Error(
        `${entry.id}: ${source.path} is ${digest}, expected ${source.md5}. ` +
          'The pinned source changed; review it before updating the pin.',
      );
    }
    if (buffer.byteLength !== source.bytes) {
      throw new Error(
        `${entry.id}: ${source.path} is ${buffer.byteLength} bytes, expected ${source.bytes}`,
      );
    }
    fetched.push({ ...source, sha256: sha256(buffer) });
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
async function derive(io, sources, entry, budget) {
  const root = entry.sources.find((source) => source.path.endsWith('.gltf'));
  const document = await io.read(join(sources.directory, root.path));

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

  const gltf = document.getRoot();
  const sourceMesh = gltf.listMeshes()[0];
  const sourceNode = gltf.listNodes().find((node) => node.getMesh() === sourceMesh) ?? null;
  const material = sourceMesh.listPrimitives()[0]?.getMaterial() ?? null;
  const scene = gltf.listScenes()[0] ?? document.createScene('scene');
  const sourceTriangles = countMeshTriangles(sourceMesh);
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
      ratio: MODEL_LOD_RATIOS[level],
      seamMerged,
      verticesRemoved,
      triangles,
    });
  };

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
        ratio: MODEL_LOD_RATIOS[level],
        error: MODEL_SIMPLIFY_ERROR,
      });
    }

    const mesh = document.createMesh(`lod${level}`);
    for (const primitive of cloneMesh.listPrimitives()) {
      mesh.addPrimitive(copyPrimitiveInto(primitive, document, material));
    }
    addLevel(level, mesh, countMeshTriangles(mesh), true, seamVerticesRemoved);
    // The clone is unreferenced from here on; its geometry was copied into the output document.
  }

  for (const primitive of sourceMesh.listPrimitives()) {
    simplifyPrimitive(primitive, {
      simplifier: MeshoptSimplifier,
      ratio: MODEL_LOD_RATIOS[0],
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
    const slug = entry.id.replace(/^model-/, '');
    const outputDirectory = join(PUBLIC_DIR, 'assets', 'models');
    const outputPath = join(outputDirectory, `${slug}.glb`);
    const relativePath = `assets/models/${slug}.glb`;

    if (!FORCE && existsSync(outputPath)) {
      console.log(`${entry.id}: up to date (use --force to rebuild)`);
      continue;
    }

    console.log(`${entry.id}: fetching pinned source …`);
    const sources = await fetchSources(entry);
    console.log(`  source: ${formatBytes(sources.totalBytes)} in ${sources.files.length} files`);

    const { document, levels, sourceTriangles, textures } = await derive(
      io,
      sources,
      entry,
      budget,
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
      problems.push(`lod0 has ${levels[0].triangles} triangles, budget is ${budget.maxTriangles}`);
    }
    if (info.size > budget.maxBytes) {
      problems.push(`file is ${formatBytes(info.size)}, budget is ${formatBytes(budget.maxBytes)}`);
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
      throw new Error(`${entry.id} exceeds its budget:\n  - ${problems.join('\n  - ')}`);
    }

    const verification = await verifyOutput(io, outputPath, levels, textures);
    console.log(`  verified: decodes to ${verification.nodes.join(', ')}`);

    const manifestEntry = buildManifestEntry(
      entry,
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
  console.error(`model build failed: ${error.message}`);
  process.exit(1);
});
