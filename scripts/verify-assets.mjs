#!/usr/bin/env node
/**
 * Offline verification of the committed asset set (CI gate).
 *
 * Checks, without ever touching the network:
 *  1. the manifest parses and every entry has the licence metadata the policy requires;
 *  2. every file the manifest describes exists in the repository;
 *  3. every file's SHA-256 and byte size match the manifest;
 *  4. the licence is one the policy allows (CC0 or an explicitly credited CC-BY);
 *  5. `CREDITS.md` lists every asset, so the register cannot drift from what ships;
 *  6. derived models still carry the compression the manifest claims, and still fit their budget.
 *
 * Check 6 is the one that would otherwise pass silently. A model's size and hash can be perfectly
 * consistent while the *contents* have regressed — a writer registered for the wrong extensions
 * drops meshopt buffers and emits a file several times the intended size, and the manifest is
 * regenerated from that file so the hashes agree with a mistake. Reading the GLB's own header
 * catches it without decoding anything and without touching the network.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes, requireBudget } from './asset-budgets.mjs';
import { HERO_CAR, HERO_WHEELS } from './hero-car/constants.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const MANIFEST_PATH = join(PUBLIC_DIR, 'assets', 'manifest.json');
const CREDITS_PATH = join(ROOT, 'CREDITS.md');

/**
 * Licences the policy allows.
 *
 * `Project-Generated` is not a licence anyone granted us — it marks content this repository authored
 * (the look LUT), which has no third-party rights to clear and no attribution to carry. Naming it
 * explicitly keeps it from being silently lumped in with the CC0 assets, where a reader would assume
 * a creator who does not exist.
 */
const ALLOWED_LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'Project-Generated']);
const REQUIRED_SOURCE_FIELDS = ['url', 'creator', 'licence', 'retrieved', 'pinnedUrl'];
const problems = [];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function require_(condition, message) {
  if (!condition) {
    problems.push(message);
  }
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const credits = await readFile(CREDITS_PATH, 'utf8');

require_(manifest.schemaVersion >= 1, 'manifest.schemaVersion must be >= 1');
require_(Array.isArray(manifest.assets), 'manifest.assets must be an array');
require_(manifest.assets.length > 0, 'manifest must describe at least one asset');

const seen = new Set();
for (const asset of manifest.assets) {
  const label = asset.id ?? '<missing id>';
  require_(typeof asset.id === 'string' && asset.id.length > 0, 'asset id is required');
  require_(!seen.has(asset.id), `duplicate asset id: ${label}`);
  seen.add(asset.id);

  for (const field of REQUIRED_SOURCE_FIELDS) {
    require_(
      typeof asset.source?.[field] === 'string' && asset.source[field].length > 0,
      `${label}: source.${field} is required`,
    );
  }
  require_(
    ALLOWED_LICENCES.has(asset.source?.licence),
    `${label}: licence ${asset.source?.licence} is not allowed by docs/ASSET_POLICY.md`,
  );
  if (asset.source?.licence?.startsWith('CC-BY')) {
    require_(
      typeof asset.source.attribution === 'string' && asset.source.attribution.length > 0,
      `${label}: CC-BY assets must carry an attribution string`,
    );
    require_(
      typeof asset.source.licenceUrl === 'string' && asset.source.licenceUrl.startsWith('https://'),
      `${label}: CC-BY assets must carry a canonical licence URL`,
    );
  }
  require_(
    Array.isArray(asset.files) && asset.files.length > 0,
    `${label}: at least one file is required`,
  );

  for (const file of asset.files ?? []) {
    const absolute = join(PUBLIC_DIR, file.path);
    let info;
    try {
      info = await stat(absolute);
    } catch {
      problems.push(`${label}: missing file ${file.path}`);
      continue;
    }
    require_(info.isFile(), `${label}: ${file.path} is not a regular file`);
    require_(
      info.size === file.bytes,
      `${label}: ${file.path} size ${info.size} != manifest ${file.bytes}`,
    );
    const digest = sha256(await readFile(absolute));
    require_(
      digest === file.sha256,
      `${label}: ${file.path} sha256 ${digest.slice(0, 12)} != manifest ${String(file.sha256).slice(0, 12)}`,
    );
  }

  require_(
    credits.includes(asset.source.url),
    `${label}: CREDITS.md does not reference ${asset.source.url}`,
  );
  if (asset.source?.licence?.startsWith('CC-BY')) {
    require_(
      credits.includes(asset.source.attribution),
      `${label}: CREDITS.md does not include the exact required attribution`,
    );
  }

  if (asset.id === HERO_CAR.id) {
    await verifyHeroRecord(label, asset);
  }
  if (asset.kind === 'model') {
    await verifyModel(label, asset);
  }
  if (asset.kind === 'lut') {
    await verifyLut(label, asset);
  }
}

function verifyHeroRecord(label, asset) {
  require_(asset.kind === 'model', `${label}: the player hero must be a model asset`);
  require_(asset.assetClass === HERO_CAR.budgetClass, `${label}: hero budget class is incorrect`);
  require_(
    asset.source?.creator === HERO_CAR.creator,
    `${label}: hero creator does not match the selected source`,
  );
  require_(asset.source?.licence === HERO_CAR.licence, `${label}: hero licence must be CC BY 4.0`);
  require_(
    asset.source?.licenceUrl === HERO_CAR.licenceUrl,
    `${label}: hero licence URL is not canonical`,
  );
  require_(
    asset.source?.url === HERO_CAR.sourceUrl,
    `${label}: hero source URL does not match the selected listing`,
  );
  require_(
    asset.source?.attribution === HERO_CAR.attribution,
    `${label}: hero attribution has drifted from the approved source/modification notice`,
  );
  require_(
    asset.source?.archiveSha256 === HERO_CAR.archiveSha256,
    `${label}: sanitized archive hash is missing or incorrect`,
  );

  const sources = asset.sourceFiles ?? [];
  const archive = sources.find((source) => source.path === HERO_CAR.archiveName);
  const fbx = sources.find((source) => source.path === HERO_CAR.fbxPath);
  const media = sources.find((source) => source.path === HERO_CAR.mediaPath);
  require_(
    archive?.sha256 === HERO_CAR.archiveSha256,
    `${label}: source archive is not hash-pinned`,
  );
  require_(
    archive?.bytes === HERO_CAR.archiveBytes,
    `${label}: source archive byte count is incorrect`,
  );
  require_(fbx?.sha256 === HERO_CAR.fbxSha256, `${label}: source FBX hash is incorrect`);
  require_(
    media?.sha256 === HERO_CAR.mediaSha256,
    `${label}: sanitized dashboard media hash is incorrect`,
  );
  require_(
    asset.verification?.sourceFbxSha256 === HERO_CAR.fbxSha256,
    `${label}: conversion report does not identify the pinned FBX`,
  );

  const neutralMedia = asset.verification?.neutralMedia;
  require_(
    neutralMedia?.sourceSha256 === HERO_CAR.mediaSha256,
    `${label}: neutral media was not verified`,
  );
  require_(
    neutralMedia?.material === 'media',
    `${label}: neutral media is not bound to the source media material`,
  );
  require_(
    Array.isArray(neutralMedia?.glbImageNames) &&
      neutralMedia.glbImageNames.some((name) => /media/i.test(name)),
    `${label}: neutral media image is missing from the GLB`,
  );
  const modelFile = asset.files?.find((file) => file.slot === 'model');
  require_(
    modelFile?.path === HERO_CAR.modelPath,
    `${label}: hero GLB is not at the pinned runtime path`,
  );
  require_(
    asset.pipeline?.resolution === String(HERO_CAR.maxTextureSize),
    `${label}: hero texture resize cap must be ${HERO_CAR.maxTextureSize}px`,
  );
}

/**
 * Checks a LUT against its own header and against the manifest's claim about it.
 *
 * The hash already proves the file is the one that was committed; this proves the file *says* what
 * the manifest and the runtime believe about it. The trap is real and quiet: `LUTCubeLoader` scales
 * every data point by 255 and ignores `DOMAIN_MIN`/`DOMAIN_MAX` entirely, so a table authored with a
 * 0–255 domain parses into values 255 times too large without a single error. A LUT that declares a
 * domain other than 0–1 is therefore a LUT that will not render as authored, and it is caught here
 * rather than in a screenshot.
 */
async function verifyLut(label, asset) {
  const file = asset.files[0];
  const text = await readFile(join(PUBLIC_DIR, file.path), 'utf8');
  const declaredSize = Number(/LUT_3D_SIZE +(\d+)/.exec(text)?.[1] ?? NaN);
  const manifestSize = Number(asset.pipeline?.resolution ?? NaN);
  require_(Number.isInteger(declaredSize), `${label}: ${file.path} has no LUT_3D_SIZE header`);
  require_(
    declaredSize === manifestSize,
    `${label}: ${file.path} declares size ${declaredSize}, manifest says ${manifestSize}`,
  );
  require_(
    /DOMAIN_MIN +0(\.0+)? +0(\.0+)? +0(\.0+)?/.test(text) &&
      /DOMAIN_MAX +1(\.0+)? +1(\.0+)? +1(\.0+)?/.test(text),
    `${label}: ${file.path} must declare a 0-1 domain; LUTCubeLoader ignores other domains`,
  );
  const entries = (text.match(/^-?[\d.]+ +-?[\d.]+ +-?[\d.]+ *$/gm) ?? []).length;
  require_(
    entries === declaredSize ** 3,
    `${label}: ${file.path} holds ${entries} entries, expected ${declaredSize ** 3}`,
  );
}

/**
 * Checks a derived model against the budget it was built to.
 *
 * The GLB header is parsed directly — the JSON chunk of the container, no decoder and no rendering
 * — because that is enough to answer the questions that matter: is the geometry compressed, are the
 * textures the transcodable format the runtime requires, how many levels are there, and what does
 * each one cost in triangles.
 */
async function verifyModel(label, asset) {
  const budget = (() => {
    try {
      return requireBudget(asset.assetClass);
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
      return null;
    }
  })();
  if (budget === null) return;

  const file = asset.files[0];
  const buffer = await readFile(join(PUBLIC_DIR, file.path));
  require_(
    buffer.subarray(0, 4).toString('ascii') === 'glTF',
    `${label}: ${file.path} is not a GLB`,
  );

  const jsonLength = buffer.readUInt32LE(12);
  require_(
    buffer.subarray(16, 20).toString('ascii') === 'JSON',
    `${label}: ${file.path} has no JSON chunk where one is expected`,
  );
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const used = json.extensionsUsed ?? [];

  // The manifest records the extensions the pipeline verified when it wrote the file, so this
  // is a drift check: a writer that silently drops an extension shows up here as a file whose
  // declarations no longer match its own manifest entry. Trees ship uncompressed vertices on
  // purpose (quantization rounds their baked metre positions; the meshopt encoder trips on the
  // scanned layout), so a single hard-coded compression policy would be wrong for half the set.
  const expected = asset.verification?.extensionsUsed ?? [
    'EXT_meshopt_compression',
    'KHR_mesh_quantization',
    'KHR_texture_basisu',
  ];
  for (const extension of expected) {
    require_(
      used.includes(extension),
      `${label}: ${file.path} does not declare ${extension}, which its manifest entry promises`,
    );
  }
  require_(
    used.includes('KHR_texture_basisu'),
    `${label}: ${file.path} does not declare KHR_texture_basisu`,
  );
  for (const image of json.images ?? []) {
    require_(
      image.mimeType === 'image/ktx2',
      `${label}: ${file.path} carries a ${image.mimeType} image, expected KTX2`,
    );
  }
  if (asset.id === HERO_CAR.id) {
    verifyHeroTextureDimensions(label, buffer, json, jsonLength);
  }

  // Every level the manifest advertises must exist as a hierarchy node in the file the runtime loads.
  const declared = asset.pipeline?.lods ?? [];
  const nodesArray = json.nodes ?? [];
  const nodes = new Map(nodesArray.map((node, index) => [node.name, { node, index }]));
  require_(
    declared.length >= budget.minLods,
    `${label}: ${declared.length} level(s) of detail, minimum is ${budget.minLods}`,
  );
  require_(
    declared.length <= budget.maxLods,
    `${label}: ${declared.length} level(s) of detail, maximum is ${budget.maxLods}`,
  );

  function countNodeTriangles(index, stack = new Set()) {
    const node = nodesArray[index];
    if (!node || stack.has(index)) return 0;
    stack.add(index);
    let total = 0;
    if (Number.isInteger(node.mesh)) {
      const mesh = json.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const accessorIndex = Number.isInteger(primitive.indices)
          ? primitive.indices
          : primitive.attributes?.POSITION;
        const count = json.accessors?.[accessorIndex]?.count ?? 0;
        const mode = primitive.mode ?? 4;
        if (mode === 4) total += Math.floor(count / 3);
        else if (mode === 5 || mode === 6) total += Math.max(0, count - 2);
      }
    }
    for (const child of node.children ?? []) total += countNodeTriangles(child, stack);
    stack.delete(index);
    return total;
  }

  function subtreeIndices(index, into = new Set()) {
    if (into.has(index)) return into;
    into.add(index);
    for (const child of nodesArray[index]?.children ?? []) subtreeIndices(child, into);
    return into;
  }

  let previous = Infinity;
  for (const level of declared) {
    const entry = nodes.get(level.node);
    require_(
      Boolean(entry),
      `${label}: the manifest advertises a "${level.node}" node that is not in the file`,
    );
    if (!entry) continue;
    const actualTriangles = countNodeTriangles(entry.index);
    require_(
      actualTriangles === level.triangles,
      `${label}: ${level.node} decodes to ${actualTriangles} triangles, manifest says ${level.triangles}`,
    );
    require_(
      level.triangles < previous,
      `${label}: ${level.node} has ${level.triangles} triangles, not fewer than the level before it (${previous})`,
    );
    previous = level.triangles;
  }

  if (asset.id === HERO_CAR.id) {
    const wheelConfig = JSON.parse(
      await readFile(join(ROOT, 'src', 'config', 'vehicle-wheels.json'), 'utf8'),
    );
    for (const level of declared) {
      const lod = nodes.get(level.node);
      if (!lod) continue;
      const inside = subtreeIndices(lod.index);
      for (const wheel of HERO_WHEELS) {
        const pivotName = `wheel-${wheel.key}-lod${level.level}`;
        const spinnerName = `wheel-spinner-${wheel.key}-lod${level.level}`;
        const pivotEntry = nodes.get(pivotName);
        const spinnerEntry = nodes.get(spinnerName);
        require_(Boolean(pivotEntry), `${label}: missing ${pivotName}`);
        require_(Boolean(spinnerEntry), `${label}: missing ${spinnerName}`);
        if (!pivotEntry || !spinnerEntry) continue;
        require_(inside.has(pivotEntry.index), `${label}: ${pivotName} is outside ${level.node}`);
        require_(
          inside.has(spinnerEntry.index),
          `${label}: ${spinnerName} is outside ${level.node}`,
        );
        require_(
          !Number.isInteger(pivotEntry.node.mesh),
          `${label}: ${pivotName} must be an empty pivot`,
        );
        require_(
          (pivotEntry.node.children ?? []).includes(spinnerEntry.index),
          `${label}: ${spinnerName} is no longer a child of ${pivotName}`,
        );
        const expected = [
          wheel.side === 'left' ? -wheelConfig.halfTrack : wheelConfig.halfTrack,
          wheelConfig.anchorY - wheelConfig.restLength,
          wheel.axle === 'front' ? wheelConfig.frontZ : wheelConfig.rearZ,
        ];
        const actual = pivotEntry.node.translation ?? [0, 0, 0];
        require_(
          actual.length === 3 &&
            actual.every((value, axis) => Math.abs(value - expected[axis]) <= 0.012),
          `${label}: ${pivotName} does not match the configured wheel centre`,
        );
      }
      const steeringName = `steering-wheel-pivot-lod${level.level}`;
      const steering = nodes.get(steeringName);
      require_(Boolean(steering), `${label}: missing ${steeringName}`);
      if (steering)
        require_(inside.has(steering.index), `${label}: ${steeringName} is outside ${level.node}`);
    }
    const lod0Level = declared[0];
    require_(
      file.triangles === lod0Level?.triangles,
      `${label}: model file triangle count differs from lod0`,
    );
  }

  const lod0 = declared[0];
  if (lod0) {
    require_(
      lod0.triangles <= budget.maxTriangles,
      `${label}: closest level has ${lod0.triangles} triangles, budget is ${budget.maxTriangles}`,
    );
  }
  require_(
    file.bytes <= budget.maxBytes,
    `${label}: ${formatBytes(file.bytes)} exceeds the ${asset.assetClass} budget of ${formatBytes(budget.maxBytes)}`,
  );
}

/**
 * Reads each hero KTX2 header without decoding it. The verified maximum texture dimensions are a
 * mobile video-memory budget: universal KTX2 can be transcoded to RGBA on devices without a usable
 * block-compressed format, where a 2K map costs many times its download size.
 */
function verifyHeroTextureDimensions(label, buffer, json, jsonLength) {
  const binaryHeaderOffset = 20 + jsonLength;
  if (binaryHeaderOffset + 8 > buffer.length) {
    require_(false, `${label}: hero GLB has no complete binary chunk header`);
    return;
  }

  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  const binaryType = buffer
    .subarray(binaryHeaderOffset + 4, binaryHeaderOffset + 8)
    .toString('ascii');
  const binaryStart = binaryHeaderOffset + 8;
  if (binaryType !== 'BIN\u0000' || binaryLength > buffer.length - binaryStart) {
    require_(false, `${label}: hero GLB has an invalid binary chunk`);
    return;
  }

  const identifier = Buffer.from([
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  let checked = 0;
  for (const image of json.images ?? []) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view) {
      require_(false, `${label}: hero image ${image.name ?? checked} has no embedded buffer view`);
      continue;
    }
    const imageOffset = binaryStart + (view.byteOffset ?? 0);
    const imageLength = view.byteLength ?? 0;
    if (
      imageLength < 28 ||
      imageOffset < binaryStart ||
      imageOffset + imageLength > binaryStart + binaryLength
    ) {
      require_(false, `${label}: hero image ${image.name ?? checked} has an invalid KTX2 range`);
      continue;
    }
    if (!buffer.subarray(imageOffset, imageOffset + 12).equals(identifier)) {
      require_(false, `${label}: hero image ${image.name ?? checked} is not KTX2`);
      continue;
    }

    const width = buffer.readUInt32LE(imageOffset + 20);
    const height = buffer.readUInt32LE(imageOffset + 24);
    require_(
      width > 0 && height > 0,
      `${label}: hero image ${image.name ?? checked} has invalid dimensions ${width}x${height}`,
    );
    require_(
      width <= HERO_CAR.maxTextureSize && height <= HERO_CAR.maxTextureSize,
      `${label}: hero image ${image.name ?? checked} is ${width}x${height}, ` +
        `exceeding the ${HERO_CAR.maxTextureSize}px memory budget`,
    );
    checked += 1;
  }
  require_(checked > 0, `${label}: no embedded hero KTX2 images were checked`);
}

require_(seen.has(HERO_CAR.id), `required player hero model ${HERO_CAR.id} is not in the manifest`);

if (problems.length > 0) {
  console.error(`asset verification failed (${problems.length} problem(s)):`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

const bytes = manifest.assets
  .flatMap((asset) => asset.files)
  .reduce((total, file) => total + file.bytes, 0);
console.log(
  `asset verification passed: ${manifest.assets.length} assets, ${bytes} bytes, all hashes and licences match`,
);
