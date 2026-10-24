import { SpotLight, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createPlayerHeadlightRig,
  PLAYER_HEADLIGHT_CONFIG,
  setAdaptiveHeadlightSteering,
  setPlayerHeadlightsEnabled,
} from '../../src/vehicles/player-headlights';

describe('player night headlights', () => {
  it('builds two warm, soft-edged, non-shadowing spotlights that converge down the road', () => {
    const rig = createPlayerHeadlightRig();

    expect(rig.lights).toHaveLength(2);
    expect(rig.lights.every((light) => light instanceof SpotLight)).toBe(true);
    expect(rig.lights.map((light) => light.name)).toEqual([
      'player-headlight-left',
      'player-headlight-right',
    ]);
    for (const light of rig.lights) {
      expect(light.color.getHex()).toBe(PLAYER_HEADLIGHT_CONFIG.colorHex);
      expect(light.intensity).toBe(PLAYER_HEADLIGHT_CONFIG.intensityCandela);
      expect(light.distance).toBe(PLAYER_HEADLIGHT_CONFIG.rangeMeters);
      expect(light.angle).toBe(PLAYER_HEADLIGHT_CONFIG.beamHalfAngleRadians);
      expect(light.penumbra).toBe(PLAYER_HEADLIGHT_CONFIG.penumbra);
      expect(light.decay).toBe(2);
      expect(light.castShadow).toBe(false);
      expect(light.visible).toBe(false);
      expect(light.parent).toBe(rig.aim);
      expect(light.target.parent).toBe(rig.aim);
      expect(light.target.position.y).toBeLessThan(light.position.y);
      expect(light.target.position.z).toBeLessThan(light.position.z);
    }

    rig.root.position.set(12, 1, -8);
    rig.root.rotation.y = Math.PI / 2;
    rig.root.updateMatrixWorld(true);
    const worldPosition = rig.lights[0].getWorldPosition(new Vector3());
    const worldTarget = rig.lights[0].target.getWorldPosition(new Vector3());
    expect(worldTarget.x).toBeLessThan(worldPosition.x);

    rig.root.clear();
  });

  it('follows front-wheel steering gently and clamps the adaptive turn angle', () => {
    const rig = createPlayerHeadlightRig();

    setAdaptiveHeadlightSteering(rig, 0.1);
    expect(rig.aim.rotation.y).toBeCloseTo(0.055);

    setAdaptiveHeadlightSteering(rig, 20);
    expect(rig.aim.rotation.y).toBe(PLAYER_HEADLIGHT_CONFIG.maxSteeringAngleRadians);

    setAdaptiveHeadlightSteering(rig, -20);
    expect(rig.aim.rotation.y).toBe(-PLAYER_HEADLIGHT_CONFIG.maxSteeringAngleRadians);

    setAdaptiveHeadlightSteering(rig, Number.NaN);
    expect(rig.aim.rotation.y).toBe(0);

    rig.root.clear();
  });

  it('enables both beams for the resolved night state and hides them by day', () => {
    const rig = createPlayerHeadlightRig();

    setPlayerHeadlightsEnabled(rig, false);
    expect(rig.lights.every((light) => !light.visible)).toBe(true);

    setPlayerHeadlightsEnabled(rig, true);
    expect(rig.lights.every((light) => light.visible)).toBe(true);

    setPlayerHeadlightsEnabled(rig, false);
    expect(rig.lights.every((light) => !light.visible)).toBe(true);

    rig.root.clear();
  });
});
