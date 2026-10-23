# Asset sources — the free and open content register

**Owner's directive (2026-10-14):** use the best-quality **free, open** resources available — no purchases, no
licence fees, no restricted licences — and do not compromise the visual target to get them. Find premium-looking
open models and audio first, then build.

**Owner's amendment (2026-10-23; ADR 0008 supersedes the hero CC0-only restriction):** AI-generated and free account-gated sources remain eligible only after exact-item review, but the owner now permits free licences that clearly allow intended use and redistribution—including CC BY 4.0 with attribution—for the hero car. No purchases, paid access, or unapproved new accounts. The selected MMC Works Generic Sport Coupé Car is integrated through the reproducible conversion/runtime pipeline; see §3.5.

This document is the verified answer to "what premium-looking free content actually exists for this game?" It is
the sourcing plan for `docs/VISUAL_TARGET.md`; `docs/ASSET_POLICY.md` holds the rules, `public/assets/manifest.json`
holds what we actually ship, and `CREDITS.md` holds attribution.

**Verified:** the Poly Haven and ambientCG APIs were queried directly on **2026-10-14** during this research; the
library counts and asset names quoted below are from those live responses, not from memory. Anything with a ⚠️ is a
caveat, not a recommendation.

---

## 1. The rule

| Tier                       | Licence                                                                                                                                                                        | Rule                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Default**                | **CC0 / public domain** (Poly Haven, ambientCG, Kenney, Quaternius, KayKit, verified Sketchfab CC0, Sonniss GDC, Freesound CC0, OpenGameArt CC0, Smithsonian, NASA, OFL fonts) | Use freely. Attribution is not required; we credit anyway in `CREDITS.md` because it is decent and cheap.                                                                                                              |
| **Exception**              | **CC-BY** (some Sketchfab props/music; hero vehicle only with explicit owner-approved source and compatible rights)                                                            | Allowed when the exact licence permits intended use, modification, self-hosting, and redistribution; the required attribution must be generated in `CREDITS.md` and the in-game credits screen. CC0 remains preferred. |
| **Excluded / conditional** | Paid assets/plans/credits, NC/ND or incompatible licences, marketplace "freebie" terms, ripped/converted game assets, or uncleared badges/logos                                | Never use a source that fails the exact-item licence, provenance, access, or brand/design-rights gate.                                                                                                                 |

**Why CC-BY is permitted:** the owner accepts a clear attribution obligation rather than excluding useful assets solely because a credit line is required. CC0 remains preferred, but compatible CC BY 4.0 is eligible for the selected hero when the exact item's rights, source, modifications, and redistribution terms are recorded and attribution is provided. This permission does not clear trademarks, trade dress, or recognizable real-car designs.

**Decision history:** the 2026-10-14 CC-BY exception remains in force, and the owner's 2026-10-23 instruction additionally permits a compatible free CC-BY licence for the hero vehicle; ADR 0008 records the extension. Required credit lines must land in `CREDITS.md` and the in-game credits UI.

---

## 2. Verified source register

| Source                                                      | What it gives us                                                                                                     | Licence                                                                    | Attribution                                   | Access                                                                            | Quality verdict                                                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Poly Haven**                                              | 997 HDRIs, 869 PBR textures, 521 models (incl. scanned trees, plants, ground cover, rocks, coastal cliffs, lanterns) | CC0                                                                        | None                                          | Public keyless API (`api.polyhaven.com`) + direct downloads                       | **Premium.** Multi-16K/20K source, industry-standard scanning; this is the same library paid projects use.                                                 |
| **ambientCG**                                               | 2 000+ PBR materials + HDRIs (1K–16K, direct download links)                                                         | CC0                                                                        | None                                          | Public API v2                                                                     | **Premium.** Ideal for asphalt, concrete, gravel, snow, ice, rock.                                                                                         |
| **Sonniss GDC Game Audio Bundle**                           | 2015–2026 bundles, **200+ GB** of commercial-library samples; 2026 edition = 7.47 GB / 347 files from 17 vendors     | Royalty-free, no attribution, lifetime use in unlimited projects           | None                                          | Direct download / torrent, no account                                             | **Premium — literally the paid libraries' own files.** The single best free audio find for this project.                                                   |
| **Freesound**                                               | ~381 000 CC0 sounds (licence filter)                                                                                 | CC0                                                                        | None                                          | Web + API                                                                         | **Good→premium.** Perfect for specific recordings (engine, rain, cicada, gulls).                                                                           |
| **Kenney**                                                  | 200+ packs, 60 000+ assets incl. 10 audio packs                                                                      | CC0                                                                        | None                                          | Direct download                                                                   | **Clean, stylized.** Not for realistic hero content; excellent for UI sounds and kitbashing.                                                               |
| **Quaternius / KayKit (Kay Lousberg)**                      | 80+ themed packs, props, vehicles, characters                                                                        | CC0                                                                        | None                                          | Direct download                                                                   | **Stylized.** Traffic proxies and distant props only, if used at all.                                                                                      |
| **OpenGameArt**                                             | Music, SFX, 3D under CC0/CC-BY/GPL (per item)                                                                        | Per item                                                                   | Depends                                       | Web                                                                               | **Varies.** Filter to CC0.                                                                                                                                 |
| **Sketchfab**                                               | Downloadable scans and models; per-item licences vary                                                                | Per model (CC0, CC-BY, mixed)                                              | Per model                                     | Item-level access varies; official Download API requires authentication           | **Varies wildly.** Verify exact-item licence, source archive, and download rights before use.                                                              |
| **Meshy community gallery**                                 | AI-generated community 3D models; formats/access vary by item                                                        | Per-item; several reviewed posts display CC0                               | Per listing                                   | Account-gated; access varies per item                                             | **Historical lead only.** The previously selected listing was reported subscription-gated; the current hero candidate is MMC Works' generic coupé in §3.5. |
| **Innerscene vehicle library**                              | Original/unbranded CC0 car GLBs, including coupes, roadster and hatchbacks                                           | CC0 under contributor terms; item pages declare CC0                        | None                                          | Blog says no account; six anonymous `HEAD` probes returned 405 (no GET attempted) | **Not selected.** Six previews were below the hero-quality bar; download access remains unverified.                                                        |
| **Sketchfab — Unity Fan concept cars**                      | ~50 author-described public-domain/CC0 concept-car models, 200k–760k triangles                                       | Item descriptions claim CC0; sampled Sketchfab metadata says Free Standard | None claimed                                  | Download access not tested                                                        | **Unverified/ineligible.** Sampled pages have a license conflict; no model/design review or download.                                                      |
| **BlenderArtists “Free Cars” thread**                       | Community car files linked from a forum thread                                                                       | Original uploader says “no license”; CC0 text was posted by another user   | Unclear                                       | Facebook-linked access not tested                                                 | **Excluded/unverified.** Provenance and design sources are unresolved; no files were accessed.                                                             |
| **Poly Pizza / Icosa Gallery (Google Poly archive)**        | Fast stylized props                                                                                                  | Mostly CC-BY                                                               | Yes                                           | Web                                                                               | Low-poly only; not for this target.                                                                                                                        |
| **Smithsonian Open Access / NASA 3D**                       | Museum scans, spacecraft                                                                                             | CC0                                                                        | None                                          | Web                                                                               | Niche; useful if we ever need a specific object.                                                                                                           |
| **Google Noto (incl. Noto Sans JP), Inter, JetBrains Mono** | UI, Japanese typography, diagnostics                                                                                 | SIL OFL 1.1                                                                | None in binary; no selling of the font itself | Direct download / npm                                                             | **Premium and free.**                                                                                                                                      |
| **Arbaro** (GPL-2.0), **ngPlant**, **GroIMP**               | Open-source tree/plant generators implementing Weber & Penn-style growth models                                      | GPL / open source                                                          | None (our exported meshes are ours)           | Source + build                                                                    | **The vegetation answer.** We generate sugi, momiji, sakura trunks/branching ourselves and texture them with scanned CC0 bark.                             |

⚠️ **Fab/Megascans free starter** (mentioned in earlier research) is _not_ used: the whole-library-free era ended
2024-12-31, the starter collection sits under the Fab Standard licence with its own conditions, and it would put a
non-auditable licence on our critical path. Free CC0 scans cover the same need.

**AI/account-gated source amendment (2026-10-22, ADR 0007):** AI-generated and free account-gated sources are eligible only after exact-item verification, redistribution review, and any required owner approval. The earlier Meshy candidate is a historical, subscription-gated lead; it is not the current selection. The 2026-10-23 MMC Works candidate is CC BY 4.0 and uses an owner-supplied, hash-identified archive without a new account or purchase.

---

## 3. What that buys, per asset class

### 3.1 Sky, lighting, and HDRIs — **CC0, premium**

Poly Haven's HDRI library includes **HDRIs shot in Japan**, which makes the region brief directly executable:
`ninomaru_teien` (a Tokyo garden, tagged `japan`, sourced at 16K/8K, by Greg Zaal), `bamboo_tunnel` and
`spooky_bamboo_morning` (**20 480 × 10 240** source), and `cedar_bridge`/`cedar_bridge_sunset_1/2` (16K, cedar
forest with a road and overpass — a near-perfect touge sky). Plus 61 night HDRIs, 225 sunset/sunrise, 822 natural
light, for the full time-of-day set.

### 3.2 Terrain, roads, and surfaces — **CC0, premium**

Poly Haven has Japan-specific scanned materials we can use directly: `japanese_cedar_planks`, `japanese_cedar_bark`,
`japanese_camphor_bark`, `japanese_hackberry_bark`, `japanese_zelkova_bark`, `japanese_sycamore`, `japanese_stone_wall`,
`sakura_bark`, `trident_maple_bark` (momiji), `lacquered_cherry_wood`, `bamboo_wall` / `bamboo_wall_02` / `bamboo_wall_03`,
`bamboo_veneer`, `tatami_mat`, `dark_wood`. ambientCG supplies asphalt, wet asphalt, gravel, soil, rock, snow, ice,
concrete, and road-marking materials at 1K–16K with direct links. Everything is CC0.

**Runtime surface-map selections verified and added 2026-10-21:** Poly Haven's [Gravel Concrete 03](https://polyhaven.com/a/gravel_concrete_03) is a 2.1 m exposed-aggregate outdoor pavement scan by Charlotte Baglioni, tagged for sidewalks/paving; its CC0 page lists diffuse, OpenGL normal, roughness, AO and packed ARM maps. It is pinned at 1K for sidewalks and concrete planter shells. Poly Haven's [Concrete Wall 009](https://polyhaven.com/a/concrete_wall_009), also by Charlotte Baglioni and CC0, is a 1.8 m cast-concrete wall scan with formwork seams; its diffuse, OpenGL normal, roughness, AO and ARM slots are pinned at 1K for selected opaque Aohara facades and Yūhi Town wall-body boxes (painted trims and signs use a separate material). Existing [Japanese Cedar Planks](https://polyhaven.com/a/japanese_cedar_planks) remains the matching CC0 scan for wooden bench boards. Runtime albedo is sRGB; normal and packed ARM are linear, with ARM channels AO/roughness/metalness. The pinned file paths, exact hashes, creators and retrieval dates are in `public/assets/manifest.json` and `CREDITS.md`; the `fetch-assets.mjs` entries are the acquisition source of truth. No generic gym rubber, worn blue steel, or other physically mismatched texture is assigned to tires, automotive paint, or bare metal.

### 3.3 Vegetation, rocks, water edges — **CC0 + open-source generation**

Verified Poly Haven nature content: category counts are **trees 20**, **plants 57**, **ground cover 32**,
**rocks 37**, **nature 110** — including `fir_tree_01`, `island_tree_01/02/03`, `jacaranda_tree`, `fir_sapling`,
`grass_medium_01/02`, `grass_bermuda_01`, `fern_02`, `boulder_01`, `moon_rock_01–04`, and scanned
`coastal_cliff_01/02/04`, `coast_rocks_01–05`, `coast_line_01/02`, `dead_tree_trunk`/`dead_tree_trunk_02`.
For the Japanese species we actually need (sugi cedar runs, momiji maples, sakura), we generate trunks and canopies
with **Arbaro/ngPlant** (open source) and texture them with the CC0 bark scans above — that keeps everything CC0 and
gives us LOD variants for free, which is exactly what the tier matrix needs.

### 3.4 Japanese props and landmarks — **mixed; the one place with a caveat**

- CC0 and already verified: Poly Haven `wooden_lantern_01`, `lantern_01`, `antique_katana_01`.
- CC-BY on Sketchfab (credit line required): torii gates (e.g. 9.6k-tri "Japanese Shrine Torii", 280k-tri
  high-poly "Japanese Shrine"), shrine/temple buildings (8.5k-tri voxel-ish temple, 8.6k-tri realtime-ready shrine).
  These are community models; each one gets audited for scale, topology, and licence text before use, and the best
  ones are rematerialised to our PBR standard.
- Everything else that defines the Japanese roadside look — vending machines, guardrails with reflectors, blue road
  signs, overhead wires and utility poles, concrete rice-paddy embankments, level crossings, convex traffic mirrors,
  snow fences, stone lanterns, jizō statues, bamboo fencing, noren, matsuri lantern strings, konbini signage — is
  **built or kitbashed in-house** from CC0 materials. This is deliberate: it keeps the look consistent and avoids a
  patchwork of community assets with unknown scale.

### 3.5 The car — integrated generic CC-BY hero asset

The target remains a realistic sports coupé with no visible manufacturer branding, plates, badges, or uncleared recognizable production-car design. On 2026-10-23 the owner directed “Integrate the model” and relaxed the former CC0-only hero rule to permit free licences that clearly allow the intended use and redistribution, including CC BY 4.0 with attribution.

**Selected asset:** MMC Works, [Generic Sport Coupé Car](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882), displayed as Creative Commons Attribution 4.0. The public listing describes a generic sports coupé, `.FBX` with texture maps, 114.1k triangles and 59.7k vertices. The owner supplied `/home/user/hero-car-candidate-neutral-screen.zip` (79,563,959 bytes; SHA-256 `222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`) with an `ATTRIBUTION.txt` describing the one source change: the BMW-branded dashboard `media.png` was replaced by a neutral dark screen. No purchase or new source account is involved. Keep that neutral screen; never restore the BMW-branded texture.

**Visual/design screening:** four local renders (`/tmp/hero-car-review/front-three-quarter.png`, `front.png`, `side.png`, and `rear-three-quarter.png`) show no visible exterior logo, badge, or plate and no unambiguous production-car identity. The FBX contains the internal name `ModelLbmw`; MMC Works also has a separate BMW M3 E46 project. Neither fact establishes this candidate's identity. The current visual gate is provisionally clear, not legal clearance; stop if closer geometry review reveals a specific real-car design or uncleared branding.

**Integration state:** the pinned, no-network build command `npm run assets:hero -- --archive /home/user/hero-car-candidate-neutral-screen.zip` hash-checks the owner archive and FBX, preprocesses textures, converts with Blender 4.3.2, aligns the game axes and wheel centres to the shared vehicle config, preserves four wheel pivots and the steering pivot, creates three LODs, then optimizes with meshopt and KTX2/Basis. The generated `public/assets/models/hero-car-mmc-generic-sport-coupe.glb` is 4,922,068 bytes with 17 KTX2 images and LOD triangle counts 114,070 / 51,323 / 17,104. The asset manifest records the archive, FBX, and sanitized media hashes plus pipeline settings; `CREDITS.md` and the in-game credits view include the exact CC BY 4.0 attribution. `PlayerCarVisual` loads asynchronously, synchronizes physics-driven wheel/steering pivots, selects LOD by camera distance, and retains `CarVisual` as fail-soft fallback. `npm run check` passed on `8709e0d` (63 test files / 513 tests; 20 assets / 49,835,331 bytes; production build). Validate #198 and Pages Deploy #187 succeeded; the live GLB SHA matches the manifest. Browser/manual visual review remains unverified under sandbox resource limits. The owner’s archive remains a local build input and must not be committed.

**Required credit:** “Generic Sport Coupé Car” by MMC Works, with links to the [source listing](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882) and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and an indication of modifications (neutral dashboard media, axis/scale alignment, DirectX-normal conversion, LOD/mesh/texture optimization). The generated `CREDITS.md` and in-game credits view both carry the exact required attribution before the game is publicly distributed.

The prior 2026-10-22 Ferrari, Meshy, BlendSwap, Grab3D, Innerscene, and Unity Fan searches are historical source-audit evidence in `docs/SESSION_HANDOFF.md` §§68–70. Those rejected leads do not change the current MMC Works selection or authorize a different asset. The pipeline, manifest/licence checks, and runtime integration are implemented. Full project checks, CI/deploy, and live asset delivery passed; browser/manual visual validation remains unverified because headless capture hit sandbox resource limits.

### 3.6 Audio — **premium SFX, good-not-AAA music**

- **Engine, tyres, impacts, wind, rain, debris, UI:** Sonniss GDC bundles (2015–2026, 200+ GB) + Freesound CC0 +
  Kenney CC0 UI packs. This is studio-grade; the engine layer is built as a **granular/loop-based Web Audio synth**
  driven by RPM, load, throttle, and surface, with the recorded layers as source material.
- **Ambience:** cicadas (summer), rain on bodywork, harbour gulls, snow-muffled hush, temple bells — Freesound CC0
  and Sonniss.
- **Music:** CC0 pools are real but are not a Forza festival soundtrack. Sources: Kenney Music Jingles (85 CC0
  stingers), OpenGameArt CC0 filter, itch.io CC0 music tag, Pixabay (permissive, no attribution) with Incompetech
  (CC-BY) as an attributed fallback. Plan: a small menu/drive playlist in a chill electronic/ambient register,
  matched per season. ⚠️ This is the weakest free category and the plan says so out loud.

### 3.7 Fonts and UI — **CC0-equivalent, premium**

Noto Sans JP (SIL OFL 1.1) for Japanese signage and UI, Inter for Latin UI, JetBrains Mono for the diagnostics
overlay. All openly licensed, all free, all ship in the repo.

---

## 4. Open-source toolchain (the "premium packages" for building it)

| Job                         | Tool                                                                                        | Licence                |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| Modelling/authoring/export  | **Blender** (headless scripting for reproducible asset builds)                              | GPL-2.0+               |
| Tree/plant generation       | Arbaro, ngPlant, GroIMP                                                                     | GPL / open source      |
| Texture/material authoring  | Material Maker (procedural), Krita, GIMP, Inkscape                                          | MIT / GPL              |
| Audio editing and mastering | Audacity, Ardour, LMMS                                                                      | GPL                    |
| Asset optimization          | **gltf-transform**, meshoptimizer, KTX-Software (toktx/basisu), oxipng, ImageMagick, FFmpeg | MIT / Apache-2.0 / BSD |
| Render debugging            | RenderDoc, Spector.js, WebGPU Inspector, Chrome tracing                                     | MIT / Apache-2.0       |
| Runtime                     | **three.js** (MIT), **Rapier** (Apache-2.0), Vite, Vitest, Tailwind                         | see each               |

Every one of these is free, open source, and already part of the workflow or planned in Phase 3.

---

## 5. Where free sourcing reaches its ceiling

Said plainly so expectations stay honest:

1. **Hero-car integration is implemented.** MMC Works' generic sports coupé (CC BY 4.0) is selected under ADR 0008; the local four-view visual screen is provisionally clear and the owner supplied a sanitized, hash-identified source archive. The optimized GLB, manifest entry, generated attribution paths, and fail-soft runtime wiring are present; `npm run assets:verify` passes. Full project checks, CI/deploy, and live asset delivery passed. Browser/manual visual validation remains unverified under sandbox resource limits; keep `CarVisual` as the loader fallback.
2. **No AAA licensed soundtrack.** We get good, season-matched CC0/CC-BY music, not an official festival soundtrack.
3. **Japan-specific landmark photogrammetry is scarce in CC0.** Real Japanese shrines/torii in the wild are either
   CC-BY community models or not free at all. Our world is a **composite, fictional prefecture** built from CC0
   materials plus in-house landmarks — not a scan of a real place, and we will never claim otherwise.
4. **Specific real locations cannot be rebuilt.** Forza pays capture crews. We author a plausible, coherent region.
5. **Full traffic AI and crowds remain bounded Phase 9 work.** The authorized visual-actor slice now has instanced passenger cars, city buses, rigid trucks, semi-trailer rigs and farm tractors, with totals fixed at C/B/A = 6/12/18 and no moving colliders. Pedestrians, crossings/right-of-way, vehicle collision truth, recovery and further population remain separate work.

None of these stop the project hitting `docs/VISUAL_TARGET.md`; they define the ceiling of it.

---

## 6. Acquisition rules (how assets actually enter the repo)

1. Everything is acquired through a **pinned script or hash-verified owner-supplied source input** (`scripts/fetch-assets.mjs` / `scripts/build-models.mjs`), so the build is reproducible and reviewable. The hero FBX archive is supplied by the owner and must match its recorded SHA-256; do not fetch it from an account-gated endpoint or create a new account.
2. Every entry is written to `public/assets/manifest.json` (id, path, source URL, creator, licence, hash, and optimization settings) and, when attribution applies, to `CREDITS.md` and the in-game credits view.
3. Assets pass the pipeline before commit. Textures and HDRIs use pinned source files; models are derived through `scripts/build-models.mjs` with documented format conversion, dedupe/prune/weld, LODs, meshopt geometry, KTX2/Basis textures, and budget checks.
4. Nothing is committed if its licence text is missing or ambiguous. `scripts/verify-assets.mjs` runs offline in CI and gates the licence register and model budgets.
5. Source-only archives remain outside the Git repository in `.asset-cache/`. Poly Haven inputs are reproducible from pinned URLs/MD5s; the owner-provided hero archive is verified against its pinned SHA-256. Commit only optimized runtime files and small project-authored sanitization patches, not the 79 MB source archive.

### 6.1 What a derived model looks like

Every level of detail lives in **one GLB with one texture set**, as sibling nodes named `lod0`, `lod1`, … The
runtime picks a level by distance and toggles visibility, so the texture set is stored, downloaded, and uploaded to
the GPU once — three files would have carried three copies of the same textures, which is roughly two thirds of the
weight of a prop.

Two rules in the derivation are the result of measurement, not preference, and both are recorded here because a
future change is likely to trip over them:

- **Level 1 and deeper merge position seams before simplifying.** meshoptimizer's simplifier works on topology, and
  a mesh whose UV/normal seams have duplicated every vertex has almost no edges left to collapse. With seams intact
  the first prop refused to simplify past **82% of its source** regardless of the error budget (ratios of 0.4, 0.2,
  even 0.05 all returned the same triangle count). Merging duplicated positions first let the same call hit its
  ratio target exactly, at 0.13% error.
- **The closest level keeps its seams.** That is why its ratio target is 0.8 rather than 1: 0.8 _is_ the honest
  ceiling for a seam-preserving simplification, and the level where merging seams would be visible.

Budgets live in `scripts/asset-budgets.mjs` and are enforced twice — by the build, which refuses to write an asset
that exceeds one, and by CI, which re-checks the committed file. The prop budget (2.5 MB, 60k triangles, 1K
textures) is deliberately tight enough that the first prop had to be trimmed to meet it.

---

## 7. Sources

- [Poly Haven](https://polyhaven.com/) and its API — verified live 2026-10-14 (997 HDRIs / 869 textures / 521 models; Japan-tagged assets listed in §3).
- [ambientCG](https://ambientcg.com/) and [API v2](https://ambientcg.com/api/v2/full_json) — verified live 2026-10-14.
- [Sonniss GDC 2026 Game Audio Bundle](https://gdc.sonniss.com/) — 7.47 GB / 347 files, royalty-free, no attribution; full archive back to 2015.
- [Freesound](https://freesound.org/) — CC0 licence filter; ~381 000 CC0 sounds.
- [Kenney](https://kenney.nl/), [Quaternius](https://quaternius.com/), [KayKit](https://kaylousberg.itch.io/) — CC0 packs.
- [Sketchfab CC0 collections](https://sketchfab.com/) and the **Unity Fan** CC0 concept-car series — per-model licence audit required.
- [OpenGameArt](https://opengameart.org/) — per-item licences, CC0 filter.
- [Arbaro](https://github.com/wdiestel/arbaro) (GPL-2.0) and ngPlant — open-source tree/plant generators.
- [gltf-transform](https://gltf-transform.dev/), [KTX-Software](https://github.com/KhronosGroup/KTX-Software), [meshoptimizer](https://github.com/zeux/meshoptimizer).
- [SIL Open Font License](https://openfontlicense.org/) — Noto, Inter, JetBrains Mono.
- Free-music landscape survey: [CC0 music guide](https://gtstu.com/free-royalty-free-music-indie-games/), [free SFX/music 2026](https://app.cinevva.com/guides/free-sound-effects-music).
