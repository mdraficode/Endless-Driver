import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { PlayerCarVisual, PLAYER_HERO_CAR_ASSET_ID } from '../../src/vehicles/PlayerCarVisual';
import { WHEEL_INDEX, type VehiclePose } from '../../src/vehicles/types';
import type { LoadedModel } from '../../src/assets/ModelAsset';

const { loadModelAssetMock } = vi.hoisted(() => ({ loadModelAssetMock: vi.fn() }));
vi.mock('../../src/assets/ModelAsset', () => ({ loadModelAsset: loadModelAssetMock }));

const WHEELS = [
  { key: 'front-left', index: WHEEL_INDEX.frontLeft, side: -1, axle: 'front' },
  { key: 'front-right', index: WHEEL_INDEX.frontRight, side: 1, axle: 'front' },
  { key: 'rear-left', index: WHEEL_INDEX.rearLeft, side: -1, axle: 'rear' },
  { key: 'rear-right', index: WHEEL_INDEX.rearRight, side: 1, axle: 'rear' },
] as const;

const POSE: VehiclePose = {
  position: { x: 7, y: 2, z: -4 },
  rotation: { x: 0, y: 0.2, z: 0, w: 0.98 },
  wheels: [
    { isFront: true, steerAngle: 0.2, spinAngle: 1.1, suspensionLength: 0.3 },
    { isFront: true, steerAngle: 0.2, spinAngle: 1.2, suspensionLength: 0.32 },
    { isFront: false, steerAngle: 0, spinAngle: 2.1, suspensionLength: 0.35 },
    { isFront: false, steerAngle: 0, spinAngle: 2.2, suspensionLength: 0.36 },
  ],
  brake: 0,
};

function createLoadedHero(): LoadedModel {
  const object = new Group();
  const levels = [0, 1, 2].map((level) => ({
    level,
    node: `lod${level}`,
    triangles: [9000, 4000, 1000][level] ?? 0,
    seamMerged: false,
  }));

  for (const level of levels) {
    const lod = new Group();
    lod.name = level.node;
    object.add(lod);
    for (const wheel of WHEELS) {
      const pivot = new Group();
      pivot.name = `wheel-${wheel.key}-lod${level.level}`;
      pivot.position.set(
        wheel.side * VEHICLE_CONFIG.wheels.halfTrack,
        VEHICLE_CONFIG.wheels.anchorY - VEHICLE_CONFIG.wheels.restLength,
        wheel.axle === 'front' ? VEHICLE_CONFIG.wheels.frontZ : VEHICLE_CONFIG.wheels.rearZ,
      );
      const spinner = new Group();
      spinner.name = `wheel-spinner-${wheel.key}-lod${level.level}`;
      spinner.add(new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial()));
      pivot.add(spinner);
      lod.add(pivot);
    }
    const steering = new Group();
    steering.name = `steering-wheel-pivot-lod${level.level}`;
    lod.add(steering);
  }

  return {
    asset: {
      id: PLAYER_HERO_CAR_ASSET_ID,
      name: 'Test hero car',
      licence: 'CC-BY-4.0',
      creator: 'Test creator',
      sourceUrl: 'https://example.org/car',
      file: 'assets/models/test.glb',
      bytes: 100,
      levels,
    },
    object,
    centre: new Vector3(),
    radius: 2,
    bottom: -1,
    height: 2,
    activeLevel: 0,
    setLevel: vi.fn(),
    updateForDistance: vi.fn(() => 2),
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  loadModelAssetMock.mockReset();
});

describe('PlayerCarVisual', () => {
  it('keeps the authored fallback visible when loading fails', async () => {
    loadModelAssetMock.mockRejectedValue(new Error('offline'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visual = new PlayerCarVisual();
    visual.sync(POSE);

    await expect(visual.load({})).resolves.toBe(false);
    expect(visual.isHeroModelLoaded).toBe(false);
    expect(visual.root.children).toHaveLength(1);
    expect(visual.root.children[0]?.name).toBe('kaminari-gt-roadster');
    expect(visual.root.children[0]?.position.toArray()).toEqual([7, 2, -4]);
    expect(warning).toHaveBeenCalledOnce();

    visual.dispose();
    warning.mockRestore();
  });

  it('swaps to the GLB, syncs every LOD pivot, and selects distance LODs', async () => {
    const model = createLoadedHero();
    loadModelAssetMock.mockResolvedValue(model);
    const visual = new PlayerCarVisual();
    visual.sync(POSE);

    await expect(visual.load({})).resolves.toBe(true);
    expect(loadModelAssetMock).toHaveBeenCalledWith({
      renderer: expect.any(Object),
      assetId: PLAYER_HERO_CAR_ASSET_ID,
    });
    expect(visual.isHeroModelLoaded).toBe(true);
    expect(visual.root.children).toContain(model.object);
    expect(visual.root.children.some((child) => child.name === 'kaminari-gt-roadster')).toBe(false);

    for (const level of [0, 1, 2]) {
      for (const wheel of WHEELS) {
        const pivot = model.object.getObjectByName(`wheel-${wheel.key}-lod${level}`);
        const spinner = model.object.getObjectByName(`wheel-spinner-${wheel.key}-lod${level}`);
        const state = POSE.wheels[wheel.index]!;
        expect(pivot?.position.x).toBe(wheel.side * VEHICLE_CONFIG.wheels.halfTrack);
        expect(pivot?.position.y).toBe(VEHICLE_CONFIG.wheels.anchorY - state.suspensionLength);
        expect(pivot?.position.z).toBe(
          wheel.axle === 'front' ? VEHICLE_CONFIG.wheels.frontZ : VEHICLE_CONFIG.wheels.rearZ,
        );
        expect(pivot?.rotation.y).toBe(state.steerAngle);
        expect(spinner?.rotation.x).toBe(state.spinAngle);
      }
      expect(model.object.getObjectByName(`steering-wheel-pivot-lod${level}`)?.rotation.z).toBeCloseTo(-0.42);
    }

    expect(visual.updateForCamera(new Vector3(0, 0, 10))).toBe(2);
    expect(model.updateForDistance).toHaveBeenCalledOnce();
    visual.dispose();
    expect(model.dispose).toHaveBeenCalledOnce();
  });
});
