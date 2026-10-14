#!/usr/bin/env node
/**
 * Offline verification of the committed asset set (CI gate).
 *
 * Checks, without ever touching the network:
 *  1. the manifest parses and every entry has the licence metadata the policy requires;
 *  2. every file the manifest describes exists in the repository;
 *  3. every file's SHA-256 and byte size match the manifest;
 *  4. the licence is one the policy allows (CC0 or an explicitly credited CC-BY);
 *  5. `CREDITS.md` lists every asset, so the register cannot drift from what ships.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const MANIFEST_PATH = join(PUBLIC_DIR, 'assets', 'manifest.json');
const CREDITS_PATH = join(ROOT, 'CREDITS.md');

const ALLOWED_LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0']);
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
