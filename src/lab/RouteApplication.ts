import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import {
  DEFAULT_BOOKMARK_ID,
  ROUTE_BOOKMARKS,
  ROUTE_CONFIG,
  findRouteBookmark,
  type RouteBookmark,
} from '../config/route';
import { loadLutAsset } from '../assets/LutAsset';
import { Engine } from '../core/Engine';
import { SceneManager } from '../core/SceneManager';
import type { TierResolution } from '../core/QualityTier';
import { DaylightController } from '../environment/DaylightController';
import { EnvironmentClock, type EnvironmentClockOptions } from '../environment/EnvironmentClock';
import { createRouteWorld } from '../world/RouteWorld';

/**
 * The validation-route application: the third composition root.
 *
 * It mounts the same `Engine`, `SceneManager`, and `DaylightController` as the driving scene and
 * the studio, and supplies only what makes it a route — the 2 km strip as the scene's content and
 * a camera parked at one of the fixed bookmarks in `config/route.ts`. No physics and no vehicle:
 * the bookmarks are the subject, and a car that had to be driven to each one would make the
 * captures depend on the driving rather than on the rendering.
 *
 * The camera is the scene's debug orbit camera, parked at the bookmark pose. Orbiting is left
 * enabled because the route is also a place to look at things; the baseline harness never touches
 * the mouse, so the captured frame is the bookmark pose exactly.
 */
export interface RouteApplicationOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config?: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly tier?: TierResolution;
  readonly clock?: EnvironmentClockOptions | undefined;
  /** Bookmark id to open on; an unknown id falls back to the default bookmark. */
  readonly bookmarkId?: string;
  /**
   * Explicit start hour (the `?time=` switch). Wins over the bookmark's own hour: the bookmark
   * table is the baseline, and overriding the hour from the URL is how an off-table hour is
   * inspected without editing the table.
   */
  readonly hourOverride?: number;
}

export interface RouteDiagnostics {
  readonly scene: 'route';
  readonly bookmarkId: string;
  /** All bookmark ids, so tooling can enumerate the set without duplicating the table. */
  readonly bookmarkIds: readonly string[];
  readonly tierId: string;
  readonly tierReason: string;
  readonly rendererBackend: string | null;
  readonly postEffects: readonly string[];
  readonly fogMode: 'height' | 'linear' | 'off';
  readonly look: string | null;
  readonly focusDistance: number | null;
  readonly renderScale: number | null;
  readonly timeOfDay: string;
  readonly sunElevationDegrees: number | null;
  readonly isNight: boolean;
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly drawCalls: number;
  readonly triangles: number;
  readonly frames: number;
}

export class RouteApplication {
  readonly #config: RenderConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #clock: EnvironmentClock;
  readonly #daylight: DaylightController;
  readonly #tier: TierResolution;
  readonly #bookmark: RouteBookmark;
  #unsubscribeFrame: (() => void) | null = null;
  #frameCount = 0;
  #disposed = false;

  private constructor(options: RouteApplicationOptions, bookmark: RouteBookmark) {
    this.#config = options.config ?? RENDER_CONFIG;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    this.#tier = options.tier ?? { id: 'B', reason: 'unresolved' };
    this.#bookmark = bookmark;

    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig,
      aspect: this.#engine.viewport.aspect,
      content: createRouteWorld,
    });
    this.#engine.setGodraysLight(this.#scene.godraysLight);
    this.#scene.setDebugCameraEnabled(true);
    // The bookmarks were framed for a slightly longer lens than the chase camera's.
    this.#scene.camera.fov = ROUTE_CONFIG.cameraFov;
    this.#scene.camera.updateProjectionMatrix();

    const hour = options.hourOverride ?? bookmark.hour;
    this.#clock = new EnvironmentClock({
      ...options.clock,
      startHour: hour,
    });
    this.#daylight = new DaylightController(this.#clock);
  }

  /** Builds the application and applies the bookmark before the first frame. */
  static async create(options: RouteApplicationOptions): Promise<RouteApplication> {
    const bookmark =
      findRouteBookmark(options.bookmarkId) ??
      findRouteBookmark(DEFAULT_BOOKMARK_ID) ??
      (ROUTE_BOOKMARKS[0] as RouteBookmark);
    const application = new RouteApplication(options, bookmark);
    await application.#init();
    return application;
  }

  async #init(): Promise<void> {
    await this.#engine.init();
    this.#applyBookmark();
    await this.#scene.loadEnvironment();
    await this.#loadLook();
    // Before the first frame, so nothing is ever drawn under a different sun than the clock reports.
    this.#daylight.update(0, this.#scene, this.#engine);

    this.#unsubscribeFrame = this.#engine.onFrame((frame) => {
      this.#frameCount = frame.frame;
      this.#scene.update(frame.delta);
      this.#daylight.update(frame.delta, this.#scene, this.#engine);

      const camera = this.#scene.camera;
      this.#scene.followCamera(camera.position);
      this.#scene.focusSun({ x: camera.position.x, y: 0, z: camera.position.z });
      this.#scene.setShadowCamera(camera);
      // The lens focuses on what the bookmark looks at: the road at reading distance, not the
      // horizon, which is the depth-of-field composition these bookmarks exist to judge.
      // Focus on what the bookmark looks at, as a photographer would: the near field softens
      // and the subject stays sharp. (System-isolation captures switch depth of field off from
      // the URL; the baseline keeps the shipped chain, focus behaviour included.)
      const target = this.#bookmark.target;
      this.#engine.focusOn(
        Math.hypot(
          camera.position.x - target[0],
          camera.position.y - target[1],
          camera.position.z - target[2],
        ),
      );
      this.#engine.render(this.#scene.scene, camera);
    });
    this.#engine.start();
  }

  /** Parks the orbit camera at the bookmark pose. Called once, before the first frame. */
  #applyBookmark(): void {
    const { camera, target } = this.#bookmark;
    this.#scene.controls.target.set(...target);
    this.#scene.camera.position.set(...camera);
    this.#scene.camera.lookAt(...target);
    this.#scene.controls.update();
    this.#scene.followCamera(this.#scene.camera.position);
  }

  /**
   * Loads the colour look and hands it to the renderer. Ungraded is a correct frame, so failure
   * degrades rather than stops — the same rule as the other composition roots.
   */
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
      console.info(`validation route: colour look "${asset.name}" (${asset.licence})`);
    } catch (error) {
      console.warn('validation route: the colour look could not be applied; ungraded.', error);
    }
  }

  /** Resizes the viewport. Called from the entrypoint's resize listener. */
  resize(): void {
    const viewport = this.#engine.viewport;
    this.#scene.resize(viewport);
    this.#scene.camera.aspect = viewport.aspect;
    this.#scene.camera.updateProjectionMatrix();
  }

  getDiagnostics(): RouteDiagnostics {
    const scene = this.#scene.getDiagnostics();
    const render = this.#engine.getRenderStatistics();
    const state = this.#daylight.state;
    const { x, y, z } = this.#scene.camera.position;
    return {
      scene: 'route',
      bookmarkId: this.#bookmark.id,
      bookmarkIds: ROUTE_BOOKMARKS.map((bookmark) => bookmark.id),
      tierId: this.#tier.id,
      tierReason: this.#tier.reason,
      rendererBackend: this.#engine.backend,
      postEffects: this.#engine.postEffects,
      fogMode: scene.fogMode,
      look: this.#engine.lookSize,
      focusDistance: this.#engine.focusDistance,
      renderScale: this.#engine.resolutionScale,
      timeOfDay: this.#clock.label,
      sunElevationDegrees: state.sunElevationDegrees,
      isNight: state.isNight,
      cameraPosition: { x, y, z },
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
