import { Group, Object3D, Vector3 } from 'three';
import { loadModelAsset, type LoadedModel } from '../assets/ModelAsset';
import { VEHICLE_CONFIG } from '../config/vehicle';
import { CarVisual } from './CarVisual';
import {
  advanceVehicleImpact,
  createVehicleImpactState,
  triggerVehicleImpact,
} from './VehicleImpact';
import { WHEEL_INDEX, type VehiclePose } from './types';

export const PLAYER_HERO_CAR_ASSET_ID = 'hero-car-mmc-generic-sport-coupe';

const WHEEL_BINDINGS = [
  { key: 'front-left', index: WHEEL_INDEX.frontLeft, side: -1, axle: 'front' },
  { key: 'front-right', index: WHEEL_INDEX.frontRight, side: 1, axle: 'front' },
  { key: 'rear-left', index: WHEEL_INDEX.rearLeft, side: -1, axle: 'rear' },
  { key: 'rear-right', index: WHEEL_INDEX.rearRight, side: 1, axle: 'rear' },
] as const;

interface WheelNodes {
  readonly pivot: Object3D;
  readonly spinner: Object3D;
}

interface ModelLodNodes {
  readonly level: number;
  readonly wheels: readonly WheelNodes[];
  readonly steeringWheel: Object3D;
}

/**
 * Player presentation with a deterministic authored fallback and a manifest-driven hero model.
 *
 * The detailed render mesh never enters physics. The car's chassis and suspension remain the
 * existing simple Rapier shapes; only this visual tree is replaced after the compressed GLB loads.
 */
export class PlayerCarVisual {
  readonly root = new Group();
  readonly #fallback = new CarVisual();
  readonly #impact = createVehicleImpactState();
  #loaded: LoadedModel | null = null;
  #lodNodes: readonly ModelLodNodes[] = [];
  #lastPose: VehiclePose | null = null;
  #loadAttempted = false;
  #fallbackDisposed = false;
  #disposed = false;

  constructor() {
    this.root.name = 'player-car-visual';
    this.root.add(this.#fallback.root);
  }

  get isHeroModelLoaded(): boolean {
    return this.#loaded !== null;
  }

  /**
   * Loads and validates the manifest model after the renderer is ready. Every failure is fail-soft:
   * the authored roadster stays visible, and no unverified or partially bound model replaces it.
   */
  async load(renderer: object): Promise<boolean> {
    if (this.#loaded !== null) return true;
    if (this.#loadAttempted) return false;
    this.#loadAttempted = true;

    let model: LoadedModel | null = null;
    try {
      model = await loadModelAsset({ renderer, assetId: PLAYER_HERO_CAR_ASSET_ID });
      if (model === null) return false;
      if (this.#disposed) {
        model.dispose();
        return false;
      }
      const lodNodes = resolveLodNodes(model);
      this.root.add(model.object);
      this.#loaded = model;
      this.#lodNodes = lodNodes;
      if (this.#lastPose !== null) this.sync(this.#lastPose);
      this.root.remove(this.#fallback.root);
      this.#fallback.dispose();
      this.#fallbackDisposed = true;
      console.info(
        `Endless Driver: hero vehicle from "${model.asset.name}" (${model.asset.licence}, ${model.asset.creator})`,
      );
      return true;
    } catch (error) {
      if (model !== null) {
        this.root.remove(model.object);
        if (this.#loaded === model) {
          this.#loaded = null;
          this.#lodNodes = [];
        }
        model.dispose();
      }
      console.warn(
        'Endless Driver: hero model could not be loaded; keeping the authored fallback.',
        error,
      );
      return false;
    }
  }

  /** Applies the authoritative physics pose and updates every LOD's four wheel/steering pivots. */
  sync(pose: VehiclePose): void {
    this.#lastPose = pose;
    const model = this.#loaded;
    if (model === null) {
      this.#fallback.sync(pose);
      return;
    }

    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);

    const frontStates = pose.wheels.filter((wheel) => wheel.isFront);
    const steeringRotation =
      frontStates.length > 0
        ? -(
            frontStates.reduce((total, wheel) => total + wheel.steerAngle, 0) / frontStates.length
          ) * 2.1
        : 0;
    for (const lod of this.#lodNodes) {
      for (const [index, binding] of WHEEL_BINDINGS.entries()) {
        const nodes = lod.wheels[index];
        const state = pose.wheels[binding.index];
        if (!nodes || !state) continue;
        nodes.pivot.position.set(
          binding.side * VEHICLE_CONFIG.wheels.halfTrack,
          VEHICLE_CONFIG.wheels.anchorY - state.suspensionLength,
          binding.axle === 'front' ? VEHICLE_CONFIG.wheels.frontZ : VEHICLE_CONFIG.wheels.rearZ,
        );
        nodes.pivot.rotation.set(0, state.steerAngle, 0);
        nodes.spinner.rotation.set(state.spinAngle, 0, 0);
      }
      lod.steeringWheel.rotation.z = steeringRotation;
    }
  }

  /** Adds a brief physical-impact shudder to the chassis presentation; the mesh is never deformed. */
  triggerImpact(relativeSpeedMetersPerSecond: number, side = 0): void {
    triggerVehicleImpact(this.#impact, relativeSpeedMetersPerSecond, side);
  }

  /** Applies the transient impact pose after the authoritative physics pose is synchronized. */
  updateImpact(deltaSeconds: number): void {
    const impact = advanceVehicleImpact(this.#impact, deltaSeconds);
    const chassis = this.#loaded === null ? this.#fallback.root : this.root;
    chassis.position.y += impact.bounceMeters;
    chassis.rotation.x += impact.pitchRadians;
    chassis.rotation.z += impact.rollRadians;
  }

  resetImpact(): void {
    this.#impact.intensity = 0;
    this.#impact.ageSeconds = 1;
    this.#impact.side = 0;
  }

  /** Selects the model LOD from its distance to the currently active camera. */
  updateForCamera(cameraPosition: Vector3): number | null {
    const model = this.#loaded;
    if (model === null) return null;
    this.root.updateMatrixWorld(true);
    const worldCentre = model.object.localToWorld(model.centre.clone());
    return model.updateForDistance(cameraPosition.distanceTo(worldCentre));
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#loaded !== null) {
      this.#loaded.dispose();
      this.#loaded = null;
    }
    if (!this.#fallbackDisposed) {
      this.#fallback.dispose();
      this.#fallbackDisposed = true;
    }
    this.#lodNodes = [];
    this.root.clear();
  }
}

function resolveLodNodes(model: LoadedModel): readonly ModelLodNodes[] {
  const lodNodes: ModelLodNodes[] = [];
  for (const level of model.asset.levels) {
    const lodRoot = model.object.getObjectByName(level.node);
    if (lodRoot === undefined) throw new Error(`hero model is missing LOD root "${level.node}"`);

    const wheels = WHEEL_BINDINGS.map((binding) => {
      const pivotName = `wheel-${binding.key}-lod${level.level}`;
      const spinnerName = `wheel-spinner-${binding.key}-lod${level.level}`;
      const pivot = lodRoot.getObjectByName(pivotName);
      const spinner = lodRoot.getObjectByName(spinnerName);
      if (pivot === undefined || spinner === undefined || spinner.parent !== pivot) {
        throw new Error(`hero model is missing the ${binding.key} pivot/spinner in ${level.node}`);
      }
      if (pivot.children.some((child) => child.type === 'Mesh')) {
        throw new Error(`${pivotName} must remain an empty steering pivot`);
      }

      const expected = [
        binding.side * VEHICLE_CONFIG.wheels.halfTrack,
        VEHICLE_CONFIG.wheels.anchorY - VEHICLE_CONFIG.wheels.restLength,
        binding.axle === 'front' ? VEHICLE_CONFIG.wheels.frontZ : VEHICLE_CONFIG.wheels.rearZ,
      ];
      const actual = pivot.position.toArray();
      if (actual.some((value, index) => Math.abs(value - expected[index]!) > 0.012)) {
        throw new Error(`${pivotName} does not match the configured wheel centre`);
      }
      return { pivot, spinner };
    });

    const steeringName = `steering-wheel-pivot-lod${level.level}`;
    const steeringWheel = lodRoot.getObjectByName(steeringName);
    if (steeringWheel === undefined) throw new Error(`hero model is missing ${steeringName}`);
    lodNodes.push({ level: level.level, wheels, steeringWheel });
  }
  if (lodNodes.length === 0) throw new Error('hero model contains no usable LOD hierarchy');
  return lodNodes;
}
