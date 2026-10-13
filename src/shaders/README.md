# Custom shader assets

**Status:** Placeholder; development has not started.

## Responsibility

Terrain blending, snow/wetness masks, and optional measured effects; distinguish GLSL/WebGL2 and optional WGSL/WebGPU variants.

## Planned work

TSL node materials arrive in Phase 3 (ADR 0004): custom shading is written as TSL nodes, never as `ShaderMaterial`/`onBeforeCompile` GLSL.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md). Do not implement this module before the relevant phase is authorized.
