import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  PCFShadowMap,
  Timer,
  VSMShadowMap,
  WebGPURenderer,
  type Camera,
  type Scene,
} from 'three/webgpu';
import { buildPostChain, type PostEffectName } from '../shaders/post-chain';
import {
  RENDER_CONFIG,
  type RenderConfig,
  type RendererBackendName,
  type ToneMappingName,
} from '../config/render';
import { clampFrameDelta, resolvePixelRatio } from '../shared/math';

/**
 * Bounds for the grade multiplier. A grade is a *look*, not a light: anything outside this band is a
 * sign that the daylight curves have gone wrong, so the value is clamped rather than trusted.
 */
const MIN_GRADE = 0.25;
const MAX_GRADE = 4;

export interface Viewport {
  /** CSS pixels. */
  readonly width: number;
  /** CSS pixels. */
  readonly height: number;
  /** Effective device pixel ratio after the mobile cap is applied. */
  readonly pixelRatio: number;
  readonly aspect: number;
}

export interface FrameState {
  /** Seconds since the previous frame, clamped to the configured maximum. */
  readonly delta: number;
  /** Accumulated clamped running time in seconds. */
  readonly elapsed: number;
  /** 1-based frame counter. */
  readonly frame: number;
}

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config?: RenderConfig;
}

export interface RenderStatistics {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

/**
 * Shadow filtering modes. `PCFSoftShadowMap` was removed in r186 (the renderer warns and downgrades
 * to PCF), so the soft-shadow intent is expressed as PCF by default with VSM as an opt-in
 * alternative. Both backends of `WebGPURenderer` understand these filters.
 */
const SHADOW_MAP_TYPES = {
  pcf: PCFShadowMap,
  vsm: VSMShadowMap,
} as const;

const TONE_MAPPINGS = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
} as const satisfies Record<ToneMappingName, number>;

export type FrameHandler = (frame: FrameState) => void;
export type ResizeHandler = (viewport: Viewport) => void;
export type ContextHandler = () => void;

/**
 * Owns the renderer, the post-processing pipeline, canvas sizing, and the frame loop.
 *
 * Phase 3 responsibilities:
 * - one `WebGPURenderer` that renders through WebGPU where the browser has it and falls back to its
 *   WebGL2 backend where it does not — a single code path, one set of TSL node materials, and the
 *   backend choice reported through `backend` so the HUD can show what is actually running;
 * - async initialisation (`renderer.init()` builds the device and the node systems), which the
 *   application awaits before the first frame;
 * - a `RenderPipeline` output chain (scene pass → bloom) with tone mapping and colour-space
 *   conversion applied at the end of the chain, so post effects work in linear HDR;
 * - a resize path that keeps the camera aspect and drawing buffer in sync while capping
 *   devicePixelRatio for mobile GPUs;
 * - a delta-time loop that clamps long frames and survives tab switches, WebGL context loss/restore
 *   and WebGPU device loss.
 *
 * The engine never imports scene systems: callers register handlers and call `render(scene, camera)`
 * from a frame handler, which keeps ownership explicit.
 */
export class Engine {
  readonly #canvas: HTMLCanvasElement;
  readonly #config: RenderConfig;
  readonly #renderer: WebGPURenderer;
  readonly #timer = new Timer();
  readonly #frameHandlers = new Set<FrameHandler>();
  readonly #resizeHandlers = new Set<ResizeHandler>();
  readonly #contextLostHandlers = new Set<ContextHandler>();
  readonly #contextRestoredHandlers = new Set<ContextHandler>();
  readonly #resizeObserver: ResizeObserver | null;
  readonly #listensToWindow: boolean;
  #chain: ReturnType<typeof buildPostChain> | null = null;
  #pipelineScene: Scene | null = null;
  #pipelineCamera: Camera | null = null;
  #viewport: Viewport = { width: 0, height: 0, pixelRatio: 1, aspect: 1 };
  #animationFrame: number | null = null;
  #resizeFrame: number | null = null;
  #elapsed = 0;
  #frameCount = 0;
  #wantsRunning = false;
  #contextLost = false;
  #disposed = false;
  #initialized = false;
  #backend: RendererBackendName | null = null;

  constructor(options: EngineOptions) {
    this.#canvas = options.canvas;
    this.#config = options.config ?? RENDER_CONFIG;

    this.#renderer = new WebGPURenderer({
      canvas: this.#canvas,
      antialias: this.#config.renderer.antialias,
      samples: this.#config.renderer.samples,
      alpha: false,
      stencil: false,
      // `auto` keeps the WebGPU backend with its built-in WebGL2 fallback; `webgl` forces the
      // fallback backend so the two paths can be compared on the same machine.
      forceWebGL: this.#config.renderer.backendPreference === 'webgl',
    });
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = SHADOW_MAP_TYPES[this.#config.shadows.shadowMapType];
    this.#renderer.toneMapping = TONE_MAPPINGS[this.#config.renderer.toneMapping];
    this.#renderer.toneMappingExposure = this.#config.renderer.toneMappingExposure;
    this.#renderer.onDeviceLost = this.#handleDeviceLost;

    this.#canvas.addEventListener('webglcontextlost', this.#handleContextLost);
    this.#canvas.addEventListener('webglcontextrestored', this.#handleContextRestored);

    this.#listensToWindow = typeof window !== 'undefined';
    if (this.#listensToWindow) {
      window.addEventListener('resize', this.#handleViewportChange);
      window.addEventListener('orientationchange', this.#handleViewportChange);
      document.addEventListener('visibilitychange', this.#handleVisibilityChange);
      // Page Visibility integration keeps deltas sane if a frame is delivered after a hidden gap.
      this.#timer.connect(document);
    }

    this.#resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(this.#handleViewportChange) : null;
    this.#resizeObserver?.observe(this.#canvas);

    this.resize();
  }

  get renderer(): WebGPURenderer {
    return this.#renderer;
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  /** True when the loop has been requested to run (not necessarily ticking while hidden). */
  get isRunning(): boolean {
    return this.#wantsRunning;
  }

  get isContextLost(): boolean {
    return this.#contextLost;
  }

  get isInitialized(): boolean {
    return this.#initialized;
  }

  /** The backend that ended up rendering, or `null` before `init()` resolves. */
  get backend(): RendererBackendName | null {
    return this.#backend;
  }

  /** True when the post-processing output chain is in use for the current configuration. */
  get isPostProcessingEnabled(): boolean {
    return this.#config.postProcessing.enabled;
  }

  /** Effects the current frame is rendered through, in application order. Reported in the HUD. */
  get postEffects(): readonly PostEffectName[] {
    return this.#chain?.effects ?? [];
  }

  /**
   * Sets tone-mapping exposure.
   *
   * `toneMappingExposure` is a live renderer reference inside the node graph, so this takes effect
   * on the next frame without rebuilding the pipeline — which is what lets exposure follow the sun
   * every frame instead of being fixed at start-up.
   */
  setExposure(exposure: number): void {
    if (Number.isFinite(exposure) && exposure > 0) {
      this.#renderer.toneMappingExposure = exposure;
    }
  }

  /**
   * Sets the time-of-day grade: a linear-RGB multiplier applied to the frame before tone mapping.
   *
   * Like exposure, this is a live uniform inside the node graph, so it costs nothing but a vector
   * write per frame and never rebuilds the pipeline. Values are clamped to a sane band and rejected
   * outright if they are not finite, so a bad solar solve cannot bleach the image.
   */
  setGrade(tint: { readonly r: number; readonly g: number; readonly b: number }): void {
    const { gradeTint } = this.#chain ?? {};
    if (gradeTint === undefined) {
      return;
    }
    const clamp = (value: number) =>
      Number.isFinite(value) ? Math.min(MAX_GRADE, Math.max(MIN_GRADE, value)) : 1;
    gradeTint.set(clamp(tint.r), clamp(tint.g), clamp(tint.b));
  }

  /**
   * Starts the renderer. `WebGPURenderer` builds its device, backend, and node systems
   * asynchronously, so nothing may be rendered before this resolves.
   */
  async init(): Promise<void> {
    if (this.#initialized || this.#disposed) {
      return;
    }
    await this.#renderer.init();
    const backend = this.#renderer.backend as { isWebGLBackend?: boolean } | undefined;
    this.#backend = backend?.isWebGLBackend === true ? 'webgl2' : 'webgpu';
    this.#initialized = true;
  }

  onFrame(handler: FrameHandler): () => void {
    this.#frameHandlers.add(handler);
    return () => {
      this.#frameHandlers.delete(handler);
    };
  }

  onResize(handler: ResizeHandler): () => void {
    this.#resizeHandlers.add(handler);
    return () => {
      this.#resizeHandlers.delete(handler);
    };
  }

  onContextLost(handler: ContextHandler): () => void {
    this.#contextLostHandlers.add(handler);
    return () => {
      this.#contextLostHandlers.delete(handler);
    };
  }

  onContextRestored(handler: ContextHandler): () => void {
    this.#contextRestoredHandlers.add(handler);
    return () => {
      this.#contextRestoredHandlers.delete(handler);
    };
  }

  start(): void {
    if (this.#disposed || this.#contextLost) {
      return;
    }
    this.#wantsRunning = true;
    // Discard the idle gap so the first frame after a pause is not a giant delta.
    this.#timer.reset();
    this.#scheduleFrame();
  }

  stop(): void {
    this.#wantsRunning = false;
    this.#cancelFrame();
  }

  /**
   * Applies the current canvas CSS size and pixel-ratio cap to the renderer, then
   * notifies resize listeners so the camera aspect ratio can follow.
   */
  resize(): void {
    if (this.#disposed) {
      return;
    }

    const width = Math.floor(this.#canvas.clientWidth);
    const height = Math.floor(this.#canvas.clientHeight);
    if (width <= 0 || height <= 0) {
      // Hidden or zero-sized canvas: keep the last valid viewport instead of
      // resizing to an invalid aspect ratio.
      return;
    }

    const devicePixelRatio =
      this.#listensToWindow && Number.isFinite(window.devicePixelRatio)
        ? window.devicePixelRatio
        : 1;
    const pixelRatio = resolvePixelRatio(devicePixelRatio, this.#config.maxPixelRatio);

    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height, false);
    this.#viewport = { width, height, pixelRatio, aspect: width / height };

    for (const handler of [...this.#resizeHandlers]) {
      handler(this.#viewport);
    }
  }

  /**
   * Renders one frame. When post-processing is configured the frame goes through the pipeline's
   * output chain (scene pass → bloom → tone mapping → colour space); otherwise the renderer draws
   * the scene directly.
   */
  render(scene: Scene, camera: Camera): void {
    if (this.#disposed || this.#contextLost || !this.#initialized) {
      return;
    }
    if (this.#updatePipeline(scene, camera)) {
      this.#chain?.pipeline.render();
      return;
    }
    this.#renderer.render(scene, camera);
  }

  getRenderStatistics(): RenderStatistics {
    const { render, memory } = this.#renderer.info;
    return {
      drawCalls: render.drawCalls ?? render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.stop();

    if (this.#resizeFrame !== null) {
      cancelAnimationFrame(this.#resizeFrame);
      this.#resizeFrame = null;
    }

    this.#resizeObserver?.disconnect();
    this.#canvas.removeEventListener('webglcontextlost', this.#handleContextLost);
    this.#canvas.removeEventListener('webglcontextrestored', this.#handleContextRestored);
    if (this.#listensToWindow) {
      window.removeEventListener('resize', this.#handleViewportChange);
      window.removeEventListener('orientationchange', this.#handleViewportChange);
      document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    }

    this.#frameHandlers.clear();
    this.#resizeHandlers.clear();
    this.#contextLostHandlers.clear();
    this.#contextRestoredHandlers.clear();
    this.#timer.dispose();
    this.#chain?.pipeline.dispose();
    this.#chain = null;
    this.#renderer.dispose();
  }

  /**
   * Builds the post-processing chain on first use and re-points its scene pass when the active
   * camera changes (gameplay chase camera <-> debug orbit camera).
   *
   * The graph itself is built once: node graphs are expensive to construct, while re-targeting a
   * pass at another camera is a field assignment.
   *
   * Returns `true` when the caller must render through the pipeline.
   */
  #updatePipeline(scene: Scene, camera: Camera): boolean {
    if (!this.#config.postProcessing.enabled) {
      return false;
    }

    if (this.#chain === null) {
      this.#chain = buildPostChain({
        renderer: this.#renderer,
        scene,
        camera,
        config: this.#config,
      });
      this.#pipelineScene = scene;
      this.#pipelineCamera = camera;
      return true;
    }

    if (this.#pipelineScene !== scene || this.#pipelineCamera !== camera) {
      this.#chain.scenePass.scene = scene;
      this.#chain.scenePass.camera = camera;
      this.#pipelineScene = scene;
      this.#pipelineCamera = camera;
    }
    return true;
  }

  #scheduleFrame(): void {
    if (
      this.#animationFrame !== null ||
      !this.#wantsRunning ||
      this.#contextLost ||
      this.#disposed
    ) {
      return;
    }
    this.#animationFrame = requestAnimationFrame(this.#tick);
  }

  #cancelFrame(): void {
    if (this.#animationFrame !== null) {
      cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
    }
  }

  #scheduleResize(): void {
    if (this.#resizeFrame !== null || this.#disposed) {
      return;
    }
    // Coalesce bursts of resize/orientation events into one sizing pass per frame.
    this.#resizeFrame = requestAnimationFrame(() => {
      this.#resizeFrame = null;
      this.resize();
    });
  }

  #tick = (timestamp: number): void => {
    this.#animationFrame = null;
    if (!this.#wantsRunning || this.#contextLost || this.#disposed) {
      return;
    }

    this.#timer.update(timestamp);
    const delta = clampFrameDelta(this.#timer.getDelta(), this.#config.maxFrameDeltaSeconds);
    this.#elapsed += delta;
    this.#frameCount += 1;

    const frame: FrameState = { delta, elapsed: this.#elapsed, frame: this.#frameCount };
    for (const handler of [...this.#frameHandlers]) {
      handler(frame);
    }

    this.#scheduleFrame();
  };

  #handleViewportChange = (): void => {
    this.#scheduleResize();
  };

  #handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.hidden) {
      // requestAnimationFrame is throttled while hidden; stop cleanly instead of
      // accumulating a huge delta on return.
      this.#cancelFrame();
      return;
    }
    if (this.#wantsRunning && !this.#contextLost) {
      this.#timer.reset();
      this.#scheduleFrame();
    }
  };

  #handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.#enterLostState();
  };

  #handleContextRestored = (): void => {
    this.#contextLost = false;
    for (const handler of [...this.#contextRestoredHandlers]) {
      handler();
    }
    if (this.#wantsRunning) {
      this.#timer.reset();
      this.#scheduleFrame();
    }
  };

  /**
   * WebGPU device loss (driver reset, adapter removal) has no restore event, so the loop stops for
   * good and the application is told to surface the failure. The WebGL2 fallback backend reports
   * through the canvas events above instead.
   */
  #handleDeviceLost = (info: { api?: string; message: string; reason?: string | null }): void => {
    console.error(
      `WebGPU device lost (${info.api ?? 'unknown API'}): ${info.message ?? 'no message'}`,
    );
    this.#enterLostState();
  };

  #enterLostState(): void {
    if (this.#contextLost) {
      return;
    }
    this.#contextLost = true;
    this.#cancelFrame();
    for (const handler of [...this.#contextLostHandlers]) {
      handler();
    }
  }
}
