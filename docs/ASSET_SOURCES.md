# Asset sources — the free and open content register

**Owner's directive (2026-10-14):** use the best-quality **free, open** resources available — no purchases, no
licence fees, no restricted licences — and do not compromise the visual target to get them. Find premium-looking
open models and audio first, then build.

**Owner's amendment (2026-10-22; ADR 0007):** AI-generated assets and free account-gated sources are permitted for future work, subject to the exact-item license hierarchy, source verification, separate brand/design checks, owner-approved accounts, and the no-purchase rule. The hero-vehicle asset must still be CC0.

This document is the verified answer to "what premium-looking free content actually exists for this game?" It is
the sourcing plan for `docs/VISUAL_TARGET.md`; `docs/ASSET_POLICY.md` holds the rules, `public/assets/manifest.json`
holds what we actually ship, and `CREDITS.md` holds attribution.

**Verified:** the Poly Haven and ambientCG APIs were queried directly on **2026-10-14** during this research; the
library counts and asset names quoted below are from those live responses, not from memory. Anything with a ⚠️ is a
caveat, not a recommendation.

---

## 1. The rule

| Tier                       | Licence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rule                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Default**                | **CC0 / public domain** (Poly Haven, ambientCG, Kenney, Quaternius, KayKit, Sketchfab CC0, Unity Fan cars, Sonniss GDC, Freesound CC0, OpenGameArt CC0, Smithsonian, NASA, OFL fonts)                                                                                                                                                                                                                                                                                                                                                       | Use freely. Attribution is not required; we credit anyway in `CREDITS.md` because it is decent and cheap.                                                                                        |
| **Exception**              | **CC-BY** (some Sketchfab Japanese landmark props, some music)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Allowed **only** when no CC0 asset of comparable quality exists, and only with the credit line implemented automatically in `CREDITS.md` and the in-game credits screen. Never for hero content. |
| **Excluded / conditional** | Paid assets, paid plans/credits, Non-Commercial or No-Derivatives terms, marketplace "freebie" licences, ripped/converted game assets, or uncleared badges/logos remain excluded. AI-generated and free account-gated sources are allowed under ADR 0007 only after exact-item license/provenance and redistribution rights are verified; CC0 remains preferred, CC-BY is limited to the attributed non-hero exception, and hero vehicles remain CC0-only. Exact branded body designs still require separate design/trade-dress permission. | Never use a source that fails the relevant license, provenance, account, or brand-rights gate.                                                                                                   |

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

| Source                                                      | What it gives us                                                                                                     | Licence                                                                    | Attribution                                   | Access                                                                            | Quality verdict                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Poly Haven**                                              | 997 HDRIs, 869 PBR textures, 521 models (incl. scanned trees, plants, ground cover, rocks, coastal cliffs, lanterns) | CC0                                                                        | None                                          | Public keyless API (`api.polyhaven.com`) + direct downloads                       | **Premium.** Multi-16K/20K source, industry-standard scanning; this is the same library paid projects use.                                                                         |
| **ambientCG**                                               | 2 000+ PBR materials + HDRIs (1K–16K, direct download links)                                                         | CC0                                                                        | None                                          | Public API v2                                                                     | **Premium.** Ideal for asphalt, concrete, gravel, snow, ice, rock.                                                                                                                 |
| **Sonniss GDC Game Audio Bundle**                           | 2015–2026 bundles, **200+ GB** of commercial-library samples; 2026 edition = 7.47 GB / 347 files from 17 vendors     | Royalty-free, no attribution, lifetime use in unlimited projects           | None                                          | Direct download / torrent, no account                                             | **Premium — literally the paid libraries' own files.** The single best free audio find for this project.                                                                           |
| **Freesound**                                               | ~381 000 CC0 sounds (licence filter)                                                                                 | CC0                                                                        | None                                          | Web + API                                                                         | **Good→premium.** Perfect for specific recordings (engine, rain, cicada, gulls).                                                                                                   |
| **Kenney**                                                  | 200+ packs, 60 000+ assets incl. 10 audio packs                                                                      | CC0                                                                        | None                                          | Direct download                                                                   | **Clean, stylized.** Not for realistic hero content; excellent for UI sounds and kitbashing.                                                                                       |
| **Quaternius / KayKit (Kay Lousberg)**                      | 80+ themed packs, props, vehicles, characters                                                                        | CC0                                                                        | None                                          | Direct download                                                                   | **Stylized.** Traffic proxies and distant props only, if used at all.                                                                                                              |
| **OpenGameArt**                                             | Music, SFX, 3D under CC0/CC-BY/GPL (per item)                                                                        | Per item                                                                   | Depends                                       | Web                                                                               | **Varies.** Filter to CC0.                                                                                                                                                         |
| **Sketchfab (CC0 filter)**                                  | Scanned props, including Japanese items                                                                              | CC0 / CC-BY / mixed                                                        | Per model                                     | Web, no account for download on CC0/CC-BY                                         | **Varies wildly.** Audit each model's triangle count and licence text before use.                                                                                                  |
| **Meshy community gallery**                                 | AI-generated community 3D models; formats/access vary by item                                                        | Per-item; several reviewed posts display CC0                               | Per listing                                   | Account-gated; free-account access not verified per item                          | **No replacement selected.** Selected listing is user-reported subscription-gated; reviewed alternatives failed visual/class checks. Category FAQs do not prove item-level access. |
| **Innerscene vehicle library**                              | Original/unbranded CC0 car GLBs, including coupes, roadster and hatchbacks                                           | CC0 under contributor terms; item pages declare CC0                        | None                                          | Blog says no account; six anonymous `HEAD` probes returned 405 (no GET attempted) | **Not selected.** Six previews were below the hero-quality bar; download access remains unverified.                                                                                |
| **Sketchfab — Unity Fan concept cars**                      | ~50 author-described public-domain/CC0 concept-car models, 200k–760k triangles                                       | Item descriptions claim CC0; sampled Sketchfab metadata says Free Standard | None claimed                                  | Download access not tested                                                        | **Unverified/ineligible.** Sampled pages have a license conflict; no model/design review or download.                                                                              |
| **BlenderArtists “Free Cars” thread**                       | Community car files linked from a forum thread                                                                       | Original uploader says “no license”; CC0 text was posted by another user   | Unclear                                       | Facebook-linked access not tested                                                 | **Excluded/unverified.** Provenance and design sources are unresolved; no files were accessed.                                                                                     |
| **Poly Pizza / Icosa Gallery (Google Poly archive)**        | Fast stylized props                                                                                                  | Mostly CC-BY                                                               | Yes                                           | Web                                                                               | Low-poly only; not for this target.                                                                                                                                                |
| **Smithsonian Open Access / NASA 3D**                       | Museum scans, spacecraft                                                                                             | CC0                                                                        | None                                          | Web                                                                               | Niche; useful if we ever need a specific object.                                                                                                                                   |
| **Google Noto (incl. Noto Sans JP), Inter, JetBrains Mono** | UI, Japanese typography, diagnostics                                                                                 | SIL OFL 1.1                                                                | None in binary; no selling of the font itself | Direct download / npm                                                             | **Premium and free.**                                                                                                                                                              |
| **Arbaro** (GPL-2.0), **ngPlant**, **GroIMP**               | Open-source tree/plant generators implementing Weber & Penn-style growth models                                      | GPL / open source                                                          | None (our exported meshes are ours)           | Source + build                                                                    | **The vegetation answer.** We generate sugi, momiji, sakura trunks/branching ourselves and texture them with scanned CC0 bark.                                                     |

⚠️ **Fab/Megascans free starter** (mentioned in earlier research) is _not_ used: the whole-library-free era ended
2024-12-31, the starter collection sits under the Fab Standard licence with its own conditions, and it would put a
non-auditable licence on our critical path. Free CC0 scans cover the same need.

**AI/account-gated source amendment (2026-10-22, ADR 0007):** the owner now permits AI-generated assets and free account-gated sources project-wide. This is not blanket approval of an entire gallery: verify each exact item's license, creator/uploader, AI status, provenance, redistribution rights, and applicable platform terms under the existing license hierarchy. No paid plans, subscriptions, upgrades, or credits are allowed. The selected Meshy listing below remains unacquired; the user reports logging into Meshy, but the assistant has no access to that authenticated browser session or model file.

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

No free candidate has yet cleared both the rights/access checks and the production-car quality bar. What exists:

| Option                                                                      | Reality                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unity Fan's ~50 **public-domain/CC0-claimed concept cars** (200k–760k tris) | The creator calls them public-domain/CC0, but reviewed Sketchfab pages show a conflicting “Free Standard” platform-license label. The rights conflict is unresolved; not eligible for a CC0-only hero until independently cleared. High-poly and still needs material/interior/topology evaluation.       |
| Grab3D 1980s Sports Car / Sports Car                                        | Item-specific CC0 and procedural origin, with direct free GLB access verified. Both are stylized and below the current hero-quality target; the 1980s model has a hollow cabin/interior, while the other has opaque windows/no interior. Not selected.                                                    |
| Innerscene original/unbranded car GLBs                                      | Six previews (two-door coupe, 1990s sports coupe, grand tourer, roadster and two hatchbacks) are visibly too simple/wedge-like for the hero target. Pages say CC0; terms require rights assertions and warn CC0 does not grant trademark/patent rights. Anonymous `HEAD` returned 405; access unverified. |
| BlendSwap Sports car base                                                   | Exact item page is CC0-labeled and free-account downloads are available, but this is a basic base mesh with unresolved provenance/design clearance; anonymous download is blocked. Not a finished hero asset.                                                                                             |
| Kenney/Quaternius/KayKit vehicle packs                                      | CC0 but stylized low-poly; wrong look for a photoreal world. Possibly distant traffic only.                                                                                                                                                                                                               |
| three.js's example `ferrari.glb`                                            | Real-brand Ferrari: trademark risk, and the licence trail depends on third-party attribution. Excluded.                                                                                                                                                                                                   |
| "Free" marketplace cars (RenderHub, Free3D, TurboSquid free section)        | Brand names plus non-open "extended use" licences. Excluded by the rule in §1.                                                                                                                                                                                                                            |

**Current vehicle direction (2026-10-22; supersedes the earlier exact-Ferrari request):** the owner broadened the hero-car search to any manufacturer and amended the asset policy to permit AI-generated and free account-gated sources under ADR 0007. The selected generic red Meshy listing displays CC0, but the user reports its download requires a subscription and chose to continue searching at the unchanged Forza-Horizon-class visual bar; no purchase, paid plan, or stylized fallback is authorized. The user reports a free-account login, but the assistant has no access to that session and no model file has been downloaded. Hero cars remain CC0-only, and recognizable real-vehicle design, trademarks, trade dress, badges, and plates need separate clearance or removal; CC0 does not grant third-party design rights ([Creative Commons FAQ](https://creativecommons.org/faq/), [CC0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)). No replacement is selected; keep the in-house Kaminari roadster. The follow-up source audit and item-level outcomes are recorded below and in `docs/SESSION_HANDOFF.md` §70.

**Exact-model audit (no qualifying candidate found):** the [plus360degrees Car Visualizer](https://carvisualizer.plus360degrees.com/threejs/?hl=en-US) lists “Ferrari California” but does not expose model provenance, downloadable source, or a reuse license; its “not for commercial purposes” note is not a model license. The [2008 Ferrari California on Sketchfab](https://sketchfab.com/3d-models/2008-ferrari-california-9f110e246c194c6fb3583d07bb54ba22) is marked CC BY but explicitly says it is based on a Racing Master model, so upstream game-asset rights are unverified and it is excluded. The [2012 Ferrari California Sketchfab model](https://sketchfab.com/3d-models/2012-ferrari-california-493edc1a96fb47b9be315e2c1f3de863) is based on CSR2 and marked CC BY-NC-SA, so it is excluded by both provenance and license. The [WA7KVI Ferrari California model](https://sketchfab.com/3d-models/ferrari-california-white-003b73707c7642bb97937314bdaf92a0) is marked CC BY and “Generated with AI”; AI origin is no longer categorically disqualifying under ADR 0007, but this is not the selected generic model, is not a CC0 hero asset, and has no documented Ferrari design clearance. The [3DModels.org model](https://3dmodels.org/3d-models/ferrari-california/) is paid, so it violates the no-purchases rule. None of these Ferrari-specific candidates is adopted.

**Selected Meshy candidate (download blocked; not acquired):** [A sleek, high-performance red sports car inspired by modern Italian supercars](https://www.meshy.ai/posts/019db878-afec-724d-9675-a1710eddd51b) is a Meshy 6 community listing marked CC0, with 400,689 triangular faces and 232,209 vertices. The public cover preview shows AI-like irregularities and a badge-like detail; the complete model, exact creator/provenance record, materials, interior, and shape have not been inspected. The user reports the download requires a subscription even after logging in, and explicitly chose a free-download alternative; do not pay or try to bypass the requirement. The assistant has no access to the user's account and no model file. The exact downloadable file, license terms, and separate brand/design suitability remain unverified, so this item is not eligible for integration.

**Free-alternative audit (2026-10-22; no model downloaded or selected):**

- **BlendSwap [Sports car base](https://blendswap.com/blend/13077) by arenyart:** the exact item page lists CC0, Blender 2.7x, and a 147 KB file; its description explicitly calls it a very basic, easily modified basemesh. The preview does include wheels (so it is not a bare body), but shows the control/wire topology and no finished cabin/material presentation. Its origin/design source is not stated, and the sports-car silhouette is not cleared for trade dress. BlendSwap's [About page](https://blendswap.com/about) says downloading requires a free account (five downloads/day); its [MCP/API page](https://blendswap.com/3d-mcp-api) says item-license claims are uploader-declared and are not verified by the platform. An unauthenticated `HEAD` to the item's download URL returned HTTP 403; no BlendSwap account was created and no file was downloaded. This is not a production-ready or rights-cleared hero.
- **BlendSwap [MegaSUV](https://blendswap.com/blend/22972) by Barzu:** the page lists CC0, 548 KB, and Blender 2.7x; the author says it is a creative futuristic SUV design not copied from an existing car. Public previews show a red, unbadged-looking SUV/crossover rather than the requested sports-car silhouette. The platform describes licenses as uploader-declared, the anonymous download endpoint returned HTTP 403, and neither source rights nor the actual geometry was verified. Unresolved lead only, not a recommendation.
- **Grab3D [1980s Sports Car](https://grab3d.com/models/vehicles/1980s-sports-car/):** the item page and [`LICENSE.txt`](https://grab3d.com/dl/1980s-sports-car/LICENSE.txt) state CC0; its [manifest](https://grab3d.com/dl/1980s-sports-car/manifest.json) reports 18,905 triangles, 2K PBR and a 1,217,424-byte GLB. It has separate wheels, a cabin with seats/steering wheel and transparent windows. The maker documents a procedural Blender-script origin with AI code assistance, but no AI-generated geometry/textures. An unauthenticated `HEAD` to the direct GLB returned HTTP 200 and the expected content length, confirming direct free access without an account. The public preview is a stylized red wedge with pop-up lights and a spoiler; it falls below the Forza-Horizon-class hero-quality target, so it is not selected.
- **Grab3D [Sports Car](https://grab3d.com/models/vehicles/sports-car/):** exact CC0/license and procedural-origin records are available; direct unauthenticated `HEAD` returned HTTP 200 for its 1,551,344-byte GLB. The 34,763-triangle 2K model has opaque windows/no interior and a stylized coral body with white stripes/spoiler, so it also misses the target.

**Outcome:** no suitable verified free hero car has been found. Keep the unbadged in-house Kaminari GT (code-authored; under 20k triangles and no more than 12 rendered Mesh objects in tests) and the in-house passenger-car/bus/truck/semi-trailer/tractor traffic. No third-party vehicle mesh is shipped or added to the manifest. The owner explicitly chose to continue searching at the current visual bar; no stylized fallback is approved. Do not run the asset pipeline until a candidate is approved and all rights, access, provenance, design and runtime gates pass. Full automated checks for the code-authored vehicle/traffic passed at `cdcd8f1`.

**Other free/open candidates audited, not adopted:** the [RGS_Dev Free Low Poly Vehicles Pack on OpenGameArt](https://opengameart.org/content/free-low-poly-vehicles-pack) identifies the pack as CC0; its included `License.txt` names Raphael Gonçalves and explicitly grants commercial/public-domain use. The archive has FBX files for a roadster, bus, rigid truck, and truck with trailer, but no tractor. It is visibly stylized low-poly and FBX-only, whereas the current verified asset pipeline derives GLTF/GLB with pinned optimization and LODs; no reproducible FBX conversion was added. The models therefore remain unshipped. The [Innerscene low-floor bus](https://www.innerscene.com/tools/library/3d-parts/low-floor-city-bus-9e7ce899) page declares a CC0 GLB but is unrelated to the player-car target. Kenney and Quaternius vehicle packs are likewise CC0 stylized candidates, not runtime dependencies.

**Follow-up sourcing sweep (2026-10-22; details in `docs/SESSION_HANDOFF.md` §70):** Innerscene’s six generic car pages describe original/unbranded CC0 GLBs, but their previews miss the target and anonymous `HEAD` requests returned 405; no file was fetched. BlenderArtists’ “Free Cars” uploader states there is no license and says the models were built from vehicle blueprints; another forum participant, not the uploader, posted CC0 wording. Unity Fan Sketchfab listings sampled for Concept Cars 003, 025, 037, 038, 040 and AI-based 049 repeat the uploader’s CC0 claim while the platform lists “Free Standard,” so the conflict remains unresolved. Fresh Meshy posts “Crimson Jewel Car,” “Golden Hour Racer,” “Desert Lightning GT,” “KMZ-H80,” and “White Velocity” display CC0 on their pages, but reviewed previews show non-car content, a sci-fi truck, or stylized/toy-like designs below target; access remains unverified per item. No candidate passed all gates.

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

1. **No suitable verified external hero vehicle is integrated.** The selected Meshy listing is user-reported subscription-gated, and the owner chose to continue searching at the current visual bar with no stylized fallback approved. BlendSwap `Sports car base` is a basic CC0-labeled basemesh with unresolved provenance/design clearance and no anonymous download; Grab3D’s 1980s Sports Car is directly free/CC0 but below the visual-quality bar; Innerscene previews are also below target and access remains unverified. No model is selected or downloaded. Keep the in-house Kaminari car until a candidate clears source, rights, cost-free access, provenance/design, pinned-pipeline and runtime visual gates.
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
