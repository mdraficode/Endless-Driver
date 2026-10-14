import { DirectionalLight, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

/**
 * Pins the `CSMShadowNode` lifecycle that `SceneManager.setShadowCamera` guards against.
 *
 * The first version of the cascade integration assigned `camera` and called `updateFrustums()` at
 * start-up, before any frame had rendered. On a real GPU-backed browser that failed with
 * `Cannot read properties of null (reading 'setFromProjectionMatrix')` and the whole scene refused
 * to start. The two behaviours below are why the guard exists; if a future three.js release makes
 * either one safe, the guard can be relaxed, and this test is where that will show up.
 */
describe('CSMShadowNode lifecycle contract', () => {
  it('has no frustum until its first setup pass creates one', () => {
    const csm = new CSMShadowNode(new DirectionalLight(), { cascades: 3 });
    expect(csm.mainFrustum).toBeNull();
    expect(csm.camera).toBeNull();
  });

  it('throws if asked to rebuild cascades before that setup pass', () => {
    const csm = new CSMShadowNode(new DirectionalLight(), { cascades: 3 });
    expect(() => csm.updateFrustums()).toThrow();
  });

  it('would skip initialisation entirely if a camera were pre-assigned', () => {
    // `setup()` runs `_init()` only while `camera` is null, so pre-assigning a camera does not just
    // risk a crash — it prevents the cascades from ever being built. This is the subtler half of
    // the bug: the scene would have rendered with no shadows at all rather than failing loudly.
    const csm = new CSMShadowNode(new DirectionalLight(), { cascades: 3 });
    csm.camera = new PerspectiveCamera(60, 1, 0.1, 2000);
    expect(csm.mainFrustum).toBeNull();
    expect(() => csm.updateFrustums()).toThrow();
  });
});
