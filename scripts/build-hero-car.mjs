#!/usr/bin/env node
/**
 * Reproducible FBX → aligned, optimized GLB pipeline for the selected player hero car.
 *
 * Usage:
 *   npm run assets:hero -- --archive /path/to/hero-car-candidate-neutral-screen.zip
 *
 * The user-supplied archive is not committed. Its SHA-256, the FBX hash, the neutral screen hash,
 * Blender 4.3.2, the exact vehicle wheel measurements, texture processing, LOD ratios, encoders, and
 * verification results are pinned/recorded. Blender handles FBX import, world-transform baking,
 * game-axis alignment, preserved wheel/steering pivots, and per-mesh LOD simplification; the existing
 * glTF-Transform/Basis pipeline handles KTX2 and meshopt. The generated GLB is committed, not the
 * 80 MB source archive or the transient conversion cache.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { formatBytes, requireBudget } from './asset-budgets.mjs';
import { encodeKtx2, basisuAvailable } from './lib/ktx2.mjs';
import { countMeshTriangles } from './lib/geometry.mjs';
import { HERO_CAR, HERO_WHEELS } from './hero-car/constants.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON_SCRIPT = join(ROOT, 'scripts', 'hero-car', 'fbx_to_glb.py');
const WHEEL_CONFIG_PATH = join(ROOT, 'src', 'config', 'vehicle-wheels.json');
const MANIFEST_PATH = join(ROOT, 'public', 'assets', 'manifest.json');
const OUTPUT_PATH = join(ROOT, 'public', HERO_CAR.modelPath);
const CACHE_ROOT = process.env.ED_HERO_CAR_CACHE
  ? resolve(process.env.ED_HERO_CAR_CACHE)
  : join(ROOT, '.asset-cache', 'hero-car');
const MAX_TEXTURE_SIZE = HERO_CAR.maxTextureSize;

function usage() {
  console.log(
    'Usage: node scripts/build-hero-car.mjs --archive <pinned-user-supplied-zip>\n' +
      `Expected SHA-256: ${HERO_CAR.archiveSha256}`,
  );
}

function parseArguments() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    usage();
    process.exit(0);
  }
  const index = args.indexOf('--archive');
  const archive = index >= 0 ? args[index + 1] : process.env.HERO_CAR_ARCHIVE;
  if (!archive) {
    usage();
    throw new Error(
      'the original user-supplied archive is required; no network fetch is attempted',
    );
  }
  return resolve(archive);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status ?? result.signal}):\n${(result.stderr || result.stdout || '').trim().slice(-8000)}`,
    );
  }
  return result.stdout ?? '';
}

async function sha256File(path) {
  const digest = createHash('sha256');
  const buffer = await readFile(path);
  digest.update(buffer);
  return digest.digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyArchive(archivePath) {
  const info = await stat(archivePath);
  assert(info.isFile(), `source archive is not a file: ${archivePath}`);
  assert(
    info.size === HERO_CAR.archiveBytes,
    `source archive is ${info.size} bytes; expected ${HERO_CAR.archiveBytes}`,
  );
  const digest = await sha256File(archivePath);
  assert(
    digest === HERO_CAR.archiveSha256,
    `source archive SHA-256 ${digest} does not match the selected archive ${HERO_CAR.archiveSha256}`,
  );
  run('unzip', ['-tq', archivePath]);
  const entries = run('unzip', ['-Z1', archivePath]).split(/\r?\n/).filter(Boolean);
  assert(entries.length === 23, `archive contains ${entries.length} entries; expected 23`);
  for (const entry of entries) {
    assert(
      !entry.startsWith('/') && !entry.split('/').includes('..'),
      `unsafe archive path: ${entry}`,
    );
  }
  for (const required of [HERO_CAR.fbxPath, HERO_CAR.mediaPath, 'ATTRIBUTION.txt']) {
    assert(entries.includes(required), `source archive is missing ${required}`);
  }
  return { bytes: info.size, sha256: digest, entries };
}

async function extractArchive(archivePath) {
  const extractDir = join(CACHE_ROOT, 'source');
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  const fbx = join(extractDir, HERO_CAR.fbxPath);
  const media = join(extractDir, HERO_CAR.mediaPath);
  run('unzip', ['-qq', archivePath, '-d', extractDir]);
  const attribution = await readFile(join(extractDir, 'ATTRIBUTION.txt'), 'utf8');
  for (const required of [
    HERO_CAR.creator,
    HERO_CAR.archiveLicenceText,
    HERO_CAR.licenceUrl,
    HERO_CAR.sourceUrl,
  ]) {
    assert(attribution.includes(required), `archive attribution does not contain ${required}`);
  }
  assert(
    attribution.includes('textures/media.png') && attribution.toLowerCase().includes('neutral'),
    'archive attribution does not document the sanitized dashboard screen',
  );
  const fbxDigest = await sha256File(fbx);
  assert(fbxDigest === HERO_CAR.fbxSha256, `extracted FBX hash mismatch: ${fbxDigest}`);
  const mediaDigest = await sha256File(media);
  assert(mediaDigest === HERO_CAR.mediaSha256, `sanitized media hash mismatch: ${mediaDigest}`);
  return {
    extractDir,
    fbx,
    media,
    fbxBytes: (await stat(fbx)).size,
    mediaBytes: (await stat(media)).size,
  };
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function preprocessTextures(sourceDir, outputDir) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const files = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  assert(files.length > 0, 'the archive contains no supported image textures');

  const textures = [];
  const outputNames = new Set();
  for (const sourceName of files) {
    const sourcePath = join(sourceDir, sourceName);
    const directXNormal = /_Normal_DirectX\.(png|jpe?g)$/i.test(sourceName);
    const outputStem = basename(sourceName, extname(sourceName)).replace(
      /_Normal_DirectX$/i,
      '_Normal_OpenGL',
    );
    const outputName = `${outputStem}.png`;
    assert(!outputNames.has(outputName), `two source images would produce ${outputName}`);
    outputNames.add(outputName);

    const metadata = await sharp(sourcePath, { failOn: 'error', sequentialRead: true }).metadata();
    assert(metadata.width && metadata.height, `texture has no dimensions: ${sourceName}`);
    const image = sharp(sourcePath, { failOn: 'error', sequentialRead: true });
    const scale = Math.min(
      1,
      MAX_TEXTURE_SIZE / metadata.width,
      MAX_TEXTURE_SIZE / metadata.height,
    );
    const resized = scale < 1;
    const { data: sourcePixels, info } = await image
      .resize({
        width: Math.min(MAX_TEXTURE_SIZE, metadata.width),
        height: Math.min(MAX_TEXTURE_SIZE, metadata.height),
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
      })
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
    let pixels = sourcePixels;
    let channels = info.channels;
    if (channels === 1 || channels === 2) {
      const sourceChannels = channels;
      channels = sourceChannels === 1 ? 3 : 4;
      pixels = Buffer.alloc(info.width * info.height * channels);
      for (
        let sourceOffset = 0, targetOffset = 0;
        sourceOffset < sourcePixels.length;
        sourceOffset += sourceChannels, targetOffset += channels
      ) {
        const gray = sourcePixels[sourceOffset] ?? 0;
        pixels[targetOffset] = gray;
        pixels[targetOffset + 1] = gray;
        pixels[targetOffset + 2] = gray;
        if (channels === 4) pixels[targetOffset + 3] = sourcePixels[sourceOffset + 1] ?? 255;
      }
    }
    assert(channels >= 3, `${sourceName} has unsupported channel count ${channels}`);
    if (directXNormal) {
      for (let offset = 0; offset < pixels.length; offset += channels) {
        pixels[offset + 1] = 255 - (pixels[offset + 1] ?? 0);
      }
    }
    await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toFile(join(outputDir, outputName));

    textures.push({
      source: sourceName,
      output: outputName,
      width: info.width,
      height: info.height,
      resized,
      directXNormalGreenFlipped: directXNormal,
      sourceSha256: await sha256File(sourcePath),
    });
  }

  const media = textures.find((texture) => texture.source === 'media.png');
  assert(media, 'neutral media.png was not included in the texture set');
  const mapping = { textures, mediaSource: media.source, mediaOutput: media.output };
  const mapPath = join(CACHE_ROOT, 'texture-map.json');
  await writeFile(mapPath, `${JSON.stringify(mapping, null, 2)}\n`);
  return { mapping, mapPath };
}

function verifyBlenderVersion(blender) {
  const output = run(blender, ['--version']);
  const version = /Blender ([\d.]+)/.exec(output)?.[1];
  assert(
    version === HERO_CAR.blenderVersion,
    `Blender ${HERO_CAR.blenderVersion} is pinned for reproducibility; found ${version ?? 'unknown'}`,
  );
  return version;
}

function validateBlenderReport(report, wheelConfig, textureMapping) {
  assert(report.blenderVersion === HERO_CAR.blenderVersion, 'Blender report version mismatch');
  assert(report.source.fbxSha256 === HERO_CAR.fbxSha256, 'Blender imported a different FBX');
  assert(
    report.source.meshObjects === 84 && report.source.triangles === 114070,
    'Blender source geometry does not match the pinned FBX',
  );
  assert(
    report.neutralMedia.sourceSha256 === HERO_CAR.mediaSha256,
    'neutral dashboard texture hash mismatch',
  );
  assert(report.neutralMedia.material === 'media', 'neutral dashboard material binding changed');
  assert(report.lods.length === 3, `expected 3 LODs; received ${report.lods.length}`);
  assert(
    report.lods[0].triangles <= requireBudget(HERO_CAR.budgetClass).maxTriangles,
    'LOD0 exceeds hero triangle budget',
  );
  assert(report.lods[0].triangles > report.lods[1].triangles, 'LOD1 must be cheaper than LOD0');
  assert(report.lods[1].triangles > report.lods[2].triangles, 'LOD2 must be cheaper than LOD1');
  assert(
    report.transform.bounds.size.every((value) => Number.isFinite(value) && value > 0),
    'target bounds are invalid',
  );
  assert(
    report.transform.scale.x > 0 && report.transform.scale.length > 0,
    'model transform scales are invalid',
  );
  assert(report.transform.scale.verticalAndWheelRadius > 0, 'model vertical scale is invalid');

  const tolerance = 0.012;
  const expectedZ = { front: wheelConfig.frontZ, rear: wheelConfig.rearZ };
  for (const wheel of HERO_WHEELS) {
    const measured = report.wheelPivots[wheel.key];
    assert(measured, `Blender report is missing the ${wheel.key} pivot`);
    const targetX = wheel.side === 'left' ? -wheelConfig.halfTrack : wheelConfig.halfTrack;
    assert(
      Math.abs(measured.target[0] - targetX) <= tolerance,
      `${wheel.key} target half-track is misaligned`,
    );
    assert(
      Math.abs(measured.target[1] - (wheelConfig.anchorY - wheelConfig.restLength)) <= tolerance,
      `${wheel.key} rest height is misaligned`,
    );
    assert(
      Math.abs(measured.target[2] - expectedZ[wheel.axle]) <= tolerance,
      `${wheel.key} axle is misaligned`,
    );
  }
  assert(
    textureMapping.textures.every(
      (texture) => texture.width <= MAX_TEXTURE_SIZE && texture.height <= MAX_TEXTURE_SIZE,
    ),
    `at least one processed texture exceeds ${MAX_TEXTURE_SIZE}px`,
  );
}

function countTreeTriangles(node) {
  let total = 0;
  const mesh = node.getMesh();
  if (mesh) total += countMeshTriangles(mesh);
  for (const child of node.listChildren()) total += countTreeTriangles(child);
  return total;
}

function findNode(root, name) {
  return root.listNodes().find((node) => node.getName() === name) ?? null;
}

function subtreeNodes(root) {
  const found = [root];
  for (let index = 0; index < found.length; index += 1) {
    found.push(...found[index].listChildren());
  }
  return found;
}

function validateHierarchy(document, report, wheelConfig) {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const byName = new Map(nodes.map((node) => [node.getName(), node]));
  const lods = [];
  const wheelPivots = {};
  const steeringPivots = [];
  for (const level of report.lods) {
    const lod = byName.get(level.node);
    assert(lod, `GLB is missing LOD root ${level.node}`);
    const actualTriangles = countTreeTriangles(lod);
    assert(
      actualTriangles === level.triangles,
      `${level.node} decodes to ${actualTriangles} triangles, expected ${level.triangles}`,
    );
    lods.push({
      level: level.level,
      node: level.node,
      triangles: actualTriangles,
      ratio: level.ratio,
    });

    const suffix = `-lod${level.level}`;
    for (const wheel of HERO_WHEELS) {
      const nodeName = `wheel-${wheel.key}${suffix}`;
      const pivot = byName.get(nodeName);
      assert(pivot, `GLB is missing wheel pivot ${nodeName}`);
      assert(pivot.getMesh() === null, `${nodeName} must remain a hierarchy pivot, not a mesh`);
      assert(subtreeNodes(lod).includes(pivot), `${nodeName} is not inside ${level.node}`);
      const expected = [
        wheel.side === 'left' ? -wheelConfig.halfTrack : wheelConfig.halfTrack,
        wheelConfig.anchorY - wheelConfig.restLength,
        wheel.axle === 'front' ? wheelConfig.frontZ : wheelConfig.rearZ,
      ];
      const actual = pivot.getTranslation();
      assert(
        actual.every((value, index) => Math.abs(value - expected[index]) <= 0.012),
        `${nodeName} translation changed in the GLB`,
      );
      const spinner = byName.get(`wheel-spinner-${wheel.key}${suffix}`);
      assert(
        spinner && pivot.listChildren().includes(spinner),
        `${nodeName} lost its child spinner`,
      );
      wheelPivots[wheel.key] ??= {};
      wheelPivots[wheel.key][String(level.level)] = nodeName;
    }
    const steeringName = `steering-wheel-pivot${suffix}`;
    const steering = byName.get(steeringName);
    assert(
      steering && subtreeNodes(lod).includes(steering),
      `GLB is missing steering pivot ${steeringName}`,
    );
    steeringPivots.push(steeringName);
  }
  return { lods, wheelPivots, steeringPivots, nodeNames: nodes.map((node) => node.getName()) };
}

function parseGlbJson(buffer) {
  assert(buffer.subarray(0, 4).toString('ascii') === 'glTF', 'output is not a GLB');
  assert(buffer.subarray(16, 20).toString('ascii') === 'JSON', 'GLB has no JSON chunk');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

async function optimizeAndVerify(rawGlbPath, outputTemp, blenderReport, wheelConfig) {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
    .setVertexLayout(VertexLayout.SEPARATE);
  const document = await io.read(rawGlbPath);
  const before = validateHierarchy(document, blenderReport, wheelConfig);
  const lod0Node = findNode(document.getRoot(), 'lod0');
  assert(
    lod0Node && countTreeTriangles(lod0Node) === blenderReport.lods[0].triangles,
    'LOD0 triangle count changed during import',
  );

  await document.transform(dedup(), prune());
  const { textures } = await encodeKtx2(document, {
    quality: 170,
    linearPattern: /rough|metal|occlusion|arm/i,
    normalPattern: /norm|nor_gl|nor_dx/i,
  });
  assert(textures > 0, 'hero model exported without any textures');
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await mkdir(dirname(outputTemp), { recursive: true });
  await io.write(outputTemp, document);

  const buffer = await readFile(outputTemp);
  const json = parseGlbJson(buffer);
  const used = json.extensionsUsed ?? [];
  for (const extension of ['EXT_meshopt_compression', 'KHR_texture_basisu']) {
    assert(used.includes(extension), `optimized GLB is missing ${extension}`);
  }
  assert((json.images ?? []).length > 0, 'optimized GLB has no texture images');
  assert(
    (json.images ?? []).every((image) => image.mimeType === 'image/ktx2'),
    'optimized GLB contains a non-KTX2 texture',
  );
  const mediaNames = (json.images ?? [])
    .map((image) => image.name ?? '')
    .filter((name) => /media/i.test(name));
  assert(mediaNames.length > 0, 'the neutral media texture did not survive GLB export');
  for (const node of json.nodes ?? []) {
    for (const key of ['translation', 'scale']) {
      const value = node[key];
      if (value !== undefined) {
        assert(
          Array.isArray(value) && value.every(Number.isFinite),
          `${node.name} has an invalid ${key}`,
        );
      }
    }
  }

  const reread = await io.read(outputTemp);
  const after = validateHierarchy(reread, blenderReport, wheelConfig);
  const budget = requireBudget(HERO_CAR.budgetClass);
  const info = await stat(outputTemp);
  assert(
    info.size <= budget.maxBytes,
    `hero GLB is ${formatBytes(info.size)}, above ${formatBytes(budget.maxBytes)}`,
  );
  assert(
    after.lods.length >= budget.minLods && after.lods.length <= budget.maxLods,
    'hero LOD count is outside its budget',
  );
  assert(after.lods[0].triangles <= budget.maxTriangles, 'hero LOD0 exceeds its triangle budget');

  return {
    bytes: info.size,
    sha256: sha256(buffer),
    textures,
    extensionsUsed: used,
    images: json.images.length,
    mediaNames,
    hierarchy: after,
    before,
  };
}

function buildManifestEntry({ archive, extracted, report, built }) {
  const sourceFiles = [
    {
      path: HERO_CAR.archiveName,
      provenance: 'user-supplied sanitized archive',
      bytes: archive.bytes,
      sha256: archive.sha256,
    },
    {
      path: HERO_CAR.fbxPath,
      bytes: extracted.fbxBytes,
      sha256: HERO_CAR.fbxSha256,
    },
    {
      path: HERO_CAR.mediaPath,
      bytes: extracted.mediaBytes,
      sha256: HERO_CAR.mediaSha256,
      note: 'Neutral dashboard media texture retained from the supplied sanitized archive.',
    },
  ];
  const file = {
    slot: 'model',
    path: HERO_CAR.modelPath,
    bytes: built.bytes,
    sha256: built.sha256,
    format: 'glb',
    triangles: report.lods[0].triangles,
    textures: built.textures,
  };
  const attribution = HERO_CAR.attribution;
  return {
    id: HERO_CAR.id,
    kind: 'model',
    name: HERO_CAR.name,
    assetClass: HERO_CAR.budgetClass,
    source: {
      url: HERO_CAR.sourceUrl,
      creator: HERO_CAR.creator,
      licence: HERO_CAR.licence,
      licenceUrl: HERO_CAR.licenceUrl,
      attribution,
      retrieved: HERO_CAR.retrievalDate,
      pinnedUrl: HERO_CAR.sourceUrl,
      archiveSha256: archive.sha256,
    },
    role: 'Player hero car: realistic, unbranded sport coupé appearance; loaded asynchronously with the authored roadster retained as a fail-soft fallback.',
    pipeline: {
      resolution: String(MAX_TEXTURE_SIZE),
      sourceBytes: archive.bytes,
      outputBytes: built.bytes,
      reductions: [
        `Blender ${HERO_CAR.blenderVersion} FBX import and transform bake`,
        'Convert source +Y-forward/+Z-up to game +Y-up/-Z-forward; align all four wheel centres to VEHICLE_CONFIG',
        'Preserve separate four wheel pivots and steering-wheel pivot; omit the unused unskinned 92-bone source armature',
        'Three full hierarchy LODs; Blender Decimate ratios 1.0, 0.45, 0.15',
        `Texture resize cap ${MAX_TEXTURE_SIZE}px; DirectX normal-map green channel flipped to OpenGL convention`,
        'EXT_meshopt_compression (high)',
        'KHR_texture_basisu (KTX2, Basis ETC1S, quality 170)',
      ],
      lods: built.hierarchy.lods.map((level) => ({
        level: level.level,
        node: level.node,
        triangles: level.triangles,
        ratio: level.ratio,
      })),
      notes:
        'The source is a multi-mesh vehicle with a separate, unskinned 92-bone rig. Mesh world transforms are baked, while steering and wheel pivots remain explicit nodes. Wheels are aligned to the same JSON measurements consumed by src/config/vehicle.ts. textures/media.png from the supplied archive is hash-verified and remains the media material base-color texture; DirectX-suffixed normal maps are converted to OpenGL tangent-space convention. Design identity remains subject to the documented visual review gate.',
    },
    sourceFiles,
    files: [file],
    verification: {
      extensionsUsed: built.extensionsUsed,
      images: built.images,
      nodes: built.hierarchy.nodeNames,
      wheelPivots: built.hierarchy.wheelPivots,
      steeringPivots: built.hierarchy.steeringPivots,
      neutralMedia: {
        sourcePath: HERO_CAR.mediaPath,
        sourceSha256: HERO_CAR.mediaSha256,
        material: report.neutralMedia.material,
        glbImageNames: built.mediaNames,
      },
      blenderVersion: report.blenderVersion,
      sourceFbxSha256: HERO_CAR.fbxSha256,
      targetBoundsMeters: report.transform.bounds,
      wheelAlignment: report.wheelPivots,
      textureProcessing: report.textures,
    },
  };
}

async function main() {
  const archivePath = parseArguments();
  const archive = await verifyArchive(archivePath);
  console.log(
    `Source archive verified: ${formatBytes(archive.bytes)} · ${archive.sha256.slice(0, 12)}`,
  );
  const blender = process.env.BLENDER_BIN ?? 'blender';
  const blenderVersion = verifyBlenderVersion(blender);
  const basisu = await basisuAvailable();
  assert(basisu.ok, `Basis Universal encoder is unavailable: ${basisu.reason}`);
  console.log(`Pipeline tools: Blender ${blenderVersion}; ${basisu.version}`);

  const extracted = await extractArchive(archivePath);
  const sourceTextureDir = join(extracted.extractDir, 'textures');
  const processedTextureDir = join(CACHE_ROOT, 'processed-textures');
  const { mapping: textureMapping, mapPath } = await preprocessTextures(
    sourceTextureDir,
    processedTextureDir,
  );
  const wheelConfig = JSON.parse(await readFile(WHEEL_CONFIG_PATH, 'utf8'));
  const rawGlb = join(CACHE_ROOT, 'hero-car-blender.glb');
  const reportPath = join(CACHE_ROOT, 'conversion-report.json');
  const finalTemp = join(CACHE_ROOT, 'hero-car-optimized.glb');
  await rm(rawGlb, { force: true });
  await rm(finalTemp, { force: true });

  run(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python',
      PYTHON_SCRIPT,
      '--',
      '--input',
      extracted.fbx,
      '--textures',
      processedTextureDir,
      '--texture-map',
      mapPath,
      '--output',
      rawGlb,
      '--report',
      reportPath,
      '--wheel-config',
      WHEEL_CONFIG_PATH,
    ],
    { stdio: 'inherit' },
  );
  assert(await pathExists(rawGlb), 'Blender did not write its intermediate GLB');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  validateBlenderReport(report, wheelConfig, textureMapping);
  console.log(
    `Blender LODs: ${report.lods.map((level) => `lod${level.level} ${level.triangles.toLocaleString()} tris`).join(' · ')}`,
  );

  const built = await optimizeAndVerify(rawGlb, finalTemp, report, wheelConfig);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await copyFile(finalTemp, OUTPUT_PATH);

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const assets = [...manifest.assets];
  const entry = buildManifestEntry({ archive, extracted, report, built });
  const existing = assets.findIndex((asset) => asset.id === HERO_CAR.id);
  if (existing >= 0) assets[existing] = entry;
  else assets.push(entry);
  assets.sort((a, b) => a.id.localeCompare(b.id));
  manifest.assets = assets;
  manifest.updated = new Date().toISOString().slice(0, 10);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const credits = spawnSync(process.execPath, ['scripts/fetch-assets.mjs', '--credits'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (credits.error || credits.status !== 0) {
    throw credits.error ?? new Error('CREDITS.md regeneration failed');
  }

  console.log(`Built ${HERO_CAR.id}: ${formatBytes(built.bytes)}, ${built.textures} KTX2 textures`);
  console.log(
    `LOD triangles: ${built.hierarchy.lods.map((level) => level.triangles.toLocaleString()).join(' → ')}`,
  );
  console.log(`SHA-256: ${built.sha256}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`hero-car build failed: ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
