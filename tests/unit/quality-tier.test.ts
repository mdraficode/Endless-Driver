import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG } from '../../src/config/render';
import { terrainConfigForTier } from '../../src/config/terrain';
import { TIER_DEFINITIONS, TIER_ORDER, isTierId, type TierId } from '../../src/config/tiers';
import {
  applyBackendOverride,
  applyTier,
  describeTier,
  readBackendRequest,
  readTierRequest,
  resolveBackendPreference,
  resolveTier,
  type TierEnvironment,
} from '../../src/core/QualityTier';

/** A desktop that should land on the default tier. */
const DESKTOP: TierEnvironment = {
  requested: null,
  isMobile: false,
  viewportWidth: 1920,
  hardwareConcurrency: 8,
  deviceMemory: 8,
};

describe('quality tier selection', () => {
  it('honours an explicit request, case-insensitively, above every other signal', () => {
    for (const value of ['A', 'a', 'b', 'C']) {
      const resolution = resolveTier({ ...DESKTOP, requested: value });
      expect(resolution.reason).toBe('requested');
      expect(resolution.id).toBe(value.toUpperCase());
    }
    // Even a phone can be told to run tier A — that is the point of an explicit contract.
    const forced = resolveTier({ ...DESKTOP, requested: 'A', isMobile: true, viewportWidth: 390 });
    expect(forced).toEqual({ id: 'A', reason: 'requested' });
  });

  it('selects tier C on mobile devices, and only on phone-sized viewports', () => {
    expect(resolveTier({ ...DESKTOP, isMobile: true })).toEqual({ id: 'C', reason: 'mobile' });
    // A phone in "desktop site" mode: no coarse pointer and a desktop user agent, but the viewport
    // gives it away.
    expect(resolveTier({ ...DESKTOP, viewportWidth: 390 })).toEqual({ id: 'C', reason: 'mobile' });
    // A narrow desktop window is not classified as a phone, but the unmeasured default remains performance-first.
    expect(resolveTier({ ...DESKTOP, viewportWidth: 600 })).toEqual({
      id: 'C',
      reason: 'desktop-default',
    });
  });

  it('selects tier C on core- or memory-constrained desktops', () => {
    expect(resolveTier({ ...DESKTOP, hardwareConcurrency: 4 })).toEqual({
      id: 'C',
      reason: 'constrained',
    });
    expect(resolveTier({ ...DESKTOP, deviceMemory: 4 })).toEqual({
      id: 'C',
      reason: 'constrained',
    });
    // Unknown memory is not treated as constrained, but still receives the conservative default.
    expect(resolveTier({ ...DESKTOP, deviceMemory: null }).id).toBe('C');
  });

  it('defaults every unmeasured desktop to tier C and never auto-selects a higher budget', () => {
    expect(resolveTier(DESKTOP)).toEqual({ id: 'C', reason: 'desktop-default' });
    // A generous machine still starts on C until the owner selects a higher budget explicitly.
    const workstation: TierEnvironment = {
      ...DESKTOP,
      hardwareConcurrency: 32,
      deviceMemory: 64,
      viewportWidth: 3840,
    };
    expect(resolveTier(workstation).id).toBe('C');
  });

  it('treats an unrecognised or absent request as no request', () => {
    expect(readTierRequest('')).toBeNull();
    expect(readTierRequest('?tier=Z')).toBeNull();
    expect(readTierRequest('?tier=')).toBeNull();
    expect(readTierRequest('?debug&tier=A')).toBe('A');
    expect(readTierRequest('?tier=c&other=1')).toBe('C');
    expect(resolveTier({ ...DESKTOP, requested: 'Z' }).reason).toBe('desktop-default');
    expect(isTierId('d')).toBe(false);
  });

  it('labels a tier with its id and reason', () => {
    expect(describeTier({ id: 'B', reason: 'desktop-default' })).toBe('B · desktop default');
    expect(describeTier({ id: 'C', reason: 'requested' })).toBe('C · requested');
  });
});

describe('applying a tier', () => {
  it('never mutates the baseline configuration', () => {
    const before = JSON.stringify(RENDER_CONFIG);
    applyTier(RENDER_CONFIG, 'C');
    applyTier(RENDER_CONFIG, 'A');
    expect(JSON.stringify(RENDER_CONFIG)).toBe(before);
  });

  it('lowers the budget on tier C and raises it on tier A', () => {
    const c = applyTier(RENDER_CONFIG, 'C');
    const b = applyTier(RENDER_CONFIG, 'B');
    const a = applyTier(RENDER_CONFIG, 'A');

    // Resolution
    expect(c.maxPixelRatio).toBe(1);
    expect(b.maxPixelRatio).toBe(1.25);
    expect(a.maxPixelRatio).toBe(2);

    // Shadows: cascade count, resolution, and range scale with the tier.
    expect(c.shadows.csm.cascades).toBe(1);
    expect(b.shadows.csm.cascades).toBe(2);
    expect(a.shadows.csm.cascades).toBe(4);
    expect(c.shadows.mapSize).toBe(1024);
    expect(b.shadows.mapSize).toBe(1024);
    expect(a.shadows.mapSize).toBeGreaterThan(b.shadows.mapSize);
    expect(c.shadows.csm.maxFar).toBeLessThan(a.shadows.csm.maxFar);

    // Backend: no tier may restate it — auto WebGPU with the built-in WebGL2 fallback
    // comes from the base config and survives every tier.
    expect(c.renderer.backendPreference).toBe('auto');
    expect(b.renderer.backendPreference).toBe('auto');
    expect(a.renderer.backendPreference).toBe('auto');
    // No MSAA, temporal history, or velocity attachment on the performance-first and balanced tiers.
    expect(c.renderer.antialias).toBe(false);
    expect(b.renderer.antialias).toBe(false);
    expect(c.postProcessing.antiAliasing).toBe('fxaa');
    expect(b.postProcessing.antiAliasing).toBe('smaa');
    expect(c.postProcessing.temporalAntiAliasing.enabled).toBe(false);
    expect(b.postProcessing.temporalAntiAliasing.enabled).toBe(false);
    expect(c.postProcessing.motionBlur.enabled).toBe(false);
    expect(b.postProcessing.motionBlur.enabled).toBe(false);
    expect(c.postProcessing.ssr.enabled).toBe(true);
    expect(b.postProcessing.ssr.enabled).toBe(true);
    expect(a.postProcessing.ssr.enabled).toBe(true);
    expect(c.postProcessing.ssr.resolutionScale).toBeLessThan(b.postProcessing.ssr.resolutionScale);
    expect(b.postProcessing.ssr.resolutionScale).toBeLessThan(a.postProcessing.ssr.resolutionScale);
    expect(c.postProcessing.temporalAntiAliasing.dynamicResolution).toBe(true);
    expect(c.postProcessing.temporalAntiAliasing.renderScale).toBe(0.9);
    expect(c.postProcessing.temporalAntiAliasing.minScale).toBe(0.6);
    expect(b.postProcessing.temporalAntiAliasing.renderScale).toBe(1);
    expect(b.postProcessing.temporalAntiAliasing.minScale).toBe(0.8);
    expect(c.postProcessing.chromaticAberration.enabled).toBe(false);
    expect(c.postProcessing.sharpen.sharpness).toBe(1);
    expect(c.postProcessing.temporalAntiAliasing.maxScale).toBe(1);
    expect(b.postProcessing.temporalAntiAliasing.maxScale).toBe(1);
  });

  it('reduces visual terrain tessellation without changing the shared heightfield', () => {
    const c = terrainConfigForTier('C');
    const b = terrainConfigForTier('B');
    const a = terrainConfigForTier('A');
    expect(c.seed).toBe(a.seed);
    expect(c.chunkSizeMeters).toBe(a.chunkSizeMeters);
    expect(c.physicsSegmentsPerChunk).toBe(a.physicsSegmentsPerChunk);
    expect(c.lodSegments).toEqual([48, 20, 8]);
    expect(b.lodSegments).toEqual([64, 24, 12]);
    expect(a.lodSegments).toEqual([64, 32, 16]);
    expect(c.maxBuildsPerFrame).toBe(1);
    expect(b.maxBuildsPerFrame).toBe(1);
    expect(a.maxBuildsPerFrame).toBe(2);
  });

  it('keeps the HDRI out of the gameplay background and reserves clouds for tier A', () => {
    const c = applyTier(RENDER_CONFIG, 'C');
    const b = applyTier(RENDER_CONFIG, 'B');
    const a = applyTier(RENDER_CONFIG, 'A');
    expect(c.environment.useAsBackground).toBe(false);
    expect(c.atmosphere.clouds.enabled).toBe(false);
    expect(b.environment.useAsBackground).toBe(false);
    expect(b.atmosphere.clouds.enabled).toBe(false);
    expect(a.atmosphere.clouds.enabled).toBe(true);
  });

  it('leaves untouched sections at their baseline values', () => {
    const c = applyTier(RENDER_CONFIG, 'C');
    expect(c.camera).toEqual(RENDER_CONFIG.camera);
    expect(c.lighting).toEqual(RENDER_CONFIG.lighting);
    expect(c.sky).toEqual(RENDER_CONFIG.sky);
    expect(c.diagnostics).toEqual(RENDER_CONFIG.diagnostics);
  });

  it('produces a configuration every tier can actually render', () => {
    // These invariants are the same ones the baseline config must satisfy; a tier that broke them
    // would produce a camera with an inverted frustum, fog past the far plane, or cascades that
    // extend beyond what the camera draws.
    for (const tier of TIER_ORDER) {
      const config = applyTier(RENDER_CONFIG, tier);
      expect(config.camera.near).toBeLessThan(config.camera.far);
      expect(config.shadows.cameraNear).toBeLessThan(config.shadows.cameraFar);
      expect(config.shadows.csm.maxFar).toBeLessThanOrEqual(config.camera.far);
      expect(config.shadows.csm.cascades).toBeGreaterThanOrEqual(1);
      expect(config.shadows.mapSize).toBeGreaterThanOrEqual(1024);
      expect(config.postProcessing.bloom.threshold).toBeGreaterThan(0);
      expect(config.maxPixelRatio).toBeGreaterThan(0);
      expect(config.maxPixelRatio).toBeLessThanOrEqual(2);
    }
  });

  it('declares every tier in the contract table, ordered low to high', () => {
    expect(TIER_ORDER).toEqual(['C', 'B', 'A']);
    for (const tier of TIER_ORDER) {
      const definition = TIER_DEFINITIONS[tier];
      expect(definition.id).toBe(tier);
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.summary.length).toBeGreaterThan(0);
      // Effects the tier is contracted to control but that do not exist yet must be declared, so the
      // gap between the contract and the implementation is visible rather than implied.
      expect(definition.pending.length).toBeGreaterThan(0);
    }
  });

  it('keeps tier identity stable for the HUD', () => {
    const ids: TierId[] = TIER_ORDER.map((tier) => TIER_DEFINITIONS[tier].id);
    expect(ids).toEqual(['C', 'B', 'A']);
  });
});

describe('forced-backend debug switch', () => {
  it('parses ?backend= and treats anything else as no request', () => {
    expect(readBackendRequest('?backend=webgl')).toBe('webgl');
    expect(readBackendRequest('?backend=WebGL2')).toBe('webgl');
    expect(readBackendRequest('?backend=auto')).toBe('auto');
    expect(readBackendRequest('?backend=vulkan')).toBeNull();
    expect(readBackendRequest('')).toBeNull();
  });

  it('overrides the resolved configuration and leaves it untouched otherwise', () => {
    const base = applyTier(RENDER_CONFIG, 'B');
    const forced = applyBackendOverride(base, 'webgl');
    expect(forced.renderer.backendPreference).toBe('webgl');
    // Everything else must survive the override.
    expect(forced.shadows).toEqual(base.shadows);
    expect(forced.maxPixelRatio).toBe(base.maxPixelRatio);
    // A null request, or one matching the automatic baseline, returns the same object;
    // a forced WebGL2 preference clones exactly the renderer block.
    expect(applyBackendOverride(base, null)).toBe(base);
    expect(applyBackendOverride(base, 'auto')).toBe(base);
    const webglForced = applyBackendOverride(base, 'webgl');
    expect(webglForced).not.toBe(base);
    expect(webglForced.renderer.backendPreference).toBe('webgl');
    expect(webglForced.shadows).toEqual(base.shadows);
    expect(base.renderer.backendPreference).toBe('auto');
  });

  it('defaults Android devices with WebGPU to the compatible WebGL2 backend', () => {
    expect(resolveBackendPreference(null, { isAndroid: true, webGpuAvailable: true })).toBe(
      'webgl',
    );
    expect(resolveBackendPreference(null, { isAndroid: true, webGpuAvailable: false })).toBeNull();
    expect(resolveBackendPreference(null, { isAndroid: false, webGpuAvailable: true })).toBeNull();
    // Explicit query choices take precedence, including `?backend=auto` for diagnostics.
    expect(resolveBackendPreference('auto', { isAndroid: true, webGpuAvailable: true })).toBe(
      'auto',
    );
    expect(resolveBackendPreference('webgl', { isAndroid: false, webGpuAvailable: true })).toBe(
      'webgl',
    );
  });

  describe('gameplay clarity: no bloom veil at any tier', () => {
    // The bloom veil read as fog and homogenised every district into one pale
    // sheet (owner report, 2026-10-17). Tier overrides may retune strength and
    // radius for photo mode later, but no gameplay tier may switch it back on.
    it.each(['C', 'B', 'A'] as const)('keeps bloom disabled at tier %s', (tier) => {
      const resolved = applyTier(RENDER_CONFIG, tier);
      expect(resolved.postProcessing.bloom.enabled).toBe(false);
    });
  });
});
