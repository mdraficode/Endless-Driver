import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG } from '../../src/config/render';
import { WORLD_CONFIG } from '../../src/config/world';

describe('render configuration', () => {
  it('caps device pixel ratio at 2 for mobile GPU budgets', () => {
    expect(RENDER_CONFIG.maxPixelRatio).toBe(2);
  });

  it('bounds frame deltas so a stall cannot advance state by seconds', () => {
    expect(RENDER_CONFIG.maxFrameDeltaSeconds).toBeGreaterThan(0);
    expect(RENDER_CONFIG.maxFrameDeltaSeconds).toBeLessThanOrEqual(0.25);
  });

  it('selects a supported shadow filter and a high-resolution shadow map', () => {
    const { shadows } = RENDER_CONFIG;
    // Three.js r186 removed PCFSoftShadowMap at runtime, so only supported modes are allowed here.
    expect(['pcf', 'vsm']).toContain(shadows.shadowMapType);
    expect(shadows.vsmBlurSamples).toBeGreaterThan(0);
    expect(shadows.mapSize).toBeGreaterThanOrEqual(2048);
    expect(shadows.cameraNear).toBeLessThan(shadows.cameraFar);
    expect(shadows.cameraBounds).toBeGreaterThan(0);
    expect(shadows.normalBias).toBeGreaterThan(0);
  });

  it('places the sun above the ground with a valid perspective frustum', () => {
    const [, sunY] = RENDER_CONFIG.lighting.sunPosition;
    expect(sunY).toBeGreaterThan(10);
    expect(RENDER_CONFIG.camera.near).toBeLessThan(RENDER_CONFIG.camera.far);
    expect(RENDER_CONFIG.camera.maxPolarAngle).toBeLessThan(Math.PI / 2);
    expect(RENDER_CONFIG.camera.maxDistance).toBeGreaterThan(RENDER_CONFIG.camera.minDistance);
  });

  it('uses integer colors in range', () => {
    const colors = [
      RENDER_CONFIG.sky.fogColorDay,
      RENDER_CONFIG.sky.fogColorHorizon,
      RENDER_CONFIG.lighting.ambientColor,
      RENDER_CONFIG.lighting.sunColor,
    ];
    for (const color of colors) {
      expect(Number.isInteger(color)).toBe(true);
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('keeps the ground grid fade inside the camera far plane', () => {
    // Grid tuning itself is asserted in world-config.test.ts; the render camera must still be able
    // to see the whole fade range.
    expect(WORLD_CONFIG.ground.grid.fadeDistance).toBeLessThan(RENDER_CONFIG.camera.far);
  });

  it('keeps the fog range inside the camera far plane', () => {
    expect(RENDER_CONFIG.sky.fogFar).toBeLessThan(RENDER_CONFIG.camera.far);
    expect(RENDER_CONFIG.sky.fogNear).toBeLessThan(RENDER_CONFIG.sky.fogFar);
  });

  it('drives the atmosphere from a physically meaningful sun', () => {
    const { atmosphere } = RENDER_CONFIG;
    expect(atmosphere.turbidity).toBeGreaterThan(1);
    expect(atmosphere.rayleigh).toBeGreaterThan(0);
    expect(atmosphere.mieCoefficient).toBeGreaterThan(0);
    expect(atmosphere.mieDirectionalG).toBeGreaterThan(0);
    expect(atmosphere.mieDirectionalG).toBeLessThan(1);
    // The sky model reads the vertical component of this as a distance.
    expect(atmosphere.sunDistance).toBeGreaterThan(1000);
    expect(atmosphere.clouds.coverage).toBeGreaterThanOrEqual(0);
    expect(atmosphere.clouds.coverage).toBeLessThanOrEqual(1);
  });

  it('cascades shadows across the visible range', () => {
    const { shadows } = RENDER_CONFIG;
    expect(shadows.csm.cascades).toBeGreaterThanOrEqual(2);
    expect(shadows.csm.maxFar).toBeGreaterThan(RENDER_CONFIG.sky.fogNear);
    expect(shadows.csm.maxFar).toBeLessThanOrEqual(RENDER_CONFIG.camera.far);
    expect(shadows.csm.lightMargin).toBeGreaterThan(0);
  });

  it('names an environment asset and keeps the dome inside the far plane', () => {
    // The environment is resolved through the asset manifest, so the id has to be a manifest id.
    expect(RENDER_CONFIG.environment.assetId).toMatch(/^hdri-[a-z0-9-]+$/);
    expect(RENDER_CONFIG.environment.intensity).toBeGreaterThan(0);
    expect(RENDER_CONFIG.sky.domeScaleFactor).toBeGreaterThan(1);
    expect(RENDER_CONFIG.renderer.backendPreference).toBe('auto');
    expect(RENDER_CONFIG.renderer.toneMappingExposure).toBeGreaterThan(0);
  });

  it('gates post-processing per effect instead of all-or-nothing', () => {
    const { postProcessing } = RENDER_CONFIG;
    expect(typeof postProcessing.enabled).toBe('boolean');
    expect(typeof postProcessing.bloom.enabled).toBe('boolean');
    expect(postProcessing.bloom.strength).toBeGreaterThanOrEqual(0);
    expect(postProcessing.bloom.threshold).toBeGreaterThan(0);
  });
});
