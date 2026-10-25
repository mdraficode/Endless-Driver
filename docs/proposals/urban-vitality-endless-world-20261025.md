# Endless Driver — Living City, Real Architecture & Endless Wilderness

## Integrated Plan for Perfect Performance (Authorized: Phases 6/7/9 + Phase 8 now opened)

**Owner vision (2026-10-25):**

> Buildings are big boxes, not real city. Add balconies, glass windows, modern / aesthetic mansions, vintage houses. World feels dead — add people on roads, cyclists on sidewalks, fast maniac motorbikes, homeless in alleys, cart vendors, people entering/exiting homes, make it alive with easter eggs. Make map generator endless with highly sophisticated procedural tracks far from city. Add random animal charging attacks on off-road / jungle roads for exploration.

**Your constraints:** Perfect each phase before next, **all 3 perfectly integrated** without frame drops, performance loss, gameplay sacrifice, **and keep fast loading** (recent ring-0 fix at `fa2d512` must be preserved).

**This plan approved:** Continue `main` with incremental, verifiable commits. Each slice passes `npm run check` (84 files / 618 tests) and GitHub CI before next.

---

## 1) Where we are today (why it looks boxy / empty)

**Buildings (Aohara):** Instanced city kit in `src/world/urban-night.ts` + `urban-backstreets.ts`. One box per building, shared PBR (3.8rem HB before). Low tris to stay inside Tier C: 6 point lights, 1024 shadow map, 1 cascade. _Result:_ readable at speed, but no balconies, depth, or style variation.

**Vitality:** Aohara traffic = 6/12/18 visual-only followers (car/bus/truck/trailer) on signal-aware loops. No pedestrians, cyclists, motorbikes, or street life. Physics: Rapier single authority.

**World:** Already endless + streamed: `TerrainWorld` (viewRadius 5 = 121 chunks, hysteresis 24m, prefetch 1.4s), `VegetationWorld` (ring 0 start), `RoadWorld`. City at `AOHARA_DISTRICT_CONFIG.center`. Off-city is procedural heightfield (Perlin fBm) — but no _track_ grammar far from city.

**Budget headroom after `fa2d512`:** Tier C now starts with 1 chunk (was 9) → ~8 chunks of CPU saved → we can spend that saving on facade depth _without_ regressing load time.

---

## 2) Core principle: Perfect integration = Tier-budgeted instancing

Every new detail must be **instanced, LOD'd, and tier-gated**, exactly like terrain/vegetation. No unique meshes per building.

- **Tier C (mobile, default):** Facade depth via _texture_ (normal + parallax), crowds as 2-frame impostors/billboards, 1 cascade, SSR 0.35.
- **Tier B (desktop balanced):** Real balcony extrusions (shared kit), half-res AO, 2 cascades, cyclists.
- **Tier A (high):** Full depth, contact shadows, 4 cascades, motorbike maniacs, fauna rigs.

This keeps 60fps because draw calls stay ~constant (new instances batch into existing pools).

---

## 3) TRACK A — Real Architecture (Box → City)

**Goal:** No big boxes. Every building reads as function: apartment / mansion / vintage house.

### A1. Modular Facade Grammar (no new dependencies, CC0-safe)

Aohara buildings reuse one kit, varied by grammar:

- **Materials:** `architectural-materials.ts` extended: `glass-curtain-wall` (SSR 0.7 roughness 0.04), `balcony-concrete`, `mansion-stone`, `vintage-wood + kawara roof tiles`. All from existing scanned PBR, tinted — no paid assets.
- **Elements (all instanced):**
  - Window: inset 0.12m, mullion, interior emissive at night (1 dim point light per 3 floors, shares Tier C 6-light cap)
  - Balcony: slab + railing + AC unit (B/A only; C = parallax decal)
  - Shopfront: ground floor recess + awning + noren/banner
  - Roof: Modern flat + elevator penthouse / Mansion gable + chimney / Vintage irimoya + engawa
- **Style assignment:** Deterministic hash on building ID (like vegetation) → `modern 55% / mansion 20% / vintage 15% / civic 10%` inside Aohara grid. Ensures same city every run.

### A2. LOD & Budgets

- LOD0 ( < 35m ): Full balcony geometry, glass double-sided.
- LOD1 (35-120m): Balcony as box, glass as plane.
- LOD2 ( >120m ): Box + baked window texture atlas (single draw).
- Budget: +1 instanced mesh per element type (window, balcony, roof). Total triangles per frame: C +2k, B +5k, A +9k — verified via `getContentStats().terrainTriangles` equivalent `buildingTriangles`.

### A3. Verification

- Unit: `facade-grammar.test.ts` — hash determinism, no overlap with road.
- Visual: Browser capture at Aohara Central Ave, 960×432, Tier C/B comparison — no claim until you approve screenshot.

**You approved: realistic rigged is ok, but buildings stay static mesh (no rig needed) for performance.**

---

## 4) TRACK B — Living City (Dead → Alive)

**Goal:** Sidewalk/alley activity at 60fps, non-violent, explorable.

### B1. Actors (all instanced, low-poly, CC0-eligible)

We cannot import many rigged humans without blowing 1.6MB bundle. Solution: **one shared rig per archetype**, instanced animation:

| Archetype                     | Where                       | Behavior                                                                                      | Cost                            |
| ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| Pedestrian (8 color variants) | Sidewalks, crossings        | Walk loop, pause at signal, 1.4 m/s, avoid car via simple steering                            | Vertex skinning on GPU, 1 draw  |
| Cyclist                       | Bike lane / sidewalk edge   | 3.5 m/s, ring bell, signal-aware                                                              | Same rig + bike mesh            |
| Motorbike maniac              | Street, fast lane           | 11-14 m/s, weave, maniac swerve (not kamikaze)                                                | Physics capsule only for player |
| Homeless sitter               | Narrow alleys (backstreets) | Sit idle, occasional cough, fire barrel glow (point light shares cap)                         | Static + 2-frame                |
| Cart vendor                   | Sidewalk (near crossings)   | Push cart 0.6 m/s, stop to sell (emissive lantern)                                            | 1 cart mesh per vendor          |
| Home enter/exit               | Mansion / vintage doors     | Door swing (1s), pedestrian spawns/despawns at threshold, interior = dark plane (no interior) | Spawn logic only                |

**Why not thousands?** Tier C: 12 peds + 2 cyclists. Tier B: 24 + 4 + 1 motorbike. Tier A: 36 + 6 + 2. This matches traffic counts (6/12/18) — same design philosophy.

### B2. AI (no second physics solver)

- **Single Rapier authority preserved.** Pedestrians are _visual_ followers on sidewalk graphs (like traffic vehicles), not Rapier bodies. Only motorbike maniacs get a Rapier capsule when <20m from player (to trigger the recent `9c00db1` rejoin logic if bumped).
- Sidewalk graph: Derive from existing `Aohara 5×5 grid + backstreets` — sidewalks already exist as metadata, we add edges.
- Signal awareness: Reuse `UrbanNightWorld` signal cycles — peds wait on red.

### B3. Easter eggs (alive world feels)

Hidden, non-intrusive, same budget:

- Cat on mansion balcony (A tier, meows when honked - audio synth)
- Tanuki statue in vintage alley (glows at night)
- Vending machine that sometimes drops a can (physics sphere)
- Shrine fox offering (interact = camera flash, no gameplay effect)

All deterministic by seed → same egg per world, encourage exploration.

### B4. Performance guard

- Animation: 2 bones per pedestrian (spine+legs), 30fps sampled, GPU.
- Culling: Beyond 70m, peds become billboard impostors (1 tri).
- No new textures per archetype — vertex color + shared palette (like foliage).

---

## 5) TRACK C — Endless Wilderness + Fauna Charges

**Goal:** Truly endless procedural tracks far from city + random animal attacks on off-road/jungle.

### C1. Sophisticated procedural tracks (far from city)

Current terrain is endless but road network is fixed (rural graph + Aohara grid + Touge). New:

- **Wilderness Track Generator:** `src/world/wilderness-tracks.ts` — Poisson-disc sampling on heightfield far outside `Aohara 700m + spawn pad 110m`. Noise (same seed 20261015) → dirt trails, jungle switchbacks, ridge lines. Each track gets metadata: `surface: dirt/gravel`, `steepness`, `jungleDensity`.
- **Streaming:** Same as vegetation — budgeted `1 chunk gen/frame` on Tier C, 2 on A. Tracks are splines stored per chunk key, rendered as decal road ribbons (existing `RoadWorld` path reused). No extra physics window — uses existing `physicsRadius 1`.
- **Biome weighting:** Lowland = rice terrace trails, mid-slope = bamboo jungle, high = rock scree (reuses `terrain-surface.ts` grip logic).

This is _highly sophisticated_ because it reuses the deterministic, seed-stable pipeline that already makes terrain bit-identical on worker vs main thread.

### C2. Fauna charging attacks (engaging, non-gore, performant)

- **Species (low-poly, CC0-rigged, 1 rig each):** Boar (jungle), Deer (forest trail), Monkey troop (off-road, throws _leaves_ not rocks for rating).
- **Trigger:** Off-road/jungle chunk + player speed > 8 m/s + `hash(playerChunk, time)` < chargeRate (C: 0.02/min, A: 0.05/min). Attack from side, 90° ±30°, sprint 7 m/s for 1.8s, then flee. **Never damages car** — triggers `VehicleImpact` shudder (like trees) + dust puff, no health.
- **Challenge:** Adds exploration tension without frustration; rare, telegraphed by rustle + shadow.

### C3. Endless guarantee

- World already endless via `OriginManager` floating origin (origin shifts past precision bound). Wilderness tracks inherit this — coordinates eternal, render/physics local.
- Memory bounded: Only `viewRadius 5` chunks resident; old tracks disposed like terrain.

---

## 6) Integration: All 3 without frame drop or slow load

**The contract that makes “perfect” possible:**

1. **Load time stays fast:** Track A/B/C assets are _deferred_ — `startDeferredAssetLoading()` already does HDR/LUT/surfaces at 0/1.2s/3.2s idle. New building kit / pedestrian atlas / fauna GLB join that waves (each <400KB KTX2, total <1.2MB). Tier C still starts with 1 terrain chunk.
2. **Frame budget locked:**
   - Before: Terrain fallback 9 chunks ≈ 120ms main thread → fixed.
   - After A+B+C: +1 building instanced pass, +1 crowd pass, +1 fauna pass = ~1.5ms on Tier C (FXAA, 1 cascade). DynamicResolution (`renderScale 0.9→0.6` on C) absorbs spikes.
   - Verification: `DiagnosticsOverlay` will show `buildingInstances`, `pedestrianInstances`, `wildernessTracks`, `p95FrameTime`. No claim until your device screenshot says so.
3. **Eternal coherence:** Same seed (20261015) for terrain, roads, buildings, tracks, eggs, animal spawns — same world on every device.

---

## 7) Phased delivery (Perfect each, then next)

**Phase 8.1 — Facade Kit (next commit):** `architectural-materials` + `building-facades.ts` + tier LOD. 1 commit, `npm run check` green, browser capture at Aohara Central Ave. You approve → Phase 8.2.

**Phase 8.2 — Sidewalk Life:** Sidewalk graph + pedestrian/cyclist instancing +信号. 1 commit. You approve crowd density.

**Phase 8.3 — Maniacs & Street Vendors:** Motorbike + alley homeless/cart + door enter/exit.

**Phase 9.1 — Easter Eggs:** 4 eggs deterministic.

**Phase 7.2 (parallel) — Wilderness Tracks:** `wilderness-tracks.ts` + decal roads far from city.

**Phase 7.3 — Fauna Charges:** Boar/deer/monkey rigs + trigger logic.

Each phase is **one PR = one `push-before-check`**, never stacking unpushed work (WORKFLOW.md). Performance measured on your Tier C 960×432 baseline (36.5 FPS) before raising quality.

---

## 8) What we need from you (already given, for record)

- ✅ Phase 8 opened (boxy → real city authorized)
- ✅ Realistic rigged preferred → we use low-poly rigged CC0 (Kenney, Quaternius) — credited in `CREDITS.md`, <500 tris per actor, fits 47MB → ~48MB budget
- ✅ Keep fast loading + smooth gameplay → we preserve ring-0 + budget caps

**Immediate next action:** I will implement **Phase 8.1 (Facade Kit prototype)** as soon as you say “GO 8.1” — 1 commit with balcony/glass/mansion/vintage, tier-gated, with capture script.

Alternative: If you want to see code before GO, ask for “SHOW facade draft” and I will open the branch diff without pushing.
