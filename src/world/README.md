# Procedural world

**Status:** Phase 4 built scope was delivered on 2026-10-15. Phase 5 remains in progress; separately authorized Phase 9 now includes a bounded Aohara road grid and the night block reused in the driving world. The existing seeded terrain, chunked LOD, rural districts and Yūhi Town remain intact. The driving-world integration passes the local check suite; manual driving, owner-device visuals and device performance remain unverified. AI agents, broader urban expansion and grade-separated links remain future work.

## Responsibility

Seeded terrain and roads, chunk identity, worker jobs, streaming, LOD, collider coverage, floating
origin — and the pluggable definition of what a scene is made of.

## Implemented

| File                      | Responsibility                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorldContent.ts`         | `SceneContent`, the seam between the environment and scene content, with optional daylight, frame-update, streaming, statistics and collision hooks                                       |
| `terrain-height.ts`       | The one height function: integer-hash deterministic fBm hills + the Hinode-dake cone + the exactly-flat spawn plateau, plus the height/slope splat colours. Pure; everything samples it   |
| `terrain-chunks.ts`       | The pure streaming planner: chunk coordinates, LOD-by-ring, the visual plan and the physics window. No three.js, no Rapier, so the plan is unit-testable                                  |
| `terrain-geometry.ts`     | Chunk mesh building: halo-sampled grid normals (bit-identical shared borders), vertex-colour splat, skirts against LOD cracks                                                             |
| `TerrainWorld.ts`         | The stateful streamer: budgeted builds (≤2/frame), in-place LOD swaps, eviction, two splat materials (near ring raymarches the scanned displacement — POM), diagnostics stats             |
| `terrain-generation.ts`   | The worker protocol: rebuild-the-same-sampler init, request/result messages, transferable buffer handling — deterministic across threads by construction                                  |
| `terrain-worker.ts`       | Thin worker entry: owns a generation sampler and answers requests; all logic lives in the testable protocol module                                                                        |
| `chunk-generator.ts`      | Main-thread worker pool (2 workers, staleness rejection, watchdog, permanent sync fallback on any failure)                                                                                |
| `origin.ts`               | The floating origin: decides when the local physics/render space slides (whole 128 m chunks past 2048 m) under the eternal world coordinates                                              |
| `districts.ts`            | District resolver: which §5 place (if any) influences a world point, as per-species density multipliers with soft edges                                                                   |
| `vegetation.ts`           | Deterministic instanced scatter: hash-decided placement per cell, sampler-gated (road/treeline/slope), species registry + streaming window                                                |
| `vegetation-placement.ts` | The pure placement function (renderer-free): same chunk in, same forest out — shared by the renderer and the collision field                                                              |
| `tree-collision.ts`       | Destructive-vegetation truth: trunk-vs-chassis collision, hit-point damage (bend → snap → shatter), rock-solid response impulses                                                          |
| `town.ts`                 | Yūhi Town: deterministic building plots (road-clear, slope-gated, tree-free) and roadside poles from the solved network; buildings solid, poles fold on accumulated hits (0.3 s cooldown) |
| `DrivingWorld.ts`         | Driving content: streamed terrain/vegetation, rural town and roads, plus the Aohara grid/night block; forwards daylight, updates, collisions, stats and disposal                          |
| `road-network.ts`         | The pure road graph builder: classed/wide per-edge profiles, Catmull-Rom smoothing, pinned junction elevations, grade clamping, spatial index, and road-surface sampling                  |
| `world-terrain.ts`        | The composed sampler the game uses: base terrain with the solved road profiles carved into the height function, so meshes, colliders, and grip share one ground truth                     |
| `road-geometry.ts`        | Ribbon geometry (pavement, shoulders, edge lines) and centre-dash generation from solved profiles                                                                                         |
| `RoadWorld.ts`            | The visual road network: per-class widths/markings batched by material, junction discs, async CC0 asphalt/gravel surfaces, road stats                                                     |
| `RouteWorld.ts`           | The Phase 3 validation route (fixed vista for the SSIM baseline)                                                                                                                          |
| `urban-night.ts`          | Phase 9's bounded Aohara block: tier-capped lamps/windows, local Gaussian-diffraction sprites, sidewalks, crossings and timed signals; shared by the look-dev and driving worlds          |

The seam exists because the project needs more than one answer to "what is the scene made of?" —
the studio look-dev grid in `src/lab/` wants identical lighting and post-processing over entirely
different content. Phase 4's terrain arrived behind the same interface, as drawn.

## Planned work

Phase 9 remains open: broaden the bounded Aohara grid with sidewalks and streets, add expressways/tunnels/bridges/flyovers only after clearance and collision validation, then implement deterministic single-player vehicle/pedestrian traffic. The present city block uses the normal streamed terrain/physics sampler but is not proof of owner-device visuals or performance. Weather/seasons and unrelated final polish remain separately gated.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
