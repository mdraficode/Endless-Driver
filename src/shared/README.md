# Shared, engine-independent contracts

**Status:** Partially implemented; `math.ts` is live.

## Responsibility

Small utilities and types that must not depend on the renderer, the DOM, or physics libraries, so
they can be reused by workers, tests, and simulation code.

## Implemented

- `math.ts` — `clamp`, `resolvePixelRatio`, `clampFrameDelta`, `secondsToMilliseconds`. These are
  total functions (never throw, never return `NaN`) because they run on the resize/frame path.

## Planned work

Interpolation helpers, deterministic RNG seeding utilities, and streaming/geometry contracts used by
the world modules in Phase 4.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
