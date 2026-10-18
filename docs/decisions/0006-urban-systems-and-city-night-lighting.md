# ADR 0006 — Add a fictional megacity district as a separately authorized urban track

- **Status:** Accepted
- **Date:** 2026-10-19
- **Decision owners:** project owner
- **Related:** ADR 0004 (visual fidelity and renderer), ADR 0005 (free/open assets and fictional branding), `PROJECT_PLAN.md` Phase 9, `docs/VISUAL_TARGET.md` §2–§5

## Context

The owner authorized a new urban-systems phase while Phase 5 still lacks stable, readable owner-device visual acceptance. The project already has a fictional rural-Japan setting, Hinode. The requested city work includes urban streets, traffic lights/signals, crossings, pedestrian and vehicle AI, intersections, tunnels, bridges/flyovers, highways, high-rise buildings, and a more active environment. The owner prioritized night lighting for the first city milestone and clarified the optical treatment as both soft glow/halation and subtle diffraction/starbursts.

The existing global bloom path was previously measured to wash out gameplay into a fog-like veil. The project also has standing constraints: no white/snow gameplay ground, prepared-ahead streaming, mobile quality tiers, CC0-first/free-open assets, fictional/unbadged branding, and honest device-validation claims. Weather/seasons and final polish remain separately gated.

## Decision

1. Create a **new fictional Japanese megacity district, Aohara Metropolis**, as an addition to the existing rural Hinode setting. Rural Hinode remains intact and rural; the city is not a replacement or a re-theme of it.
2. Record the urban systems work as a new **Phase 9**, expressly authorized on 2026-10-19 to proceed alongside the open Phase 5 visual gate. This authorizes Phase 9 only; Phase 6 still depends on Phase 5 acceptance, and Phases 7–8 remain gated.
3. Start Phase 9 with a bounded night-lighting slice. Include both a localized soft Gaussian halo and restrained radial starburst/diffraction around urban light sources. Preserve road and crossing visibility. Do not re-enable whole-frame bloom to achieve this; the prior global bloom washout result remains relevant.
4. The longer Phase 9 scope includes streets, signals, crossings, high-rises, grade-separated roads and single-player traffic/pedestrian AI. Multiplayer, accounts, server persistence, weather/seasons and unrelated final-polish scope are not authorized by this decision.
5. Keep all new rendering within Three.js TSL and the existing C/B/A quality-tier architecture. Prefer in-house/procedural or verified free/open assets, retain fictional/unbadged identity, and do not claim SSR, ray tracing, visual acceptance or hardware performance without implementation and evidence.

## Consequences

- Phase 9 may proceed in parallel with the incomplete Phase 5 visual-acceptance work; the existing Phase 5 acceptance record is unchanged.
- A bounded `?scene=city` look-dev slice may be used before the city is integrated into the driveable, streamed world. Such a preview is not evidence that the full district is driveable or complete.
- City light effects must remain source-local and darkness-gated. Pavement highlights may use the existing material-lighting path, but this ADR does not authorize a weather, rain, standing-water or traction system.
- The eventual district must preserve the no-white-ground, streaming, mobile-tier and licensing constraints already recorded in `AGENTS.md`, `PROJECT_PLAN.md` and the asset policy.
