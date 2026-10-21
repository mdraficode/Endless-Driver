#!/usr/bin/env node
/**
 * Pinned asset acquisition for Endless Driver.
 *
 * The project's rule (ADR 0005, docs/ASSET_SOURCES.md) is that every third-party asset is CC0-first,
 * fetched by a script rather than by hand, recorded in `public/assets/manifest.json` with its source,
 * creator, licence, and a SHA-256 of the exact bytes committed, and listed in `CREDITS.md`.
 *
 * Usage:
 *   node scripts/fetch-assets.mjs                 # fetch everything missing or changed
 *   node scripts/fetch-assets.mjs --force         # re-download and rewrite the manifest
 *   node scripts/fetch-assets.mjs --only <id>     # fetch one entry
 *   node scripts/fetch-assets.mjs --credits       # regenerate CREDITS.md from the manifest only
 *
 * The entry list below is the single source of truth: the manifest is derived from it, never edited
 * by hand. `npm run assets:verify` (CI) re-checks the committed manifest and file hashes offline.
 *
 * Poly Haven is CC0: no attribution is required, no account, no key. Its public API is documented at
 * https://api.polyhaven.com — we pin explicit file URLs instead of querying it at build time, so a
 * Poly Haven outage can never break a build.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const MANIFEST_PATH = join(PUBLIC_DIR, 'assets', 'manifest.json');
const CREDITS_PATH = join(ROOT, 'CREDITS.md');
const BASE_URL = 'https://dl.polyhaven.org/file/ph-assets';

/**
 * @typedef {Object} AssetEntry
 * @property {string} id            Runtime id used by the manifest and loader.
 * @property {'hdri'|'texture'} kind
 * @property {string} name          Display name.
 * @property {string} assetClass    Budget class from docs/ASSET_SOURCES.md.
 * @property {string} sourceUrl      Human page for the asset (licence evidence).
 * @property {string} creator
 * @property {string} licence       SPDX-style id; CC0-1.0 for everything sourced here.
 * @property {string} attribution   Empty when the licence requires none (we still credit in CREDITS.md).
 * @property {string} runtimePath   Repository-relative path of the committed file.
 * @property {string} url           Pinned download URL.
 * @property {string} [role]        How the runtime uses it (IBL, PBR surface, ...).
 * @property {string} [stem]        Published file stem for texture sets.
 */

/** @type {AssetEntry[]} */
const ENTRIES = [
  {
    id: 'hdri-ninomaru-teien-1k',
    kind: 'hdri',
    name: 'Ninomaru Teien (Tokyo garden) — 1K HDR',
    assetClass: 'environment-ibl',
    sourceUrl: 'https://polyhaven.com/a/ninomaru_teien',
    creator: 'Greg Zaal',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/hdri/ninomaru_teien_1k.hdr',
    url: `${BASE_URL}/HDRIs/hdr/1k/ninomaru_teien_1k.hdr`,
    role: 'Image-based lighting and reflections for the sky/IBL pillar (docs/VISUAL_TARGET.md §2.1).',
  },
  {
    id: 'hdri-bamboo-tunnel-1k',
    kind: 'hdri',
    name: 'Bamboo Tunnel — 1K HDR',
    assetClass: 'environment-ibl',
    sourceUrl: 'https://polyhaven.com/a/bamboo_tunnel',
    creator: 'Dimitrios Savva, Jarod Guest',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/hdri/bamboo_tunnel_1k.hdr',
    url: `${BASE_URL}/HDRIs/hdr/1k/bamboo_tunnel_1k.hdr`,
    role: 'Second IBL preset (shaded, green-bounced light) — used by the studio scene HDRI switcher.',
  },
  {
    id: 'hdri-cedar-bridge-sunset-1k',
    kind: 'hdri',
    name: 'Cedar Bridge Sunset — 1K HDR',
    assetClass: 'environment-ibl',
    sourceUrl: 'https://polyhaven.com/a/cedar_bridge_sunset_1',
    creator: 'Greg Zaal',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/hdri/cedar_bridge_sunset_1k.hdr',
    url: `${BASE_URL}/HDRIs/hdr/1k/cedar_bridge_sunset_1_1k.hdr`,
    role: 'Third IBL preset (golden hour) — matches the warm grading preset and the Mie Pass look.',
  },
  {
    id: 'tex-leafy-grass-1k',
    kind: 'texture',
    name: 'Leafy Grass \u2014 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/leafy_grass',
    creator: 'Charlotte Baglioni',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/leafy_grass_1k',
    url: `${BASE_URL}/Textures/jpg/1k/leafy_grass`,
    stem: 'leafy_grass',
    heightMap: true,
    role: 'Terrain splat diffuse/normal/roughness/AO for grass lowlands (Phase 4 realism pass).',
  },
  {
    id: 'tex-brown-mud-dry-1k',
    kind: 'texture',
    name: 'Brown Mud Dry \u2014 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/brown_mud_dry',
    creator: 'Rob Tuytel',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/brown_mud_dry_1k',
    url: `${BASE_URL}/Textures/jpg/1k/brown_mud_dry`,
    stem: 'brown_mud_dry',
    heightMap: true,
    role: 'Terrain splat diffuse/normal/roughness/AO for soil slopes and worked ground (Phase 4 realism pass).',
  },
  {
    id: 'tex-rock-face-03-1k',
    kind: 'texture',
    name: 'Rock Face 03 \u2014 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/rock_face_03',
    creator: 'Dario Barresi, Rico Cilliers',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/rock_face_03_1k',
    url: `${BASE_URL}/Textures/jpg/1k/rock_face_03`,
    stem: 'rock_face_03',
    heightMap: true,
    role: 'Terrain splat diffuse/normal/roughness/AO for steep rock and cliffs (Phase 4 realism pass).',
  },
  {
    id: 'tex-snow-01-1k',
    kind: 'texture',
    name: 'Snow 01 \u2014 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/snow_01',
    creator: 'Rob Tuytel',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/snow_01_1k',
    url: `${BASE_URL}/Textures/jpg/1k/snow_01`,
    stem: 'snow_01',
    heightMap: true,
    role: 'Terrain splat diffuse/normal/roughness/AO above the snowline (Phase 4 realism pass).',
  },
  {
    id: 'tex-asphalt-03-1k',
    kind: 'texture',
    name: 'Asphalt 03 \u2014 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/asphalt_03',
    creator: 'Dario Barresi, Charlotte Baglioni',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/asphalt_03_1k',
    url: `${BASE_URL}/Textures/jpg/1k/asphalt_03`,
    stem: 'asphalt_03',
    role: 'Road surface diffuse/normal/roughness/AO for the Phase 4 spline road network.',
  },
  {
    id: 'tex-sandy-gravel-1k',
    kind: 'texture',
    name: 'Sandy Gravel \u2014 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/sandy_gravel',
    creator: 'Charlotte Baglioni',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/sandy_gravel_1k',
    url: `${BASE_URL}/Textures/jpg/1k/sandy_gravel`,
    stem: 'sandy_gravel',
    role: 'Road shoulder diffuse/normal/roughness/AO for the Phase 4 spline road network.',
  },
  {
    id: 'tex-japanese-cedar-planks-1k',
    kind: 'texture',
    name: 'Japanese Cedar Planks — 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/japanese_cedar_planks',
    creator: 'Rob Tuytel',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/japanese_cedar_planks_1k',
    url: `${BASE_URL}/Textures/jpg/1k/japanese_cedar_planks`,
    role: 'Scanned CC0 cedar surface for the material library, studio validation grid and wooden Aohara bench boards.',
  },
  {
    id: 'tex-gravel-concrete-03-1k',
    kind: 'texture',
    name: 'Gravel Concrete 03 — 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/gravel_concrete_03',
    creator: 'Charlotte Baglioni',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/gravel_concrete_03_1k',
    url: `${BASE_URL}/Textures/jpg/1k/gravel_concrete_03`,
    stem: 'gravel_concrete_03',
    role: 'CC0 aggregate concrete for sidewalks and concrete street furniture; albedo, normal and packed AO/roughness/metalness maps.',
  },
  {
    id: 'tex-concrete-wall-009-1k',
    kind: 'texture',
    name: 'Concrete Wall 009 — 1K PBR set',
    assetClass: 'material-surface',
    sourceUrl: 'https://polyhaven.com/a/concrete_wall_009',
    creator: 'Charlotte Baglioni',
    licence: 'CC0-1.0',
    attribution: '',
    runtimePath: 'assets/textures/concrete_wall_009_1k',
    url: `${BASE_URL}/Textures/jpg/1k/concrete_wall_009`,
    stem: 'concrete_wall_009',
    role: 'CC0 cast-concrete scan for opaque city and rural building walls; albedo, normal and packed AO/roughness/metalness maps.',
  },
];

/**
 * Map files for the Poly Haven texture sets:
 * [manifest slot, published file stem, colour space, usage].
 * The exact file names are pinned here (verified against Poly Haven's public asset pages/API on
 * 2026-10-21) so the pipeline never guesses a URL or depends on the API at build time.
 */
const TEXTURE_MAPS = [
  ['diffuse', 'diff', 'srgb'],
  ['normal', 'nor_gl', 'linear'],
  ['roughness', 'rough', 'linear'],
  ['arm', 'arm', 'linear'],
  // Scanned displacement, published only for the terrain splat sets
  // (`heightMap: true` below): the near-tier POM raymarch samples it.
  ['height', 'disp', 'linear'],
];

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const CREDITS_ONLY = args.has('--credits');
const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'endless-driver-asset-pipeline' } });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchEntry(entry) {
  const files = [];

  if (entry.kind === 'hdri') {
    const target = join(PUBLIC_DIR, entry.runtimePath);
    const buffer =
      FORCE || !existsSync(target) ? await download(entry.url) : await readFile(target);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    files.push({
      slot: 'hdri',
      path: entry.runtimePath,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
      colourSpace: 'linear',
      format: 'hdr',
    });
  } else {
    const stem = entry.stem ?? 'japanese_cedar_planks';
    for (const [slot, suffix, colourSpace] of TEXTURE_MAPS) {
      if (slot === 'height' && entry.heightMap !== true) {
        continue;
      }
      const relative = `${entry.runtimePath}_${suffix}_1k.jpg`;
      const url = `${entry.url}/${stem}_${suffix}_1k.jpg`;
      const target = join(PUBLIC_DIR, relative);
      const buffer = FORCE || !existsSync(target) ? await download(url) : await readFile(target);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buffer);
      files.push({
        slot,
        path: relative,
        bytes: buffer.byteLength,
        sha256: sha256(buffer),
        colourSpace,
        format: 'jpg',
      });
    }
  }

  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    assetClass: entry.assetClass,
    source: {
      url: entry.sourceUrl,
      creator: entry.creator,
      licence: entry.licence,
      attribution: entry.attribution,
      retrieved: new Date().toISOString().slice(0, 10),
      pinnedUrl: entry.url,
    },
    role: entry.role,
    pipeline: {
      // Phase 3 optimization step: select the 1K runtime variant rather than the 16K/20K source,
      // pack ORM-style maps where the source provides them, and keep HDR linear for PMREM IBL.
      resolution: '1024',
      notes:
        'Runtime variant selected at fetch time; KTX2/Basis transcoding is applied when the KTX-Software toolchain is available in the build environment (recorded per asset when it happens).',
    },
    files,
  };
}

function creditsSection(assets) {
  const rows = assets
    .map((asset) => {
      const maps = asset.files.map((file) => `\`${file.path}\``).join(', ');
      return `- **${asset.name}** — ${asset.source.creator} — [source](${asset.source.url}) — ${asset.source.licence}\n  - file: ${maps}`;
    })
    .join('\n');
  return `## Assets used

All assets below are CC0 (public domain). Attribution is not required by the licence; the creators are
listed because their work deserves the credit, not because the licence asks for it.

${rows}

\`retrieved\` and \`sha256\` for each file are recorded in \`public/assets/manifest.json\`.
`;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(manifest.assets)) {
    throw new Error('manifest.assets must be an array');
  }

  if (!CREDITS_ONLY) {
    const entries = ONLY ? ENTRIES.filter((entry) => entry.id === ONLY) : ENTRIES;
    if (entries.length === 0) {
      throw new Error(`--only ${ONLY} matched no entry`);
    }

    const assets = [...manifest.assets];
    for (const entry of entries) {
      console.log(`fetching ${entry.id} …`);
      const asset = await fetchEntry(entry);
      const existing = assets.findIndex((candidate) => candidate.id === asset.id);
      if (existing >= 0) {
        assets[existing] = asset;
      } else {
        assets.push(asset);
      }
      for (const file of asset.files) {
        console.log(
          `  ${file.path}  ${(file.bytes / 1024).toFixed(0)} KiB  ${file.sha256.slice(0, 12)}`,
        );
      }
    }
    assets.sort((a, b) => a.id.localeCompare(b.id));
    manifest.assets = assets;
    manifest.updated = new Date().toISOString().slice(0, 10);
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`manifest written: ${manifest.assets.length} assets`);
  }

  const header = await readFile(CREDITS_PATH, 'utf8');
  const marker = '## Assets used';
  const start = header.indexOf(marker);
  const head = start >= 0 ? header.slice(0, start) : `${header.trimEnd()}\n\n`;
  await writeFile(CREDITS_PATH, `${head}${creditsSection(manifest.assets)}`);
  console.log('CREDITS.md regenerated');
}

main().catch((error) => {
  console.error(`asset fetch failed: ${error.message}`);
  process.exit(1);
});
