import {
  STUDIO_CONFIG,
  SURFACE_MATERIALS,
  materialFocusPose,
  studioCameraPose,
} from '../config/studio';
import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import {
  listEnvironmentAssets,
  readAssetManifest,
  type EnvironmentAsset,
} from '../assets/AssetManifest';
import { DaylightController } from '../environment/DaylightController';
import { EnvironmentClock, type EnvironmentClockOptions } from '../environment/EnvironmentClock';
import { createMaterialLab, type MaterialLab } from './MaterialLab';
import { StudioPanel, type StudioPanelAction, type StudioPanelState } from './StudioPanel';
import { Engine } from '../core/Engine';
import { SceneManager } from '../core/SceneManager';
import type { TierResolution } from '../core/QualityTier';

/**
 * The studio look-dev application.
 *
 * A second composition root beside `Application`, and a deliberately thin one: it mounts the same
 * `Engine`, the same `SceneManager`, and the same `DaylightController` as the driving scene, and
 * supplies only what makes it a studio — the material grid as the scene's content, an orbital camera
 * looking at that grid, an environment switcher, and a panel.
 *
 * Nothing about the *rendering* differs between the two. That is the entire value of the studio: what
 * is judged here is what ships.
 */
export interface StudioApplicationOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config?: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly tier?: TierResolution;
  readonly panelRoot?: HTMLElement | null;
  readonly statusElement?: HTMLElement | null;
  readonly clock?: EnvironmentClockOptions | undefined;
  /** Manifest id of the environment to start with; defaults to the configured one. */
  readonly environmentId?: string;
  /** Skips the environment switch UI, for headless captures. */
  readonly panel?: boolean;
  /** Initial environment rotation in degrees; defaults to the configured value. */
  readonly rotationDegrees?: number;
  /** Material id to open on, framed close up. Anything else fills the grid view. */
  readonly focus?: string;
}

export interface StudioDiagnostics {
  readonly scene: 'studio';
  readonly tierId: string;
  readonly tierReason: string;
  readonly rendererBackend: string | null;
  readonly postEffects: readonly string[];
  readonly skyMode: 'procedural' | 'hdri';
  readonly environmentId: string | null;
  readonly environmentRotationDegrees: number;
  readonly timeOfDay: string;
  readonly sunElevationDegrees: number | null;
  readonly isNight: boolean;
  readonly materialIds: readonly string[];
  readonly hasScannedSurface: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly frames: number;
}

const HOUR_STEP = 0.5;
const ROTATION_STEP = 15;

/**
 * How much of the frame the control panel covers.
 *
 * Measured from the DOM rather than configured: the panel is styled in `rem`, so its share of the
 * viewport depends on the device's root font size and the window width, and a hardcoded fraction
 * would be wrong on exactly the narrow screens where it matters most. Wide panels simply take the
 * whole frame, and the camera stops trying to dodge them.
 */
function measureOccludedFraction(panelRoot: HTMLElement | null): number {
  if (panelRoot === null || panelRoot.hidden) {
    return 0;
  }
  const width = panelRoot.getBoundingClientRect().width;
  const viewport = Math.max(1, window.innerWidth);
  if (width / viewport > 0.5) {
    return 0;
  }
  return width / viewport;
}

export class StudioApplication {
  readonly #config: RenderConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #lab: MaterialLab;
  readonly #clock: EnvironmentClock;
  readonly #daylight: DaylightController;
  readonly #panel: StudioPanel | null;
  readonly #tier: TierResolution;
  readonly #environments: EnvironmentAsset[];
  #environmentIndex = 0;
  #environmentEnabled = true;
  #rotationDegrees: number;
  #unsubscribeFrame: (() => void) | null = null;
  #frameCount = 0;
  #occludedFraction = 0;
  #focusId: string | null;
  #disposed = false;

  private constructor(
    options: StudioApplicationOptions,
    environments: readonly EnvironmentAsset[],
  ) {
    this.#config = options.config ?? RENDER_CONFIG;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    this.#tier = options.tier ?? { id: 'B', reason: 'unresolved' };

    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    // One lab, two references: the scene mounts it as its content, and the application keeps the
    // handle it needs for the material count, the grid centre, and the texture load.
    const lab = createMaterialLab(
      { config: this.#config, worldConfig },
      { config: STUDIO_CONFIG, materials: SURFACE_MATERIALS },
    );
    this.#lab = lab;

    this.#focusId = options.focus ?? null;
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig,
      aspect: this.#engine.viewport.aspect,
      content: () => lab,
    });
    // The studio does not drive, so its orbit camera is the only camera.
    this.#scene.setDebugCameraEnabled(true);
    // `SceneManager` builds its camera from the *render* configuration, which is authored for a
    // driving view. The studio wants a longer lens, and every framing calculation below reads this
    // value back off the camera, so the two can never disagree about what the lens is doing.
    this.#scene.camera.fov = STUDIO_CONFIG.camera.fov;
    this.#scene.camera.updateProjectionMatrix();

    this.#clock = new EnvironmentClock(options.clock);
    this.#daylight = new DaylightController(this.#clock);
    this.#environments = [...environments];
    const requested = options.environmentId;
    const requestedIndex =
      requested === undefined
        ? -1
        : this.#environments.findIndex((asset) => asset.id === requested);
    this.#environmentIndex = requestedIndex >= 0 ? requestedIndex : 0;
    this.#rotationDegrees = options.rotationDegrees ?? this.#config.environment.rotationDegrees;
    this.#scene.setEnvironmentRotation(this.#rotationDegrees);

    this.#panel =
      options.panel === false || !options.panelRoot
        ? null
        : new StudioPanel({
            root: options.panelRoot,
            onChange: (action) => {
              void this.#handlePanelAction(action);
            },
          });
  }

  /**
   * Boots the studio: reads the manifest for the available environments, then builds the app.
   *
   * The manifest read happens first because the environment list is content, not configuration: the
   * switcher offers exactly what the pinned asset pipeline published, and nothing that it did not.
   */
  static async create(options: StudioApplicationOptions): Promise<StudioApplication> {
    let environments: readonly EnvironmentAsset[] = [];
    try {
      environments = listEnvironmentAssets(await readAssetManifest());
    } catch (error) {
      console.warn(
        'could not read the asset manifest; the studio will use the procedural sky',
        error,
      );
    }
    const application = new StudioApplication(options, environments);
    await application.init();
    return application;
  }

  /** Initialises the renderer, loads the first environment, and applies the light for the first frame. */
  private async init(): Promise<void> {
    await this.#engine.init();
    // Framing happens here rather than in the constructor because the pose depends on the viewport
    // aspect, and the canvas has not been measured until the engine has initialised. Framing early
    // silently computes a square viewport's pose, which leaves the grid two thirds too far away.
    this.#frameScene(this.#focusId);
    await this.#loadEnvironment(this.#environmentIndex, { initial: true });
    // Before the first frame, so nothing is ever drawn under a different sun than the clock reports.
    this.#daylight.update(0, this.#scene, this.#engine);
    this.#scene.focusSun(this.#lab.centre);
    this.#scene.followCamera(this.#scene.camera.position);

    // The archived PBR set is applied after the first frame is possible: a slow texture load must
    // never hold up the scene, and the material simply stays flat if it fails.
    void this.#lab.loadScannedSurface('tex-japanese-cedar-planks-1k').then((set) => {
      if (set !== null) {
        this.#publishPanelState();
      }
    });

    this.#unsubscribeFrame = this.#engine.onFrame((frame) => {
      this.#frameCount = frame.frame;
      this.#scene.update(frame.delta);
      this.#daylight.update(frame.delta, this.#scene, this.#engine);

      // Unlike the driving scene the subject never moves, so the sky dome and the shadow cascades
      // only have to follow the camera as it orbits. Both are cheap, and both are what keep the
      // shadows and the atmosphere correct when the camera flies out to the edge of the grid.
      const camera = this.#scene.camera;
      this.#scene.followCamera(camera.position);
      this.#scene.focusSun(this.#lab.centre);
      // The engine owns the loop but not the scene: rendering is the caller's job, and the studio's
      // camera is always the orbital one.
      this.#scene.setShadowCamera(camera);
      this.#engine.render(this.#scene.scene, camera);

      if (frame.frame % 30 === 0) {
        this.#publishPanelState();
      }
    });
    this.#engine.start();
    this.#publishPanelState();
  }

  /** Everything the panel shows, in one object, so the panel never reaches into the app. */
  #snapshot(): StudioPanelState {
    const scene = this.#scene.getDiagnostics();
    const state = this.#daylight.state;
    const render = this.#engine.getRenderStatistics();
    return {
      environments: this.#environments.map((asset) => ({ id: asset.id, name: asset.name })),
      environmentIndex: this.#environmentIndex,
      environmentEnabled: this.#environmentEnabled,
      environmentId: this.#environmentEnabled ? scene.environmentId : null,
      rotationDegrees: this.#rotationDegrees,
      timeLabel: this.#clock.label,
      sunElevationDegrees: state.sunElevationDegrees,
      isNight: state.isNight,
      materialCount: this.#lab.materialIds.length,
      hasScannedSurface: this.#lab.hasScannedSurface,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      tierId: this.#tier.id,
      tierReason: this.#tier.reason,
      backend: this.#engine.backend,
      postEffects: this.#engine.postEffects,
    };
  }

  #publishPanelState(): void {
    this.#panel?.update(this.#snapshot());
  }

  async #handlePanelAction(action: StudioPanelAction): Promise<void> {
    switch (action) {
      case 'hour-back':
        this.#clock.setHour(this.#clock.hour - HOUR_STEP);
        break;
      case 'hour-forward':
        this.#clock.setHour(this.#clock.hour + HOUR_STEP);
        break;
      case 'environment-next':
        await this.#loadEnvironment(
          (this.#environmentIndex + 1) % Math.max(1, this.#environments.length),
        );
        break;
      case 'environment-toggle':
        this.#environmentEnabled = !this.#environmentEnabled;
        this.#scene.setEnvironmentEnabled(this.#environmentEnabled);
        break;
      case 'rotation-back':
        this.#rotationDegrees -= ROTATION_STEP;
        this.#scene.setEnvironmentRotation(this.#rotationDegrees);
        break;
      case 'rotation-forward':
        this.#rotationDegrees += ROTATION_STEP;
        this.#scene.setEnvironmentRotation(this.#rotationDegrees);
        break;
      case 'reset-camera':
        this.#resetCamera();
        break;
      case 'toggle-panel':
        // Hiding the panel frees the left of the frame, so the grid is reframed to fill it.
        this.#panel?.setCollapsed(!(this.#panel?.isCollapsed ?? false));
        this.#frameScene(this.#focusId);
        break;
    }
    this.#daylight.update(0, this.#scene, this.#engine);
    this.#publishPanelState();
  }

  /**
   * Frames the grid: wide for the whole set, close up when a material was named at start-up.
   *
   * The panel's share of the frame is measured here rather than configured, because it is styled in
   * `rem` and depends on the root font size as well as the window width.
   */
  #frameScene(focusId: string | null = null): void {
    const panelRoot = this.#panel?.element ?? null;
    this.#occludedFraction = this.#panel?.isCollapsed ? 0 : measureOccludedFraction(panelRoot);
    const fov = this.#scene.camera.fov;
    const aspect = this.#engine.viewport.aspect;
    const index = focusId === null ? -1 : this.#lab.materialIds.indexOf(focusId);
    const pose =
      index >= 0
        ? materialFocusPose(index, fov, STUDIO_CONFIG)
        : studioCameraPose(
            this.#lab.materialIds.length,
            aspect,
            fov,
            STUDIO_CONFIG,
            this.#occludedFraction,
          );
    this.#scene.controls.target.set(...pose.target);
    this.#scene.camera.position.set(...pose.position);
    this.#scene.camera.lookAt(...pose.target);
    this.#scene.controls.update();
  }

  /** Reframes the grid. Always the grid view, even if the scene opened on a close-up. */
  #resetCamera(): void {
    this.#focusId = null;
    this.#frameScene();
  }

  async #loadEnvironment(index: number, options: { initial?: boolean } = {}): Promise<void> {
    if (this.#environments.length === 0) {
      return;
    }
    const target = this.#environments[index];
    if (target === undefined) {
      return;
    }
    const asset = await this.#scene.loadEnvironment(target.id);
    if (asset !== null || options.initial === true) {
      this.#environmentIndex = index;
    }
    this.#publishPanelState();
  }

  /** Resizes the viewport. Called from the entrypoint's resize observer. */
  resize(): void {
    const viewport = this.#engine.viewport;
    this.#scene.resize(viewport);
    this.#scene.camera.aspect = viewport.aspect;
    this.#scene.camera.updateProjectionMatrix();
    // Aspect and panel share both change with the window, so the framing is recomputed rather than
    // kept: a phone in portrait has a very different free area than the desktop window it was
    // framed on.
    this.#frameScene(this.#focusId);
  }

  getDiagnostics(): StudioDiagnostics {
    const scene = this.#scene.getDiagnostics();
    const render = this.#engine.getRenderStatistics();
    const state = this.#daylight.state;
    return {
      scene: 'studio',
      tierId: this.#tier.id,
      tierReason: this.#tier.reason,
      rendererBackend: this.#engine.backend,
      postEffects: this.#engine.postEffects,
      skyMode: scene.skyMode,
      environmentId: this.#environmentEnabled ? scene.environmentId : null,
      environmentRotationDegrees: this.#rotationDegrees,
      timeOfDay: this.#clock.label,
      sunElevationDegrees: scene.sunElevationDegrees,
      isNight: state.isNight,
      materialIds: this.#lab.materialIds,
      hasScannedSurface: this.#lab.hasScannedSurface,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      frames: scene.objectCount > 0 ? this.#frameCount : 0,
    };
  }

  /** Mirrors the driving scene's `?hdri=`/`?rot=` switches, used by the screenshot harness. */
  cycleEnvironment(): void {
    void this.#handlePanelAction('environment-next');
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#unsubscribeFrame?.();
    this.#unsubscribeFrame = null;
    this.#panel?.dispose();
    this.#engine.dispose();
    this.#scene.dispose();
  }
}
