import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { URBAN_CITY_CONFIG } from '../config/urban-city';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { loadLutAsset } from '../assets/LutAsset';
import { Engine } from '../core/Engine';
import { SceneManager } from '../core/SceneManager';
import type { TierResolution } from '../core/QualityTier';
import { DaylightController } from '../environment/DaylightController';
import { EnvironmentClock } from '../environment/EnvironmentClock';
import { createUrbanNightWorld } from '../world/urban-night';

const DEFAULT_CITY_HOUR = 23.5;

export interface UrbanNightApplicationOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config?: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly tier?: TierResolution;
  /** Explicit `?time=` override; the standalone city preview otherwise opens at night. */
  readonly hourOverride?: number;
}

export interface UrbanNightDiagnostics {
  readonly scene: 'city';
  readonly district: string;
  readonly tierId: string;
  readonly tierReason: string;
  readonly rendererBackend: string | null;
  readonly postEffects: readonly string[];
  readonly timeOfDay: string;
  readonly sunElevationDegrees: number | null;
  readonly isNight: boolean;
  readonly city: Readonly<Record<string, number>>;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly frames: number;
}

/**
 * Static look-dev composition for the first Phase 9 city lighting slice.
 *
 * It shares the production `Engine`, `SceneManager`, daylight controller and TSL post chain; it does
 * not load physics or claim that the city block is driveable. The dedicated route makes the night
 * effect inspectable while full-district streaming and traffic AI remain future work; local checks pass, while manual driving and owner-device review remain outstanding.
 */
export class UrbanNightApplication {
  readonly #config: RenderConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #clock: EnvironmentClock;
  readonly #daylight: DaylightController;
  readonly #tier: TierResolution;
  #unsubscribeFrame: (() => void) | null = null;
  #frameCount = 0;
  #disposed = false;

  private constructor(options: UrbanNightApplicationOptions) {
    this.#config = options.config ?? RENDER_CONFIG;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    this.#tier = options.tier ?? { id: 'B', reason: 'unresolved' };
    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig,
      aspect: this.#engine.viewport.aspect,
      content: createUrbanNightWorld,
      qualityTier: this.#tier.id,
    });
    this.#engine.setGodraysLight(this.#scene.godraysLight);
    this.#scene.setDebugCameraEnabled(true);
    this.#scene.camera.fov = URBAN_CITY_CONFIG.camera.fovDegrees;
    this.#scene.camera.position.set(...URBAN_CITY_CONFIG.camera.position);
    this.#scene.controls.target.set(...URBAN_CITY_CONFIG.camera.target);
    this.#scene.camera.lookAt(...URBAN_CITY_CONFIG.camera.target);
    this.#scene.camera.updateProjectionMatrix();
    this.#scene.controls.update();

    this.#clock = new EnvironmentClock({ startHour: options.hourOverride ?? DEFAULT_CITY_HOUR });
    this.#daylight = new DaylightController(this.#clock);
  }

  static async create(options: UrbanNightApplicationOptions): Promise<UrbanNightApplication> {
    const application = new UrbanNightApplication(options);
    await application.#init();
    return application;
  }

  async #init(): Promise<void> {
    await this.#engine.init();
    await this.#scene.loadEnvironment();
    await this.#loadLook();
    // Resolve the clock before the first frame so the city lights never start in a daylight state.
    this.#daylight.update(0, this.#scene, this.#engine);
    this.#scene.followCamera(this.#scene.camera.position);
    this.#scene.focusSun({
      x: this.#scene.camera.position.x,
      y: 0,
      z: this.#scene.camera.position.z,
    });

    this.#unsubscribeFrame = this.#engine.onFrame((frame) => {
      this.#frameCount = frame.frame;
      this.#scene.update(frame.delta);
      this.#daylight.update(frame.delta, this.#scene, this.#engine);

      const camera = this.#scene.camera;
      this.#scene.followCamera(camera.position);
      this.#scene.focusSun({ x: camera.position.x, y: 0, z: camera.position.z });
      this.#scene.setShadowCamera(camera);
      const target = this.#scene.controls.target;
      this.#engine.focusOn(
        Math.hypot(
          camera.position.x - target.x,
          camera.position.y - target.y,
          camera.position.z - target.z,
        ),
      );
      this.#engine.render(this.#scene.scene, camera);
    });
    this.#engine.start();
  }

  async #loadLook(): Promise<void> {
    if (!this.#config.postProcessing.lut.enabled) {
      return;
    }
    try {
      const requestedId = this.#config.postProcessing.lut.assetId;
      const asset = await loadLutAsset({
        ...(requestedId === null ? {} : { assetId: requestedId }),
        expectedSize: this.#config.postProcessing.lut.size,
      });
      if (asset === null) {
        return;
      }
      this.#engine.applyLookTable(asset);
      this.#engine.setLookIntensity(this.#config.postProcessing.lut.intensity);
      console.info(`Aohara city preview: colour look "${asset.name}" (${asset.licence})`);
    } catch (error) {
      console.warn(
        'Aohara city preview: colour look could not be applied; rendering ungraded.',
        error,
      );
    }
  }

  resize(): void {
    const viewport = this.#engine.viewport;
    this.#scene.resize(viewport);
    this.#scene.camera.aspect = viewport.aspect;
    this.#scene.camera.updateProjectionMatrix();
  }

  getDiagnostics(): UrbanNightDiagnostics {
    const scene = this.#scene.getDiagnostics();
    const render = this.#engine.getRenderStatistics();
    const daylight = this.#daylight.state;
    return {
      scene: 'city',
      district: URBAN_CITY_CONFIG.districtName,
      tierId: this.#tier.id,
      tierReason: this.#tier.reason,
      rendererBackend: this.#engine.backend,
      postEffects: this.#engine.postEffects,
      timeOfDay: this.#clock.label,
      sunElevationDegrees: daylight.sunElevationDegrees,
      isNight: daylight.isNight,
      city: scene.contentStats,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      frames: this.#frameCount,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#unsubscribeFrame?.();
    this.#scene.dispose();
    this.#engine.dispose();
  }
}
