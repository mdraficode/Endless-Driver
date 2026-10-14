# Look-development lab

**Status:** Phase 3 — the material studio is implemented and verified; the route bookmarks and the
screenshot regression pass described in `docs/VISUAL_TARGET.md` §4 are not built yet.

## Responsibility

Scenes whose job is to _judge_ the renderer rather than to be played: the material grid, the
environment and clock switches around it, and the framing that puts a surface under a fair light.

## Implemented

| File                   | Responsibility                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MaterialLab.ts`       | The scene content: a grid of spheres (one per `SURFACE_MATERIALS` entry), a neutral floor, and a flat backdrop. Applies the archived PBR set to the material that asks for it. Also the `SceneContent` implementation the studio mounts |
| `StudioApplication.ts` | The second composition root. Shares `Engine`, `SceneManager`, and `DaylightController` with the driving scene and supplies only what makes it a studio: the grid as content, an orbital camera, an environment switcher, a panel        |
| `StudioPanel.ts`       | The DOM control surface and readout: hour, HDRI, environment rotation, camera reset, and the state of everything those controls affect                                                                                                  |

Reached with `?scene=studio`. Switches: `?hdri=<manifest id>`, `?rot=<degrees>`, `?time=<hours>`,
`?focus=<material id>` for a close-up, and `?panel=0` to hide the controls for a clean capture.

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
  and that the materials are physically plausible. These are exactly the failures a screenshot
  review does not catch.

## Planned work

The 2 km validation route with fixed camera bookmarks at each weather, season, and time of day, and
the SSIM screenshot pass that diffs them between phases (`docs/VISUAL_TARGET.md` §4). Both need
Phases 4–5, because there is no route to bookmark yet.

See [the project plan](../../PROJECT_PLAN.md) and [the visual target](../../docs/VISUAL_TARGET.md).
