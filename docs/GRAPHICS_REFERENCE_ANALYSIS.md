# Public graphics-reference analysis — 2026-10-22

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
| Kaminari GT roadster paint                            | Project-authored TSL physical-material treatment             | In-house unbadged body uses metallic base/clearcoat and procedural micro-variation; no unsuitable concrete/industrial scan is assigned                          |
| Glazing, emitters and mixed/unsupported metal details | No fabricated maps                                          | Glass/emissive paths remain separate; metal trim, signals and light sources retain authored PBR/emissive materials                                             |

Albedo uses sRGB; normal and packed ARM data are linear. ARM channels are red = AO, green = roughness, blue = metalness. A small per-world texture library coalesces requests for shared static-world sets and owns their disposal; the existing streamed terrain resource lifecycle remains independent. Texture sets are pinned and verified through the asset script, manifest and credits register.

## Vehicle visual and traffic implementation (2026-10-22)

The +360º Car Visualizer remains a presentation reference only: its public page does not disclose a source mesh, topology, asset license, or authoring tool. The owner selected “Ferrari California” as a broad two-seat convertible/GT body-class reference. `CarVisual.ts` now builds an original fictional Kaminari GT roadster from Three.js geometry: a long-hood open-top silhouette, visible seats/dashboard, framed windshield, mirrors, non-branded wheels, and local brake lamps. It uses the project's metallic/clearcoat node material plus map-free opaque tinted glazing and authored interior/rubber/metal materials. The detailed render body remains separate from Rapier's simple chassis collider. No manufacturer badge, text, exact Ferrari body geometry, third-party model, or externally sourced vehicle texture is included.

Aohara visual traffic now has five procedural archetypes: passenger cars, city buses, rigid trucks, semi-trailer rigs, and farm tractors. Each class has compact merged geometry and one instanced mesh with three material groups (physical paint, dark glazing/tires, and small metal/light accents). The groups remain separate GPU draws; configured batch counts are not draw-call or FPS measurements. Class totals stay inside the existing C/B/A traffic budgets of 6/12/18, with all five types represented at each tier; the actor count, pedestrian budgets, and no-moving-collider design are unchanged. Length-aware stop-line offsets keep the longer vehicles' fronts clear of the signal while retaining a tier-bounded batch count. This is signal-aware visual traffic, not collision-resolved vehicle AI or pedestrian right-of-way.

The CC0 RGS_Dev pack was verified from its OpenGameArt listing and included `License.txt`; its FBX-only roadster/bus/truck/trailer assets are stylized and no tractor is included. Because the project's reproducible model pipeline is GLTF/GLB-based, no unverified one-off conversion or external model was added. The Innerscene bus page declares CC0 but the local file was not inspected and is not used. These sources are research candidates only; they do not need `CREDITS.md` entries because none is shipped.

## Deliberate limits

- Maps are restricted to geometry whose physical material matches the scan; furniture preserves semantic material groups, and Yūhi Town separates wall bodies from trim/details before applying the concrete scan. No blanket texture is put on every opaque material.
- The in-house body paint is not made to look realistic by attaching a generic industrial texture. Its authored physical shader, clearcoat, and HDRI reflections are used instead; no automotive-paint maps are fabricated.
- No scanned maps are added to glass or emissive surfaces. No new global bloom, fog, mist, haze, weather, rain, standing water, or traction behavior is introduced. Aohara's authorized static wet-look stays local and visual-only.
- Existing quality-tier budgets, streaming, instancing pools, lane readability, spawn behavior, and relaxing balance are unchanged. These are configured budgets, not measured GPU limits or FPS evidence.
- No browser visual review, manual drive, named-device frame-time measurement, or owner-device acceptance is claimed in this reference review.

## Implementation and verification (2026-10-21)

The material increment is committed at `ceaa1846a61ebf66af9806c93c5556cb309425fe`. `SurfaceTextureLibrary` coalesces static-world requests, configures repeat/aniso sampling, handles late disposal and shares the pinned map sets across `DrivingWorld`, `RoadWorld`, `TownWorld`, urban furniture and `UrbanNightWorld`. Geometry/material separation keeps scans off glass, emitters, mixed-signage/trim kits, planted foliage and unsupported metal. Yūhi wall bodies are split from painted trim/details; benches and planters preserve semantic material groups and UVs. Existing HDRI PMREM IBL, AgX/ACES tone mapping and TSL SSAO were retained rather than replaced.

The full local `npm run check` passed on `ceaa184`: Prettier, ESLint, GLSL guard, both TypeScript checks, **59 test files / 504 tests**, pinned asset verification (**19 assets / 44,913,263 bytes**), and the production build. GitHub Validate [#170](https://github.com/mdraficode/Endless-Driver/actions/runs/39626078445) and Pages Deploy [#160](https://github.com/mdraficode/Endless-Driver/actions/runs/39626078385) also succeeded for the same SHA; remote `main` matched local. Existing non-blocking Three.js non-indexed-geometry/model-fixture warnings and Vite's large-chunk warning remain. Several intermediate commits had failing validation while resolving test/import/type/format issues; the final commit is green. No browser visual review, manual driving, owner-device review, or FPS/device-performance measurement was performed.
