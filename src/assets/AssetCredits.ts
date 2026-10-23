import type { AssetManifest } from './AssetManifest';

/** One manifest-backed credit line for the in-game attribution view. */
export interface AssetCredit {
  readonly id: string;
  readonly name: string;
  readonly creator: string;
  readonly licence: string;
  readonly sourceUrl: string;
  readonly licenceUrl: string | null;
  readonly requiredAttribution: string | null;
  readonly files: readonly string[];
}

/**
 * Resolves every published asset into a display-ready credit record.
 *
 * CC BY text comes verbatim from the manifest, so the in-game notice cannot drift from the
 * attribution generated into CREDITS.md. Other licences remain listed for provenance, without
 * incorrectly labelling optional credits as legally required.
 */
export function listAssetCredits(manifest: AssetManifest): readonly AssetCredit[] {
  return manifest.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    creator: asset.source.creator,
    licence: asset.source.licence,
    sourceUrl: asset.source.url,
    licenceUrl: asset.source.licenceUrl ?? null,
    requiredAttribution: asset.source.licence.startsWith('CC-BY') ? asset.source.attribution : null,
    files: asset.files.map((file) => file.path),
  }));
}
