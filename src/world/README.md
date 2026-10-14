# Procedural world

**Status:** Phase 4 is not authorized. What exists is the _driving world's_ static content and the
interface that lets a scene be something other than the driving world.

## Responsibility

Seeded terrain and roads, chunk identity, worker jobs, streaming, LOD, collider coverage, floating
origin — and, in the meantime, the pluggable definition of what a scene is made of.

## Implemented

| File              | Responsibility                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorldContent.ts` | `SceneContent`, the seam between the environment and what stands in it. `SceneManager` owns the sky, sun, fog, shadows, HDRI, and cameras; the content is whatever the caller supplies. Phase 4's terrain goes behind this same interface |
| `DrivingWorld.ts` | The driving content: the ground plane (with the distance-fading grid) and the Phase 1 reference obstacles. Deliberately thin, because it is about to be replaced by seeded terrain                                                        |

The seam exists because the project needs a second answer to "what is the scene made of?" — the
studio look-dev grid in `src/lab/`, which wants identical lighting and post-processing over entirely
different content. Drawing it here rather than giving each mode its own environment is what keeps
the two scenes honestly comparable.

## Planned work

`ChunkManager.ts`, `TerrainGenerator.ts`, `RoadGraph.ts`, `FloatingOrigin.ts` in Phase 4, replacing
`DrivingWorld.ts` and implementing the same `SceneContent` interface.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md). Do not implement this module before the relevant phase is authorized.
