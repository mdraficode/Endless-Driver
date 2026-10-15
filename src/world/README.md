# Procedural world

**Status:** Phase 4 in progress (authorized 2026-10-15). The terrain foundation has landed —
seeded heightfield, chunked LOD streaming, heightfield colliders. Roads, the generation
worker, and floating origin are the remaining increments.

## Responsibility

Seeded terrain and roads, chunk identity, worker jobs, streaming, LOD, collider coverage, floating
origin — and the pluggable definition of what a scene is made of.

## Implemented

| File                  | Responsibility                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorldContent.ts`     | `SceneContent`, the seam between the environment and what stands in it, with the optional `updateStreaming`/`getContentStats` hooks Phase 4 streams through                             |
| `terrain-height.ts`   | The one height function: integer-hash deterministic fBm hills + the Hinode-dake cone + the exactly-flat spawn plateau, plus the height/slope splat colours. Pure; everything samples it |
| `terrain-chunks.ts`   | The pure streaming planner: chunk coordinates, LOD-by-ring, the visual plan and the physics window. No three.js, no Rapier, so the plan is unit-testable                                |
| `terrain-geometry.ts` | Chunk mesh building: halo-sampled grid normals (bit-identical shared borders), vertex-colour splat, skirts against LOD cracks                                                           |
| `TerrainWorld.ts`     | The stateful streamer: budgeted builds (≤2/frame), in-place LOD swaps, eviction, one material for all chunks, diagnostics stats                                                         |
| `DrivingWorld.ts`     | The driving content: streamed terrain plus the Phase 2 reference obstacles on the plateau                                                                                               |
| `RouteWorld.ts`       | The Phase 3 validation route (fixed vista for the SSIM baseline)                                                                                                                        |

The seam exists because the project needs more than one answer to "what is the scene made of?" —
the studio look-dev grid in `src/lab/` wants identical lighting and post-processing over entirely
different content. Phase 4's terrain arrived behind the same interface, as drawn.

## Planned work

`RoadGraph.ts` (spline network, junctions, bridges/tunnels), worker-side generation in
`src/workers/`, `FloatingOrigin.ts`, scanned-CC0 splat detail, and the §5 district build-out —
all this phase, behind the same `SceneContent` interface.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
