# Asset and Licensing Policy

## Current inventory

`public/assets/manifest.json` contains an empty versioned asset list. No car model, environment texture, building/tree/rock model, sound, HDRI, or third-party shader has been acquired or committed.

The project's initial `UNLICENSED` status does not replace or remove dependency licenses. Choosing an open-source project license later does not automatically permit redistribution of purchased or restricted assets.

## Standing rule (owner instruction, 2026-10-14)

**Free and open only. No purchases, ever.** CC0 is the default; CC-BY is an attributed exception only where no CC0
asset of comparable quality exists; everything paid, account-gated, NC/ND, marketplace-"freebie", AI-generated, or
brand-trademarked is excluded. The verified source register, per-asset-class plan, and the honest ceiling of free
sourcing are in [`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md); the decision is ADR 0005. Nothing in this policy may
be relaxed to obtain an asset — if free content cannot reach the bar, we author it ourselves or document the gap.

## Preferred sources (visual-fidelity re-plan, 2026-10-14)

The owner requires Forza-Horizon-class visuals, which makes sourcing a first-class planning input
(see `docs/RESEARCH_AAA_FIDELITY.md` §5 and `docs/VISUAL_TARGET.md`):

- **CC0 first** for environment content: Poly Haven (HDRIs, PBR textures, models) and ambientCG.
  CC0 still gets recorded in the manifest — "no attribution required" is not "no provenance".
- **Paid / non-CC0 sources** (Fab/Megascans free starter collection, purchased models, subscriptions):
  allowed only with a per-asset licence record, the terms that apply, and the download date. The
  era of the whole Megascans library being free for everyone ended 2024-12-31, and free-of-charge is
  not the same as licensed for redistribution.
- **Cars:** never ripped game assets; never manufacturer names, logos, or trade dress. The hero car is an
  in-house design under the fictional "Kaminari" marque, with a **CC0** Sketchfab concept car (Unity Fan series)
  as the stand-in until it lands — see `docs/ASSET_SOURCES.md` §3.5. No purchases are involved at any point.
- Audio, if it is ever added, follows the same rules and needs its own scope decision.

## Before adding an asset

1. Identify the creator, original source, and exact license or purchase terms.
2. Verify rights to use, modify, self-host, and redistribute within a downloadable web build/repository as appropriate.
3. Determine required attribution, share-alike conditions, commercial-use restrictions, and whether source distribution is forbidden.
4. Check separate trademark/brand, music, voice, and other rights. A realistic branded car model may have additional restrictions.
5. Save appropriate license/credit evidence and inventory metadata. Never include purchase credentials or receipts containing private payment details in Git.
6. Obtain user approval for paid assets, asset-source decisions, or additional accounts/services.
7. Normalize units, axes, pivots, node names, and material maps; document modifications.
8. Optimize, measure, and test the asset against the target device tier.

Do not infer that an image-search result, marketplace download, or publicly viewable GLB is free to redistribute. Prefer owned content or clearly compatible licenses such as verified CC0 when appropriate.

## Manifest contract to extend during asset loading

The current manifest is intentionally minimal. Add a loader/schema as assets appear. Each actual entry should record:

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

- GLB preferred for packaging; external GLTF resources allowed only when paths are tracked and deployment-safe.
- Normalize to meters, +Y up, +X right, and local -Z forward.
- Resolve four wheel nodes, front steering pivots, an optional interior steering wheel, brake-light material/meshes, and cockpit camera anchor.
- Keep chassis collision geometry independent and simple; do not use the detailed render mesh as a dynamic triangle collider.
- Provide a placeholder/error fallback for missing files or nodes.
- Interior detail must support cockpit view or the view's limitations must be explicitly documented.

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
