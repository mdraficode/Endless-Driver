# Public graphics-reference analysis — 2026-10-21

## Scope and evidence boundary

This review uses only public web pages, public project documentation, and observable interface features. It is a fidelity comparison, **not reverse engineering**. A publicly visible reflection, tone curve, shadow, or configurable colour does not prove which renderer, shader, image-based-lighting setup, ambient-occlusion method, or post-processing stack produced it. The implementation choices below are requirements for Endless Driver, not claims about any reference's hidden internals.

## What the references publicly establish

### Slow Roads — procedural-world and lighting target

- The live site and its public changelog establish an actively updated procedural driving game; the June 2026 release notes mention road/ground shader and texture improvements. This supports the visual goal of continuous, readable road-and-landscape surfacing, but does not identify its current lighting, reflection, tone-mapping, or SSAO implementation.
- The 2023 Google Chrome engineering article describes the then-published WebGL game design: a narrow high-detail corridor, predictive chunk generation and caching, pooled/recycled geometry, preallocated loop memory, and custom shaders that combine textures. It is historical design documentation, not evidence that the current 2026 build uses the same implementation.

Sources: [slowroads.io](https://slowroads.io/); [Google Chrome engineering article](https://github.com/GoogleChrome/web.dev/blob/main/src/site/content/en/blog/slow-roads/index.md).

### Three.js WebGPU materials example — material-system target

The public example is a gallery of built-in materials and NodeMaterials using the Three.js WebGPU/TSL path. It is useful as a reference for material variety and node-material workflows. The linked example is **not a dedicated automotive-paint/reflection demo**, and it does not establish that it uses any particular HDRI, SSAO, tone curve, or car-paint shader. The live example could not be visually tested in the research environment because WebGPU was reported unsupported there.

Sources: [public WebGPU materials example](https://threejs.org/examples/webgpu_materials.html); [example source](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_materials.html).

### +360º Car Visualizer — vehicle presentation target

The public configurator lets visitors select a vehicle/body colour and wheel options and inspect the model from different angles; its page exposes FPS and millisecond UI. The studio describes a WebGL vehicle product-configurator product. These are observable product/interface facts, not disclosure of the configurator's internal reflection probes, HDRI, shadow, or occlusion techniques.

Sources: [+360º Three.js Car Visualizer](https://carvisualizer.plus360degrees.com/threejs/); [Plus360º studio](https://plus360degrees.com/).

## Endless Driver changes and existing foundation

The renderer already provides the requested light and image-quality foundation: a CC0 HDRI PMREM environment for image-based reflections, AgX as the default tone mapper with ACES and Neutral alternatives, and TSL SSAO in the post chain (SSGI replaces SSAO on the higher tier). The HDRI may be shown as a background for comparison. These features are retained; this increment focuses on closing the scanned-material coverage gap rather than claiming the references disclose the same setup.

The material extension uses pinned CC0 1K scans selected by surface type:

| Surface                                               | Map set                                                     | Binding                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terrain, roads and shoulders                          | Existing grass/soil/rock, asphalt and sandy-gravel CC0 sets | Existing streamed terrain and road bindings retained                                                                                                           |
| City sidewalks and concrete planters                  | Poly Haven Gravel Concrete 03                               | sRGB albedo, tangent-space normal and packed AO/roughness/metalness on matching sidewalk/planter geometry                                                      |
| Opaque city/plaster facades                           | Poly Haven Concrete Wall 009                                | Albedo, normal, roughness and packed ARM on selected Aohara low-rise facades and Yūhi wall-body boxes; trims, signage, roofs, frames and glazing stay separate |
| Wooden bench boards                                   | Existing Poly Haven Japanese Cedar Planks                   | Bench-seat group only; steel supports and planter shrubs retain separate materials                                                                             |
| Car paint                                             | Existing TSL physical-material treatment                    | Metallic base/clearcoat remains a purpose-authored automotive response; no unsuitable concrete/industrial scan is assigned                                     |
| Glazing, emitters and mixed/unsupported metal details | No fabricated maps                                          | Glass/emissive paths remain separate; metal trim, signals and light sources retain authored PBR/emissive materials                                             |

Albedo uses sRGB; normal and packed ARM data are linear. ARM channels are red = AO, green = roughness, blue = metalness. A small per-world texture library coalesces requests for shared static-world sets and owns their disposal; the existing streamed terrain resource lifecycle remains independent. Texture sets are pinned and verified through the asset script, manifest and credits register.

## Deliberate limits

- Maps are restricted to geometry whose physical material matches the scan; furniture preserves semantic material groups, and Yūhi Town separates wall bodies from trim/details before applying the concrete scan. No blanket texture is put on every opaque material.
- The body paint is not made to look realistic by attaching a generic industrial texture. Its layered physical shader, clearcoat, and HDRI reflections remain the appropriate path until a suitable CC0 automotive-paint asset/hero vehicle is adopted.
- No scanned maps are added to glass or emissive surfaces. No new global bloom, fog, mist, haze, weather, rain, standing water, or traction behavior is introduced. Aohara's authorized static wet-look stays local and visual-only.
- Existing quality-tier budgets, streaming, instancing pools, lane readability, spawn behavior, and relaxing balance are unchanged. These are configured budgets, not measured GPU limits or FPS evidence.
- No browser visual review, manual drive, named-device frame-time measurement, or owner-device acceptance is claimed in this reference review.

## Implementation and verification (2026-10-21)

The material increment is committed at `ceaa1846a61ebf66af9806c93c5556cb309425fe`. `SurfaceTextureLibrary` coalesces static-world requests, configures repeat/aniso sampling, handles late disposal and shares the pinned map sets across `DrivingWorld`, `RoadWorld`, `TownWorld`, urban furniture and `UrbanNightWorld`. Geometry/material separation keeps scans off glass, emitters, mixed-signage/trim kits, planted foliage and unsupported metal. Yūhi wall bodies are split from painted trim/details; benches and planters preserve semantic material groups and UVs. Existing HDRI PMREM IBL, AgX/ACES tone mapping and TSL SSAO were retained rather than replaced.

The full local `npm run check` passed on `ceaa184`: Prettier, ESLint, GLSL guard, both TypeScript checks, **59 test files / 504 tests**, pinned asset verification (**19 assets / 44,913,263 bytes**), and the production build. GitHub Validate [#170](https://github.com/mdraficode/Endless-Driver/actions/runs/39626078445) and Pages Deploy [#160](https://github.com/mdraficode/Endless-Driver/actions/runs/39626078385) also succeeded for the same SHA; remote `main` matched local. Existing non-blocking Three.js non-indexed-geometry/model-fixture warnings and Vite's large-chunk warning remain. Several intermediate commits had failing validation while resolving test/import/type/format issues; the final commit is green. No browser visual review, manual driving, owner-device review, or FPS/device-performance measurement was performed.
