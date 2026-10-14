import {
  PROPS_CONFIG,
  lineupCameraPose,
  lineupCentre,
  lineupFocusPose,
  type PropsConfig,
} from '../config/props';
import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { createLoadedPropLab, createPropLab, type PropLab } from './PropLab';
import { PropPanel, type PropPanelAction } from './PropPanel';
import { DaylightController } from '../environment/DaylightController';
import { EnvironmentClock, type EnvironmentClockOptions } from '../environment/EnvironmentClock';
import { Engine } from '../core/Engine';
import { SceneManager } from '../core/SceneManager';
import type { TierResolution } from '../core/QualityTier';
import type { LodLevel } from '../assets/LodSelection';

/**
 * The prop inspection application (`?scene=props`).
 *
 * The third composition root, and the thinnest of the three: it mounts the same engine, scene manager,
 * lighting, and post chain as the driving scene and the studio, and supplies only what makes it a prop
 * inspector — the loaded model as the scene's content, an orbital camera framed on the lineup, the
 * clock, and a panel that reads out what the derivation pipeline produced.
 *
 * The feature worth pointing at is **automatic mode**. It is the level-of-detail rule the streamed
 * world will run: one instance, a distance, and a choice of level. Rather than describe it in a
 * document, this scene flies the camera through the switch distances while the panel shows which level
 * is showing and how many triangles that costs, so the rule can be watched rather than trusted.
 */
export interface PropLabApplicationOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config?: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly propsConfig?: PropsConfig;
  readonly tier?: TierResolution;
  readonly panelRoot?: HTMLElement | null;
  readonly clock?: EnvironmentClockOptions | undefined;
  /** Manifest id of the model to inspect; the first model when omitted. */
  readonly assetId?: string;
  /** Skips the panel, for headless captures. */
  readonly panel?: boolean;
}

export interface PropLabDiagnostics {
  readonly scene: 'props';
  readonly modelId: string | null;
  readonly modelName: string | null;
  readonly modelRadius: number | null;
  readonly modelBytes: number | null;
  readonly levels: readonly LodLevel[];
  readonly mode: 'lineup' | 'isolated' | 'auto';
  readonly activeLevel: number | null;
  readonly cameraDistance: number | null;
  readonly tierId: string;
  readonly tierReason: string;
  readonly rendererBackend: string | null;
  readonly postEffects: readonly string[];
  readonly timeOfDay: string;
  readonly sunElevationDegrees: number | null;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly frames: number;
  /** Set when the model could not be loaded, so an empty scene is explainable. */
  readonly error: string | null;
}

const HOUR_STEP = 0.5;
/** Radians per second the camera orbits in automatic mode. Slow enough to read, fast enough to watch. */
const AUTO_ORBIT_RATE = 0.055;
/** Seconds between panel updates while the camera moves in automatic mode. */
const PANEL_INTERVAL_FRAMES = 15;

export class PropLabApplication {
  readonly #config: RenderConfig;
  readonly #propsConfig: PropsConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #clock: EnvironmentClock;
  readonly #daylight: DaylightController;
  readonly #panel: PropPanel | null;
  readonly #tier: TierResolution;
  #lab: PropLab | null = null;
  #unsubscribeFrame: (() => void) | null = null;
  #frameCount = 0;
  #occludedFraction = 0;
  #focusLevel: number | null = null;
  #autoAngle = 0;
  #error: string | null = null;
  #loading = false;
  #disposed = false;

  private constructor(options: PropLabApplicationOptions) {
    this.#config = options.config ?? RENDER_CONFIG;
    this.#propsConfig = options.propsConfig ?? PROPS_CONFIG;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    this.#tier = options.tier ?? { id: 'B', reason: 'unresolved' };

    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });

    // The content is supplied as a factory because `SceneManager` builds it during construction, and
    // the model is not loaded yet at that point. The factory hands over an empty lab; the real one is
    // swapped in when the file arrives. That keeps the loading asynchronous without making the whole
    // application asynchronous to construct.
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig,
      aspect: this.#engine.viewport.aspect,
      content: (context) => {
        const lab = createPropLab(context);
        this.#lab = lab;
        return lab;
      },
    });
    this.#scene.setDebugCameraEnabled(true);
    this.#scene.camera.fov = this.#propsConfig.camera.fov;
    this.#scene.camera.updateProjectionMatrix();

    this.#clock = new EnvironmentClock(options.clock);
    this.#daylight = new DaylightController(this.#clock);

    this.#panel =
      options.panel === false || !options.panelRoot
        ? null
        : new PropPanel({
            root: options.panelRoot,
            onChange: (action) => {
              void this.#handlePanelAction(action);
            },
          });
  }

  static async create(options: PropLabApplicationOptions): Promise<PropLabApplication> {
    const application = new PropLabApplication(options);
    await application.init(options);
    return application;
  }

  private async init(options: PropLabApplicationOptions): Promise<void> {
    await this.#engine.init();
    this.#frameScene();
    this.#daylight.update(0, this.#scene, this.#engine);
    this.#scene.followCamera(this.#scene.camera.position);
    this.#scene.focusSun({ x: 0, y: 0, z: 0 });

    this.#unsubscribeFrame = this.#engine.onFrame((frame) => {
      this.#frameCount = frame.frame;
      this.#scene.update(frame.delta);
      this.#daylight.update(frame.delta, this.#scene, this.#engine);

      const camera = this.#scene.camera;
      if (this.#lab?.mode === 'auto') {
        this.#advanceAuto(frame.delta);
      }
      // The floor and the wall are sized from the frame, so they follow the camera rather than being
      // placed once: automatic mode orbits through 26 radii, and a surface placed for one distance
      // shows its edge at every other one.
      this.#lab?.followCamera(camera, this.#scene.controls.target);
      this.#scene.followCamera(camera.position);
      this.#scene.focusSun({ x: 0, y: 0, z: 0 });
      this.#scene.setShadowCamera(camera);
      this.#engine.render(this.#scene.scene, camera);

      if (frame.frame % PANEL_INTERVAL_FRAMES === 0) {
        this.#publishPanelState();
      }
    });
    this.#engine.start();
    this.#publishPanelState();

    // Loading starts after the first frame is on screen: a model that takes a second to decode must
    // never hold up the renderer, and the floor and backdrop are worth looking at while it arrives.
    await this.#loadModel(options.assetId);
  }

  /** Loads the model and swaps the loaded lab in place of the placeholder. */
  async #loadModel(assetId: string | undefined): Promise<void> {
    if (this.#loading || this.#disposed) {
      return;
    }
    this.#loading = true;
    try {
      const lab = await createLoadedPropLab(
        { config: this.#config, worldConfig: WORLD_CONFIG },
        {
          renderer: this.#engine.renderer,
          ...(assetId === undefined ? {} : { assetId }),
        },
      );
      if (this.#disposed) {
        lab.dispose();
        return;
      }
      const previous = this.#lab;
      this.#lab = lab;
      this.#scene.setContent(lab);
      previous?.dispose();
      this.#frameScene();
      // An id that is not in the manifest and a manifest with nothing in it are different failures —
      // one is a typo in the URL, the other is a broken build — and a single message for both sends
      // the reader looking in the wrong place.
      this.#error =
        lab.asset === null
          ? assetId === undefined
            ? 'the manifest published no model to inspect'
            : `the manifest has no model named “${assetId}”`
          : null;
    } catch (error) {
      // A model that fails to load must not take the scene down with it: the floor, the backdrop and
      // the clock still render, and the panel says what went wrong.
      this.#error = error instanceof Error ? error.message : String(error);
      console.error('prop inspector: the model failed to load', error);
    } finally {
      this.#loading = false;
      this.#publishPanelState();
    }
  }

  /**
   * Moves the camera around the model in automatic mode.
   *
   * The orbit is what makes the rule observable: the camera sweeps in and out through the two switch
   * distances, and the panel shows which level that distance selected. The level itself comes from the
   * lab, so what is on screen is the same code path the world will use rather than a re-implementation
   * of it for the demo.
   */
  #advanceAuto(deltaSeconds: number): void {
    const lab = this.#lab;
    if (lab === null) {
      return;
    }
    this.#autoAngle += deltaSeconds * AUTO_ORBIT_RATE;
    const radius = lab.size.radius;
    const near = radius * 4;
    const far = radius * this.#propsConfig.autoOrbitRadii;
    // A slow breathing orbit between the near and far extremes, so every switch distance is crossed.
    const breath = (Math.sin(this.#autoAngle) + 1) / 2;
    const distance = near + (far - near) * breath;
    const target = lineupCentre(lab.size);
    const angle = this.#autoAngle * 1.7;
    this.#scene.controls.target.set(target.x, target.y, target.z);
    this.#scene.camera.position.set(
      target.x + Math.sin(angle) * distance,
      target.y + radius * 0.6 + Math.sin(this.#autoAngle * 0.5) * radius * 0.3,
      target.z + Math.cos(angle) * distance,
    );
    this.#scene.camera.lookAt(target.x, target.y, target.z);
    this.#scene.controls.update();

    const cameraDistance = this.#scene.camera.position.distanceTo(this.#scene.controls.target);
    lab.updateAuto(cameraDistance);
  }

  /** Frames the lineup, or the isolated level when one is selected. */
  #frameScene(): void {
    const lab = this.#lab;
    if (lab === null || lab.copies.length === 0) {
      return;
    }
    const panelRoot = this.#panel?.element ?? null;
    this.#occludedFraction = this.#panel?.isCollapsed === true ? 0 : measurePanel(panelRoot);
    const fov = this.#scene.camera.fov;

    if (this.#focusLevel === null) {
      const pose = lineupCameraPose(
        lab.copies.length,
        lab.size,
        this.#engine.viewport.aspect,
        fov,
        this.#propsConfig,
        this.#occludedFraction,
      );
      this.#scene.controls.target.set(...pose.target);
      this.#scene.camera.position.set(...pose.position);
      this.#scene.camera.lookAt(...pose.target);
    } else {
      const copy = lab.copies.find((candidate) => candidate.level.level === this.#focusLevel);
      const pose = lineupFocusPose(copy?.offset ?? 0, lab.size, fov);
      this.#scene.controls.target.set(...pose.target);
      this.#scene.camera.position.set(...pose.position);
      this.#scene.camera.lookAt(...pose.target);
    }
    this.#scene.controls.update();
    // The floor and the wall are sized from the frame, so reframing the camera has to resize them in
    // the same breath: for one frame after a level change they would otherwise describe the previous
    // shot, and the camera would be looking past the wall's edge at the sky.
    lab.followCamera(this.#scene.camera, this.#scene.controls.target);
  }

  async #handlePanelAction(action: PropPanelAction): Promise<void> {
    const lab = this.#lab;
    switch (action) {
      case 'show-lineup':
        lab?.setIsolatedLevel(null);
        this.#focusLevel = null;
        this.#autoAngle = 0;
        this.#frameScene();
        break;
      case 'level-0':
      case 'level-1':
      case 'level-2': {
        const level = Number(action.slice('level-'.length));
        const available = lab?.copies.some((copy) => copy.level.level === level) ?? false;
        if (available) {
          lab?.setIsolatedLevel(level);
          this.#focusLevel = level;
          this.#autoAngle = 0;
          this.#frameScene();
        }
        break;
      }
      case 'level-next': {
        const copies = lab?.copies ?? [];
        if (copies.length > 0) {
          const current = this.#focusLevel ?? -1;
          const index = copies.findIndex((copy) => copy.level.level === current);
          const next = copies[(index + 1) % copies.length];
          if (next) {
            lab?.setIsolatedLevel(next.level.level);
            this.#focusLevel = next.level.level;
            this.#autoAngle = 0;
            this.#frameScene();
          }
        }
        break;
      }
      case 'auto-toggle': {
        const enable = lab?.mode !== 'auto';
        lab?.setAuto(enable);
        this.#focusLevel = null;
        this.#autoAngle = 0;
        if (!enable) {
          this.#frameScene();
        }
        break;
      }
      case 'hour-back':
        this.#clock.setHour(this.#clock.hour - HOUR_STEP);
        break;
      case 'hour-forward':
        this.#clock.setHour(this.#clock.hour + HOUR_STEP);
        break;
      case 'reset-camera':
        lab?.setIsolatedLevel(null);
        this.#focusLevel = null;
        this.#autoAngle = 0;
        this.#frameScene();
        break;
      case 'toggle-panel':
        this.#panel?.setCollapsed(!(this.#panel?.isCollapsed ?? false));
        this.#frameScene();
        break;
    }
    this.#daylight.update(0, this.#scene, this.#engine);
    this.#publishPanelState();
  }

  #publishPanelState(): void {
    if (this.#panel === null) {
      return;
    }
    const lab = this.#lab;
    const render = this.#engine.getRenderStatistics();
    const state = this.#daylight.state;
    const camera = this.#scene.camera;
    this.#panel.update({
      modelName: lab?.asset?.name ?? 'No model loaded',
      modelId: lab?.asset?.id ?? '',
      licence: lab?.asset?.licence ?? '',
      creator: lab?.asset?.creator ?? '',
      bytes: lab?.asset?.bytes ?? 0,
      radius: lab?.size.radius ?? 0,
      levels: (lab?.asset?.levels ?? []).map((level) => ({
        level: level.level,
        node: level.node,
        triangles: level.triangles,
        seamMerged: level.seamMerged,
      })),
      autoLevel: lab?.autoLevel?.level ?? null,
      isolatedLevel: this.#focusLevel,
      mode: lab?.mode ?? 'lineup',
      cameraDistance: camera.position.distanceTo(this.#scene.controls.target),
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      timeLabel: this.#clock.label,
      sunElevationDegrees: state.sunElevationDegrees,
      tierId: this.#tier.id,
      backend: this.#engine.backend,
      postEffects: this.#engine.postEffects,
      error: this.#error,
    });
  }

  resize(): void {
    const viewport = this.#engine.viewport;
    this.#scene.resize(viewport);
    this.#scene.camera.aspect = viewport.aspect;
    this.#scene.camera.updateProjectionMatrix();
    if (this.#lab?.mode !== 'auto') {
      this.#frameScene();
    }
  }

  getDiagnostics(): PropLabDiagnostics {
    const render = this.#engine.getRenderStatistics();
    const scene = this.#scene.getDiagnostics();
    const state = this.#daylight.state;
    const lab = this.#lab;
    const camera = this.#scene.camera;
    return {
      scene: 'props',
      modelId: lab?.asset?.id ?? null,
      modelName: lab?.asset?.name ?? null,
      modelRadius: lab === null ? null : lab.size.radius,
      modelBytes: lab?.asset?.bytes ?? null,
      levels: lab?.asset?.levels ?? [],
      mode: lab?.mode ?? 'lineup',
      activeLevel:
        lab === null
          ? null
          : lab.mode === 'auto'
            ? (lab.autoLevel?.level ?? null)
            : (this.#focusLevel ?? lab.copies[0]?.level.level ?? null),
      cameraDistance: camera.position.distanceTo(this.#scene.controls.target),
      tierId: this.#tier.id,
      tierReason: this.#tier.reason,
      rendererBackend: this.#engine.backend,
      postEffects: this.#engine.postEffects,
      timeOfDay: this.#clock.label,
      sunElevationDegrees: scene.sunElevationDegrees ?? state.sunElevationDegrees,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      frames: scene.objectCount > 0 ? this.#frameCount : 0,
      error: this.#error,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#unsubscribeFrame?.();
    this.#unsubscribeFrame = null;
    this.#panel?.dispose();
    this.#lab?.dispose();
    this.#lab = null;
    this.#engine.dispose();
    this.#scene.dispose();
  }
}

/**
 * How much of the frame the panel covers.
 *
 * Measured from the DOM rather than configured, for the same reason the studio measures it: the panel
 * is styled in `rem`, so its share of the viewport depends on the root font size and the window width,
 * and a hardcoded fraction would be wrong on exactly the narrow screens where it matters. A panel wide
 * enough to be the whole frame is treated as taking none of it, and the camera stops dodging.
 */
function measurePanel(panelRoot: HTMLElement | null): number {
  if (panelRoot === null || panelRoot.hidden) {
    return 0;
  }
  const width = panelRoot.getBoundingClientRect().width;
  const viewport = Math.max(1, window.innerWidth);
  return width / viewport > 0.5 ? 0 : width / viewport;
}
