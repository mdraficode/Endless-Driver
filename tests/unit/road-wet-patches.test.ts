import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping } from 'three';
import { describe, expect, it } from 'vitest';

import { URBAN_CITY_CONFIG } from '../../src/config/urban-city';
import {
  createRoadWetPatchMaskTexture,
  generateRoadWetPatchMask,
} from '../../src/world/road-wet-patches';

describe('localized road wet-patch mask', () => {
  it('generates a deterministic, irregular map with both broad dry gaps and wet interiors', () => {
    const first = generateRoadWetPatchMask({ resolution: 256 });
    const repeated = generateRoadWetPatchMask({ resolution: 256 });
    const alternate = generateRoadWetPatchMask({ resolution: 256, seed: 0x51a7 });

    expect(repeated).toEqual(first);
    expect(alternate).not.toEqual(first);

    let sum = 0;
    let dryPixels = 0;
    let strongWetPixels = 0;
    let featherPixels = 0;
    for (const value of first) {
      sum += value;
      if (value === 0) dryPixels += 1;
      if (value >= 180) strongWetPixels += 1;
      if (value > 0 && value < 245) featherPixels += 1;
    }

    const average = sum / first.length / 255;
    expect(average).toBeGreaterThan(0.06);
    expect(average).toBeLessThan(0.32);
    expect(dryPixels / first.length).toBeGreaterThan(0.45);
    expect(strongWetPixels / first.length).toBeGreaterThan(0.04);
    expect(featherPixels).toBeGreaterThan(0);
  });

  it('uses a repeated linear mask texture so the world-space patch field has soft, stable edges', () => {
    const texture = createRoadWetPatchMaskTexture();
    expect(texture.image.width).toBe(URBAN_CITY_CONFIG.wetRoad.patches.textureResolution);
    expect(texture.image.height).toBe(URBAN_CITY_CONFIG.wetRoad.patches.textureResolution);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.generateMipmaps).toBe(true);
    texture.dispose();
  });
});
