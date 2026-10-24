# ADR 0006 — Add a fictional megacity district as a separately authorized urban track

- **Status:** Accepted
- **Date:** 2026-10-19
- **Decision owners:** project owner
- **Related:** ADR 0004 (visual fidelity and renderer), ADR 0005 (free/open assets and fictional branding), `PROJECT_PLAN.md` Phase 9, `docs/VISUAL_TARGET.md` §2–§5

## Context

The owner authorized a new urban-systems phase while Phase 5 still lacks stable, readable owner-device visual acceptance. The project already has a fictional rural-Japan setting, Hinode. The requested city work includes urban streets, traffic lights/signals, crossings, pedestrian and vehicle AI, intersections, tunnels, bridges/flyovers, highways, high-rise buildings, and a more active environment. The owner prioritized night lighting for the first city milestone and clarified the optical treatment as both soft glow/halation and subtle diffraction/starbursts.

The owner later requested a brighter Aohara night drive with denser streetlamps, building/billboard/decorative lighting, fictional banners, and varied building types (including stadiums, casinos, mansions and house types). These should cast actual local light onto streets, not exist solely as decorative meshes. The existing global bloom path was previously measured to wash out gameplay into a fog-like veil. The project also has standing constraints: no white/snow gameplay ground, prepared-ahead streaming, mobile quality tiers, CC0-first/free-open assets, fictional/unbadged branding, and honest device-validation claims. Weather/seasons and final polish remain separately gated.

## Decision

1. Create a **new fictional Japanese megacity district, Aohara Metropolis**, as an addition to the existing rural Hinode setting. Rural Hinode remains intact and rural; the city is not a replacement or a re-theme of it.
2. Record the urban systems work as a new **Phase 9**, expressly authorized on 2026-10-19 to proceed alongside the open Phase 5 visual gate. The owner later broadly authorized Phase 6 on 2026-10-20 despite pending Phase 5 acceptance. At the time of this decision, Phases 7–8 remained gated; later owner direction supersedes that status as recorded under Consequences.
3. Start Phase 9 with a bounded night-lighting slice. Include both a localized soft Gaussian halo and restrained radial starburst/diffraction around urban light sources. Preserve road and crossing visibility. Do not re-enable whole-frame bloom to achieve this; the prior global bloom washout result remains relevant.
4. The longer Phase 9 scope includes streets, signals, crossings, high-rises, grade-separated roads and single-player traffic/pedestrian AI. Multiplayer, accounts, server persistence, weather/seasons and unrelated final-polish scope are not authorized by this decision.
5. Keep all new rendering within Three.js TSL and the existing C/B/A quality-tier architecture. Prefer in-house/procedural or verified free/open assets, retain fictional/unbadged identity, and do not claim SSR, ray tracing, visual acceptance or hardware performance without implementation and evidence.
6. The 2026-10-19 brightening follow-up authorizes denser street lighting, road-illuminating building/billboard/decorative sources, unbadged banners, and varied fictional architecture (stadiums, casinos, mansions and distinct house types). Keep those sources local to the player/drive focus, preserve lane readability, and hold explicit per-tier budgets; decorative geometry alone does not satisfy the lighting request.
7. On 2026-10-24, the owner separately authorized a persistent, immediately applied `Night Mood` switch on the gameplay pause/home menu's Overview page. Day remains the default. This narrow exception adds a night preset without changing weather/physics or expanding the existing Aohara local-light caps; it does not authorize unrelated Phase 8 work.

## Consequences

- Phase 9 may proceed in parallel with the incomplete Phase 5 visual-acceptance work; the existing Phase 5 acceptance record is unchanged.
- A bounded `?scene=city` look-dev slice may be used before the city is integrated into the driveable, streamed world. Such a preview is not evidence that the full district is driveable or complete.
- City light effects must remain source-local and darkness-gated. A later narrow owner request (2026-10-19) permits an Aohara-only, static wet-look clearcoat using the existing HDRI and local streetlights; it is strictly visual and does not authorize rain, standing water, weather/seasons, spray, or traction changes.
- The brightening follow-up is still Phase 9 scope and does not turn into global post-processing, weather, or unrestricted light count; architectural pointlights, pole/window/billboard instances and banners use explicit C/B/A budgets.
- The eventual district must preserve the no-white-ground, streaming, mobile-tier and licensing constraints already recorded in `AGENTS.md`, `PROJECT_PLAN.md` and the asset policy.
- Later owner direction on 2026-10-24 opened Phase 7 and authorized the specific Night Mood control above. Phase 8 remains gated except for that menu-toggle/night-mood feature; no unrelated Phase 8 scope is opened.
- The Night Mood headlight follow-up adds a fixed pair of night-gated, unshadowed spotlights for the player vehicle only; it is separate from Aohara's city point-light allocations and does not raise any C/B/A city cap.
