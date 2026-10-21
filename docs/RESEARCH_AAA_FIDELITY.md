# Research: what a Forza-Horizon-class look actually requires, and what of it is reachable in this project

**Status:** research record, 2026-10-14  
**Question asked by the owner:** the Phase 2 car looked cartoonish and boxed; the target is "Forza Horizon level" graphics — realistic car models, environment aesthetics, seasons, roads, terrain. What are we missing, and how should the project be rearranged to get there?

This document is the evidence base for the rearranged plan in `PROJECT_PLAN.md` §6–§11 and the decisions recorded
in `docs/decisions/0004-visual-fidelity-and-rendering-pipeline.md`. It separates three things that are easy to
blur together: **what Forza Horizon is technically**, **what a browser can do today**, and **what this project can
realistically own**.

---

## 1. What we are actually being compared against

Forza Horizon 5 is a first-party Microsoft title: a multi-hundred-person production across Playground Games and
Turn 10, a custom engine (ForzaTech), a 4-year cycle, and a budget in the tens of millions of dollars. Its world
was built from on-location capture in Mexico — the team sent crews to the country and **"captured 24-hour shoots of
real Mexican skies at 12K resolution"** with an HDR camera rig, and used **12K photogrammetry** for terrain and
geology detail ([PC Gamer](https://www.pcgamer.com/forza-horizon-5-next-gen/), [TweakTown](https://www.tweaktown.com/news/79986/forza-horizon-5-ray-tracing-high-end-12k-photogrammetry-textures/index.html)).
Car models come from manufacturer CAD data plus dedicated car artists; the game ships tens of gigabytes of
streamed assets and renders on consoles with unified memory and hardware ray-tracing units.

No realistic reading of "exactly like Forza Horizon" is achievable by a browser game built by one person. That is
not a rendering-technology gap alone; it is a **content-production gap**: scanned assets, artist hours, licensed
CAD, and audio/vehicle databases. The honest target — and the one this plan now sets — is:

> **AAA-inspired fidelity in a browser**: physically-based materials and lighting, an HDR sky and dynamic
> time-of-day, dense and varied terrain with roads and vegetation, seasons and weather that visibly and physically
> change the world, a realistic-looking car with automotive-grade paint, a film-grade post-processing chain, and
> frame-rate budgets that hold up on real hardware — while being explicit that asset depth, world scale, and
> photogrammetric authenticity will trail a AAA production.

Everything below is arranged around closing the **technique and pipeline** gap (which we can close) rather than
the **art-capital gap** (which we cannot).

---

## 2. How Forza Horizon achieves its look (feature catalogue, with sources)

| Area                   | What ForzaTech/Playground actually does                                                                                                                                                                                                                                                                                                                                                                                                                            | Source                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global illumination    | Replaced FH4's voxelised GI with **surfel GI**: indirect bounce data derived from surface normal + albedo, placed via a procedural probe system, baked and then combined with real-time lighting through a compute shader. Gives correct bounce light, low light leakage, and works with a **fully dynamic time of day**.                                                                                                                                          | [Digital Foundry, FH5 tech showcase](https://www.digitalfoundry.net/articles/digitalfoundry-2021-forza-horizon-5-xbox-series-technology-showcase)                                                                                                                               |
| Sky & weather coupling | Procedural sky that **reacts to the weather system** (clouds thicken and swirl as a storm rolls in), volumetric fog that blends with the sky, and volumetric dust storms.                                                                                                                                                                                                                                                                                          | same                                                                                                                                                                                                                                                                            |
| Terrain detail         | **Parallax occlusion mapping** on terrain plus **layers of virtual texturing** for granular ground detail; ground detail holds up at 200 mph.                                                                                                                                                                                                                                                                                                                      | same                                                                                                                                                                                                                                                                            |
| Buildings/props        | **Cone-step mapping** for depth on buildings (quality mode).                                                                                                                                                                                                                                                                                                                                                                                                       | same                                                                                                                                                                                                                                                                            |
| Contact grounding      | **Screen-space contact shadows** used to ground small foliage and rocks that would otherwise float.                                                                                                                                                                                                                                                                                                                                                                | same                                                                                                                                                                                                                                                                            |
| Foliage                | Dedicated **translucent foliage material**; a simulated weather system that affects the whole map "down to the movement of palm fronds".                                                                                                                                                                                                                                                                                                                           | same                                                                                                                                                                                                                                                                            |
| Particles              | Lit and shadowed particles (rain, dust, spray).                                                                                                                                                                                                                                                                                                                                                                                                                    | same                                                                                                                                                                                                                                                                            |
| Reflections            | High-resolution **screen-space reflections** on car bodies in gameplay; ray-traced reflections appear in ForzaVista/photomode rather than racing. FH5 gameplay has **no ray-traced reflections**.                                                                                                                                                                                                                                                                  | [GamingBolt](https://gamingbolt.com/forza-horizon-the-complete-graphical-evolution-of-the-series-from-1-to-5), [Steam discussion](https://steamcommunity.com/app/1551360/discussions/0/3387291961154497717/)                                                                    |
| Clouds                 | FH5 uses **captured photographic sky material** driven procedurally for the visible sky rather than a fully ray-marched volumetric cloudscape in gameplay; a bespoke volumetric cloud shot exists in the intro. Forza Motorsport 2023 added real-time volumetric clouds.                                                                                                                                                                                           | [Reddit/Forza community](https://www.reddit.com/r/ForzaHorizon/comments/zmt1bl/who_thinks_forza_horizon_4s_skybox_is_better/), [Eurogamer FM tech review](https://eurogamer.net/digitalfoundry-2023-forza-motorsport-tech-review-a-pleasing-visual-upgrade-for-series-veterans) |
| Car rendering          | Bent normals on car models, dedicated material work for metallic paints and clearcoats, high-quality interiors used in ForzaVista; automotive marketing-grade meshes ~300k–800k polys, game hero cars typically **100k–200k triangles**.                                                                                                                                                                                                                           | [DF summary](https://famiboards.com/threads/digital-foundry-forza-horizon-5-tech-analysis-an-xbox-series-x-masterpiece.849/), [88Cars3D](https://88cars3d.com/2025/12/01/from-mesh-to-masterpiece-a-technical-guide-to-using-3d-car-models-for-rendering-and-games/)            |
| Seasons (FH4)          | Every terrain material authored with diffuse/normal/AO/roughness/height/blend/**hardness (wetness)**; **seasonal variants** generated from a summer master, including in-house **"Winteriser" nodes** for frost and snow breakup; foliage transmissive masks with **baked-in self-shadowing** for depth; surface "conductivity" (heat transfer into the tyre) changes with temperature and wetness, so the same road drives differently by season and time of day. | [Adobe Substance magazine: FH4 seasons](https://substance3d.adobe.com/magazine/forza-horizon-4-creating-seasons-with-substance/), [Fandom](https://www.fandom.com/articles/forza-horizon-4-weather-seasons)                                                                     |
| Tire/physics detail    | Forza Motorsport 2023 rebuilt the tire model around **eight contact points** with a more complex suspension, for finer load distribution and force fidelity.                                                                                                                                                                                                                                                                                                       | [ForzaTech writeup](https://foro3d.com/en/2026/february/forza-motorsport-2023-and-its-forzatech-graphics-engine.html)                                                                                                                                                           |
| Scale                  | Open world streamed and rendered at 60 FPS with dynamic time-of-day, extreme weather, traffic/AI, and physics, "at 250 mph".                                                                                                                                                                                                                                                                                                                                       | [Klobrille](https://x.com/klobrille/status/1409811901199093765)                                                                                                                                                                                                                 |

Three lessons matter more than the feature list:

1. **Most of the "Forza look" is lighting and materials, not polygon count.** Surfel GI + HDR sky + POM terrain +
   contact shadows + restrained post-processing do the heavy lifting. A scene with mediocre meshes and excellent
   lighting reads as "real"; the reverse reads as a toy.
2. **Detail is layered, not uniform.** Near the camera: POM, splat-blended materials, dense foliage. Far away:
   impostors, lower LODs, fewer layers. Forza spends geometry where the player looks.
3. **The world is authored, not generated.** Photogrammetry gave them real-world _variety_; procedural systems
   alone produce bland, repetitive terrain. We cannot scan Mexico, so we must source scanned CC0 assets and
   art-direct hard, or accept a "clean stylised-realistic" look.

---

## 3. What the browser/Three.js stack can do today (verified against our pinned r186)

We pinned `three@0.186.1`. I inspected the installed package rather than relying on marketing claims:

**Available in `three/examples/jsm/tsl/display/` (TSL post-processing nodes):** `BloomNode`, `GTAONode`,
`SSAONode`, `SSGINode`, `SSRNode`, `TAAUNode`, `MotionBlur`, `DepthOfFieldNode`, `ChromaticAberrationNode`,
`FilmNode` (grain), `Lut3DNode` (colour grading), `GodraysNode`, `LensflareNode`, `DenoiseNode`,
`RecurrentDenoiseNode`, `BilateralBlurNode`, `SharpenNode`, `FSR1Node`, `SMAANode`, `FXAANode`, `SSSNode`
(subsurface), `OutlineNode`, `AfterImageNode`, `RGBShiftNode`.

**Other engine-side assets:** `examples/jsm/csm/` (`CSM.js`, `CSMShadowNode.js`) for cascaded shadow maps;
`examples/jsm/objects/Sky.js`, `SkyMesh.js`, `Water.js`, `Water2.js`, `WaterMesh.js`, `GroundedSkybox.js`;
`examples/jsm/loaders/` has `KTX2Loader`, `DRACOLoader`, `GLTFLoader`; `MeshPhysicalMaterial` in r186 supports
`clearcoat`, `sheen`, `iridescence`, `anisotropy`, `dispersion`, `transmission` and attenuation — i.e. the
automotive paint layers (flake + clearcoat) are expressible without a custom BRDF.

**Renderer path.** `WebGPURenderer` (from `three/webgpu`) is stable, initialises through `setAnimationLoop()`,
and **falls back to a WebGL2 backend automatically**. TSL compiles to WGSL on WebGPU and GLSL on the WebGL2
backend, and the same `RenderPipeline` post-processing stack runs on both. The WebGL2 backend emulates compute
via transform feedback and lacks storage textures and indirect draws.

**Cost of migrating.** Our custom shaders used `ShaderMaterial`/`onBeforeCompile` (the Phase 1 sky dome and ground
grid did), which **do not run on the WebGPU backend**; the Phase 3 migration rewrote both in TSL and added a
source guard (`npm run guard:glsl`). `EffectComposer` and
`pmndrs/postprocessing` are WebGL-only and are replaced by `RenderPipeline`. Community reports put non-trivial
ports at weeks-to-months of work ([migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide),
[field notes](https://www.buildmvpfast.com/blog/threejs-webgl-to-webgpu-renderer-migration-2026)).

**WebGPU availability in 2026:** ~82–87% of browsers by caniuse-derived trackers (Chrome/Edge since 113, Safari
since 26 — including iOS 26, Firefox shipped on Windows/Apple Silicon), with Linux/Android Firefox and older
devices still on the WebGL2 fallback ([byteiota](https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/),
[utsubo](https://www.utsubo.com/blog/webgpu-threejs-migration-guide), [web3dsurvey](https://web3dsurvey.com/webgpu)).

**Practical implication:** the "AAA post-processing stack" is no longer something we must write from scratch; it
ships with the engine we already use. What we must own is the _content pipeline_, the _material library_, the
_world systems_, and the _performance discipline_.

---

## 4. Gap analysis: Forza element → our project today

Current state is Phase 2: a flat grey arena, a gradient sky shader, one directional light with PCF shadows, and a
box-geometry placeholder car. Every row below is a gap; the column that matters is **feasible in-browser**.

| #   | Forza Horizon element                                               | Our state (Phase 2)                         | Feasible in browser?    | Technique we would adopt                                                                                     | Phase   |
| --- | ------------------------------------------------------------------- | ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | Dynamic HDR sky + time of day                                       | Static gradient sky dome                    | **Yes**                 | HDRI-based sky + `Sky`/`SkyMesh` atmospheric scattering, sun-driven exposure, 24 h cycle                     | 3       |
| 2   | Image-based lighting / ambient                                      | `AmbientLight(0xffffff, 0.9)`               | **Yes**                 | PMREM-processed HDRI environment map on every material                                                       | 3       |
| 3   | GI bounce (surfel/probe)                                            | none                                        | **Partly**              | Baked irradiance probes + `SSGINode` screen-space GI on high tier; no baked lightmaps for a procedural world | 3, 8    |
| 4   | Cascaded shadows at distance                                        | single 2048 PCF, camera-following           | **Yes**                 | `CSM.js` / `CSMShadowNode`, per-tier cascade counts, contact shadows for props                               | 3, 5    |
| 5   | POM/virtual-textured terrain                                        | flat plane + in-shader grid                 | **Yes**                 | Multi-layer splat terrain material (height + AO blending), POM on near tier, detail maps                     | 4       |
| 6   | Roads with real surfacing                                           | none (arena)                                | **Yes**                 | Spline-generated road mesh, layered materials, markings, kerbs, wetness masks                                | 4       |
| 7   | Dense vegetation that moves                                         | none                                        | **Yes, budgeted**       | GPU-instanced grass/trees with LOD + impostors, wind in vertex stage, translucent foliage material           | 5       |
| 8   | Contact/screen-space shadows for small props                        | none                                        | **Yes**                 | Screen-space shadow pass using depth/normal                                                                  | 5       |
| 9   | Volumetric fog, dust, god rays, lit particles                       | none                                        | **Partly**              | Depth-fog + `GodraysNode` + volumetric raymarch at low res on high tier; lit particles via TSL               | 5, 7    |
| 10  | Weather that changes driving                                        | none                                        | **Yes**                 | Rain/snow/dust particles, wet-road roughness + puddles, spray, traction coupling to surface state            | 7       |
| 11  | Seasonal world variants (FH4 "Winteriser")                          | none                                        | **Yes**                 | Season parameter set swapped on shared materials + snow/frost masks + foliage variants; visible and physical | 7       |
| 12  | Photogrammetric realism                                             | procedural boxes                            | **Partly**              | CC0 scanned PBR surfaces (Poly Haven / ambientCG) + scanned props; no scanning pipeline of our own           | 4, 5    |
| 13  | Hero car model (100k–200k tris, interiors)                          | box mesh, ~1k tris                          | **Legally constrained** | Royalty-free/marketplace model with a recorded licence, or in-house Blender build; never ripped game assets  | 6       |
| 14  | Automotive paint (flake, clearcoat, orange peel)                    | flat `MeshStandardMaterial`                 | **Yes**                 | `MeshPhysicalMaterial` clearcoat + procedural flake normal/roughness + micro-detail                          | 6       |
| 15  | SSR on car body, wet reflections                                    | none                                        | **Yes**                 | `SSRNode` (high tier) + reflection probes/cubemap fallback                                                   | 3, 6, 7 |
| 16  | Film-grade post (bloom, DOF, motion blur, grain, grade, anamorphic) | none                                        | **Yes**                 | `RenderPipeline` + TSL display nodes, exposure/ACES/AgX + LUT grading                                        | 3       |
| 17  | Temporal AA / upscaling                                             | none                                        | **Yes**                 | `TAAUNode`/`TRAA` + dynamic resolution scale                                                                 | 3       |
| 18  | 8-contact tire model                                                | 4-ray suspension + simplified magic formula | **Partly**              | Increase to multiple sample rays per wheel/contact patch and refine the force curve                          | 6       |
| 19  | Photoreal captured skies at 12K                                     | gradient shader                             | **Yes**                 | CC0 HDRIs (Poly Haven: 990+ HDRIs, CC0) for sky/IBL, blended with atmospheric scattering                     | 3       |
| 20  | 50 GB streamed world, traffic, audio database                       | 800 m arena                                 | **No**                  | Out of scope by design; chunked streaming of a much smaller authored world                                   | —       |

---

## 5. Legally usable content: what we can and cannot source

The asset question is the binding constraint on "realistic", so it is a planning input, not an afterthought.

**Photorealistic surfaces, HDRIs, scanned props:**

- **Poly Haven** — CC0, no attribution, commercial use: 990+ HDRIs, 850+ PBR textures, 520+ models; public API.
- **ambientCG** — CC0: 2,000+ PBR materials, HDRIs, models.
- **Fab (Epic)** — free Megascans starter collection (1500+ scanned assets) under the Fab Standard licence plus
  rotating free content; **not** CC0, so each listing's licence must be recorded, and the Standard tier has a
  revenue threshold. The era of the whole Megascans library being free ended 2024-12-31.
- **Sketchfab / Poly Pizza / BlenderKit** — mixed licences; CC0 filters exist; CC-BY requires attribution.
- Sources and licence text: [Cinevva guide](https://app.cinevva.com/guides/game-assets-guide),
  [Quixel→Fab FAQ](https://support.fab.com/s/article/Fab-Transition-FAQs), [ambientCG](https://ambientcg.com/).

**Cars** (the hardest asset):

- Game hero cars run **100k–200k triangles**; mobile-grade cars 15k–25k; automotive marketing meshes 300k–800k.
  Free CC0 car models exist (e.g. a Sketchfab CC0 concept car at ~484k triangles) but arrive far too heavy and
  are usually unbranded concepts, not recognisable production cars.
- Recognisable modern cars require either a manufacturer licence or an artist building a **generic, unbranded**
  design from scratch. We will not use ripped assets or brand marks.
- Practical options: **(a)** commission/build one in-house hero car in Blender (~2–4 weeks of skilled artist time);
  **(b)** buy a royalty-free game-ready model and record its licence in the asset manifest; **(c)** ship a
  "generic coupe" built procedurally/by code to a high material standard as an interim hero, with correct
  proportions, panel gaps, glass, wheels, and paint.
- **Resolved 2026-10-14 and clarified 2026-10-22 (owner): free/open only, no purchases.** The player car is an
  in-house, unbadged fictional **Kaminari** GT roadster; Ferrari California is only a broad body-class reference,
  not a source mesh or branding template. External models are eligible only when provenance, licence and suitability
  are verifiable. The Unity Fan CC0 concept cars and the audited CC0 RGS_Dev FBX pack are not incorporated. The current
  code-authored roadster passes a <20k-triangle/≤12-Mesh automated budget test at `cdcd8f1`. See the verified
  sourcing decision and candidate audit in [`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md) §3.5. The earlier (b)-then-(a)
  recommendation is superseded.

**Pipeline for whatever we source** (all of this is engine-agnostic and self-owned):

- `gltf-transform` optimization chain: prune/dedupe → LODs → quantization → **meshopt** geometry compression →
  **KTX2/Basis** textures (4–8× less GPU memory than RGBA8) → WebP/AVIF for non-GPU-critical maps.
- Texture discipline: a single 4096² RGBA8 texture costs ~89 MB of VRAM if left uncompressed — cap at 1024/2048,
  pack ORM, transcode to KTX2, and call `KTX2Loader.detectSupport(renderer)`.
- Reference numbers from a published pipeline study: 28 MB test model → 22.8 MB (quantization) → 5.1 MB (meshopt)
  → 2.6 MB (Draco); meshopt decodes far faster than Draco, which matters on mobile.

---

## 6. What we must not promise

To keep this project honest, these claims are explicitly out of bounds:

1. **"Exactly like Forza Horizon."** Asset depth, licensed cars, scanned world authenticity, and a
   multi-hundred-person art budget are out of reach. The measurable target is the technique list in §4, validated
   per phase.
2. **Photoreal in every frame.** A browser renderer with a software fallback path will not match a console
   renderer at 4K with hardware RT. Our tier system must state explicitly what is on/off per tier.
3. **Frame-rate promises without hardware evidence.** The dev sandbox runs SwiftShader (CPU rasterisation); the
   only honest performance statements are ones measured on named devices with recorded resolution and settings.
4. **A big open world.** Streaming scope will be a small, dense, authored region — a few square kilometres, not a
   country. The region is now fixed: the fictional rural-Japanese **Hinode Prefecture** (`docs/VISUAL_TARGET.md` §5).
5. **Traffic, crowds, and full simulation databases.** Phase scope keeps the vehicle count low. Audio is
   **synthesized/procedural from free sample libraries** (Sonniss GDC, Freesound CC0), not a licensed AAA engine
   recording, and the music is a CC0/CC-BY playlist rather than an official soundtrack.
6. **Any specific real place.** The region is a _composite_ of Japanese scenery built from CC0 materials and
   in-house landmarks — not photogrammetry of a real location, and never presented as one.

---

## 7. Conclusion: what to change in the plan

Three structural changes follow from this research, and are now written into `PROJECT_PLAN.md`:

1. **Put the rendering foundation before the world.** The original plan had terrain in Phase 3 and "final
   graphics" in Phase 6, which would have meant building the world with placeholder tech and rebuilding it later.
   The rearranged roadmap makes the next phase a dedicated **renderer + asset-pipeline + material-library**
   phase, so terrain, roads, vegetation, and the car are all authored against the final pipeline.
2. **Make fidelity measurable.** `docs/VISUAL_TARGET.md` defines per-system quality bars, tier gates, a
   look-dev validation scene, and screenshot/stat-based checks, so "looks AAA" becomes a reviewable checklist
   rather than a vibe.
3. **Treat content sourcing as engineering.** A documented asset pipeline (gltf-transform → KTX2/meshopt), a
   licence register, LOD conventions, and budgets per asset class, because in a browser the asset budget _is_
   the frame budget.

The phase mapping (old → new) and the acceptance criteria live in `PROJECT_PLAN.md` §9–§11.

---

## 8. Sources

- [Digital Foundry — The technology of Forza Horizon 5](https://www.digitalfoundry.net/articles/digitalfoundry-2021-forza-horizon-5-xbox-series-technology-showcase)
- [PC Gamer — FH5's on-location capture and 12K HDR sky shoots](https://www.pcgamer.com/forza-horizon-5-next-gen/)
- [TweakTown — 12K photogrammetry textures, ray tracing, GI system](https://www.tweaktown.com/news/79986/forza-horizon-5-ray-tracing-high-end-12k-photogrammetry-textures/index.html)
- [Adobe Substance — Forza Horizon 4: creating seasons with Substance](https://substance3d.adobe.com/magazine/forza-horizon-4-creating-seasons-with-substance/)
- [GamingBolt — graphical evolution of Forza Horizon 1→5](https://gamingbolt.com/forza-horizon-the-complete-graphical-evolution-of-the-series-from-1-to-5)
- [Eurogamer/DF — Forza Motorsport (2023) tech review: volumetric clouds, dynamic lighting](https://eurogamer.net/digitalfoundry-2023-forza-motorsport-tech-review-a-pleasing-visual-upgrade-for-series-veterans)
- [ForzaTech overview — Forza Motorsport 2023 tire model (8 contact points)](https://foro3d.com/en/2026/february/forza-motorsport-2023-and-its-forzatech-graphics-engine.html)
- [Three.js TSL display effects / RenderPipeline](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Three.js WebGL → WebGPU migration checklist (2026)](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
- [Three.js performance best practices (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [WebGPU adoption 2026](https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/), [web3dsurvey](https://web3dsurvey.com/webgpu)
- [glTF/GLB optimization: Draco vs meshopt vs KTX2](https://app.cinevva.com/guides/optimize-glb-for-web)
- [Free asset sources and licences (2026)](https://app.cinevva.com/guides/game-assets-guide), [Poly Haven](https://polyhaven.com/), [ambientCG](https://ambientcg.com/), [Quixel→Fab FAQ](https://support.fab.com/s/article/Fab-Transition-FAQs)
- [Car polygon budgets (game hero cars 100k–200k tris)](https://88cars3d.com/2025/12/01/from-mesh-to-masterpiece-a-technical-guide-to-using-3d-car-models-for-rendering-and-games/)
- [Automotive paint layering (clearcoat + flake), DSPBR spec](https://dassaultsystemes-technology.github.io/EnterprisePBRShadingModel/spec-2021x.md.html)
