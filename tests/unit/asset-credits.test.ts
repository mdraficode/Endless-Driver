import { describe, expect, it } from 'vitest';
import { listAssetCredits } from '../../src/assets/AssetCredits';
import type { AssetManifest } from '../../src/assets/AssetManifest';

const MANIFEST: AssetManifest = {
  schemaVersion: 1,
  assets: [
    {
      id: 'example-cc-by',
      kind: 'model',
      name: 'Example hero',
      assetClass: 'hero',
      source: {
        url: 'https://example.org/model',
        creator: 'Example Creator',
        licence: 'CC-BY-4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: 'Example attribution line; modified for the game.',
        retrieved: '2026-10-23',
      },
      role: 'test',
      files: [
        {
          slot: 'model',
          path: 'assets/models/example.glb',
          bytes: 100,
          sha256: 'abc',
          colourSpace: 'mixed',
          format: 'glb',
        },
      ],
    },
    {
      id: 'example-cc0',
      kind: 'hdri',
      name: 'Example environment',
      assetClass: 'environment-ibl',
      source: {
        url: 'https://example.org/environment',
        creator: 'Another Creator',
        licence: 'CC0-1.0',
        attribution: '',
        retrieved: '2026-10-23',
      },
      role: 'test',
      files: [
        {
          slot: 'hdri',
          path: 'assets/example.hdr',
          bytes: 100,
          sha256: 'def',
          colourSpace: 'linear',
          format: 'hdr',
        },
      ],
    },
  ],
};

describe('manifest-backed asset credits', () => {
  it('carries the exact required CC BY line and licence link into the display record', () => {
    const credits = listAssetCredits(MANIFEST);
    expect(credits[0]).toMatchObject({
      id: 'example-cc-by',
      licence: 'CC-BY-4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      requiredAttribution: 'Example attribution line; modified for the game.',
      files: ['assets/models/example.glb'],
    });
  });

  it('does not label CC0 provenance as legally required attribution', () => {
    const credits = listAssetCredits(MANIFEST);
    expect(credits[1]?.requiredAttribution).toBeNull();
    expect(credits[1]?.licenceUrl).toBeNull();
  });
});
