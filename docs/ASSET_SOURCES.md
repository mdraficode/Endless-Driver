# Asset sources — the free and open content register

**Owner's directive (2026-10-14):** use the best-quality **free, open** resources available — no purchases, no
licence fees, no restricted licences — and do not compromise the visual target to get them. Find premium-looking
open models and audio first, then build.

This document is the verified answer to "what premium-looking free content actually exists for this game?" It is
the sourcing plan for `docs/VISUAL_TARGET.md`; `docs/ASSET_POLICY.md` holds the rules, `public/assets/manifest.json`
holds what we actually ship, and `CREDITS.md` holds attribution.

**Verified:** the Poly Haven and ambientCG APIs were queried directly on **2026-10-14** during this research; the
library counts and asset names quoted below are from those live responses, not from memory. Anything with a ⚠️ is a
caveat, not a recommendation.

---

## 1. The rule

| Tier          | Licence                                                                                                                                                                                                                                                                                                              | Rule                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Default**   | **CC0 / public domain** (Poly Haven, ambientCG, Kenney, Quaternius, KayKit, Sketchfab CC0, Unity Fan cars, Sonniss GDC, Freesound CC0, OpenGameArt CC0, Smithsonian, NASA, OFL fonts)                                                                                                                                | Use freely. Attribution is not required; we credit anyway in `CREDITS.md` because it is decent and cheap.                                                                                        |
| **Exception** | **CC-BY** (some Sketchfab Japanese landmark props, some music)                                                                                                                                                                                                                                                       | Allowed **only** when no CC0 asset of comparable quality exists, and only with the credit line implemented automatically in `CREDITS.md` and the in-game credits screen. Never for hero content. |
| **Banned**    | Anything requiring payment, an account-gated "free tier" that forbids redistribution, Non-Commercial or No-Derivatives terms, "freebie" marketplace licences (TurboSquid/CGTrader/RenderHub/Free3D-style), AI-generated asset galleries, ripped or converted game assets, manufacturer badges, logos, or trade dress | Never. If an asset cannot be audited, it does not enter the repository.                                                                                                                          |

**Why CC-BY is an exception rather than a ban:** a CC-BY credit is just a line of text naming the artist in the
credits screen. It is not a payment, not a restriction on use, distribution, or modification, and not a fee. It buys
real quality in only a few places — a handful of Japanese shrine/torii models and some music. The environment
textures/models and sound effects are plain CC0; the player vehicle and traffic geometry are authored in-house.

**Decided 2026-10-14:** the credited exception **stays**, because the only alternative is spending our own build
time recreating those few landmark props from scratch for no benefit. Rule of thumb for whoever implements this:
prefer CC0 whenever a comparable asset exists; reach for a CC-BY asset only when it is clearly better, and then the
credit line is written automatically into `CREDITS.md` and the in-game credits. The exception can be closed later at
any time by swapping those few props for in-house versions — a small change, not a redesign.

---

## 2. Verified source register

| Source                                                      | What it gives us                                                                                                     | Licence                                                          | Attribution                                   | Access                                                      | Quality verdict                                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Poly Haven**                                              | 997 HDRIs, 869 PBR textures, 521 models (incl. scanned trees, plants, ground cover, rocks, coastal cliffs, lanterns) | CC0                                                              | None                                          | Public keyless API (`api.polyhaven.com`) + direct downloads | **Premium.** Multi-16K/20K source, industry-standard scanning; this is the same library paid projects use.                                                  |
| **ambientCG**                                               | 2 000+ PBR materials + HDRIs (1K–16K, direct download links)                                                         | CC0                                                              | None                                          | Public API v2                                               | **Premium.** Ideal for asphalt, concrete, gravel, snow, ice, rock.                                                                                          |
| **Sonniss GDC Game Audio Bundle**                           | 2015–2026 bundles, **200+ GB** of commercial-library samples; 2026 edition = 7.47 GB / 347 files from 17 vendors     | Royalty-free, no attribution, lifetime use in unlimited projects | None                                          | Direct download / torrent, no account                       | **Premium — literally the paid libraries' own files.** The single best free audio find for this project.                                                    |
| **Freesound**                                               | ~381 000 CC0 sounds (licence filter)                                                                                 | CC0                                                              | None                                          | Web + API                                                   | **Good→premium.** Perfect for specific recordings (engine, rain, cicada, gulls).                                                                            |
| **Kenney**                                                  | 200+ packs, 60 000+ assets incl. 10 audio packs                                                                      | CC0                                                              | None                                          | Direct download                                             | **Clean, stylized.** Not for realistic hero content; excellent for UI sounds and kitbashing.                                                                |
| **Quaternius / KayKit (Kay Lousberg)**                      | 80+ themed packs, props, vehicles, characters                                                                        | CC0                                                              | None                                          | Direct download                                             | **Stylized.** Traffic proxies and distant props only, if used at all.                                                                                       |
| **OpenGameArt**                                             | Music, SFX, 3D under CC0/CC-BY/GPL (per item)                                                                        | Per item                                                         | Depends                                       | Web                                                         | **Varies.** Filter to CC0.                                                                                                                                  |
| **Sketchfab (CC0 filter)**                                  | Scanned props, including Japanese items                                                                              | CC0 / CC-BY / mixed                                              | Per model                                     | Web, no account for download on CC0/CC-BY                   | **Varies wildly.** Audit each model's triangle count and licence text before use.                                                                           |
| **Sketchfab — "Unity Fan" (@unityfan777) concept cars**     | ~50 **CC0** concept-car models, 200k–760k triangles, some rigged/animated, unbranded designs                         | CC0 (author's explicit public-domain dedication)                 | None                                          | Sketchfab download                                          | **Partial.** Realistic-ish, high-poly, no trademarks — the only credible free "premium" car. Needs decimation and a material rebuild; not a production car. |
| **Poly Pizza / Icosa Gallery (Google Poly archive)**        | Fast stylized props                                                                                                  | Mostly CC-BY                                                     | Yes                                           | Web                                                         | Low-poly only; not for this target.                                                                                                                         |
| **Smithsonian Open Access / NASA 3D**                       | Museum scans, spacecraft                                                                                             | CC0                                                              | None                                          | Web                                                         | Niche; useful if we ever need a specific object.                                                                                                            |
| **Google Noto (incl. Noto Sans JP), Inter, JetBrains Mono** | UI, Japanese typography, diagnostics                                                                                 | SIL OFL 1.1                                                      | None in binary; no selling of the font itself | Direct download / npm                                       | **Premium and free.**                                                                                                                                       |
| **Arbaro** (GPL-2.0), **ngPlant**, **GroIMP**               | Open-source tree/plant generators implementing Weber & Penn-style growth models                                      | GPL / open source                                                | None (our exported meshes are ours)           | Source + build                                              | **The vegetation answer.** We generate sugi, momiji, sakura trunks/branching ourselves and texture them with scanned CC0 bark.                              |

⚠️ **Fab/Megascans free starter** (mentioned in earlier research) is _not_ used: the whole-library-free era ended
2024-12-31, the starter collection sits under the Fab Standard licence with its own conditions, and it would put a
non-auditable licence on our critical path. Free CC0 scans cover the same need.

⚠️ **AI-generated CC0 galleries** (e.g. Meshy's gallery) are excluded from consideration: authorship and training
provenance cannot be audited, and this project's registers must be defensible. Revisit only if the owner asks.

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

### 3.5 The car — **the honest constraint**

There is no free, licence-clean, production-car-grade hero vehicle. What exists:

| Option                                                                          | Reality                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unity Fan's ~50 **CC0 concept cars** (200k–760k tris, unbranded, no trademarks) | The best free option that exists. High-poly, but the materials, interiors, and topology are hobbyist-grade: they need decimation to 100–200k, a full PBR rebuild (paint, glass, rubber, chrome, lights), cockpit authoring, and a wheel/anchor contract. |
| Kenney/Quaternius/KayKit vehicle packs                                          | CC0 but stylized low-poly; wrong look for a photoreal world. Possibly distant traffic only.                                                                                                                                                              |
| three.js's example `ferrari.glb`                                                | Real-brand Ferrari: trademark risk, and the licence trail depends on third-party attribution. Excluded.                                                                                                                                                  |
| "Free" marketplace cars (RenderHub, Free3D, TurboSquid free section)            | Brand names plus non-open "extended use" licences. Excluded by the rule in §1.                                                                                                                                                                           |

**Vehicle decision (2026-10-22):** the owner selected the Ferrari California only as a broad convertible/GT body-class reference for a new, in-house player car—not as a model to reproduce. `src/vehicles/CarVisual.ts` now builds an original, unbadged two-seat GT roadster with a long bonnet, open cabin, project-authored physical paint/glazing/interior materials, four pose-driven wheels, steering, and brake lamps. Traffic geometry is also authored in-house for passenger cars, city buses, rigid trucks, semi-trailer rigs, and farm tractors. No vehicle mesh is shipped as an external asset, and no manifest or credit entry is needed.

**Free/open candidates audited, not adopted:** the [RGS_Dev Free Low Poly Vehicles Pack on OpenGameArt](https://opengameart.org/content/free-low-poly-vehicles-pack) identifies the pack as CC0; its included `License.txt` names Raphael Gonçalves and explicitly grants commercial/public-domain use. The archive has FBX files for a roadster, bus, rigid truck, and truck with trailer, but no tractor. It is visibly stylized low-poly and FBX-only, whereas the current verified asset pipeline derives GLTF/GLB with pinned optimization and LODs; no reproducible FBX conversion was added. The models therefore remain unshipped. The [Innerscene low-floor bus](https://www.innerscene.com/tools/library/3d-parts/low-floor-city-bus-9e7ce899) page also declares a CC0 GLB, but it was not locally inspected or used. Kenney and Quaternius vehicle packs are likewise CC0 stylized candidates, not runtime dependencies. No exact reference geometry or branded model was copied.

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

1. **No free licensed production car.** The hero car is our own design. It can be genuinely good — correct
   proportions, panel gaps, clearcoat paint, glass, detailed wheels — but it will not be a scanned, licensed
   manufacturer model.
2. **No AAA licensed soundtrack.** We get good, season-matched CC0/CC-BY music, not an official festival soundtrack.
3. **Japan-specific landmark photogrammetry is scarce in CC0.** Real Japanese shrines/torii in the wild are either
   CC-BY community models or not free at all. Our world is a **composite, fictional prefecture** built from CC0
   materials plus in-house landmarks — not a scan of a real place, and we will never claim otherwise.
4. **Specific real locations cannot be rebuilt.** Forza pays capture crews. We author a plausible, coherent region.
5. **Full traffic AI and crowds remain bounded Phase 9 work.** The authorized visual-actor slice now has instanced passenger cars, city buses, rigid trucks, semi-trailer rigs and farm tractors, with totals fixed at C/B/A = 6/12/18 and no moving colliders. Pedestrians, crossings/right-of-way, vehicle collision truth, recovery and further population remain separate work.

None of these stop the project hitting `docs/VISUAL_TARGET.md`; they define the ceiling of it.

---

## 6. Acquisition rules (how assets actually enter the repo)

1. Everything is fetched through a **small Node script** (`scripts/fetch-assets.mjs`, Phase 3) that pins each asset
   by **source id + version/hash**, so the build is reproducible and reviewable. No manual downloads, no mystery
   binaries.
2. Every entry is written to `public/assets/manifest.json` (ids, paths, source URL, creator, licence, hash,
   and the optimization chain and settings used) and, when attribution applies, to `CREDITS.md`.
3. Assets pass the pipeline before commit. Textures and HDRIs ship as published (resized at fetch time); **models
   are derived** by `scripts/build-models.mjs` — dedupe/prune/weld → one mesh per level of detail → position-seam
   merging on the deeper levels → simplification → **KHR_mesh_quantization** → **EXT_meshopt_compression** →
   **KHR_texture_basisu (KTX2, ETC1S)** → budget check.
4. Nothing is committed if its licence text is missing or ambiguous. `scripts/verify-assets.mjs` runs in CI and gates
   both the licence register and the model budgets, so this cannot rot.
5. Textures and models that only exist to be _sources_ (16K HDRIs, 8K scans) stay out of the repo; the build fetches
   the needed resolution and commits only the optimized runtime files. Model sources are cached in `.asset-cache/`,
   which is not committed — they are reproducible from the pinned URLs and MD5s in the build script.

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
