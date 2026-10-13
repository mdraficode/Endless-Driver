# Configuration and tuning data

**Status:** Partially implemented; `render.ts` is live, later-phase configs are placeholders.

## Responsibility

Data-driven tuning data kept out of system code: quality tiers, render settings, and (in later
phases) vehicle, world, and weather parameters.

## Implemented

- `render.ts` — Phase 1 render configuration: pixel-ratio cap (2), frame-delta clamp, camera/debug
  camera setup, shadow map and sun parameters, sky gradient colors, fog range, ground/grid, reference
  props, and diagnostics cadence.

## Planned work

Quality presets and device tiers (Phase 6), vehicle/drivetrain tuning (Phases 2/4), and world
generation/streaming parameters (Phase 3).

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
