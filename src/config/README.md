# Configuration and tuning data

**Status (updated 2026-10-23):** Render tiers and persistent player preferences are implemented; later-phase configs remain in their owning modules.

## Responsibility

Data-driven tuning data kept out of system code: quality tiers, render settings, and (in later
phases) vehicle, world, and weather parameters.

## Implemented

- `render.ts` — Render configuration: pixel-ratio cap, frame-delta clamp, gameplay/debug camera setup,
  shadows, sun, sky, ground/grid, reference props, post effects, and diagnostics cadence.
- `tiers.ts` — C/B/A device-quality contracts and overrides.
- `game-preferences.ts` — localStorage validation/defaults for the user's graphics tier, Aohara traffic
  intensity, player-car model, startup camera, and steering response.

## Planned work

Further device-tier tuning, vehicle/drivetrain work in the vehicle modules, and world
generation/streaming parameters in the world modules.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
