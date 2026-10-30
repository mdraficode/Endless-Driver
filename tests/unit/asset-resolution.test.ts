import { describe, expect, it } from 'vitest';
import {
  assetResolutionForTier,
  surfaceAssetIdAtResolution,
  textureSetEntryServesResolution,
} from '../../src/config/asset-resolution';

describe('assetResolutionForTier', () => {
  it('gives tier C (phones) the 512-px budget', () => {
    expect(assetResolutionForTier('C')).toBe('512');
  });

  it('keeps tiers B and A on the full 1K files', () => {
    expect(assetResolutionForTier('B')).toBe('1k');
    expect(assetResolutionForTier('A')).toBe('1k');
  });
});

describe('surfaceAssetIdAtResolution', () => {
  it('maps a 1K surface id to its 512 id for the 512 budget', () => {
    expect(surfaceAssetIdAtResolution('tex-leafy-grass-1k', '512')).toBe('tex-leafy-grass-512');
    expect(surfaceAssetIdAtResolution('tex-rock-face-03-1k', '512')).toBe('tex-rock-face-03-512');
  });

  it('keeps the 1K id for the 1K budget', () => {
    expect(surfaceAssetIdAtResolution('tex-leafy-grass-1k', '1k')).toBe('tex-leafy-grass-1k');
  });

  it('leaves ids without a resolution suffix untouched', () => {
    // An id a 512 derivation has not been cut for keeps its name: the loader then serves the
    // file it has (the 1K one) instead of looking for a file that does not exist.
    expect(surfaceAssetIdAtResolution('tex-some-set', '512')).toBe('tex-some-set');
  });
});

describe('textureSetEntryServesResolution', () => {
  it('matches a 512 entry to the 512 budget and no other', () => {
    expect(textureSetEntryServesResolution('tex-leafy-grass-512', '512')).toBe(true);
    expect(textureSetEntryServesResolution('tex-leafy-grass-512', '1k')).toBe(false);
  });

  it('matches an id without a 512 suffix to the 1K budget only', () => {
    expect(textureSetEntryServesResolution('tex-leafy-grass-1k', '1k')).toBe(true);
    expect(textureSetEntryServesResolution('tex-leafy-grass-1k', '512')).toBe(false);
  });
});
