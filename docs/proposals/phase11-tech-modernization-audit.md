# Phase 11.0 — Procedural World-Generation Tech Audit & Transformation

Status: **11.0a SHIPPED (this commit series) · 11.0b–d pending**
Scope ruled by the owner (2026-11-09): deep-research the procedural world-generation
stack against current best practice, then transform it in four ordered sub-passes.

## 1. Method

- Full survey of `src/world` (~35 k lines: world-plan, terrain-height, road-layout,
  road-network, world-terrain, chunk-generator, vegetation-placement, urban-massing,
  gpu-traffic, garage/tunnel/overpass passes).
- Compared each subsystem against the 2026 state of the art (procedural-terrain and
  procedural-road tooling, noise implementations, WebGPU platform baseline).
- Every gap is paired with a concrete sub-pass and a headless, measurable acceptance
  criterion — no visual-only claims.

## 2. Current-state inventory (at audit time)

| Subsystem      | Implementation                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Noise          | 32-bit `imul`-hash value noise, 5-octave fBm ×2 + domain warp + squared ridged + gorge mask + volcano cone + spawn pad (~19 noise evals per `heightAt`)                           |
| World plan     | 4 km lattice, 4 archetypes (urban u≥0.76 / town 0.52 / village 0.36 / rural 0.14), seeded                                                                                         |
| Roads          | grid-first: 4 km trunk chords, cell rural roads, urban blocks; **no horizontal grade routing** — infeasible grades resolved by vertical clamp (the road profile lags the terrain) |
| Profile solver | 8 m resample → smooth(3, r10) → node relaxation → `clampGrade` → terrain-follow (≤8 m cut / ≤12 m fill) → tunnels ≤8 → overpasses ≤2 → garages ≤3                                 |
| Vegetation     | stratified jitter sampling, per-cell density from the moisture/biome field                                                                                                        |
| Rendering      | three three.js r186.1 (TSL), TS 5.9.3, Vite 8.3.4; WebGPU compute used for traffic only; terrain rasterised CPU-side per chunk                                                    |

## 3. State of the art (2026) and the gaps

### Terrain noise

- Value noise is legacy: visible grid/axis alignment artefacts; simplex-family noise
  contributes 3 corners vs 4 in 2D value lattices (noisier spectrum at the same cost).
- **OpenSimplex2 (KdotJPG reference implementation)** is the current reference:
  simplex-lattice construction **with analytic gradients** — fBm + domain warp can be
  composed with exact derivatives (needed for normals, hydrology, and later road
  alignment). FastNoiseLite is the fast alternative.
- **GPU compute** rasterisation of 512×512 heightfield tiles: ~50 ms CPU → <5–10 ms
  (Horizon Zero Dawn-class generation is GPU-resident).

### Roads

- Grade caps win; **reroute before refusing** (ProceduralRoads PR #39; simple-road-
  network-generator): the network-shared junction height plus an **A\* over the
  heightmap with a hard maximum grade** is the standard horizontal router.
- Grade-scaled meander (roads straighten on steep ground) is the standard rural
  aesthetic; L-systems (Parish & Müller 2001) remain the classic city school — our
  grid-first layout is of that lineage and is kept.

### Vegetation

- **Bridson Poisson-disk sampling (k≈30)** with noise-driven density is the standard
  for non-lumpy, evenly-spread forests; blue-noise variants for 3D surfaces.

### Platform

- WebGPU is a baseline API in every major browser (Jan 2026); ~85 % of global traffic
  reached it by Oct 2026 (caniuse). TSL compute is first-class; r186 added
  `compileComputeAsync`.

## 4. Transformation passes (owner-ordered, all four approved)

### 11.0a — Grade-constrained A\* road routing (DONE)

`src/world/road-routing.ts` (new): elevation grid (`max(32 m, window/1100)` spacing,
bilinear `cellHeight`), 8-direction A\* with cost `stepDist·(1+3·grade²)`, **hard step
cap at 0.85× the class grade** (headroom: grid undersampling + post-search corner
cut), binary heap, de-collineation, **Chaikin ×3 corner smoothing** (endpoints pinned),
2-octave sine meander (rural only, amplitude 12 m, halve-once on cap breach),
**corridor bias 0.02** (cost per metre of chord deviation — junction approach stays on
the baseline axis, detours only where grade forces). Wired in `road-network.ts`:
rural roads always routed (meander upgrade), trunks routed when the dense 25 m chord
grade exceeds 3× the class cap; per-edge seeded streams; **undirected route cache**
(reverse-direction duplicate edges share one corridor); **node-pair dedupe** (a rural
road snapping onto a skeleton segment no longer doubles the physical road).
Garage passes: **ramp-corridor severance** — every street class whose ribbon crosses a
ramp's descent corridor (lateral <8 m, apron…ramp-end+6 m) is severed: wholly-in-zone
removed, end-touching trimmed and re-anchored, middle crossings split at the zone
boundaries (the pit retaining wall ends the street); orphaned nodes dropped, plus a
final degree-0 node sweep. Carve: a street crossing a ramp descent no longer holds
street level over the ramp (the co-linear driveway case is level and keeps priority).

**Measured (13 seeds, corrected audit — the engine world, generated anchor):**

- Realised grade: max = exactly the class cap on every seed (OVER counts are float
  epsilon — identical on the pre-routing baseline; not a regression).
- Components: 1 on all 13 seeds. Kinks (>60°): 0 on all 13 seeds.
- D1 worst 1.958 m (baseline 0.960), D2 worst 2.914 m (baseline 0.295),
  D3 worst 2.914 m (baseline 1.863) — the residuals are all junction ribbon-overlap
  points (garage connectors, trunk junctions): the 11.1b/11.1d classes the program
  already has open (the baseline itself carried a 0.904 m g2-ramp residual of the same
  class). Scheduled for 11.1d/11.2, not re-opened here.
- Builds 0.8–3.3 s (baseline 0.4–1.2 s); 25–55 routed edges/seed.
- `tests/unit/road-routing.test.ts`: 8/8 (flat→straight, hill→detour, wall→null both
  directions, determinism, meander, exact endpoints, grade dense-vs-chord, resample
  budget). Full suite 956/956.

### 11.0b — OpenSimplex2 + analytic gradients (next)

Replace the value-noise core with OpenSimplex2 fBm + domain warp; expose analytic
gradients for normals and road alignment. `WORLD_PLAN_VERSION` 3→4 (existing worlds
regenerate). Acceptance: in-band relief match (per-seed terrain statistics within
tolerance of the value-noise baseline on a 13-seed grid) + normals from gradients
(≤0.5° vs finite-difference) + build time not worse than 11.0a.

### 11.0c — Bridson Poisson-disk vegetation

Bridson (k=30) per biome cell, noise-driven density. Acceptance: forest density
in-band ±20 % of the current stratified-jitter count per seed (owner feedback bar: the
forest must not look empty) + nearest-neighbour distance distribution Poisson-like
(CV < 0.35 of the uniform-jitter baseline) + placement time ≤ baseline.

### 11.0d — WebGPU compute heightfield

Move the heightfield rasterisation (noise fBm + warp + volcano + plateau + carve mask)
to a TSL compute pass; CPU path remains the fallback. Acceptance: parity ≤1 cm vs the
CPU sampler on a 512² grid + measurable rasterisation speedup on tier-C hardware +
identical carve output (the carve itself stays CPU until 11.3/11.5).

## 5. Non-goals (deliberate)

- Rivers/erosion/hydrology → 11.3 (world composition).
- SDF road bake → 11.5 (efficiency).
- Urban grid generation (L-systems) → not in 11.0; the grid-first layout is kept.

## 6. Audit-instrumentation note

`scripts/audit-worldgen11.ts` must build the **engine world** (generated home-city
anchor), not the hand-placed default plateau — the hybrid world is not something the
game produces (it split seed 2's network into 2 components during 11.0a and skewed
every baseline figure).
