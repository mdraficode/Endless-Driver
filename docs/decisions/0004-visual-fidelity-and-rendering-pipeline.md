# Visual fidelity, rendering pipeline, and asset strategy

**Status:** Accepted 2026-10-14 (owner approved the direction; the five open questions were resolved in ADR 0005)
**Date:** 2026-10-14
**Phase:** Cross-cutting; governs Phase 3 and every phase after it

## Context

Phase 2 shipped a working car on a flat grey arena: a gradient-sky shader, one directional light
with PCF shadows, and box geometry for the vehicle. The owner reviewed the Phase 2 screenshots and
rejected the presentation, asking for "Forza Horizon level" graphics — realistic car models,
environmental aesthetics, seasons, roads, and terrain. They authorized a research step-back and a
full re-plan before any further implementation.

The research is recorded in `docs/RESEARCH_AAA_FIDELITY.md` (what Forza actually does, what
Three.js r186 can do, a 20-row gap analysis, and what can legally be sourced) and the normative
visual specification is `docs/VISUAL_TARGET.md` (five pillars, per-system quality bars, tier
matrix, look-dev workflow, region brief). This ADR records the decisions that follow, their
consequences, and the boundaries we refuse to overstate.

Three structural problems had to be resolved, not just "more effects":

1. **Ordering.** The old roadmap put terrain in Phase 3 and "final graphics" in Phase 6. Building a
   procedural world with Phase-2-era rendering and re-authoring it a phase later would have wasted
   the world work and the vehicle work alike.
2. **Renderer path.** Custom GLSL (`ShaderMaterial`) exists today, but `three`'s `WebGPURenderer`
   ignores `ShaderMaterial`/`onBeforeCompile`, and the project needs the post-processing stack that
   only ships as TSL display nodes (`RenderPipeline`). This decision had to be made _before_
   materials, terrain, and vehicle shading are written, because it determines how they are written.
3. **Content.** Every pixel in a browser has an asset cost and a licence. "Realistic" is an asset
   problem as much as a shading problem, and the car — the object the player looks at most — is the
   hardest asset to obtain legally.

## Decision

### 1. Keep Three.js and move to the WebGPU/TSL rendering path with a WebGL2 fallback

The project stays on Three.js (ADR 0002 stands; no renderer swap). Within Three.js it moves from
`WebGLRenderer` to **`WebGPURenderer` from `three/webgpu`**, using the library's automatic fallback
to the WebGL2 backend when WebGPU is unavailable.

- Custom shading is written in **TSL** (Three.js Shading Language) node materials. The remaining
  Phase 1/2 GLSL-era code (the in-shader ground grid, and any `onBeforeCompile` usage) is ported or
  deleted in the Phase 3 migration commit.
- A CI-visible guard rejects new `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile(` usage
  under `src/`.
- Both backends are exercised in the same test runs; the tier matrix states what each backend loses
  (for example, the WebGL2 path cannot use compute-based effects and is the practical home of the
  low tier).

WebGPU availability in 2026 is roughly 82–87% of browsers (Chrome/Edge 113+, Chrome Android 121+,
Firefox 141+/145–147, Safari 26 on macOS/iOS/iPadOS), leaving a low-double-digit share — notably
Linux and Android Firefox — on the WebGL2 backend. That is exactly why the fallback is mandatory
rather than optional.

### 2. Post-processing is one TSL `RenderPipeline`

`EffectComposer` and the pmndrs `postprocessing` package are WebGL-only; neither is used. The stack
is ordered explicitly: scene render/MRT depth+normals → SSAO (or SSGI, which replaces separate AO) / SSR,
tier-gated → low-sun shafts (no fog or atmospheric veil) → restrained optional bloom → DOF → motion blur
→ tone mapping → LUT grading → grain/chromatic aberration/vignette → TAAU/TRAA or FXAA/SMAA. Tone mapping
and colour-space conversion happen exactly once, at the end of the pipeline. Gameplay-wide bloom remains off.

### 3. Rendering, asset, and material foundations move _before_ world content

The phase order changes (details and acceptance criteria in `PROJECT_PLAN.md` §9):

| Old | Content                            | New                                                                                             |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 3   | Terrain, roads, streaming          | **4** (same content, on the final renderer)                                                     |
| 4   | Advanced vehicle + realistic model | **6**                                                                                           |
| 5   | Mobile touch, HUD                  | **8**                                                                                           |
| 6   | Seasons, weather, "final graphics" | **3** (renderer/lighting/post/asset/material pipeline), **7** (weather/seasons), **8** (polish) |
| —   | —                                  | **3** (new) and **5** (vegetation, props, atmosphere)                                           |

Phase 3 therefore delivers: the renderer migration, colour pipeline and exposure, HDRI IBL +
dynamic sky + time of day, cascaded shadows, the post stack, temporal AA with dynamic resolution,
the `gltf-transform`/KTX2/meshopt asset pipeline with a licence register, and a look-dev studio
scene plus a fixed 2 km validation route with 12 bookmarked screenshots.

Phases 1 and 2 are **not** re-opened: the Rapier physics authority (ADR 0001), the custom raycast
force layer, input smoothing, and the chase camera (ADR 0003) remain valid and are extended.

### 4. Quality tiers are explicit contracts, not automatic behavior

Tiers C (mobile/low), B (desktop balanced), and A (desktop high) are defined in
`docs/VISUAL_TARGET.md` §3 with per-system on/off states (shadows, AO, reflections, terrain layers,
vegetation, clouds, particles, post stack, AA, resolution scale). The active tier is visible in the
diagnostics overlay and recorded with every performance claim. The dev sandbox runs SwiftShader and
may only assert correctness — never frame rate.

### 5. Content sourcing is engineering, with the car as the binding constraint

- External environment and vehicle assets are **free/open only, CC0-first**; any other permissive licence, attribution, provenance and redistribution terms must be verified and recorded before use. No paid or account-gated models.
- **No ripped game assets, manufacturer trademarks, badges, logos or copied trade dress.** The player car is a fictional, unbadged in-house Kaminari GT roadster; Ferrari California is only a broad convertible/GT body-class reference. No external model is incorporated in this increment.
- Every external asset passes the automated pipeline — prune/dedupe → LODs → quantization → **meshopt** geometry compression → **KTX2/Basis** textures → budget check — driven by the asset manifest, not by hand. Textures are capped at 1024/2048 (a single 4096² RGBA8 texture costs ~89 MB of VRAM uncompressed). Code-authored Three.js geometry is tracked by tests, not the third-party manifest.
- Budgets: the current player roadster is tested below 20k triangles and at no more than 12 rendered Mesh objects at `cdcd8f1`; any future imported high-detail model requires a separate 100k–200k LOD budget plus verified suitability/licence. Props ≤ 5k; foliage via atlases and impostors.

### 6. Visual work is validated by a repeatable procedure

A studio scene (`?scene=studio`) with HDRI/time-of-day/weather switches and a material sphere grid,
plus a fixed 2 km route with 12 camera bookmarks (dawn/noon/dusk/night × rain/snow/season variants).
The same 12 screenshots are re-shot every phase and diffed (SSIM) against the previous baseline;
structure changes are expected, silent regressions are not. A system is "done" only after:
reference board → implementation → studio validation → route validation → tier tuning → performance
recorded → docs updated.

### 7. What this ADR explicitly does not claim

No Forza parity. Forza runs photogrammetry capture crews, 12K source textures, baked surfel GI, and
native console hardware. This project targets the technique list in `docs/RESEARCH_AAA_FIDELITY.md`
§4 at quality-tiered fidelity, and `docs/VISUAL_TARGET.md` §6 lists what "done" does not mean. No
frame-rate promise is made without measurements on named hardware, and no stylized fallback is ever
presented as the intended quality.

## Consequences

**Positive**

- One rendering layer for both backends; materials, terrain, weather, and the car are written once
  against the final pipeline instead of being re-authored later.
- The post stack, AA, and asset pipeline arrive before the content that depends on them, which is
  the cheapest possible order for a project of this shape.
- "AAA look" becomes a reviewable checklist (quality bars, bookmarks, tier matrix) instead of an
  argument.
- Licence and budget discipline is enforced by tooling and manifests rather than by memory.

**Negative / mitigations**

- **Migration cost.** Phase 1/2 shader-era code must be ported to TSL, and TSL/node material
  knowledge is thinner in the ecosystem than classic three.js. Mitigation: the migration is the
  first, self-contained task of Phase 3, it is guarded by a lint rule, and nothing visual is authored
  until it is complete.
- **Two backends to test.** Every rendering change must be validated on WebGPU _and_ the WebGL2
  fallback. Mitigation: tier C is defined on the WebGL2 path, so the fallback is the low tier rather
  than a second-class port; both run in the same harness.
- **A longer road to content.** Terrain now arrives a phase later than originally planned.
  Mitigation: content phases run on proven tech, and Phases 4–7 can proceed without rework.
- **Asset risk is real and partially outside engineering control.** A hero car may need purchase or
  commissioning; the interim coupe keeps the pipeline moving meanwhile.
- **Performance claims cannot be validated in this sandbox.** SwiftShader metrics (currently ~15 FPS,
  sim/wall ≈ 0.82) are correctness evidence only; every tier claim needs named hardware.
- **Scope creep.** The visual bar invites endless polish. Mitigation: `docs/VISUAL_TARGET.md` quality
  bars are the definition of done, and each phase still stops for authorization.

## Open questions — resolved

The five questions raised here were answered by the owner on 2026-10-14 and are recorded in
[ADR 0005](0005-free-and-open-asset-strategy.md) and `docs/VISUAL_TARGET.md` §7: free-and-open sourcing only
(no purchases), an unbadged fictional brand, the rural-Japan "Hinode Prefecture" region, free sample libraries
plus a project-owned engine synth, and photo mode in scope for Phase 8. The verified register behind those
answers is `docs/ASSET_SOURCES.md`.

## Related

- `PROJECT_PLAN.md` §6 (rendering/seasons/weather architecture), §8 (tiers/budgets), §9 (phases 3–8),
  §10 (acceptance), §11 (assets, risks, deferred decisions).
- `docs/RESEARCH_AAA_FIDELITY.md` — evidence, capability audit, gap analysis, sources.
- `docs/VISUAL_TARGET.md` — normative visual specification, quality bars, look-dev workflow, region brief (§5).
- `docs/ASSET_SOURCES.md` — verified free-and-open asset register.
- `docs/decisions/0005-free-and-open-asset-strategy.md` — licence policy, region, brand, car, and audio decisions.
- `docs/ASSET_POLICY.md` — licence rules and manifest requirements.
- `docs/decisions/0001-engine-and-physics.md`, `0002-renderer-three-js.md`,
  `0003-vehicle-physics-and-camera.md`, `0005-free-and-open-asset-strategy.md`.

## Current renderer/material foundation (2026-10-21)

The owner broadly authorized Phase 6 on 2026-10-20 despite pending Phase 5 acceptance; this authorization does not accept Phase 5 or open Phases 7–8. The renderer prefers WebGPU with automatic WebGL2 fallback and AgX tone mapping by default. Radiance HDRI can be shown as a background for comparison; the post chain uses MRT normals/depth, SSAO, SMAA/TAAU and only an opt-in restrained bloom comparison. Scanned opaque surfaces bind sRGB albedo, tangent-space normals and linear AO/roughness/metalness with TSL macro variation. Glass and emissive surfaces receive no fabricated maps. Vehicle effects use fixed-capacity GPU compute on WebGPU and are disabled on WebGL2, not simulated on the CPU. One Three.js unit equals one metre. Code-level implementation is not visual acceptance, device validation or a performance result.
