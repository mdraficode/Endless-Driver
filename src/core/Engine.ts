import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  Timer,
  VSMShadowMap,
  WebGLRenderer,
  type Camera,
  type Scene,
} from 'three';
import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { clampFrameDelta, resolvePixelRatio } from '../shared/math';

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
 * Shadow filtering modes supported by the pinned Three.js release. `PCFSoftShadowMap` was removed
 * in r186 (the renderer warns and downgrades to PCF), so the soft-shadow intent is expressed as PCF
 * by default with VSM available as an opt-in soft alternative.
 */
const SHADOW_MAP_TYPES = {
  pcf: PCFShadowMap,
  vsm: VSMShadowMap,
} as const;

export type FrameHandler = (frame: FrameState) => void;
export type ResizeHandler = (viewport: Viewport) => void;
export type ContextHandler = () => void;

/**
 * Owns the WebGL renderer, canvas sizing, and the requestAnimationFrame loop.
 *
 * Phase 1 responsibilities:
 * - one renderer with antialiasing, soft shadows, and ACES filmic tone mapping;
 * - a resize path that keeps the camera aspect and drawing buffer in sync while
 *   capping devicePixelRatio for mobile GPUs;
 * - a delta-time loop that clamps long frames and survives tab switches and
 *   WebGL context loss/restore.
 *
 * The engine never imports scene systems: callers register handlers and call
 * `render(scene, camera)` from a frame handler, which keeps ownership explicit.
 */
export class Engine {
  readonly #canvas: HTMLCanvasElement;
  readonly #config: RenderConfig;
  readonly #renderer: WebGLRenderer;
  readonly #timer = new Timer();
  readonly #frameHandlers = new Set<FrameHandler>();
  readonly #resizeHandlers = new Set<ResizeHandler>();
  readonly #contextLostHandlers = new Set<ContextHandler>();
  readonly #contextRestoredHandlers = new Set<ContextHandler>();
  readonly #resizeObserver: ResizeObserver | null;
  readonly #listensToWindow: boolean;
  #viewport: Viewport = { width: 0, height: 0, pixelRatio: 1, aspect: 1 };
  #animationFrame: number | null = null;
  #resizeFrame: number | null = null;
  #elapsed = 0;
  #frameCount = 0;
  #wantsRunning = false;
  #contextLost = false;
  #disposed = false;

  constructor(options: EngineOptions) {
    this.#canvas = options.canvas;
    this.#config = options.config ?? RENDER_CONFIG;

    this.#renderer = new WebGLRenderer({
      canvas: this.#canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = SHADOW_MAP_TYPES[this.#config.shadows.shadowMapType];
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1;

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

  get renderer(): WebGLRenderer {
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

  render(scene: Scene, camera: Camera): void {
    if (this.#disposed || this.#contextLost) {
      return;
    }
    this.#renderer.render(scene, camera);
  }

  getRenderStatistics(): RenderStatistics {
    const { render, memory } = this.#renderer.info;
    return {
      drawCalls: render.calls,
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
    this.#renderer.dispose();
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
    this.#contextLost = true;
    this.#cancelFrame();
    for (const handler of [...this.#contextLostHandlers]) {
      handler();
    }
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
}
