# Core runtime

**Status:** Phase 1 implemented (engine, loop, scene foundation, diagnostics); Phase 2 wired physics, vehicle,
input, and the chase camera into the composition root; Phase 3 moved rendering to `WebGPURenderer` and TSL node
materials, so the composition root is now asynchronous and the scene is lit by an HDRI environment with cascaded
shadows.

## Responsibility

Renderer ownership, the post-processing output chain, canvas sizing and pixel-ratio limits, the frame loop, scene
composition, lighting, frame statistics, and shutdown/disposal.

## Implemented

| File                    | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Engine.ts`             | `WebGPURenderer` from `three/webgpu` (MSAA, configurable filtered shadows, ACES/AgX/neutral tone mapping) with the automatic WebGL2 backend fallback and a config switch to force it; async `init()`; a TSL `RenderPipeline` output chain (scene pass → bloom → tone mapping) with the pass re-pointed when the render camera changes; resize/DPR cap; delta-time loop (`THREE.Timer`, clamped deltas); pause/resume; WebGL context-loss and WebGPU device-loss handling; statistics; disposal |
| `SceneManager.ts`       | Scene composition: Preetham atmosphere sky (`SkyMesh`) with sun disc and clouds, HDRI environment lighting resolved from the asset manifest, ambient + cascaded-shadow sun tracked to the vehicle, arena ground and obstacles built from `WORLD_CONFIG` with an in-shader distance-fading grid, debug camera and orbit controls, add/remove for runtime objects                                                                                                                                |
| `QualityTier.ts`        | Resolves the C/B/A quality tier from device probes (or `?tier=`), applies it as an overlay on the baseline render config, and provides the `?backend=webgl\|auto` debug switch. Pure functions, no GPU: the tier a machine will run is decided before the renderer exists and is reported in the HUD                                                                                                                                                                                           |
| `PerformanceMonitor.ts` | Fixed-window FPS and frame-time statistics                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Application.ts`        | Composition root: engine, scene, physics world, car, input, chase camera, HUD cadence, status messages, diagnostics snapshot, and disposal. Owns the per-frame order: input → intent → fixed-step physics → interpolated pose → visuals → sky/shadow-camera sync → render. `start()` awaits renderer initialisation and environment loading                                                                                                                                                    |

## Not implemented here

Terrain/streaming (Phase 4), environment/weather state (Phase 7), and the remaining post effects from the Phase 3
matrix (GTAO, SSR, DOF, motion blur, TAAU/TRAA) are not wired yet; the tier system that will gate them arrives
later in Phase 3. Physics, vehicles, input, and cameras are implemented in their own modules and are only _wired_
here.

See [the project plan](../../PROJECT_PLAN.md), [architecture](../../docs/ARCHITECTURE.md), and
[the renderer decision](../../docs/decisions/0002-renderer-three-js.md).
