import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG, applyRenderSwitches } from '../../src/config/render';
import { applyTier } from '../../src/core/QualityTier';
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

describe('tone curve comparison switch', () => {
  it('defaults to ACES and replays through AgX only when the URL asks', () => {
    expect(RENDER_CONFIG.renderer.toneMapping).toBe('aces');
    expect(applyRenderSwitches(RENDER_CONFIG, '?tonemap=agx').renderer.toneMapping).toBe('agx');
    expect(applyRenderSwitches(RENDER_CONFIG, '?tonemap=neutral').renderer.toneMapping).toBe(
      'neutral',
    );
    expect(applyRenderSwitches(RENDER_CONFIG, '?tonemap=bogus').renderer.toneMapping).toBe('aces');
  });
});

describe('contact shadows and SSGI configuration', () => {
  it('ships both off in the baseline: a tier buys them, the defaults do not', () => {
    expect(RENDER_CONFIG.postProcessing.contactShadows.enabled).toBe(false);
    expect(RENDER_CONFIG.postProcessing.ssgi.enabled).toBe(false);
  });

  it('keeps the contact march at contact scale with a sane tap count', () => {
    const { contactShadows } = RENDER_CONFIG.postProcessing;
    expect(Number.isInteger(contactShadows.steps)).toBe(true);
    expect(contactShadows.steps).toBeGreaterThan(0);
    expect(contactShadows.maxDistanceMeters).toBeGreaterThan(0);
    expect(contactShadows.maxDistanceMeters).toBeLessThanOrEqual(3);
    expect(contactShadows.thicknessMeters).toBeGreaterThan(0);
    expect(contactShadows.strength).toBeGreaterThan(0);
    expect(contactShadows.strength).toBeLessThanOrEqual(1);
  });

  it('keeps the SSGI sampling within the node documented ranges', () => {
    const { ssgi } = RENDER_CONFIG.postProcessing;
    expect(ssgi.sliceCount).toBeGreaterThanOrEqual(1);
    expect(ssgi.sliceCount).toBeLessThanOrEqual(4);
    expect(ssgi.stepCount).toBeGreaterThanOrEqual(1);
    expect(ssgi.stepCount).toBeLessThanOrEqual(32);
    expect(ssgi.radiusMeters).toBeGreaterThan(0);
  });

  it('switches each effect independently from the URL', () => {
    expect(
      applyRenderSwitches(RENDER_CONFIG, '?contact=1').postProcessing.contactShadows.enabled,
    ).toBe(true);
    expect(applyRenderSwitches(RENDER_CONFIG, '?ssgi=1').postProcessing.ssgi.enabled).toBe(true);
    expect(applyRenderSwitches(RENDER_CONFIG, '').postProcessing.contactShadows.enabled).toBe(
      false,
    );
  });
});

describe('height-aware fog and god rays configuration', () => {
  it('keeps the height-fog densities in the range the factor functions expect', () => {
    const { heightFog } = RENDER_CONFIG.sky;
    expect(heightFog.distanceDensity).toBeGreaterThan(0);
    expect(heightFog.distanceDensity).toBeLessThan(0.01);
    expect(heightFog.heightDensity).toBeGreaterThan(0);
    expect(heightFog.heightDensity).toBeLessThan(heightFog.distanceDensity);
    expect(heightFog.heightMeters).toBeGreaterThan(0);
    expect(heightFog.heightMeters).toBeLessThan(100);
    expect(heightFog.sunScatterStrength).toBeGreaterThanOrEqual(0);
    expect(heightFog.sunScatterStrength).toBeLessThanOrEqual(1);
    expect(heightFog.sunScatterPower).toBeGreaterThan(1);
  });

  it('gives the constrained tier the linear band and the desktop tiers the height term', () => {
    expect(applyTier(RENDER_CONFIG, 'C').sky.heightFog.enabled).toBe(false);
    expect(applyTier(RENDER_CONFIG, 'B').sky.heightFog.enabled).toBe(true);
    expect(applyTier(RENDER_CONFIG, 'A').sky.heightFog.enabled).toBe(true);
    // A tier that only flips the switch must not lose the tuned densities to the merge.
    expect(applyTier(RENDER_CONFIG, 'C').sky.heightFog.distanceDensity).toBe(
      RENDER_CONFIG.sky.heightFog.distanceDensity,
    );
  });

  it('switches the height term and fog itself from the URL', () => {
    expect(applyRenderSwitches(RENDER_CONFIG, '?hfog=0').sky.heightFog.enabled).toBe(false);
    expect(applyRenderSwitches(RENDER_CONFIG, '?hfog=1').sky.heightFog.enabled).toBe(true);
    expect(applyRenderSwitches(RENDER_CONFIG, '?fog=off').sky.fogEnabled).toBe(false);
  });

  it('keeps the god-ray march parameters the node can consume', () => {
    const { godrays } = RENDER_CONFIG.postProcessing;
    expect(Number.isInteger(godrays.raymarchSteps)).toBe(true);
    expect(godrays.raymarchSteps).toBeGreaterThan(0);
    expect(godrays.density).toBeGreaterThan(0);
    expect(godrays.maxDensity).toBeGreaterThan(0);
    expect(godrays.maxDensity).toBeLessThanOrEqual(1);
    expect(godrays.resolutionScale).toBeGreaterThan(0);
    expect(godrays.resolutionScale).toBeLessThanOrEqual(1);
    expect(godrays.shadowExtentMeters).toBeGreaterThan(0);
    expect(godrays.shadowMapSize).toBeGreaterThanOrEqual(256);
  });
});

describe('diagnostics overlay visibility (player default)', () => {
  it('stays hidden for plain player visits and debug tooling opts in', () => {
    // No params: a player opening the game gets a clean screen.
    expect(applyRenderSwitches(RENDER_CONFIG, '').diagnostics.overlayEnabled).toBe(false);
    expect(applyRenderSwitches(RENDER_CONFIG, '?tier=C').diagnostics.overlayEnabled).toBe(false);
    // Debug tooling keeps its instrumentation.
    expect(applyRenderSwitches(RENDER_CONFIG, '?debug=1').diagnostics.overlayEnabled).toBe(true);
    expect(applyRenderSwitches(RENDER_CONFIG, '?overlay=1').diagnostics.overlayEnabled).toBe(true);
    // An explicit hide wins over everything, including debug.
    expect(
      applyRenderSwitches(RENDER_CONFIG, '?debug=1&overlay=0').diagnostics.overlayEnabled,
    ).toBe(false);
  });
});
