import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COCKPIT_CAMERA_CONFIG, FALLBACK_COCKPIT_EYE_ANCHOR } from '../../src/config/camera';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { PlayerCarVisual, PLAYER_HERO_CAR_ASSET_ID } from '../../src/vehicles/PlayerCarVisual';
import {
  BRAKE_LAMP_ACTIVE_INTENSITY,
  BRAKE_LAMP_EMISSIVE_COLOR,
  BRAKE_LAMP_IDLE_INTENSITY,
  HEADLAMP_ACTIVE_EMISSIVE_INTENSITY,
} from '../../src/vehicles/vehicle-materials';
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

function createLoadedHero(includeBrakeLamps = true): LoadedModel {
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
    if (includeBrakeLamps) {
      const redLamp = new MeshStandardMaterial({ color: 0x9a1820 });
      redLamp.name = 'Glass - Red';
      const roughRedLamp = new MeshStandardMaterial({ color: 0x9a1820 });
      roughRedLamp.name = 'Glass - Red - Rough';
      const clearGlass = new MeshStandardMaterial({ color: 0x333333 });
      clearGlass.name = 'Glass - Clear';
      const tailLamps = new Group();
      tailLamps.name = `tail-lamps-lod${level.level}`;
      const redLampMesh = new Mesh(new BoxGeometry(0.2, 0.05, 0.01), redLamp);
      redLampMesh.name = `red-lamp-lod${level.level}`;
      const roughRedLampMesh = new Mesh(new BoxGeometry(0.2, 0.05, 0.01), roughRedLamp);
      roughRedLampMesh.name = `rough-red-lamp-lod${level.level}`;
      const clearGlassMesh = new Mesh(new BoxGeometry(0.2, 0.05, 0.01), clearGlass);
      clearGlassMesh.name = `clear-glass-lod${level.level}`;
      tailLamps.add(redLampMesh, roughRedLampMesh, clearGlassMesh);
      lod.add(tailLamps);
      const frontHeadlampLens = new Mesh(new BoxGeometry(0.2, 0.08, 0.02), clearGlass);
      frontHeadlampLens.name = `front-headlamp-lens-lod${level.level}`;
      frontHeadlampLens.position.set(-0.55, 0.18, -1.95);
      lod.add(frontHeadlampLens);
    }
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

function getHeroBrakeLampMaterials(model: LoadedModel): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = [];
  for (const level of [0, 1, 2]) {
    const group = model.object.getObjectByName(`tail-lamps-lod${level}`);
    if (group === undefined) throw new Error(`missing test tail lamps for LOD ${level}`);
    group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const candidates = Array.isArray(object.material) ? object.material : [object.material];
      materials.push(
        ...candidates.filter(
          (material): material is MeshStandardMaterial =>
            material instanceof MeshStandardMaterial && material.name.startsWith('Glass - Red'),
        ),
      );
    });
  }
  return materials;
}

function getFallbackHeadlampMaterial(visual: PlayerCarVisual): MeshStandardNodeMaterial {
  const fallback = visual.root.getObjectByName('kaminari-gt-roadster');
  if (fallback === undefined) throw new Error('missing authored car fallback');

  let headlampMaterial: MeshStandardMaterial | undefined;
  fallback.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const candidates = Array.isArray(object.material) ? object.material : [object.material];
    headlampMaterial = candidates.find(
      (material): material is MeshStandardNodeMaterial =>
        material instanceof MeshStandardNodeMaterial &&
        material.name === 'headlamp-emissive-no-map',
    );
  });
  if (headlampMaterial === undefined) throw new Error('missing fallback headlamp material');
  return headlampMaterial;
}

function getHeroHeadlampMaterials(model: LoadedModel): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = [];
  model.object.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const candidates = Array.isArray(object.material) ? object.material : [object.material];
    materials.push(
      ...candidates.filter(
        (material): material is MeshStandardMaterial =>
          material instanceof MeshStandardMaterial && material.name === 'player-headlamp-lens',
      ),
    );
  });
  return materials;
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
    expect(visual.cockpitEyeAnchor).toEqual(FALLBACK_COCKPIT_EYE_ANCHOR);
    expect(visual.root.children).toHaveLength(1);
    expect(visual.root.children[0]?.name).toBe('kaminari-gt-roadster');
    expect(visual.root.children[0]?.position.toArray()).toEqual([7, 2, -4]);
    expect(warning).toHaveBeenCalledOnce();

    visual.dispose();
    warning.mockRestore();
  });

  it('keeps the authored fallback when the hero asset lacks named rear-lamp materials', async () => {
    const model = createLoadedHero(false);
    loadModelAssetMock.mockResolvedValue(model);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visual = new PlayerCarVisual();

    await expect(visual.load({})).resolves.toBe(false);
    expect(visual.isHeroModelLoaded).toBe(false);
    expect(visual.root.children.map((child) => child.name)).toEqual(['kaminari-gt-roadster']);
    expect(model.dispose).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();

    visual.dispose();
    warning.mockRestore();
  });

  it('uses the selected authored roadster without downloading the other model', async () => {
    const visual = new PlayerCarVisual('kaminari-gt-roadster');
    visual.sync(POSE);

    await expect(visual.load({})).resolves.toBe(false);
    expect(visual.model).toBe('kaminari-gt-roadster');
    expect(visual.isHeroModelLoaded).toBe(false);
    expect(loadModelAssetMock).not.toHaveBeenCalled();
    expect(visual.root.children).toHaveLength(1);
    expect(visual.root.children[0]?.name).toBe('kaminari-gt-roadster');
    expect(visual.root.children[0]?.position.toArray()).toEqual([7, 2, -4]);

    visual.dispose();
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
    expect(visual.cockpitEyeAnchor).toEqual(COCKPIT_CAMERA_CONFIG.eyeAnchor);
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
      expect(
        model.object.getObjectByName(`steering-wheel-pivot-lod${level}`)?.rotation.z,
      ).toBeCloseTo(-0.42);
    }

    expect(visual.updateForCamera(new Vector3(0, 0, 10))).toBe(2);
    expect(model.updateForDistance).toHaveBeenCalledOnce();
    visual.dispose();
    expect(model.dispose).toHaveBeenCalledOnce();
  });

  it('keeps the adaptive night beams attached to the active car and lights fallback lenses', async () => {
    const model = createLoadedHero();
    loadModelAssetMock.mockResolvedValue(model);
    const visual = new PlayerCarVisual();
    visual.sync(POSE);

    const fallback = visual.root.getObjectByName('kaminari-gt-roadster');
    const rig = visual.root.getObjectByName('player-headlights');
    const aim = visual.root.getObjectByName('player-headlight-aim');
    const leftBeam = visual.root.getObjectByName('player-headlight-left');
    const headlampMaterial = getFallbackHeadlampMaterial(visual);
    expect(rig?.parent).toBe(fallback);
    expect(aim?.rotation.y).toBeCloseTo(0.11);
    expect(leftBeam?.visible).toBe(false);
    expect(headlampMaterial.emissiveIntensity).toBe(0);

    visual.setHeadlightsEnabled(true);
    expect(leftBeam?.visible).toBe(true);
    expect(headlampMaterial.emissiveIntensity).toBe(HEADLAMP_ACTIVE_EMISSIVE_INTENSITY);
    await expect(visual.load({})).resolves.toBe(true);
    expect(rig?.parent).toBe(visual.root);
    expect(leftBeam?.visible).toBe(true);
    const heroHeadlamps = getHeroHeadlampMaterials(model);
    expect(heroHeadlamps).toHaveLength(3);
    expect(
      heroHeadlamps.every(
        (material) => material.emissiveIntensity === HEADLAMP_ACTIVE_EMISSIVE_INTENSITY,
      ),
    ).toBe(true);

    visual.setHeadlightsEnabled(false);
    expect(leftBeam?.visible).toBe(false);
    expect(heroHeadlamps.every((material) => material.emissiveIntensity === 0)).toBe(true);
    visual.dispose();
  });

  it('drives the hero red-glass rear lamps from brake input across every LOD', async () => {
    const model = createLoadedHero();
    loadModelAssetMock.mockResolvedValue(model);
    const visual = new PlayerCarVisual();
    visual.sync({ ...POSE, brake: 0.7 });

    await expect(visual.load({})).resolves.toBe(true);
    const lamps = getHeroBrakeLampMaterials(model);
    expect(lamps).toHaveLength(6);
    for (const material of lamps) {
      expect(material.emissive.getHex()).toBe(BRAKE_LAMP_EMISSIVE_COLOR);
      expect(material.emissiveIntensity).toBe(BRAKE_LAMP_ACTIVE_INTENSITY);
    }

    for (const level of [0, 1, 2]) {
      const clearGlassMesh = model.object.getObjectByName(`clear-glass-lod${level}`);
      if (!(clearGlassMesh instanceof Mesh)) {
        throw new Error(`missing test clear-glass mesh for LOD ${level}`);
      }
      expect(clearGlassMesh.material).toBeInstanceOf(MeshStandardMaterial);
      if (!(clearGlassMesh.material instanceof MeshStandardMaterial)) {
        throw new Error('clear glass should retain its standard material');
      }
      expect(clearGlassMesh.material.emissive.getHex()).toBe(0x000000);
      expect(clearGlassMesh.material.emissiveIntensity).toBe(1);
    }

    visual.sync({ ...POSE, brake: 0 });
    expect(
      lamps.every((material) => material.emissiveIntensity === BRAKE_LAMP_IDLE_INTENSITY),
    ).toBe(true);
    visual.dispose();
  });
});
