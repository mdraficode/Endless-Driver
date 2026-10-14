# Asset loading and ownership

**Status:** Phase 3 in progress — the manifest-driven load path, the verified asset set, and the **model
derivation pipeline** exist; runtime GLB loading with LOD selection arrives with the props viewer, and
shared-resource reference counting with the assets that need it (Phases 4–6).

## Responsibility

Manifest-driven loading, GLB node normalization, shared-resource reference ownership, errors/fallbacks, and
disposal.

## Implemented

| File               | Responsibility                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AssetManifest.ts` | Reads `public/assets/manifest.json` (written by `scripts/fetch-assets.mjs`), resolves an HDRI by manifest id, and loads it as a linear half-float reflection texture. A missing or unreachable asset is reported and the caller falls back — the scene keeps rendering with the procedural sky and the sun |

The manifest is the only path by which an asset can reach the renderer, which is what keeps `CREDITS.md` and
`docs/ASSET_SOURCES.md` true: an asset that the pipeline did not fetch and hash cannot be referenced.

## The model pipeline

Models are not fetched, they are _derived_: `scripts/build-models.mjs` fetches a pinned CC0 source into an
uncommitted cache and produces the runtime `.glb`, recording the source URLs, MD5s and output hashes in the same
manifest this module reads. What it produces is one file per model holding every level of detail as a node
(`lod0`, `lod1`, …) over a single KTX2 texture set, with the geometry meshopt-compressed and quantized.

`docs/ASSET_SOURCES.md` §6.1 records the two rules that make that derivation work — seams merge on the deeper
levels, and not on the closest one — along with the measurements behind them.

## Planned work

GLB/GLTF loading with node normalization and material translation, LOD selection by distance, asset pools with
reference-counted release (Phases 4–6, per `docs/ASSET_POLICY.md`). Image-decoding work moves to a worker when the
first heavy asset lands.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
