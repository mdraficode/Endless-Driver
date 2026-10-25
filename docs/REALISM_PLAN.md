# Realism plan: how close to a AAA look this can actually get, and what to do about it

Written 2026-10-14, after Phase 3's post stack, LUT look, depth of field, and model pipeline landed. It
answers one question the owner asked directly: _is there anything that would make this feel more real —
real enough to be the best-looking thing anyone has opened in a browser tab without installing anything?_

It extends [`RESEARCH_AAA_FIDELITY.md`](RESEARCH_AAA_FIDELITY.md) (the 2026-10 re-plan, which catalogues
what Forza Horizon does and what is reachable) rather than repeating it. What is new here is the
_ordering_: which levers actually change how real the image feels, what each costs, and where each one
lands in the phase plan.

---

## 1. What changed in 2026, and why it matters

Three facts decide the ceiling, and all three moved recently:

1. **WebGPU is Baseline.** Chrome and Edge since 113, **Safari 26** (macOS Tahoe, iOS/iPadOS 26),
   **Firefox 141+** — all shipping enabled by default, no flags. The fifteen-year WebGL era is over
   ([vr.org](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default),
   [byteiota](https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/)). This project
   already renders WebGPU-first with a WebGL2 fallback, so the ceiling is now the _fast_ path's ceiling.
2. **Compute shaders are first-class.** GPU-resident buffers, storage textures, indirect draws, and
   workgroup dispatch are available in production browsers. This is what unlocks GPU-driven rendering —
   the technique that makes real vegetation density possible at all
   ([three.js TSL compute](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)).
3. **Hardware ray tracing is _not_ coming soon.** It is blocked on bindless resource binding; the WebGPU
   working group's own priority order puts mesh shaders and ray tracing behind it, with "earliest 2027,
   if ever", and warns developers to stop waiting for it
   ([roadmap](https://kaelan.fyi/research/webgpu-future-roadmap/)). Software ray tracing in compute is
   10–100× slower than dedicated RT hardware — viable for a demo scene, not for a driving game at frame
   rate.

**Consequence:** we will never have path-traced lighting. Every realism gain has to come from
screen-space and probe-based techniques, hand-authored material work, and content density. That is not a
weak position — it is the position _every_ shipping game was in until 2018, and it is why the ranking
below matters more than any single feature.

---

## 2. The honest ceiling

|               | Forza Horizon                                            | This project                                                         | Verdict                                                          |
| ------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Car models    | 300k+ tris, scanned, licensed, interiors                 | One free/CC0 hero car, unbadged fictional brand                      | **Cannot match.** Legal and sourcing limit, not a rendering one. |
| World content | 100–200 GB of authored and photogrammetric data          | Generated from a seed; ~10 MB shipped today                          | **Cannot match density; can match _composition_.**               |
| Lighting      | Precomputed GI probes + RT reflections + screen-space GI | HDRI IBL, cascaded shadows, SSGI/RC on high tier                     | **Matchable at the technique level.**                            |
| Atmosphere    | Physical scattering, volumetric clouds/fog, god rays     | Preetham sky, sun-driven grade, fog; above pending                   | **Matchable.**                                                   |
| Materials     | Bespoke shaders, wear/dirt layers, decals                | `MeshPhysicalMaterial` with clearcoat/anisotropy + procedural detail | **Approachable.**                                                |
| Motion        | Motion blur, TAA, per-object velocity, physics-driven    | TAA and motion blur pending; physics already real                    | **Matchable, and it is cheap.**                                  |
| Load time     | 100+ GB install, minutes to first drive                  | A web page, seconds to first drive                                   | **We win outright.**                                             |
| Reach         | One platform, one spec                                   | Any device with a browser                                            | **We win outright.**                                             |

The claim worth building toward is not "we match Forza". It is: **the best-looking driving experience
that exists inside a link, on a page, with nothing to install — and one that uses rendering techniques
most shipped games never bothered with.** That is a real, defensible, one-of-a-kind position, and it is
reachable. Pretending to match a 200 GB console title's _asset library_ is not.

---

## 3. The levers, ranked by how much realism they buy per unit of work

The ordering below is the substance of this document. It is deliberately not the order of a feature
list: the biggest wins here are cheap and unglamorous, and the most expensive item is not the most
visible.

### Rank 1 — Temporal stability (TAA/TRAA + per-object motion vectors). Phase 3. **Highest impact per cost.**

Shimmer is the single loudest "this is a computer image" signal there is. Edges crawling, foliage
flickering, thin geometry blinking in and out — the eye reads it instantly, and no amount of material or
lighting work survives it. Every still screenshot looks fine while the image is visibly synthetic in
motion, which is exactly why it gets deprioritised and why shipping games spend so much effort on it.

It is also the keystone effect: the velocity buffer TAA needs is the **same** buffer motion blur and
screen-space effects need. Build it once, get three effects. `TAAUNode` and `TRAANode` both ship in r186.

### Rank 2 — Motion blur, per-object and camera. Phase 3. **Cheapest large win, once Rank 1 exists.**

Speed is the subject of a racing game and still frames cannot express it. Per-object blur on wheels and
roadside geometry is what makes 100 km/h read as 100 km/h. It also changes the _perceived_ frame rate:
motion-blurred 30 fps reads smoother than sharp 30 fps.

### Rank 3 — Aerial perspective and height-aware fog. Phase 3/4. **Large impact, small cost.**

The current fog is a distance band. Real distance cues are: colour shifting towards the sky's own
in-scatter with distance, height-dependent density (valley haze, clear ridges), and sun-facing
brightening at low sun. This is what makes a _distant_ landscape read as distant rather than as a
painted backdrop — the single most photographic cue available for an open world, and mostly mathematics.

**Status: shipped (Phase 3).** `src/shaders/height-fog.ts` composes the exponential height falloff with the
distance term on tiers B/A (tier C keeps the cheaper band alone). Measured at the dawn bookmark with depth of
field disabled: against fog-off, the height fog moved the far band further (MAD 11.2) than the linear band
(≈8.9), and the distant volcano sampled [188, 200, 213] under height fog vs [164, 180, 194] linear vs
[121, 137, 155] off — distance desaturating toward the sky, as intended. Tuning caveat recorded: the height
density saturates fast (the factor multiplies depth-below-threshold by distance), so the shipped value is
far smaller than the first guess.

### Rank 4 — Contact shadows and shadow quality. Phase 3/5. **Medium cost, high credibility.**

Objects that do not touch their own shadow read as pasted on. Screen-space contact shadows (a few
samples of the depth buffer along the light direction, darkening where occlusion is close) fix the
grounding of props, kerbs, the car's tyres, and vegetation bases, at a fraction of the cost of a finer
shadow map. Pairs with raising cascade resolution on the near tier.

**Status: shipped (Phase 3).** `src/shaders/contact-shadows.ts`: a 8–16 tap depth march towards
the sun from each surface point, in the HDR stage ahead of the temporal resolve, gated by the
daylight state (nothing at night). Measured in the studio: A/B MAD 2.8 with the _median pixel
untouched_ and p99 at 115 — exactly a contact-scale effect's signature, and every material
sphere now pools a contact shadow on its sun side. Its screen-space limits are the expected
ones (off-screen occluders cast nothing) and are why the march stays under two metres.

### Rank 5 — Terrain and road material craft. Phase 4. **Large impact; the largest single item of work.**

Tiling is the other great destroyer of realism. The fix is a stack, not a texture: multi-layer splat
blending with height-based transitions, **macro variation** (a large-scale albedo/roughness modulation
that breaks the tile period), **detail maps** that fade in with distance, and **parallax occlusion
mapping** on the near tier for the surfaces you drive over. Roads additionally need aggregate normal
detail, tar seams, worn markings, and kerb geometry — the road is what the player looks at most.

### Rank 6 — GPU-driven density (instancing + compute culling). Phase 5. **The enabler for everything dense.**

Grass, scatter, rocks, roadside clutter, and trees are what make an environment feel like a _place_.
CPU-side draw calls cap that at a few thousand objects; GPU-resident instance buffers with compute
frustum/distance culling and indirect draws raise it by an order of magnitude at the same frame cost.
WebGPU-only — the WebGL2 fallback emulates compute via transform feedback and lacks indirect draws, so
this needs a defined degraded path.

### Rank 7 — Global illumination: SSGI now, radiance cascades as a deliberate bet. Phase 3 experiment → 4/7.

Ambient occlusion darkens crevices; **GI is what makes light bounce**, and its absence is why
procedurally-lit scenes look flat next to baked ones. Three options, in increasing ambition:

- **`SSGINode`** — ships in r186, screen-space, noisy, needs the temporal + denoise stack. Cheap to
  enable on the high tier; a respectable baseline.
- **Reflection probes / irradiance volumes** — stable, off-screen-aware, and the technique most shipping
  games actually use for ambient bounce. Moderate work; fits the procedural world because probes can be
  generated from the same chunk data.
- **Radiance cascades** — a 2024–2026 technique that computes **noise-free, denoiser-free, multi-bounce**
  GI with a small compute budget. An independent comparison against Unity's own pipelines found it
  _faster_ than both SSGI and realtime lightmaps with better temporal stability
  ([study](https://dl.digra.org/index.php/dl/article/download/2775/2759),
  [WebGPU/WGSL implementation](https://github.com/nff747/radiance-cascades-wgsl)). It also produces
  volumetric lighting as a by-product, because it solves radiance in a volume.

  **Status (Phase 3): the SSGI option shipped.** `SSGINode` runs on the high tier as
  `beauty × ssao + diffuse × gi` ahead of the temporal resolve, _replacing_ SSAO there (two occlusion terms would double-darken). Measured: studio A/B MAD 4.4 (shadowed sides lift);
  the open route at noon barely moves (0.6) — there is no occlusion for bounce to work with
  until Phases 4–5 build real geometry. The cascades bet below is unchanged: it remains the
  Phase 7 go/no-go, not a Phase 3 promise.

  This is the project's genuine "one of a kind" bet: **almost no shipped game uses radiance cascades**,
  and nothing in a browser does. It is also compute-only, so it is a high-tier feature with no WebGL2
  path, and it is the highest-risk item on this list. Approach it as a timeboxed prototype with an
  explicit go/no-go, measured on real hardware, _not_ as a committed deliverable.

### Rank 8 — Material imperfection: wear, dirt, and variation. Phases 5–6. **Medium cost, disproportionate payoff.**

Real surfaces are not uniform. Roughness that varies at every scale, dirt accumulating in crevices and
splashing up from the road, brake dust on wheels, rubber laid down on kerbs, worn paint on markings,
edge wear on metal. This is the "last 5%" that turns a clean render into a photograph, and it is
authoring work plus procedural masks — not new rendering technology.

### Rank 9 — Weather and wet surfaces. Phase 7. **The most photogenic state, and it flatters everything else.**

A wet road is the best-looking surface in any racing game: it reflects, it darkens, it breaks up into
puddles, it sprays, and it hides the seams in whatever is around it. Rain on the lens, spray trails,
puddle reflections, and a wet-specular response with roughness modulation are the strongest single
visual event available — and they double as gameplay (traction).

### Rank 10 — Sky and light-shaft craft. Phase 3/7.

God rays through a cedar canopy, headlight cones in fog, streetlight pools at night. `GodraysNode`
exists; the rest is authored volumetrics. Cheap, dramatic, and the scenes where a browser game is
compared against a console one.

**Status: god rays shipped (Phase 3, tier A).** In the HDR chain after motion blur, driven by a
daylight-resolved tint (black at night = off, never a boolean), marching a dedicated non-CSM shaft light.
Measured at the canopy dawn bookmark (grain and depth of field disabled): unchanged-frame diff mean-max
5.64, max 108, localized through canopy and sky — present and correctly placed, but visually subtle
through the sparse placeholder slats; it will read properly when Phase 5 gives it real foliage density.
Headlight cones and streetlight pools remain Phase 7.

---

## 4. What this changes in the plan

| Phase       | Added or re-prioritised work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3 (now)** | **Landed:** Ranks 1, 2, 3, 4, 10 and the SSGI half of Rank 7, plus the image-quality harness (bookmarks, SSIM baseline, stability metric) — measured evidence in `docs/SESSION_HANDOFF.md` §§17–19. **Phase 3 is code-complete**; what remains is owner validation on named hardware (the sandbox has no GPU and cannot time frames) and the Phase 7 radiance-cascades go/no-go. Aohara wet-road SSR is now implemented for localized patch-mask pixels (2026-10-25); it is screen-space only and awaits rendered/performance validation. Car-body SSR and reflection probes remain pending. |
| **4**       | Terrain material stack (splat + macro + detail + POM) (Rank 5); road surfacing craft; aerial perspective parametrised from the atmosphere model.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **5**       | GPU-driven instancing and culling (Rank 6); density as an explicit budget; vegetation translucency (`SSSNode`) and wind; contact shadows extended to scatter.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **6**       | Hero car materials — clearcoat, flake normal, anisotropy — plus **reflection probes** and wear layers (Rank 8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **7**       | Radiance cascades **go/no-go outcome**, if the Phase 3 prototype succeeds; wet-surface response, puddle masks, spray, rain on lens (Rank 9); volumetric light shafts (Rank 10).                                                                                                                                                                                                                                                                                                                                                                                                              |
| **8**       | Photo mode with real camera controls; final grade and lens; the accepted baseline captures become the regression suite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Cross-cutting:** every item above must declare what the **WebGL2 fallback** does instead. The fallback
is not a debug path — it is roughly a fifth of the audience, and "it degrades to a still-good image" is a
requirement, not a hope.

---

## 5. Making "more realistic" testable

Aesthetic claims cannot be argued into existence, so the acceptance is mechanical:

1. **Baseline captures.** ✅ Shipped: the 2 km route with 12 fixed bookmarks, tier B, archived and
   committed in `baseline/route/` as the reference set (per-bookmark conditions in its `manifest.json`).
2. **SSIM against the accepted baseline.** ✅ Shipped: `npm run capture:route` re-shoots the bookmarks and
   fails below SSIM 0.97 per bookmark (self-consistency measured 0.9999–1.0000), so a change that quietly
   breaks framing, exposure, or colour is caught rather than admired.
3. **A temporal-stability metric.** ✅ Machinery shipped (`--stability`: 12-frame bursts, flat-region σ,
   TAA on/off arms). Under SwiftShader a static TAA-off burst is exactly 0.000 by construction and TAA-on
   shows small jitter residual (σ 0.048 start / 0.436 canopy, p95 flagging the thin posts) — so this
   validates the metric and names a watch item; validating Rank 1 itself still needs moving-camera bursts
   on real GPU hardware, which remains open.
4. **Frame budget on named hardware.** The sandbox has no GPU and cannot time anything; only the owner
   can. Each tier gets a target (16.6 ms for B/A on a mid-range dGPU) measured with a capture switch, and
   tiers are adjusted to the measurement, never the claim.
5. **Shipped-weight ceiling.** First-load bytes stay under ~25 MB. This is the constraint that makes the
   project unique, and it is a budget like any other.

---

## 6. What will not happen

Recorded so it is never quietly promised:

- Photogrammetric road and building density. There is no scanning pipeline and no budget for one.
- Licensed vehicles, or anything resembling a real manufacturer's car. The brand is fictional by design.
- Path-traced or hardware-accelerated ray tracing, for the reasons in §1.
- A 100 GB content library. World size comes from generation, not storage.
- Crowds, traffic AI, or animated humans at AAA scale.
- Anything measured only in a marketing sentence. Every claim in this document is either verified in the
  repository or attached to the phase that will verify it.
