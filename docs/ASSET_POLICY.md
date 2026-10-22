# Asset and Licensing Policy

## Current inventory

`public/assets/manifest.json` contains 19 pinned CC0 runtime entries at the verified PBR baseline: three HDRIs, nine 1K PBR surface sets, one colour-grading LUT, and six optimized environment models (44,913,263 asset bytes). The two concrete sets added for sidewalks, planters and selected opaque facades are Gravel Concrete 03 and Concrete Wall 009; existing Japanese Cedar Planks is used on wooden bench boards. The player roadster and five traffic archetypes are now project-authored TypeScript/Three.js geometry, not third-party model files; no vehicle asset was added to the manifest and `CREDITS.md` needs no new entry. A verifiably CC0 RGS_Dev vehicle pack was audited but not shipped because it is FBX-only and its stylized meshes do not match the current in-house rendering path. The manifest, `CREDITS.md`, and [`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md) remain the source/provenance records.

The project's initial `UNLICENSED` status does not replace or remove dependency licenses. Choosing an open-source project license later does not automatically permit redistribution of purchased or restricted assets.

## Standing rule (owner amendment 2026-10-22; ADR 0007 supplements ADR 0005)

**Free/open only. No purchases, fees, or paid credits.** CC0 remains preferred; CC-BY is an attributed exception only for suitable non-hero content and remains excluded for hero vehicles. The owner now permits AI-generated assets and free account-gated sources for all future project work, provided the exact asset has a verified license and its provenance, modification, self-hosting, redistribution, and intended-use terms are confirmed under the standing hierarchy (CC0 preferred; CC-BY only as the attributed exception for non-hero content; CC0-only for hero vehicles). New accounts and sources require owner approval; paid plans, upgrades, API access, or credits are not authorized. NC/ND and marketplace-"freebie" licenses remain excluded. Trademark, trade-dress, and recognizable vehicle-design rights remain separate from copyright licensing, and logos/number plates must be absent unless separately cleared. Hero vehicles remain CC0-only.

The owner broadened the hero-car search from the exact Ferrari California to any manufacturer and selected a generic red Meshy supercar listing as a candidate. It is marked CC0 and AI-generated. The owner accepted Meshy's Terms/Privacy for free signup, but human hCaptcha blocks account creation; no account has been created and no verification code requested. The downloadable file, badge-like details, brand/design suitability, and reproducible conversion have not been verified; retain the current unbadged in-house car until every gate passes. The exact source and audit are in [`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md), and the policy amendment is ADR 0007. If a free source cannot reach the bar, author in-house or document the gap; do not weaken the remaining rules.

## Preferred sources (visual-fidelity re-plan, 2026-10-14)

The owner requires Forza-Horizon-class visuals, which makes sourcing a first-class planning input
(see `docs/RESEARCH_AAA_FIDELITY.md` §5 and `docs/VISUAL_TARGET.md`):

- **CC0 first** for environment content: Poly Haven (HDRIs, PBR textures, models) and ambientCG.
  CC0 still gets recorded in the manifest — "no attribution required" is not "no provenance".
- **Free account-gated and AI-generated sources:** allowed after owner approval and exact-item review under ADR 0007. A free download is not automatically redistributable; verify the exact-item license and applicable platform terms under the existing hierarchy (CC0 preferred, CC-BY only as an attributed non-hero exception, CC0-only for hero vehicles). No paid plans, subscriptions, upgrades, or paid credits are authorized. Fab/Megascans remains excluded where the applicable terms are not CC0-compatible.
- **Cars:** never use a ripped/converted game mesh. The owner broadened the hero search from exact Ferrari California to any manufacturer and selected Meshy's generic red Italian-supercar-inspired concept, marked CC0 and AI-generated. This is a candidate only; item-level license/provenance, terms, download, badge-like marks, trade dress, and design suitability still need verification. CC0 alone does not clear recognizable real vehicle designs. Keep the current code-authored, unbadged Kaminari GT roadster until the source and build gates pass; see `docs/ASSET_SOURCES.md` §3.5. No purchase or paid access is authorized.
- Audio, if it is ever added, follows the same rules and needs its own scope decision.

## Before adding an asset

1. Identify the creator, original source, and exact license or purchase terms.
2. Verify rights to use, modify, self-host, and redistribute within a downloadable web build/repository as appropriate.
3. Determine required attribution, share-alike conditions, commercial-use restrictions, and whether source distribution is forbidden.
4. Check separate trademark/brand, music, voice, and other rights. A realistic branded car model may have additional restrictions.
5. Save appropriate license/credit evidence and inventory metadata. Never include purchase credentials or receipts containing private payment details in Git.
6. Obtain owner approval for new sources and account creation/use; no paid assets, plans, subscriptions, credits, or upgrades are authorized.
7. Normalize units, axes, pivots, node names, and material maps; document modifications.
8. Optimize, measure, and test the asset against the target device tier.

Do not infer that an image-search result, marketplace download, or publicly viewable GLB is free to redistribute. Prefer owned content or clearly compatible licenses such as verified CC0 when appropriate.

## Manifest contract for asset acquisition

The runtime manifest and loader are established. Every new entry must continue recording:

- Unique asset identifier and kind.
- Relative runtime path(s), format, and content/version identifier.
- Original source URL and creator.
- License name/link or internal approved-license reference.
- Required attribution and redistribution status.
- Modifications, authoring scale/axes, and relevant node bindings.
- Approximate file size, texture dimensions, and intended quality/LOD tier.
- Decoder/transcoder requirements and where the self-hosted decoder lives.
- The optimization chain and non-default settings used to produce the runtime file (so the pipeline
  is reproducible rather than a hand-edited asset of unknown provenance).

Any examples in documentation are examples, not authorization for a specific download.

## Car model contract — Phase 6

- The current player roadster is project-authored Three.js geometry in `src/vehicles/CarVisual.ts`; no imported model, manifest entry, or external runtime resource is required. A future free/open GLB is eligible only after source, license, and reproducible optimization are verified.
- Keep units in metres, +Y up, +X right, and local -Z forward.
- `CarVisual` resolves four physics-driven wheel pivots, front steering, an interior steering-wheel pivot, pose-driven local brake lamps, and shadow-casting body surfaces.
- Keep chassis collision geometry independent and simple; do not use the detailed render mesh as a dynamic triangle collider.
- The code-authored geometry is the deterministic fallback if a future optional external model cannot load.
- The open two-seat cabin is present, but a cockpit camera, mirror hooks, visual cockpit review, and device acceptance remain unverified.

## Optimization and hosting

- Use relative same-origin paths; avoid undeclared CDN runtime dependencies.
- Every asset goes through the project pipeline (`gltf-transform`-based): prune/dedupe → LODs →
  quantization → **meshopt** geometry compression → **KTX2/Basis** textures → budget check. Custom
  one-off exports are not accepted; the chain and its settings are recorded per manifest entry.
- Budgets per asset class are enforced in review: hero car 100k–200k triangles with halving LODs;
  props ≤ 5k; textures capped at 1024/2048 (a single uncompressed 4096² RGBA8 texture costs ~89 MB
  of GPU memory); vegetation through atlases and impostors.
- Prefer small GLBs, appropriate material counts, mesh LOD, and instanced environment assets.
- Keep color-space metadata correct for base color/emissive versus linear material maps.
- KTX2/Basis is the default for GPU textures, with `KTX2Loader.detectSupport(renderer)` deciding the
  fallback path; meshopt is preferred over Draco on the web because decoding is much faster.
- Do not commit generated dependency/build directories as a way to preserve assets.
- Record texture/mesh memory estimates and mobile fallbacks.

## Large-file Git policy

Git LFS is **not enabled in the initial scaffold**. Before enabling it, verify client installation, the actual dedicated repository's support, budget/quotas, and collaborators' clone workflow.

Do not add LFS filters blindly and leave only unresolved pointers. Do not commit large asset packs when only a few optimized runtime files are needed. Existing assets should never be moved or history-rewritten without user approval. GitHub's file/repository limits must be checked when large assets are proposed.

## Licence register

Alongside the manifest, every acquisition is recorded in a licence register: asset id, source URL,
creator, licence name and version/date, redistribution and modification rights, required
attribution text, and where the proof (licence page or receipt reference, never payment details) is
stored. An asset without a register entry does not enter the repository, and the register is
reviewed at the same gate as the manifest. Anything whose terms cannot be confirmed is replaced,
not "kept for now".

## Credits and release gate

[`CREDITS.md`](../CREDITS.md) is the attribution file. It is written by the same script that writes the manifest, so
a licence entry and its credit line land in the same commit and cannot drift from what ships. CC0 assets are credited
there anyway (out of respect, not obligation); CC-BY entries carry the required credit line and appear in the
in-game credits screen.

Create/update an attribution file as soon as the first asset requires credit. Before release, verify the inventory against files actually distributed, include required notices, and document any non-redistributable source assets. No public release or deployment is authorized by this initial setup.
