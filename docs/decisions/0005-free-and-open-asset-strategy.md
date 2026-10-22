# Free-and-open asset strategy, region, and brand policy

**Status:** Accepted 2026-10-14 (owner instruction)
**Date:** 2026-10-14
**Phase:** Cross-cutting; governs Phases 3–8

**Supersession note (2026-10-23):** ADR 0007 amended the source-category rules on 2026-10-22; ADR 0008 now supersedes only ADR 0005 §1/§4's CC0-only hero-vehicle restriction. The owner permits compatible free licences including CC BY 4.0 for a hero asset with required attribution. No-purchase, exact-item licence verification, provenance, redistribution, brand/design, and reproducible-pipeline requirements remain. The earlier sections below record the original 2026-10-14 decision and are superseded only where stated. CC-BY is not permission to ship recognizable real-car trade dress.

## Context

ADR 0004 left five questions open for the owner: car asset route, brand policy, region, audio scope, and photo
mode. The owner answered them with a single standing rule: **use the best-quality free and open resources
available — no purchases, no licensing fees, no restricted licences — and do not compromise the game to get them.**
The region is Japan's natural beauty, as Forza Horizon does for its settings.

That rule makes sourcing a design constraint rather than a shopping list, so it needed verification before it could
be planned: which free libraries actually carry premium-grade content, and where does free reach its ceiling? The
audit is `docs/ASSET_SOURCES.md` (Poly Haven and ambientCG APIs queried live on 2026-10-14; audio, car, and music
sources surveyed and licence-checked).

## Decision

### 1. Licence policy: CC0-first, no purchases

- **Default: CC0 / public domain** (Poly Haven, ambientCG, Kenney, Quaternius, KayKit, Sketchfab CC0, Sonniss GDC
  audio, Freesound CC0, OpenGameArt CC0, Smithsonian/NASA, SIL OFL fonts). No payment, no attribution obligation,
  redistribution and modification permitted.
- **Exception: CC-BY with an automatic credit line** in `CREDITS.md` and the in-game credits screen — allowed only
  where no CC0 asset of comparable quality exists (a handful of Japanese landmark props, some music), never for hero
  content. **Kept by decision of 2026-10-14** (recorded after the owner asked the agent to settle the remaining
  question): a credit line is text naming the artist, not a payment or a restriction, and the alternative is
  recreating those few props ourselves for no gain. The exception can be closed at any time by swapping those props
  for in-house versions.
- **Excluded at adoption (2026-10-14; amended by ADR 0007):** anything paid or account-gated with redistribution
  limits; NC/ND terms; marketplace "freebie" licences; ripped or converted game assets; badges, logos or number
  plates. AI-generated galleries and free account-gated sources are no longer categorically excluded; use them only
  under ADR 0007's exact-item license/provenance, owner-approval, and redistribution checks. Any recognizable branded
  body design still requires separate, verifiable rights.
- Every asset is fetched by a pinned, reproducible script, recorded in `public/assets/manifest.json` with source,
  creator, licence, and hash, and optimized through the project pipeline before it enters the repository. The gate
  becomes a check in `npm run check` in Phase 3.

### 2. Region: the fictional rural-Japanese "Hinode Prefecture"

Rural Japan, as the owner specified — a compact prefecture of districts: coast and harbour, a river with sakura
avenues, rice terraces, bamboo groves and a shrine lane, a maple gorge with tunnels, a sugi-cedar touge pass, an
open highland plateau, a snow-country onsen village, and a small town with level crossings, wires, and vending
machines. Seasonal event dressing (hanami, matsuri, momiji-gari, yuki-matsuri) gives the world Forza's sense of
place. Full brief: `docs/VISUAL_TARGET.md` §5.

This choice is also the one our verified free content serves best: Poly Haven's Japan HDRIs (`ninomaru_teien`,
`bamboo_tunnel` at 20 480 × 10 240, `cedar_bridge` at 16K) and Japanese scanned materials (cedar planks, sakura
bark, trident-maple bark, stone walls, tatami, bamboo walls) map directly onto those districts.

**Composite, not a copy.** The region is built from CC0 materials and in-house props; it is not photogrammetry of a
real place and will never be described as one.

### 3. Brand policy: unbadged presentation; current generic-model candidate

The default remains a fictional, unbadged hero car under the **"Kaminari"** marque, with no badges, logos or number plate.
The owner initially asked about the exact Ferrari California body, then on 2026-10-22 broadened the search to any make and
selected a generic Meshy red supercar listing. That item is AI-generated and marked CC0, but the user reports its download
requires a subscription and chose a free-download alternative; no paid access is authorized. The policy amendment is recorded
in ADR 0007. Any recognizable real vehicle design still requires separate, verifiable rights; absent those rights, inspect/remove
identifying details and retain a fictional, unbadged presentation. Other signage and world content stay fictional/unbranded.

### 4. Car: current in-house model; no unverified stand-in

The current player vehicle is an original code-authored GT roadster under the fictional **Kaminari** marque. It remains the
runtime vehicle; no third-party hero asset has been downloaded or integrated. Meshy's CC0 listing is blocked by a user-reported
subscription requirement. The verified no-login Grab3D 1980s Sports Car is stylized below the target; the BlendSwap base mesh
remains unresolved and unsuitable as a finished model. The procedural car has clearcoat paint, map-free glazing/interior/rubber/metal,
a visible cabin, pose-driven wheels and steering, and local brake lamps. Its automated test enforces fewer than 20k triangles
and at most 12 rendered Mesh objects; the full check passed at `cdcd8f1`.

External models are optional, not required for the build. Any replacement hero vehicle must meet the CC0-only hero-content
rule, have verifiable provenance, suitability, and a reproducible conversion path, and pass separate rights clearance for
any recognizable design. CC0 alone is insufficient to establish brand/design rights. The selected Meshy item is marked CC0 and described in `docs/ASSET_SOURCES.md` §3.5, but download reportedly requires a
subscription and no model file is available. BlendSwap and Grab3D alternatives are documented in §3.5; none currently meets
both the rights/access and Forza-Horizon-class quality gates. The CC0 RGS_Dev pack was not integrated because it is stylized
and FBX-only. No third-party vehicle files or manifest entry are currently shipped.

### 5. Audio: free sample libraries plus a project-owned synthesis layer

- **SFX:** Sonniss GDC Game Audio bundles (2015–2026, 200+ GB of commercial-library samples, royalty-free, no
  attribution) + Freesound CC0 + Kenney CC0 — studio-grade and free.
- **Engine:** a Web Audio granular/loop synth driven by RPM, load, throttle, and surface, using the recorded layers
  as source material. This is our own system, not a licensed engine sound set.
- **Music:** a small chill electronic/ambient playlist per season from CC0 pools (Kenney, OpenGameArt CC0, itch.io
  CC0, Pixabay) with CC-BY (Incompetech) as an attributed fallback. It is explicitly **not** an AAA licensed
  soundtrack, and the plan says so.

### 6. Photo mode is in scope

A late-polish (Phase 8) free-camera pause mode with tier-aware quality bumps — cheap once the post stack and tiers
exist, and a signature Forza feature.

### 7. What this does not change

- The visual quality bars in `docs/VISUAL_TARGET.md` §2 stand. Free sourcing is a constraint on _provenance_, not a
  licence to lower the bar — and where free content cannot reach (hero car scans, licensed soundtrack, real-location
  photogrammetry) we build it ourselves or state the gap.
- No purchase will ever be requested. If a future phase seems to need one, the answer is in-house authoring or a
  documented scope change, not a shopping request.
- ADR 0004's rendering, tier, and pipeline decisions are unaffected.

## Consequences

**Positive**

- Zero licensing cost and zero legal exposure from content; public repository and future distribution stay clean.
- The Japan region is the strongest match between what the owner wants and what free CC0 libraries actually hold.
- Reproducible, pinned asset acquisition keeps builds auditable and prevents "mystery binary in the repo".
- In-house car authoring removes the last dependency on a marketplace.

**Negative / mitigations**

- **Hero car requires ongoing visual authoring and review.** Mitigation: the original in-house roadster is now implemented with tested triangle/render-mesh caps; runtime visual and device review remain explicit acceptance gates. No external stand-in is used.
- **Music is the weakest free category.** Mitigation: curated CC0/CC-BY playlist matched to seasons, stated as such
  in the research document's non-promises.
- **CC-BY props add a credit obligation.** Mitigation: automated credits generation; the owner can close the
  exception entirely.
- **In-house props are persistent art-authoring work.** Mitigation: budgeted at ≤ 5k tris each, built as a reusable
  kit, and required by every district so each one pays for itself many times over.
- **No reference scans of real Japanese landmarks.** Mitigation: composite authoring from CC0 materials, and the
  non-promise that we never present it as a real place.

## Related

- `docs/ASSET_SOURCES.md` — the verified register, per-class plan, and the ceiling of free sourcing.
- `docs/VISUAL_TARGET.md` §5 (region brief), §7 (resolved decisions).
- `docs/ASSET_POLICY.md` — licence rules, manifest, and register requirements.
- `PROJECT_PLAN.md` §9 (phases), §11 (asset policy, risks, deferred decisions).
- `docs/decisions/0004-visual-fidelity-and-rendering-pipeline.md`.
