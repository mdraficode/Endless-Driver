import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  PCFShadowMap,
  Timer,
  VSMShadowMap,
  WebGPURenderer,
  type Camera,
  type DirectionalLight,
  type Scene,
} from 'three/webgpu';
import { scaleBaseline } from '../environment/daylight-levels';
import { buildPostChain, type PostEffectName } from '../shaders/post-chain';
import { DynamicResolutionController } from './DynamicResolution';
import { supportsScenePassResolutionScale } from './RenderScalePolicy';
import { writeLookTable } from '../shaders/lut-identity';
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
/** Reads the renderer's counters into the shape the HUD and the tests use. */
function readStatistics(info: {
  render: { calls: number; drawCalls?: number; triangles: number };
  memory: { geometries: number; textures: number };
}): RenderStatistics {
  return {
    drawCalls: info.render.drawCalls ?? info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
}

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
  /** Set before the lazy chain build so speed-gated shutter strength is correct on the first frame. */
  #motionBlurIntensity: number | null = null;
  #godraysLight: DirectionalLight | null = null;
  readonly #resolution: DynamicResolutionController;
  #renderScale = 1;
  #focusTarget: number | null = null;
  #lookName: string | null = null;
  #pendingLook: { readonly table: Uint8Array; readonly size: number } | null = null;
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
  #statistics: RenderStatistics = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(options: EngineOptions) {
    this.#canvas = options.canvas;
    this.#config = options.config ?? RENDER_CONFIG;
    // The controller is built here, not when the chain appears, so that a page whose first frames are slow
    // has already started averaging by the time there is a chain to apply a scale to.
    const temporal = this.#config.postProcessing.temporalAntiAliasing;
    this.#resolution = new DynamicResolutionController({
      minScale: temporal.minScale,
      maxScale: temporal.maxScale,
      targetFrameTimeMs: temporal.targetFrameTimeMs,
      tolerance: temporal.tolerance,
      step: temporal.step,
      adjustmentIntervalSeconds: temporal.adjustmentIntervalSeconds,
      smoothing: temporal.smoothing,
    });

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
    // This engine owns the frame loop, so it owns the counter reset too; leaving three's automatic
    // reset enabled would mean two resets at two different moments in the same frame.
    this.#renderer.info.autoReset = false;

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

  /** Lattice size of the look currently applied, or `null` when the frame is ungraded. */
  get lookSize(): string | null {
    return this.#lookName;
  }

  /** Focus distance the chain is currently using, in metres; `null` when depth of field is off. */
  get focusDistance(): number | null {
    const chain = this.#chain;
    if (chain === null || !chain.effects.includes('dof')) {
      return null;
    }
    return chain.focusDistance.value;
  }

  /**
   * Render scale the scene pass is currently drawn at, as a fraction of the drawing buffer; `null` when
   * the active post chain cannot use a scaled scene pass.
   *
   * TAAU reconstructs reduced scenes; the low-tier spatial-AA path linearly upscales before FXAA/SMAA and
   * may look softer. Reporting the scale makes both adaptive and explicitly fixed scaling observable.
   */
  get resolutionScale(): number | null {
    const chain = this.#chain;
    const temporal = this.#config.postProcessing.temporalAntiAliasing;
    if (chain === null || !supportsScenePassResolutionScale(chain.effects, temporal)) {
      return null;
    }
    return this.#renderScale;
  }

  /**
   * Sets the shutter angle: the multiplier on the motion vectors, live.
   *
   * Same contract as `setBokehScale` — a write to a uniform node, so it takes effect on the next frame
   * without rebuilding the graph, and zero reads as "the shutter was instant", which is the effect's own
   * off switch without taking the effect out of the chain.
   */
  setMotionBlurIntensity(intensity: number): void {
    if (!Number.isFinite(intensity)) {
      return;
    }
    const resolved = Math.max(0, intensity);
    this.#motionBlurIntensity = resolved;
    if (this.#chain !== null) {
      this.#chain.motionBlurIntensity.value = resolved;
    }
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
      this.#renderer.toneMappingExposure = scaleBaseline(
        this.#config.renderer.toneMappingExposure,
        exposure,
      );
    }
  }

  /**
   * Points the camera's focus at something.
   *
   * The distance is smoothed towards over `depthOfField.focusSmoothingSeconds`, because a focus plane
   * that jumps is the single most obvious way depth of field reads as a bug rather than as a lens. The
   * smoothing lives here, in the engine, so all three scenes rack focus the same way instead of each
   * inventing its own damped lerp.
   *
   * When depth of field is not in the chain the call is a no-op — every scene may ask to be focused
   * without asking whether the tier can afford it.
   */
  focusOn(distance: number): void {
    if (Number.isFinite(distance) && distance > 0) {
      this.#focusTarget = distance;
    }
  }

  /**
   * Applies a loaded look table to the chain's texture.
   *
   * Safe to call before the chain exists, which is not a hypothetical: a scene loads its assets during
   * start-up and the chain is built lazily on the first `render()`, so the look *always* arrives first.
   * Holding it until the chain is built rather than dropping it is the difference between a look that
   * works and a look that is silently never applied — the failure mode being a frame with no grade at
   * all, which looks exactly like a look that is simply subtle.
   */
  applyLookTable(asset: { readonly table: Uint8Array; readonly size: number }): void {
    this.#pendingLook = asset;
    this.#applyPendingLook();
  }

  #applyPendingLook(): void {
    const asset = this.#pendingLook;
    const chain = this.#chain;
    if (asset === null || chain === null) {
      return;
    }
    if (!chain.effects.includes('lut')) {
      // The chain was built without the look — a tier or a switch removed it. Dropping the table is
      // correct here: there is nothing to apply it to, and the frame is already ungraded by design.
      this.#pendingLook = null;
      return;
    }
    writeLookTable(chain.lutTexture, asset.table, asset.size);
    this.#lookName = `${asset.size}³`;
  }

  /**
   * Trims the look: 0 leaves the frame as the renderer produced it, 1 applies it as authored.
   *
   * Live, like exposure and the grade — which is the property that makes a LUT a *dial* rather than a
   * decision, and lets the same table serve a bright noon and a night scene without a second file.
   */
  setLookIntensity(intensity: number): void {
    const chain = this.#chain;
    if (chain === null || !Number.isFinite(intensity)) {
      return;
    }
    chain.lutIntensity.value = Math.min(1, Math.max(0, intensity));
  }

  /** Sets the aperture: the size of the blur itself, unitless. Zero disables the effect's look. */
  setBokehScale(scale: number): void {
    const chain = this.#chain;
    if (chain === null || !Number.isFinite(scale)) {
      return;
    }
    chain.bokehScale.value = Math.max(0, scale);
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
   * Hands the chain the scene's shadow-only god-ray light. Called by composition roots before
   * the first frame; the chain is built lazily, so the light only has to exist by then. Without
   * it the effect is dropped from the graph (see `buildPostChain`), never built broken.
   */
  setGodraysLight(light: DirectionalLight | null): void {
    this.#godraysLight = light;
  }

  /**
   * Sets the god-ray shaft colour for the coming frame: the sun's colour, pre-scaled by the
   * daylight controller to how plausible shafts are at this hour. Black is the off state, so the
   * call is safe at any hour and on any tier - the controller never has to ask whether the
   * effect is in the chain before describing the sky to it.
   */
  setGodrays(tint: { readonly r: number; readonly g: number; readonly b: number }): void {
    const { godraysTint } = this.#chain ?? {};
    if (godraysTint === undefined) {
      return;
    }
    const clamp = (value: number) =>
      Number.isFinite(value) ? Math.min(MAX_GRADE, Math.max(0, value)) : 0;
    godraysTint.set(clamp(tint.r), clamp(tint.g), clamp(tint.b));
  }

  /**
   * Sets the contact-shadow light for the coming frame: view-space direction towards the
   * sun, and the daylight gate the controller resolved (0 at night). The chain multiplies
   * the gate by its configured strength here, so the value the shader sees is the final
   * one and the controller never needs to know the configuration. Safe on any tier: when
   * the effect is not in the chain there are no handles and the call is a no-op.
   */
  setContactSun(
    direction: { readonly x: number; readonly y: number; readonly z: number },
    gate: number,
  ): void {
    const contact = this.#chain?.contact;
    if (contact === null || contact === undefined) {
      return;
    }
    if (
      Number.isFinite(direction.x) &&
      Number.isFinite(direction.y) &&
      Number.isFinite(direction.z)
    ) {
      contact.sunDirectionView.set(direction.x, direction.y, direction.z);
    }
    contact.sunStrength.value =
      contact.baseStrength * (Number.isFinite(gate) ? Math.min(1, Math.max(0, gate)) : 0);
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

  /**
   * What the last completed frame drew.
   *
   * A cached snapshot rather than a live read of the renderer's counters, because those are reset at
   * the start of each frame: a caller that asks between the reset and the last draw would be told the
   * frame was empty, and the HUD would flicker between the truth and a zero.
   */
  getRenderStatistics(): RenderStatistics {
    return this.#statistics;
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
    this.#chain?.dispose();
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
        godraysLight: this.#godraysLight,
      });
      if (this.#motionBlurIntensity !== null) {
        this.#chain.motionBlurIntensity.value = this.#motionBlurIntensity;
      }
      this.#pipelineScene = scene;
      this.#pipelineCamera = camera;
      // The look may already be loaded and waiting; now there is a texture to put it in.
      this.#applyPendingLook();
      this.#applyResolutionScale(true);
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

  /**
   * Moves the focus plane most of the way to whatever the scene last asked for.
   *
   * Exponential damping on a time constant, not a per-frame lerp factor: the amount of travel per frame
   * has to depend on how long the frame took, or the same code racks focus at a different speed on a
   * 60 Hz display and a 144 Hz one. `1 - e^(-dt/τ)` is the fraction of the remaining distance covered
   * in that time, and it is stable for any delta.
   */
  #updateFocus(delta: number): void {
    const chain = this.#chain;
    const target = this.#focusTarget;
    if (chain === null || target === null || !chain.effects.includes('dof')) {
      return;
    }
    const tau = Math.max(0.001, this.#config.postProcessing.depthOfField.focusSmoothingSeconds);
    const fraction = 1 - Math.exp(-delta / tau);
    const current = chain.focusDistance.value;
    chain.focusDistance.value = current + (target - current) * fraction;
  }

  /**
   * Moves the render scale towards what the delivered frame time can afford, then applies it to the scene
   * pass. TAAU reconstructs reduced frames on B/A; tier C can scale its FXAA/SMAA scene pass as a bounded
   * mobile fallback, with a higher floor because spatial AA cannot restore the lost detail. That path is
   * explicitly reported as FXAA/SMAA rather than described as temporal upscaling.
   *
   * `delta` is the frame time this engine already measured, in seconds. It is not the GPU's own time — see
   * the note at the top of `DynamicResolution.ts` for what that difference costs — but it is the time the
   * player actually got.
   */
  #updateResolution(delta: number): void {
    const chain = this.#chain;
    const temporal = this.#config.postProcessing.temporalAntiAliasing;
    if (chain === null || !supportsScenePassResolutionScale(chain.effects, temporal)) {
      return;
    }
    if (!temporal.dynamicResolution) {
      // A fixed render scale still has to be *applied* — once, and then never again.
      if (this.#renderScale !== this.#resolution.scale) {
        this.#renderScale = this.#resolution.scale;
      }
      return;
    }

    const decision = this.#resolution.updateFrameTime(delta * 1000);
    if (decision.changed) {
      this.#renderScale = decision.scale;
      chain.scenePass.setResolutionScale(decision.scale);
    }
  }

  /** Applies the configured render scale to the pass. `initial` also seeds the controller's own value. */
  #applyResolutionScale(initial = false): void {
    const chain = this.#chain;
    const temporal = this.#config.postProcessing.temporalAntiAliasing;
    if (chain === null || !supportsScenePassResolutionScale(chain.effects, temporal)) {
      return;
    }
    if (initial) {
      // Optimistic start: the highest scale the configuration allows, with the controller adapting down if
      // the first second cannot hold it. Starting low would mean every session opens soft on the machines
      // that did not need to trade anything away.
      this.#resolution.reset(temporal.dynamicResolution ? temporal.maxScale : temporal.renderScale);
    }
    this.#renderScale = this.#resolution.scale;
    chain.scenePass.setResolutionScale(this.#renderScale);
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

    // The renderer's counters are reset here, at the top of the frame this engine drives, and the
    // result is cached at the bottom. Both halves are deliberate: three only resets `info` inside its
    // *own* animation loop, and this engine does not use that loop — so without the reset the numbers
    // accumulate for as long as the page is open, and with it but without the cache a caller reading
    // mid-frame (a HUD, a test, the screenshot harness) can catch the counters between the reset and
    // the first draw and be told the scene is empty.
    this.#renderer.info.reset();
    this.#updateFocus(delta);
    this.#updateResolution(delta);

    const frame: FrameState = { delta, elapsed: this.#elapsed, frame: this.#frameCount };
    for (const handler of [...this.#frameHandlers]) {
      handler(frame);
    }

    this.#statistics = readStatistics(this.#renderer.info);
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
