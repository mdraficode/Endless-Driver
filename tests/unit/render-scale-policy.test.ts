import { describe, expect, it } from 'vitest';

import { supportsScenePassResolutionScale } from '../../src/core/RenderScalePolicy';

describe('scene-pass resolution scaling policy', () => {
  it('supports TAAU reconstruction and bounded spatial-AA scaling', () => {
    expect(
      supportsScenePassResolutionScale(['taa'], { dynamicResolution: false, renderScale: 1 }),
    ).toBe(true);
    expect(
      supportsScenePassResolutionScale(['fxaa'], { dynamicResolution: true, renderScale: 1 }),
    ).toBe(true);
    expect(
      supportsScenePassResolutionScale(['smaa'], { dynamicResolution: true, renderScale: 1 }),
    ).toBe(true);
  });

  it('applies a requested fixed spatial scale but leaves the native spatial path alone', () => {
    expect(
      supportsScenePassResolutionScale(['fxaa'], { dynamicResolution: false, renderScale: 0.8 }),
    ).toBe(true);
    expect(
      supportsScenePassResolutionScale(['fxaa'], { dynamicResolution: false, renderScale: 1 }),
    ).toBe(false);
    expect(supportsScenePassResolutionScale([], { dynamicResolution: true, renderScale: 1 })).toBe(
      false,
    );
  });
});
