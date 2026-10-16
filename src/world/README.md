# Procedural world

**Status:** Phase 4 in progress (authorized 2026-10-15). Terrain foundation and the spline
road network have landed — seeded heightfield, chunked LOD streaming, heightfield
colliders, carved roads with scanned surfaces. The generation worker and floating origin
are the remaining increments.

## Responsibility

Seeded terrain and roads, chunk identity, worker jobs, streaming, LOD, collider coverage, floating
origin — and the pluggable definition of what a scene is made of.

## Implemented

| File                      | Responsibility                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorldContent.ts`         | `SceneContent`, the seam between the environment and what stands in it, with the optional `updateStreaming`/`getContentStats` hooks Phase 4 streams through                                  |
| `terrain-height.ts`       | The one height function: integer-hash deterministic fBm hills + the Hinode-dake cone + the exactly-flat spawn plateau, plus the height/slope splat colours. Pure; everything samples it      |
| `terrain-chunks.ts`       | The pure streaming planner: chunk coordinates, LOD-by-ring, the visual plan and the physics window. No three.js, no Rapier, so the plan is unit-testable                                     |
| `terrain-geometry.ts`     | Chunk mesh building: halo-sampled grid normals (bit-identical shared borders), vertex-colour splat, skirts against LOD cracks                                                                |
| `TerrainWorld.ts`         | The stateful streamer: budgeted builds (≤2/frame), in-place LOD swaps, eviction, one material for all chunks, diagnostics stats                                                              |
| `terrain-generation.ts`   | The worker protocol: rebuild-the-same-sampler init, request/result messages, transferable buffer handling — deterministic across threads by construction                                     |
| `terrain-worker.ts`       | Thin worker entry: owns a generation sampler and answers requests; all logic lives in the testable protocol module                                                                           |
| `chunk-generator.ts`      | Main-thread worker pool (2 workers, staleness rejection, watchdog, permanent sync fallback on any failure)                                                                                   |
| `origin.ts`               | The floating origin: decides when the local physics/render space slides (whole 128 m chunks past 2048 m) under the eternal world coordinates                                                 |
| `districts.ts`            | District resolver: which §5 place (if any) influences a world point, as per-species density multipliers with soft edges                                                                      |
| `vegetation.ts`           | Deterministic instanced scatter: hash-decided placement per cell, sampler-gated (road/treeline/slope), species registry + streaming window                                                   |
| `vegetation-placement.ts` | The pure placement function (renderer-free): same chunk in, same forest out — shared by the renderer and the collision field                                                                 |
| `tree-collision.ts`       | Destructive-vegetation truth: trunk-vs-chassis collision, hit-point damage (bend → snap → shatter), rock-solid response impulses                                                             |
| `DrivingWorld.ts`         | The driving content: streamed terrain plus the Phase 2 reference obstacles on the plateau                                                                                                    |
| `road-network.ts`         | The pure road graph builder: Catmull-Rom splines over an authored topology, moving-average smoothing, pinned junction elevations, grade clamping on true segment runs, spatial segment index |
| `world-terrain.ts`        | The composed sampler the game uses: base terrain with the solved road profiles carved into the height function, so meshes, colliders, and grip share one ground truth                        |
| `road-geometry.ts`        | Ribbon geometry (pavement, shoulders, edge lines) and centre-dash generation from solved profiles                                                                                            |
| `RoadWorld.ts`            | The visual road network: whole-network ribbon meshes, junction discs, async CC0 asphalt/gravel surfaces, road stats                                                                          |
| `RouteWorld.ts`           | The Phase 3 validation route (fixed vista for the SSIM baseline)                                                                                                                             |

The seam exists because the project needs more than one answer to "what is the scene made of?" —
the studio look-dev grid in `src/lab/` wants identical lighting and post-processing over entirely
different content. Phase 4's terrain arrived behind the same interface, as drawn.

## Planned work

Bridges/tunnels where a future generator needs them, worker-side generation in
`src/workers/`, `FloatingOrigin.ts`, scanned-CC0 splat detail, and the §5 district build-out —
all this phase, behind the same `SceneContent` interface.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
