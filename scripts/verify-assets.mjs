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

  if (asset.kind === 'model') {
    await verifyModel(label, asset);
  }
  if (asset.kind === 'lut') {
    await verifyLut(label, asset);
  }
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

  require_(
    used.includes('EXT_meshopt_compression'),
    `${label}: ${file.path} does not declare EXT_meshopt_compression — its geometry is uncompressed`,
  );
  require_(
    used.includes('KHR_mesh_quantization'),
    `${label}: ${file.path} does not declare KHR_mesh_quantization`,
  );
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

  // Every level the manifest advertises must exist as a node in the file the runtime will load.
  const declared = asset.pipeline?.lods ?? [];
  const nodes = new Map((json.nodes ?? []).map((node) => [node.name, node]));
  require_(
    declared.length >= budget.minLods,
    `${label}: ${declared.length} level(s) of detail, minimum is ${budget.minLods}`,
  );
  require_(
    declared.length <= budget.maxLods,
    `${label}: ${declared.length} level(s) of detail, maximum is ${budget.maxLods}`,
  );

  let previous = Infinity;
  for (const level of declared) {
    const node = nodes.get(level.node);
    require_(
      Boolean(node),
      `${label}: the manifest advertises a "${level.node}" node that is not in the file`,
    );
    if (!node) continue;
    const mesh = (json.meshes ?? [])[node.mesh];
    require_(Boolean(mesh), `${label}: ${level.node} references a mesh that is not in the file`);
    require_(
      level.triangles < previous,
      `${label}: ${level.node} has ${level.triangles} triangles, not fewer than the level before it (${previous})`,
    );
    previous = level.triangles;
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
