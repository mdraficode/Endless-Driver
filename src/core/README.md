# Core runtime

**Status (updated 2026-10-23):** Phase 1–4 foundations are shipped; the owner reports Phase 5 passed. Phase 6 rendering/material work and Phase 9 city systems are authorized. The owner has additionally authorized the requested Phase 8 in-game pause/home menu and named options only; unrelated Phase 8 polish and Phase 7 weather/seasons remain gated. The composition root uses `WebGPURenderer` with automatic WebGL2 fallback, HDRI image-based lighting, cascaded shadows, and a TSL render pipeline.

## Responsibility

Renderer ownership, the post-processing output chain, canvas sizing and pixel-ratio limits, the frame loop, scene
composition, lighting, frame statistics, and shutdown/disposal.

## Implemented

| File                    | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Engine.ts`             | `WebGPURenderer` from `three/webgpu` prefers WebGPU with automatic WebGL2 fallback (`?backend=webgl` forces fallback); async `init()`; AgX default (ACES/neutral remain selectable); TSL `RenderPipeline` with MRT normals/depth, SSAO/SSGI, contact shadows, TAAU/SMAA/FXAA, restrained optional bloom and tiered photographic effects; resize/DPR cap; clamped delta-time loop; context/device-loss handling; statistics; disposal |
| `SceneManager.ts`       | Scene composition: clear Preetham procedural sky (`SkyMesh`) with sun/cloud layer, manifest-loaded HDRI for image-based lighting (optional HDRI backdrop via `?envbg=1`), ambient + cascaded-shadow sun, streamed world content, debug camera/orbit controls, resource disposal; no gameplay fog, mist, haze or global atmospheric veil                                                                                              |
| `QualityTier.ts`        | Resolves the C/B/A quality tier from device probes (or `?tier=`), applies it as an overlay on the baseline render config, and provides the `?backend=webgl\|auto` debug switch. Pure functions, no GPU: the tier a machine will run is decided before the renderer exists and is reported in the HUD                                                                                                                                 |
| `PerformanceMonitor.ts` | Fixed-window FPS and frame-time statistics                                                                                                                                                                                                                                                                                                                                                                                           |
| `Application.ts`        | Composition root: engine, scene, physics world, car, input, cameras, saved steering/car/traffic preferences, HUD cadence, status messages, diagnostics snapshot, and disposal. Owns the per-frame order: input → intent → fixed-step physics → interpolated pose → visuals → sky/shadow-camera sync → render. `start()` awaits renderer initialisation and environment loading                                                       |

## Not implemented here

The hero vehicle model, screen-space reflections, and any weather/seasons behavior are not part of this core runtime work. Terrain and streaming live in the world modules; vehicle physics, input, particles and cameras remain independently owned systems. Phase 7 weather/seasons and unrelated Phase 8 work remain gated; the explicitly requested pause/home menu and named settings are a narrow Phase 8 exception.

See [the project plan](../../PROJECT_PLAN.md), [architecture](../../docs/ARCHITECTURE.md), and
[the renderer decision](../../docs/decisions/0002-renderer-three-js.md).
