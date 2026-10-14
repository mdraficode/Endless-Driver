import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG } from '../../src/config/render';
import { WORLD_CONFIG } from '../../src/config/world';
import { createAtmosphereSky, applySunPosition } from '../../src/shaders/atmosphere-sky';
import { createGroundGridColorNode, linearColor } from '../../src/shaders/ground-grid';

/**
 * Node-material construction checks.
 *
 * These run in Node without a GPU, which is exactly the point: a TSL graph is plain data until it is
 * built into a shader, so the scene's shading can be smoke-tested here. What this cannot check is
 * what the shader looks like — that needs a browser and a GPU (see `docs/SESSION_HANDOFF.md`).
 */
describe('shader nodes', () => {
  it('decodes hex colours into linear RGB', () => {
    const white = linearColor(0xffffff);
    expect(white.x).toBeCloseTo(1, 5);
    expect(white.y).toBeCloseTo(1, 5);
    expect(white.z).toBeCloseTo(1, 5);

    // Mid grey is roughly 0.216 in linear light once the sRGB transfer function is applied.
    const grey = linearColor(0x808080);
    expect(grey.x).toBeGreaterThan(0.2);
    expect(grey.x).toBeLessThan(0.23);
    expect(grey.x).toBeLessThan(0.5);
  });

  it('builds the ground grid as an independent node graph per material', () => {
    // A TSL graph is lazy data; what can be checked without a GPU is that it builds and that two
    // materials never share one graph instance (shared mutable nodes leak state between materials).
    const first = createGroundGridColorNode(WORLD_CONFIG.ground);
    const second = createGroundGridColorNode(WORLD_CONFIG.ground);
    expect(first.isNode).toBe(true);
    expect(second.isNode).toBe(true);
    expect(first).not.toBe(second);
  });

  it('builds a Preetham sky from the render configuration', () => {
    const sky = createAtmosphereSky(RENDER_CONFIG);
    expect(sky.isSkyMesh).toBe(true);
    expect(sky.material.isNodeMaterial).toBe(true);
    // The sky is never fogged: it is what the fog blends toward.
    expect(sky.material.fog).toBe(false);
    expect(sky.frustumCulled).toBe(false);
    expect(sky.turbidity.value).toBe(RENDER_CONFIG.atmosphere.turbidity);
    expect(sky.rayleigh.value).toBe(RENDER_CONFIG.atmosphere.rayleigh);
    expect(sky.cloudCoverage.value).toBe(RENDER_CONFIG.atmosphere.clouds.coverage);
    expect(sky.scale.x).toBe(RENDER_CONFIG.camera.far * RENDER_CONFIG.sky.domeScaleFactor);
    expect(sky.material.side).toBe(1); // BackSide
  });

  it('scales the sun direction by the configured sun distance', () => {
    const sky = createAtmosphereSky(RENDER_CONFIG);
    const [, sunY] = RENDER_CONFIG.lighting.sunPosition;
    const length = Math.hypot(...RENDER_CONFIG.lighting.sunPosition);
    expect(sky.sunPosition.value.y).toBeCloseTo(
      (sunY / length) * RENDER_CONFIG.atmosphere.sunDistance,
      3,
    );
    expect(sky.sunPosition.value.length()).toBeCloseTo(RENDER_CONFIG.atmosphere.sunDistance, 3);

    const longer = { ...RENDER_CONFIG.lighting, sunPosition: [0, 10, 0] as const };
    applySunPosition(sky, { ...RENDER_CONFIG, lighting: longer });
    expect(sky.sunPosition.value.y).toBeCloseTo(RENDER_CONFIG.atmosphere.sunDistance, 3);
    expect(sky.sunPosition.value.x).toBeCloseTo(0, 3);
  });
});
