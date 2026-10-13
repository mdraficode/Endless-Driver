import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG } from '../../src/config/render';

describe('Phase 1 render configuration', () => {
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

  it('uses integer colors in range and a square, evenly divided grid', () => {
    const colors = [
      RENDER_CONFIG.sky.zenithColor,
      RENDER_CONFIG.sky.horizonColor,
      RENDER_CONFIG.sky.groundColor,
      RENDER_CONFIG.lighting.ambientColor,
      RENDER_CONFIG.lighting.sunColor,
      RENDER_CONFIG.ground.color,
      RENDER_CONFIG.ground.grid.lineColor,
      RENDER_CONFIG.ground.grid.centerLineColor,
    ];
    for (const color of colors) {
      expect(Number.isInteger(color)).toBe(true);
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }

    // The procedural grid is drawn in the ground shader, so its spacing must tile the plane
    // exactly and its fade distance must stay inside the camera far plane.
    const { ground } = RENDER_CONFIG;
    expect(ground.size % ground.grid.spacing).toBe(0);
    expect(ground.grid.lineWidth).toBeGreaterThan(0);
    expect(ground.grid.strength).toBeGreaterThan(0);
    expect(ground.grid.strength).toBeLessThanOrEqual(1);
    expect(ground.grid.fadeDistance).toBeLessThan(RENDER_CONFIG.camera.far);
  });

  it('keeps the fog range inside the camera far plane', () => {
    expect(RENDER_CONFIG.sky.fogFar).toBeLessThan(RENDER_CONFIG.camera.far);
    expect(RENDER_CONFIG.sky.fogNear).toBeLessThan(RENDER_CONFIG.sky.fogFar);
  });
});
