# Shader assets

**Status:** Phase 3 started — the first custom shading is written in TSL, compiled to WGSL on WebGPU and GLSL on
the WebGL2 backend.

## Responsibility

Terrain blending, snow/wetness masks, atmosphere helpers, and optional measured effects. Custom shading is written
as TSL node graphs, never as `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` patches: those APIs only
exist on the WebGL backend and would fork the rendering path (ADR 0004). `npm run guard:glsl` fails the build if
one appears in `src/`.

## Implemented

| File                | Responsibility                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atmosphere-sky.ts` | Builds the Preetham sky (`SkyMesh`) from `RENDER_CONFIG`: turbidity, Rayleigh/Mie coefficients, sun disc, cloud layer, and the sun-direction scaling the model expects        |
| `ground-grid.ts`    | Analytically anti-aliased reference grid drawn inside the ground material from world position, with axis emphasis and distance fade; also the shared hex→linear colour helper |

Both are pure node-graph factories: they build data, so they are unit-tested in Node without a GPU. What they
cannot be tested for without a browser is what the shader looks like — that needs the look-dev workflow in
[`docs/VISUAL_TARGET.md`](../../docs/VISUAL_TARGET.md) §4.

## Planned work

Terrain splatting and road blending (Phase 4), wetness/snow masks (Phase 7), and the remaining post effects as
their turns come in the tier matrix.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
