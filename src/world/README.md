# Procedural world

**Status:** Phase 4 built scope was delivered on 2026-10-15. Phase 5 remains in progress; the separately authorized Phase 9 has begun with a bounded Aohara Metropolis night-lighting look-dev slice. The existing seeded terrain, chunked LOD, road graph, rural districts and Yūhi Town remain intact.

## Responsibility

Seeded terrain and roads, chunk identity, worker jobs, streaming, LOD, collider coverage, floating
origin — and the pluggable definition of what a scene is made of.

## Implemented

| File                      | Responsibility                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorldContent.ts`         | `SceneContent`, the seam between the environment and scene content, with optional daylight, frame-update, streaming, statistics and collision hooks                                          |
| `terrain-height.ts`       | The one height function: integer-hash deterministic fBm hills + the Hinode-dake cone + the exactly-flat spawn plateau, plus the height/slope splat colours. Pure; everything samples it      |
| `terrain-chunks.ts`       | The pure streaming planner: chunk coordinates, LOD-by-ring, the visual plan and the physics window. No three.js, no Rapier, so the plan is unit-testable                                     |
| `terrain-geometry.ts`     | Chunk mesh building: halo-sampled grid normals (bit-identical shared borders), vertex-colour splat, skirts against LOD cracks                                                                |
| `TerrainWorld.ts`         | The stateful streamer: budgeted builds (≤2/frame), in-place LOD swaps, eviction, two splat materials (near ring raymarches the scanned displacement — POM), diagnostics stats                |
| `terrain-generation.ts`   | The worker protocol: rebuild-the-same-sampler init, request/result messages, transferable buffer handling — deterministic across threads by construction                                     |
| `terrain-worker.ts`       | Thin worker entry: owns a generation sampler and answers requests; all logic lives in the testable protocol module                                                                           |
| `chunk-generator.ts`      | Main-thread worker pool (2 workers, staleness rejection, watchdog, permanent sync fallback on any failure)                                                                                   |
| `origin.ts`               | The floating origin: decides when the local physics/render space slides (whole 128 m chunks past 2048 m) under the eternal world coordinates                                                 |
| `districts.ts`            | District resolver: which §5 place (if any) influences a world point, as per-species density multipliers with soft edges                                                                      |
| `vegetation.ts`           | Deterministic instanced scatter: hash-decided placement per cell, sampler-gated (road/treeline/slope), species registry + streaming window                                                   |
| `vegetation-placement.ts` | The pure placement function (renderer-free): same chunk in, same forest out — shared by the renderer and the collision field                                                                 |
| `tree-collision.ts`       | Destructive-vegetation truth: trunk-vs-chassis collision, hit-point damage (bend → snap → shatter), rock-solid response impulses                                                             |
| `town.ts`                 | Yūhi Town: deterministic building plots (road-clear, slope-gated, tree-free) and roadside poles from the solved network; buildings solid, poles fold on accumulated hits (0.3 s cooldown)    |
| `DrivingWorld.ts`         | The driving content: streamed terrain plus the Phase 2 reference obstacles on the plateau                                                                                                    |
| `road-network.ts`         | The pure road graph builder: Catmull-Rom splines over an authored topology, moving-average smoothing, pinned junction elevations, grade clamping on true segment runs, spatial segment index |
| `world-terrain.ts`        | The composed sampler the game uses: base terrain with the solved road profiles carved into the height function, so meshes, colliders, and grip share one ground truth                        |
| `road-geometry.ts`        | Ribbon geometry (pavement, shoulders, edge lines) and centre-dash generation from solved profiles                                                                                            |
| `RoadWorld.ts`            | The visual road network: whole-network ribbon meshes, junction discs, async CC0 asphalt/gravel surfaces, road stats                                                                          |
| `RouteWorld.ts`           | The Phase 3 validation route (fixed vista for the SSIM baseline)                                                                                                                             |
| `urban-night.ts`          | Phase 9's bounded Aohara city block: tier-capped street lights/windows, local Gaussian-diffraction sprites, specular road surface, crossing and timed signals; not yet driveable or streamed |

The seam exists because the project needs more than one answer to "what is the scene made of?" —
the studio look-dev grid in `src/lab/` wants identical lighting and post-processing over entirely
different content. Phase 4's terrain arrived behind the same interface, as drawn.

## Planned work

Phase 4 bridges/tunnels remain deferred. Phase 9 will integrate Aohara into the bounded streamed world, add the full urban road graph and grade-separated links, then implement deterministic single-player vehicle/pedestrian traffic. Weather/seasons and unrelated final polish remain separately gated.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
