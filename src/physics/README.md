# Physics authority

**Status:** Phase 2 implemented (fixed-step Rapier world, static arena, step hooks).

## Responsibility

The sole Rapier world, fixed ticks, collider ownership, queries, debug data, and transform
snapshots. Keep Three.js and the DOM out of the simulation layer.

## Implemented

| File              | Responsibility                                                                                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RapierModule.ts` | Type aliases for the Rapier surface plus a lazily initialised singleton (`loadRapier()` → `await init()`); `resetRapierForTesting()` for isolated test runs                                                                                                                                                             |
| `PhysicsWorld.ts` | The one `World` instance: gravity, fixed timestep, ground (top face at y = 0) and obstacle colliders built from `WORLD_CONFIG`, bounded catch-up with `stalledFrames`, pre-step and post-step handler registration (vehicle forces before integration, pose snapshots after), interpolation alpha, explicit `dispose()` |

## Invariants

- Exactly one solver. No second physics engine, and no Rapier built-in vehicle controller: the
  vehicle layer generates forces and Rapier integrates them (see
  [ADR 0003](../../docs/decisions/0003-custom-raycast-vehicle.md)).
- SI units everywhere; +Y up, +X right, vehicle forward is −Z.
- Static arena geometry comes from `config/world.ts`, which the renderer reads too, so meshes and
  colliders cannot drift apart.
- `dispose()` frees the world; bodies are removed through `removeBody()` while the world is alive.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
