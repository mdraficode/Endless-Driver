# Visual target: the look we are building toward, and how we will know we got there

**Status:** specification, updated 2026-10-21 · **rural region and sourcing decisions resolved 2026-10-14; additional fictional megacity district authorized 2026-10-19; Phase 6 and Phase 9 active; owner reports Phase 5 passed; Phases 7–8 remain gated**  
**Companion documents:** [`docs/RESEARCH_AAA_FIDELITY.md`](RESEARCH_AAA_FIDELITY.md) (evidence and feasibility),
[`docs/GRAPHICS_REFERENCE_ANALYSIS.md`](GRAPHICS_REFERENCE_ANALYSIS.md) (public reference evidence and material assignments),
[`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md) (the verified free-and-open asset register backing every claim here),
[`PROJECT_PLAN.md`](../PROJECT_PLAN.md) §6–§11 (the phased plan),
[`docs/decisions/0004-visual-fidelity-and-rendering-pipeline.md`](decisions/0004-visual-fidelity-and-rendering-pipeline.md)
and [`0005`](decisions/0005-free-and-open-asset-strategy.md) (decisions).

The owner's requirement: graphics "as close as that Forza Horizon's level" — realistic car models, environmental
aesthetics, seasons, roads, terrains. This document turns that into something buildable and reviewable.

---

## 1. The five pillars

Everything visual in this project must serve at least one of these. If a feature serves none, it is out of scope.

1. **Light is the product.** HDR environment lighting, a dynamic sun/sky, correct exposure, and indirect bounce
   do more for perceived realism than any polygon. A cheap mesh in great light reads as real; a great mesh in flat
   light reads as a toy.
2. **Material truth.** Every surface is physically-based: measured albedo ranges, correct roughness/metalness,
   packed ORM maps, detail layers that survive close inspection, and automotive paint with clearcoat and flake.
3. **Depth without a veil.** Layered terrain, scale cues, shadows and horizon composition should make distance feel deep while preserving clear sightlines. Fog, mist and global atmospheric veils stay disabled per owner direction; low-sun shafts remain tier-gated.
4. **Density where you look.** Detail is budgeted by distance: high-frequency near-field detail (POM, splat
   layers, grass, gravel, cracks, kerbs), impostors and simplified LODs far away. Never uniform detail.
5. **The world changes.** Time of day, weather, and season visibly transform the same road — sky, light colour,
   wetness, foliage, snow, and grip. This is the Horizon signature and it must be a system, not a toggle.

---

## 2. Per-system quality bars

Each row states the **target**, the **measurable check** (how we prove it in Phase review), and the phase that
owns it. "Tier" refers to §3.

### 2.1 Sky, light, and atmosphere

| Target                                                                                               | Measurable check                                                                                                               | Phase |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Physically plausible sky driven by sun position; sunset/sunrise colour, night with stars and a moon  | At 06:00/12:00/18:00/00:00 the same camera position yields visibly distinct, plausible lighting; no hand-authored colour steps | 3     |
| HDRI image-based lighting on all materials, PMREM-processed, switched per time-of-day/weather preset | Materials show coloured specular from the environment; turning IBL off visibly flattens the scene (A/B screenshot)             | 3     |
| Exposure control that survives dawn/dusk/night transitions                                           | No clipping of the sky or crushed shadows across a 24 h sweep at fixed camera; histogram spread stays inside bounds            | 3     |
| Urban night sources: soft Gaussian halation plus subtle diffraction/starbursts, gated by darkness    | At night each flare remains confined to its lamp/signal; daylight gates it off; road markings stay legible with no global veil | 9     |
| Cascaded shadows: sharp and stable near camera, extended range at distance                           | Shadow map resolution ≥ 1024 per near cascade, ≤ 1 px shimmer when the camera moves 1 m laterally, no visible cascade seams    | 3     |
| Clear distance readability with fog and haze disabled                                                | Distant hills remain identifiable and do not collapse into a grey/white veil across daylight and night bookmark captures       | 3, 5  |
| God rays / light shafts at low sun on the high tier                                                  | Visible under tree canopies and through gaps at sun elevation < 15°, no banding, disabled below the high tier                  | 3, 7  |

### 2.2 Terrain and roads

**Owner correction (2026-10-18; latest report 2026-10-21):** gameplay terrain must not render white/snow ground. The active splat is grass, soil, and rock only; snow is not loaded or weighted in the current gameplay material. The owner reports Phase 5 passed and earlier non-FPS issues resolved, while FPS remains unstable. No named-device frame-time measurement or runtime capture is supplied by that report. Seasonal snow belongs to the gated Phase 7 scope and must not reappear in the default gameplay world.

| Target                                                                                                          | Measurable check                                                                                                                         | Phase |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Three-material summer-ground splat (grass, soil, rock), with height/AO blending and no visible tiling           | At 2 m and 20 m viewing distance, no repeating pattern within a 50 m span; layer boundaries follow terrain features rather than UV seams | 4     |
| Parallax occlusion mapping for near-field ground relief (high tier)                                             | Road-edge gravel and kerb relief reads as depth, not a flat texture, when the camera is within ~8 m                                      | 4     |
| Procedural road network with believable surfacing: asphalt layers, markings, kerbs, shoulders, cambered corners | A 500 m drive shows continuous asphalt with correct markings, no UV stretching on curves, shoulder material transitions                  | 4     |
| Water: rivers/lakes with reflections and depth-based colour                                                     | Water reflects the sky and nearby geometry; shallow areas show bottom colour                                                             | 4     |
| Terrain LOD and chunk streaming with no visible pop at speed                                                    | Driving at 150 km/h, chunk boundaries show no seams, cracks, or texture pops; LOD transitions within a 2-frame blur budget               | 4     |
| Scanned-derived surface detail (CC0 PBR sets) for aggregate, rock, soil, grass                                  | Material close-ups match their reference boards                                                                                          | 4     |

### 2.3 Vegetation and environment detail (Phase 5)

| Target                                                                                | Measurable check                                                                                                            | Phase |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| Dense instanced ground cover (≥ 100k instances on high tier) with wind animation      | Grass covers the verge continuously with no visible instance grid pattern; wind is visible but not uniform across the field | 5     |
| Trees: 3+ LODs with impostor billboards, shadow casting fitted to distance            | Tree count at 300 m distance shows no LOD popping in a slow fly-by; impostors match silhouette and colour                   | 5     |
| Translucent foliage material (leaf backlight, subsurface tint)                        | Leaves at low sun glow without blowing out; backlit and frontlit foliage differ clearly                                     | 5     |
| Contact/screen-space shadows beneath small props and foliage                          | Rocks and grass clumps are visually anchored (no floating), shadow contact density scales with tier                         | 3, 5  |
| Props: rocks, barriers, signs, poles, fences with correct scale and material response | Scale check against the car (1.8 m tall reference); no intersected/oversized props in the drive route                       | 5     |

**Implementation note (updated 2026-10-21):** the initial ground-cover batch has fixed instance-pool caps of 16k / 42k / 100k for C/B/A and is reported separately from tree/prop instances. The cap is not proof that a given streaming window reaches 100k, that the cover is continuous, or that it meets frame budgets; actual counts, LOD/pop-in, fixed-bookmark appearance, and owner-device performance remain to be reviewed. Its TSL wind/backlight uses the existing daylight and tier pipeline. The owner reports Phase 5 passed; the subsequent world-detail sequence is code-complete, but runtime visual and device evidence remain separate. New building surfaces use the current HDRI image-based lighting and AgX tone mapping by default with TSL PBR variation; this does not add SSR or hardware ray tracing. The reference-driven PBR coverage at `ceaa184` adds CC0 maps selectively to asphalt/shoulders, sidewalks, cedar bench boards, concrete planters, Yūhi wall-body boxes, and selected opaque Aohara low-rise facades. It retains the existing HDRI/AgX/SSAO pipeline and does not map glazing, emitters, trim, tires, or generic automotive paint. Full local checks and GitHub workflows passed; no browser visual review or named-device measurement is claimed. See [`docs/GRAPHICS_REFERENCE_ANALYSIS.md`](GRAPHICS_REFERENCE_ANALYSIS.md) for source evidence and limits.

### 2.4 The car (Phase 6)

| Target                                                                                           | Measurable check                                                                                                       | Phase |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----- |
| Hero car model at 80k–200k triangles with correct proportions, panel gaps, glass, wheels, lights | Silhouette compared against a reference board at matched framing reads as a car, not a box; panel gaps visible at 2 m  | 6     |
| Automotive paint: base coat + metallic flake + clearcoat, optional pearlescent                   | On a studio turntable: sharp clearcoat highlight, subtle flake shimmer that changes with view angle, no "plastic" look | 6     |
| Glass, chrome, rubber, plastic, brake discs: distinct material responses                         | Each material behaves differently under a moving light; rubber is matte, chrome mirrors, glass refracts/tints          | 6     |
| Interior (partial or full) with a cockpit camera path                                            | Cockpit view shows a plausible dashboard, wheel, mirrors, and A-pillars without obvious holes                          | 6     |
| Dirt, dust, rain, and snow accumulation masks that respond to the world                          | After driving through rain/mud/snow, the car visibly changes; wipers/lights interact with the water layer              | 6, 7  |
| Reflection quality on the bodywork (SSR high tier, probes lower tiers)                           | Reflections land on the correct surface regions without swimming artefacts                                             | 6, 7  |

**Narrow gameplay increment authorized 2026-10-19 (not Phase 6 asset work):** add procedural exhaust/tire
smoke, brief sparks on forward gear changes, and restrained wind marks above 90 km/h. These visuals do not
change grip or gameplay physics. Keep effect pools tier-capped and localized, with no global bloom. The existing car should handle as forgiving arcade: predictable steering,
less abrupt rear-grip loss, and clear countersteer recovery. The high-speed shutter is exactly zero through
120 km/h, eases to the tier maximum by 195 km/h on B/A, and remains disabled on C. This limited increment
does not start the hero-car, weather, or broader Phase 8 work.

### 2.5 Weather and seasons (Phase 7)

| Target                                                                                                  | Measurable check                                                                                                   | Phase |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| Rain: falling particles, wet road roughness + puddles, spray, wipers, reduced grip                      | Road reflections appear in puddles, spray trails the car, grip reduces measurably in the physics telemetry         | 7     |
| Snow: accumulation masks on surfaces, tracks/churn, reduced grip, snow-dust particles                   | Snow accumulates on terrain props and the car; the wear layer follows the driven path                              | 7     |
| Autumn/spring: foliage swaps, leaf drift, mud; summer: dry dust only, with heat haze disabled           | Each season at a fixed camera produces a distinct, recognisable palette and asset set                              | 7     |
| Season changes are physical, not only cosmetic                                                          | The same corner taken at the same speed shows different slip angles between summer and winter (recorded telemetry) | 7     |
| Day/night lighting: headlights, taillights, brake lights, street/implicit lights, darker night exposure | Night drive reads as night while the road stays navigable; lights bloom without washing out the frame              | 3, 7  |

### 2.6 Post-processing and image quality (Phase 3, tuned per tier)

| Target                                                                                                                                                     | Measurable check                                                                                                                                  | Phase |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Tone mapping + colour grading pipeline (ACES/AgX + LUT) applied exactly once                                                                               | No double tone mapping (grey/washed look); grading LUT visible in the look-dev scene                                                              | 3     |
| SSAO/SSGI, restrained optional bloom, SSR, DOF (photography), speed-gated motion blur (camera), grain, chromatic aberration, vignette as one ordered chain | Each effect individually toggleable with a visible-on/off reference; motion blur stays exactly zero through 120 km/h and ramps by 195 km/h on B/A | 3     |
| Temporal AA / upscaling with dynamic resolution                                                                                                            | Edges resolve cleanly at 0.7× scale; no persistent ghosting on fast camera pans                                                                   | 3     |
| Contact shadows grounding props against the sun                                                                                                            | Contact darkening at surface junctions on the sun side; median frame pixel untouched                                                              | 3     |
| Bounced diffuse light (SSGI, high tier)                                                                                                                    | Shadowed sides lift with neighbour colour; replaces (never stacks on) SSAO                                                                        | 3     |
| No artefact regressions on the WebGL2 fallback path                                                                                                        | Identical scene validated on `?webgl` with the documented per-backend differences                                                                 | 3     |

---

## 3. Quality tiers

Tiers are **explicit contracts**, not "auto magic". The tier system must be visible in the HUD/debug overlay and
recorded in every performance claim.

| System                                         | Tier C: mobile/low                                     | Tier B: desktop balanced                                        | Tier A: desktop high                                            |
| ---------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Renderer path                                  | WebGPU preferred; automatic WebGL2 fallback            | WebGPU preferred; automatic WebGL2 fallback                     | WebGPU                                                          |
| Resolution                                     | DPR ≤ 1.0, FXAA scene scale 0.50–1.0 (spatial upscale) | DPR ≤ 1.25, FXAA scene scale 0.55–1.0 (spatial upscale)         | DPR ≤ 2.0 with resolution cap, TAAU scale 0.75–1.0              |
| Anti-aliasing                                  | FXAA; no temporal history or velocity attachment       | FXAA + adaptive spatial scaling; no temporal history            | TAAU + dynamic resolution, higher scale floor                   |
| Shadows                                        | 1 cascade, 1024                                         | 2 cascades, 1024                                                | 4 cascades, 2048–4096                                           |
| Ambient occlusion                              | Off or baked                                           | SSAO (half res)                                                 | SSGI composite (replaces SSAO)                                  |
| Reflections                                    | Environment IBL + Aohara local clearcoat               | SSR (half res) + probes (pending)                               | SSR + probes (pending); Aohara wet-look is local PBR            |
| Terrain layers                                 | 2                                                      | 3                                                               | 4 + POM                                                         |
| Vegetation                                     | Impostors, ≤ 20k; TSL sway off                         | LOD1–2, ≤ 80k; TSL sway ≤ 0.035 m                               | Full LOD0 near, ≤ 200k; TSL sway ≤ 0.065 m                      |
| Runtime foliage chunks generated per frame     | 1                                                      | 2                                                               | 3                                                               |
| Clouds/atmosphere                              | HDRI IBL + clear procedural sky; no fog                | Clear procedural sky; clouds off, no fog                         | Sky + clouds/light shafts where enabled; no fog                 |
| Urban night lights                             | Faint local halo + 2-axis starburst, few active lights | Soft halo + restrained 4-axis starburst, capped lights/windows  | Full local halo + subtle 4-axis starburst, source-isolated      |
| Aohara facade panes/frames + structure details | 2,400 / 512                                            | 4,800 / 1,024                                                   | 7,200 / 1,600                                                   |
| Vehicle particles / shutter                    | ≤ 32 smoke, 6 sparks, 4 airflow marks; no blur         | ≤ 64 smoke, 10 sparks, 10 airflow marks; no global blur          | ≤ 88 smoke, 14 sparks, 16 airflow marks; 0–0.36 high-speed blur |
| Post stack                                     | Tone map + grade; SSAO off; no global bloom            | + half-res SSAO; no temporal resolve or global blur              | + SSGI (replaces SSAO) + grain; no global bloom                 |
| Target frame                                   | 30–60 FPS                                              | 60 FPS                                                          | 60+ FPS where hardware permits                                  |

Budgets from `PROJECT_PLAN.md` §8 remain the reference; every tier gate is validated on **named hardware** with
recorded resolution and settings. The performance-first C/B profiles start at scene scales 0.72/0.75 and adapt
within 0.50–1.0 / 0.55–1.0, using 0.3 s intervals and 0.1 steps; A retains its higher-quality temporal path and
0.5 s/0.05 defaults. All tiers use an elapsed-time-smoothed frame-time signal. Spatial upscaling may soften detail;
compare that trade on device. These controls are code budgets, not measured FPS guarantees. The dev sandbox
(SwiftShader) may only validate correctness, never frame rate.

**Implementation status (Phase 3).** The C/B/A contracts are code, not prose: `src/config/tiers.ts` holds the
matrix as data and `src/core/QualityTier.ts` resolves and applies it. Selection is deterministic — an explicit
`?tier=C|B|A` wins; otherwise **C is the performance-first default on every unmeasured device**, with mobile and
constrained hardware labeled separately in the HUD. The owner can select B/A explicitly. **Tier A is never
selected automatically**: its settings have not been measured on named hardware, so silent selection would be an
unsupported performance claim. The active tier and reason remain visible for any later device report.

Two documented deviations from the table above:

- **Tier C's renderer path.** All tiers leave the backend on `auto`, preferring WebGPU when available and using
  automatic WebGL2 fallback otherwise; pinning the older API on a device that supports WebGPU would surrender
  capability for no quality gain. `?backend=webgl` forces the fallback for comparison.
- **Anti-aliasing and scaling.** Implemented: MSAA, FXAA, SMAA, and TAAU with dynamic resolution. C/B default
  to FXAA with temporal history and motion vectors off; their scene pass scales within each tier's bounds to
  trade detail for fill-rate. A retains TAAU reconstruction and adaptive resolution. Spatial AA linearly upscales
  and cannot restore lost detail. **No tier uses multisampling by default** (the resolver forces `samples: 0` for
  non-MSAA modes). `?aa=fxaa|smaa|none|taa` names a strategy outright, and `?res=` fixes a scale; when TAA is
  switched off on a TAA configuration, the chain falls back to SMAA.

**Post-processing status (Phase 3).** The stack is assembled by `src/shaders/post-chain.ts` in a fixed, documented
order, and every effect is individually toggleable through configuration:

| Stage                   | Effects                                                                                                      | State   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| Scene (linear HDR)      | ambient occlusion (SSAO), applied via the scene pass                                                         | Shipped |
| Scene-stage HDR         | SSGI composite (tier A; replaces SSAO), contact shadows (tier A)                                              | Shipped |
| Temporal resolve        | TAAU + dynamic resolution (tier A; wraps the scene pass)                                                      | Shipped |
| Linear HDR              | motion blur (tier A shutter), god rays (tier A), time-of-day grade, bloom, depth of field                    | Shipped |
| Pre-sRGB                | SMAA (fallback when the temporal path is off)                                                                | Shipped |
| Colour-space conversion | tone mapping + sRGB (once)                                                                                   | Shipped |
| Display-referred        | look LUT, chromatic aberration, sharpening (RCAS), grain, vignette                                           | Shipped |
| Post-sRGB               | FXAA                                                                                                         | Shipped |
| Pending                 | screen-space reflections (SSR) — tier-declared; its first real surface is the Phase 6 car / Phase 7 wet road | Not yet |

**Renderer/material upgrade (2026-10-21):** WebGPURenderer prefers WebGPU with automatic WebGL2 fallback, AgX is the default tone curve, and `?envbg=1` displays the loaded Radiance HDRI instead of the procedural sky. The TSL scene pass keeps MRT normals/depth for SSAO and supports SMAA/TAAU; `?bloom=1` exposes only a restrained high-threshold comparison. Scanned opaque surfaces bind sRGB albedo, tangent-space normals, and linear AO/roughness/metalness maps plus large-surface macro variation. Placeholder vehicle materials are node-based; glass/emissives have no fabricated maps. `1 Three.js unit = 1 m` is enforced at scene boundaries. Fixed-capacity vehicle effects use TSL compute on WebGPU and are disabled on WebGL2. This is implementation status, not image-quality acceptance or device performance evidence; checks and visual review remain separate.

Global bloom is currently disabled in gameplay at all tiers. The earlier global bloom A/B washed out the frame
and made the horizon read like fog; Phase 9 therefore adds only source-local Gaussian halos and subtle diffraction
sprites around city lights. Those local effects are not a reason to re-enable whole-frame bloom.

The velocity attachment that feeds the temporal resolve and the motion blur is requested only when one of them is
in the chain: it is written by every material in the scene, so an unused motion-vector buffer is a cost paid per
object for nothing.

The time-of-day grade is in the linear stage on purpose. It is a per-frame RGB multiplier resolved from the clock
(`src/environment/EnvironmentClock.ts`) and needed because a _captured_ HDRI backdrop can only be dimmed — it cannot
redden as the sun drops, so dawn and dusk would otherwise read as a dimmed noon under a bright sky. Grading before
the tone curve warms the sky and the shadowed sides of the world together, and cannot clip highlights
because the tone curve runs afterwards. A LUT, when it lands, belongs in the same place.

Two ordering constraints are not preferences and must survive future edits: **SMAA requires pre-sRGB input while
FXAA requires post-sRGB input**, and **sharpening must precede grain** or it amplifies the noise the grain adds.
Both are pinned by tests in `tests/unit/post-chain.test.ts`.

`pending` in each tier definition lists the effects that tier is contracted to control once they exist (AO,
reflections, motion blur, terrain layers, vegetation density). Nothing listed there affects rendering today.

---

## 4. Look development workflow

1. **Studio scene** (`?scene=studio`): HDRI switcher, time-of-day controls, material sphere grid
   (asphalt, gravel, soil, grass, snow, water, glass, chrome, rubber, 3 paint variants), and a control panel.
   **Implemented (Phase 3).** The grid shares the world's lighting, shadows, and post chain. The car turntable and
   the reference board wait for the Phase 6 vehicle; weather controls wait for Phase 7.
2. **Route scene** (`?scene=route`, implemented Phase 3): a fixed 2 km validation route with camera bookmarks
   — 3 stations (start, canopy, summit) × 4 phases (dawn, noon, dusk, night) — the same 12 screenshots every
   phase, diffed against the accepted baseline in `baseline/route/` with SSIM and reviewed by eye. Weather and
   season bookmarks join when Phase 7 makes weather and seasons real; until then bookmarks pin
   `weather: clear, season: summer`.
3. **Screenshot regression in CI-adjacent tooling** (implemented): `npm run capture:route` re-shoots the
   bookmarks headlessly and fails (exit 1) below SSIM 0.97 per bookmark against `baseline/route/`; `--baseline`
   accepts a new set deliberately, and `--stability` adds the TAA on/off temporal-stability bursts. Thresholds
   stay generous — structure changes are expected between phases; unexpected large deltas or missing features
   fail the run. It runs locally, not in CI: the sandbox renderer is SwiftShader, so it asserts structure and
   colour, never frame rate.
4. **Performance gates**: rolling FPS, frame-time percentiles, draw calls, triangles, GPU memory estimate, and
   physics cost, recorded per tier on real devices and stored in the handoff.
5. **Definition of done for a visual system**: reference board exists → implementation → studio scene validated →
   route scene validated → tier matrix tuned → performance recorded → docs updated.

---

## 5. Region brief — "Hinode Prefecture" (日出県)

**Owner decision (2026-10-14):** the world is **rural Japan** — the natural beauty and roadside character of the
settings Forza Horizon uses for its regions. Fictional, but unmistakably Japanese.

**Why this direction is also the smart one technically:** rural Japan is where the content we can legally and freely
obtain is strongest. Poly Haven's Japan HDRIs (`ninomaru_teien`, `bamboo_tunnel` at 20 480 × 10 240,
`spooky_bamboo_morning`, `cedar_bridge` at 16K) plus its CC0 Japanese scanned materials (`japanese_cedar_planks`,
`sakura_bark`, `trident_maple_bark`, `japanese_stone_wall`, `tatami_mat`, `bamboo_wall`) map directly onto the
districts below. The load-bearing question for "does this look like Japan?" is **roadside props and vegetation**,
not a particular landmark — and props we author in-house, so the look stays coherent.

### Shape of the world

A compact, dense rural prefecture: roughly **8 × 8 km** of drivable road network (a few minutes end-to-end at speed), no
country-sized sprawl, everything visible from the road. One volcano silhouette (**Hinode-dake**) is visible from most
of the map and is the visual anchor at golden hour.

**Additional owner decision (2026-10-19):** add the fictional **Aohara Metropolis** as a distinct, high-density Japanese
city district; do not replace or urbanize any rural Hinode district. The Aohara driving-world slice uses a 5×5,
640 m classed grid with 16 blocks, 32 instanced high-rises, 22 authored low-rise shells (shops, casinos, mansions,
townhouses and detached houses), tier-capped low-rise infill (6/9/12 buildings for C/B/A), an open-bowl stadium,
abstract unbadged billboards, street banners and graph-aligned sidewalks, crossings and lighting. It also has 6/12/18
avenue vehicles and 12/24/36 sidewalk pedestrians for C/B/A; vehicles follow signal-aware loops and pedestrians
remain on sidewalks. Traffic now has origin-aware dynamic Rapier colliders and non-destructive impact animation;
pedestrian crossings and full traffic recovery/AI remain outside this increment.
Streetlamp spacing is 40 m (240 instanced poles at the current graph); active unshadowed pointlights are capped at
6/8/12 total across C/B/A, split between street and architectural sources. Localized glow is source-bound; whole-frame
bloom remains off. Aohara Central Avenue is the default game start; rural starts remain explicitly selectable.
`?scene=city` remains an orbit-only lighting preview. Automated checks cover budgets, counts, collision and streaming
selection, but no manual browser drive, owner-device visual/performance review, or acceptance has been recorded for
this increment. This bounded prototype is not represented as a completed megacity or verified driving experience.

| District                            | Road character                                                                          | What it is for                                                                             | Primary seasonal payoff                             |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **Kaiun Coast** (海運海岸)          | Fast coastal expressway, sweepers, a long causeway                                      | Speed, sea horizon, wide skies, sunset runs                                                | Summer sea-glare, winter storm swell                |
| **Hinode Harbour**                  | Harbour loop, container port, fish market lanes                                         | Water reflections, industrial light at night                                               | Rain-slick neon, clear night silhouettes            |
| **Yūhi Town** (夕陽町)              | Tight grid of narrow lanes, crossings, alleys                                           | The everyday Japan look: vending machines, wires, konbini, izakaya                         | Rain, snow, matsuri lanterns                        |
| **Aohara Metropolis**               | Dense multi-lane avenues, signalized intersections, elevated and underground connectors | Added high-rise skyline, urban traffic and pedestrian systems; never replaces rural Hinode | Night windows, local street-light glow, reflections |
| **Take-no-Michi** (竹の道)          | Narrow lane through a bamboo grove toward a shrine                                      | Landmark moment: torii, stone lanterns, moss, stepping-stone shadows                       | Green all year; snow on bamboo in winter            |
| **Chiyo River & Sakura Avenue**     | River road lined with sakura, two bridges                                               | The postcard: blossom tunnels, petals on asphalt                                           | Spring, overwhelmingly                              |
| **Momiji Gorge** (紅葉峡)           | Winding gorge road, river, waterfalls, short tunnels                                    | Technical corners, tunnels, canyon light                                                   | Autumn maple colour, leaf litter, wet road          |
| **Kiri Pass** (霧峠)                | Classic touge: hairpins, guardrails, convex mirrors, clear sunrise                      | The drift road; canyon walls of sugi cedar                                                 | Mud, falling leaves, first snow                     |
| **Shirasagi Terraces** (白鷺の棚田) | Single-lane farm roads between paddies, raised beds                                     | Open sky, mirror-flat water, rice green/gold                                               | Flooded-spring mirror, harvest gold, snow fields    |
| **Hokuto Highlands** (北斗高原)     | Open plateau sweepers, susuki grass, volcanic ash                                       | Big sky, wind, dirt pull-offs, rally-ish routes                                            | Silver grass, frost, deep snow                      |
| **Ginzan Onsen** (銀山温泉)         | Snow-country village lanes, steep approach road                                         | Winter hub: lanterns, steam, wooden buildings                                              | Heavy snow, ice, night glow                         |

**Aohara night-brightening scope (owner follow-up, 2026-10-19):** Add road-facing streetlamp pools plus locally budgeted storefront, venue, billboard and entry-lantern light; add varied fictional building types and decorative banners. Preserve lane/readability first, use instanced citywide decor and nearest-focus unshadowed point lights, and do not use global bloom. Separately, the earlier Aohara-only wet-look clearcoat may respond more strongly at night and reflect the existing HDRI/local lights. These remain static visual/PBR treatments—not SSR, rain, puddles, weather/seasons or traction. Full wet-surface behaviour remains gated to Phase 7.

**Events layer (presentation, not gameplay scope):** seasonal set-dressing that turns the same roads into different
places — _Hanami_ (spring blossom), _Matsuri_ (summer festival: lantern strings, yukata props, fireworks over the
harbour), _Momiji-gari_ (autumn foliage drives), _Yuki-matsuri_ (winter illumination). Forza's sense of place comes
largely from this, and it is cheap once Phase 7 exists.

### Roadside kit (the actual "looks like Japan" list)

Authored in-house from CC0 materials: bamboo-screen and kendo-bamboo fencing, reflective guardrail with cats-eyes,
blue circular signage and red/white curve chevrons, "止まれ" stop markings and painted kanji, overhead utility poles
with dense wire runs, concrete paddy embankments, irrigation channels, convex traffic mirrors at every hairpin,
steel snow-melt pipes and red-slanted snow fences, jizō statues with bibs, stone lanterns and torii (shrine lane),
level crossings with red lamps and barriers, roadside vending machines (doubling as night-time light sources),
komeda-style shop fronts, noren, shōji panels, tiled roofs with heavy eaves, kerbside storm drains, and temple
bells. Each one is a budgeted prop (≤ 5k tris) that pays for itself at every corner.

### Reference palette rules

Sky-driven lighting (never a hand-tuned "sunny" look baked into materials); saturated but not cartoonish foliage;
asphalt that is grey-brown rather than blue-black, with visible wet film in rain; restrained grading at midday and
warm, low-contrast lift at golden hour; no artificial fog, mist, haze or global atmospheric veil. Any look that requires
standing still to look good is rejected.

---

## 6. What "done" does not mean

Restating the constraints from the research document, because they define acceptance in the negative:

- We will not claim parity with Forza Horizon. We claim: **the same categories of technique, executed to a
  documented quality bar, at browser budgets, with a much smaller world.**
- We will never ship ripped or unlicensed assets, brand marks, or manufacturer CAD.
- We will not promise 60 FPS without measured evidence on named hardware.
- We will not build a country-sized world; the target is a compact, dense, authored region.

---

## 7. Owner decisions (resolved 2026-10-14; amended 2026-10-22) and what remains open

**Resolved by the owner:**

| #   | Question            | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Car asset path      | **Free/open, with CC0 preferred; compatible CC BY 4.0 is explicitly accepted for the selected hero with required attribution.** The owner selected MMC Works' Generic Sport Coupé Car (CC BY 4.0) on 2026-10-23. Four local views show no visible branding or unambiguous production-car identity; `ModelLbmw` and the creator's separate BMW M3 project are cautions, not proof. Preserve neutral dashboard media, stop if a specific real-car design appears, retain `CarVisual` as fallback until the reproducible pipeline/runtime gates pass. See ADR 0008 and `docs/ASSET_SOURCES.md` §3.5. |
| 2   | Brand policy        | No uncleared badge, logo, or plate. Default to fictional/unbadged presentation; the selected MMC Works generic coupé is not identified as a real make. The four-view design screen is provisional; stop if further geometry review identifies a specific real-car design. CC-BY does not clear trade dress or other rights.                                                                                                                                                                                                                                                                       |
| 3   | Region              | **Rural Japan** — the fictional **Hinode Prefecture** laid out in §5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | Audio scope         | **Free and open sources only** (Sonniss GDC bundles, Freesound CC0, Kenney CC0), with music built from CC0/CC-BY pools. Engine audio is a Web Audio synth driven by vehicle state, not a sample library. See §3.6 of the asset register.                                                                                                                                                                                                                                                                                                                                                          |
| 5   | Photo mode / replay | **In scope** as late polish (Phase 8): a free-camera pause mode with tier-aware quality bumps, which is cheap once the post stack exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Sub-decision closed 2026-10-14:** the **CC-BY-with-automatic-credit exception stays** (it is only a line of text
naming the artist in the credits — no payment, no restriction on use). It applies to a few Japanese landmark props
(torii, shrine buildings) and some music, and only when no CC0 asset of comparable quality exists. Everything
structural — sky, terrain, roads, vegetation, the car, and all sound effects — is plain CC0. The exception can be
dropped later by authoring those props in-house instead.

**Not questions, but standing constraints the plan keeps:** no purchase requests, no dead ends waiting on a
purchased asset, and every claim about visual quality stays tied to `docs/VISUAL_TARGET.md` and measured evidence.
