# Renderer decision: Three.js replaces Babylon.js

**Status:** Accepted (supersedes the renderer choice in `0001-engine-and-physics.md`)  
**Date:** 2026-10-13  
**Phase:** 1 (engine, loop, camera, lighting)

## Context

`0001-engine-and-physics.md` selected Babylon.js ES modules for rendering because of its built-in
scene/lighting/asset tooling. During Phase 1 authorization the project owner requested the engine be
implemented with **Three.js**, specifying `WebGLRenderer`, `PCFSoftShadowMap`,
`ACESFilmicToneMapping`, `clock.getDelta()`, and `OrbitControls` by name.

The owner's explicit instruction takes precedence over the earlier planning baseline. Rewriting the
renderer layer is cheapest now: no rendering code existed before Phase 1, so nothing had to be
migrated.

## Decision

- Rendering uses **Three.js** (`three@0.186.1`) with `@types/three` in `devDependencies`.
- Rendering stays a separate layer from simulation. **Rapier remains the sole physics authority**;
  Three.js renders interpolated physics poses once vehicles and terrain exist (Phases 2–4).
- The engine module is `src/core/Engine.ts` and owns renderer configuration, canvas sizing,
  pixel-ratio capping, the requestAnimationFrame loop, context-loss recovery, and disposal.
- Scene composition is `src/core/SceneManager.ts`; composition/wiring is
  `src/core/Application.ts`; frame statistics are `src/core/PerformanceMonitor.ts`.
- Module boundaries from the plan are preserved. `src/app` and `src/engine` placeholders were
  replaced by a single `src/core` module; `world`, `vehicles`, `physics`, `input`, `cameras`, `ui`,
  `environment`, `shaders`, `assets`, `config`, `shared`, and `workers` keep their responsibilities.
- Babylon.js dependencies were removed from `package.json`.

## Consequences

**Positive**

- Matches the owner's explicit Phase 1 instruction and keeps the renderer layer small and explicit.
- Three.js has no engine-level scene/asset framework, so ownership of lighting, sky, materials, and
  loading stays visible in project code rather than implicit in engine defaults.
- `WebGLRenderer` remains a WebGL2 baseline; a future WebGPU path would be a separate, tested
  renderer, not an assumed swap.

**Negative / mitigations**

- Babylon's built-in shadow, sky, PBR, and asset tooling is no longer available, so effects such as
  image-based lighting, sky/atmosphere, and post-processing must be assembled from Three.js
  `examples/jsm` addons and custom shaders (Phase 6 work).
- `three/examples/jsm/*` addons are version-coupled to the three core package; upgrades must move
  `three` and `@types/three` together and re-run validation.
- `THREE.Clock` is deprecated in favour of `THREE.Timer`; the engine uses `Timer` with Page
  Visibility integration.
- `PCFSoftShadowMap` was deprecated/removed in r186 (the renderer warns and falls back to
  `PCFShadowMap`). Shadows therefore default to `PCFShadowMap`, with `VSMShadowMap` offered as an
  opt-in soft-shadow mode in `config/render.ts`; no warning is emitted at runtime.
- The plan's phrase "Babylon renders interpolated physics poses" becomes "Three.js renders
  interpolated physics poses"; no architectural invariant (single physics authority, fixed-step
  simulation, float-origin rebasing, explicit disposal) changes.

## Superseded items

- Renderer/framework choice in `0001-engine-and-physics.md`.
- Any plan text that named Babylon modules (`EngineHost`, `Scene`, `ArcRotateCamera`, etc.).

> **Phase numbering note (2026-10-14):** custom shader work moved from the original Phase 6 into
> Phase 3, and the renderer path moved from `WebGLRenderer` to `WebGPURenderer` (TSL) with a WebGL2
> backend — see ADR 0004. Three.js remains the renderer.

All later phases continue to treat **Rapier** as the simulation source of truth, and any
renderer-side interpolation remains presentation-only.

> **Historical addendum (round 9, 2026-10-17; superseded 2026-10-20).** The
> then-shipped default backend was WebGL2 (`backendPreference: 'webgl'`), pending
> hardware validation. This records the earlier baseline; it is no longer the
> renderer preference.
>
> **Owner authorization (2026-10-20).** The owner requested `WebGPURenderer` with
> automatic WebGL2 fallback. The default preference is now `auto`; WebGPU runs
> when available, and `?backend=webgl` forces WebGL2 for comparison. The broad
> Phase 6 opening is independent of the still-open Phase 5 acceptance gate.
