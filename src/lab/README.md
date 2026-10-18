# Look-development lab

**Status:** Phase 3 material studio and route bookmarks are implemented; the Phase 9 `?scene=city` preview is the first bounded Aohara Metropolis night-lighting slice. It is a look-dev block, not yet a driveable or streamed urban district.

## Responsibility

Scenes whose job is to _judge_ the renderer and a first lighting slice: the material grid, fixed route bookmarks, and the bounded Aohara night block. They share the production engine, scene manager, clock and post chain.

## Implemented

| File                       | Responsibility                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MaterialLab.ts`           | The scene content: a grid of spheres (one per `SURFACE_MATERIALS` entry), a neutral floor, and a flat backdrop. Applies the archived PBR set to the material that asks for it. Also the `SceneContent` implementation the studio mounts |
| `StudioApplication.ts`     | The second composition root. Shares `Engine`, `SceneManager`, and `DaylightController` with the driving scene and supplies only what makes it a studio: the grid as content, an orbital camera, an environment switcher, a panel        |
| `StudioPanel.ts`           | The DOM control surface and readout: hour, HDRI, environment rotation, camera reset, and the state of everything those controls affect                                                                                                  |
| `UrbanNightApplication.ts` | A no-physics look-dev composition root for the bounded Aohara city block; same production daylight, render chain and orbit camera. Opens at night, with `?time=<hours>` available for comparison                                        |
| `../world/urban-night.ts`  | The first city content slice: high-rise massing/windows, point-lit streetlamps, local Gaussian/diffraction sprites, road sheen, a signalized intersection and crosswalk. It is not yet a streamed, driveable city                       |

Reached with `?scene=studio`. Switches: `?hdri=<manifest id>`, `?rot=<degrees>`, `?time=<hours>`,
`?focus=<material id>` for a close-up, and `?panel=0` to hide the controls for a clean capture.

The city lighting preview is reached with `?scene=city` (defaults to 23:30; `?time=<hours>` overrides it). Use `?tier=C|B|A` to inspect the bounded C/B/A light and window budgets. The orbit camera is enabled. It uses the same production renderer but is not a driving mode.

## Why it is built this way

- **It shares the world's lighting.** The same sun, sky, HDRI, shadows, post chain, and clock as the
  driving scene. A studio with its own bespoke rig would approve materials that do not survive
  contact with the actual game, which is the only failure that matters here.
- **It is a separate composition root, not a mode.** It has no vehicle, no physics, and no track;
  faking those to reuse `Application` would thread `if (studio)` through the entire driving path.
- **The framing is derived, not fixed.** The camera pose is computed from the grid's measured size,
  the lens, the viewport aspect, and how much of the frame the panel currently covers. Every one of
  those changed during the build and each change would have silently broken a hardcoded pose.
- **Layout and material values are asserted in Node.** `tests/unit/studio-config.test.ts` checks that
  the grid fits the frame, that spheres stand on the floor, that the panel does not cover the grid,
  and that the materials are physically plausible. `tests/unit/urban-night.test.ts` covers the city
  lights' darkness gate, opposing signal phases and tier budgets; these checks do not replace a visual review.
- **The city optics are source-local.** Each lamp/signal has a bounded Gaussian halo and restrained streak pattern;
  whole-frame bloom remains disabled after the earlier washout A/B. Pavement sheen is a simple material-lighting
  approximation, not SSR, ray tracing or a weather/wetness simulation.

## Planned work

Full Phase 9 work remains: integrate Aohara into the streamed driveable map without changing rural Hinode; expand the road graph and grade-separated links; add bounded single-player vehicle/pedestrian AI; then validate signal/crossing behavior and urban night readability on named devices. The existing 2 km route bookmarks and SSIM baseline remain the separate world-regression harness.

See [the project plan](../../PROJECT_PLAN.md) and [the visual target](../../docs/VISUAL_TARGET.md).
