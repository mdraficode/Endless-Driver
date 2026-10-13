import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { DiagnosticsOverlay, type DiagnosticsSnapshot } from '../ui/DiagnosticsOverlay';
import { Engine, type FrameState } from './Engine';
import { PerformanceMonitor } from './PerformanceMonitor';
import { SceneManager } from './SceneManager';

export interface ApplicationOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config?: RenderConfig;
  /** DOM node that hosts the diagnostics HUD. */
  readonly overlayRoot?: HTMLElement | null;
  /** DOM node used for status/error messages. */
  readonly statusElement?: HTMLElement | null;
}

type StatusTone = 'info' | 'error';

/**
 * Phase 1 composition root: wires the engine, the scene, the frame statistics, and the
 * diagnostics HUD together, and exposes a diagnostics snapshot for tests and tooling.
 *
 * Ownership flows one way: Application owns Engine, SceneManager, PerformanceMonitor,
 * and DiagnosticsOverlay; each of those only knows about its own responsibility.
 */
export class Application {
  readonly #config: RenderConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #monitor: PerformanceMonitor;
  readonly #overlay: DiagnosticsOverlay | null;
  readonly #statusElement: HTMLElement | null;
  readonly #unsubscribers: readonly (() => void)[];
  #hudTimer = 0;
  #firstFrameRendered = false;
  #disposed = false;

  constructor(options: ApplicationOptions) {
    this.#config = options.config ?? RENDER_CONFIG;

    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      aspect: this.#engine.viewport.aspect,
    });
    this.#monitor = new PerformanceMonitor(this.#config.diagnostics.sampleWindow);
    this.#overlay =
      options.overlayRoot && this.#config.diagnostics.overlayEnabled
        ? new DiagnosticsOverlay({ root: options.overlayRoot })
        : null;
    this.#statusElement = options.statusElement ?? null;

    this.#unsubscribers = [
      this.#engine.onResize((viewport) => {
        this.#scene.resize(viewport);
      }),
      this.#engine.onFrame((frame) => {
        this.#renderFrame(frame);
      }),
      this.#engine.onContextLost(() => {
        this.#setStatus('WebGL context lost — waiting for the browser to restore it.', 'error');
      }),
      this.#engine.onContextRestored(() => {
        this.#setStatus('WebGL context restored.', 'info');
      }),
    ];

    // Sync camera aspect with the size the engine already measured.
    this.#engine.resize();
    this.#hudTimer = this.#config.diagnostics.hudUpdateIntervalSeconds;
    this.#setStatus('Preparing the scene…', 'info');
  }

  get engine(): Engine {
    return this.#engine;
  }

  get sceneManager(): SceneManager {
    return this.#scene;
  }

  get isRunning(): boolean {
    return this.#engine.isRunning;
  }

  start(): void {
    this.#engine.start();
  }

  stop(): void {
    this.#engine.stop();
  }

  getDiagnostics(): DiagnosticsSnapshot {
    const statistics = this.#monitor.snapshot();
    const render = this.#engine.getRenderStatistics();
    const viewport = this.#engine.viewport;
    const cameraPosition = this.#scene.camera.position;

    return {
      framesPerSecond: statistics.averageFramesPerSecond,
      minimumFramesPerSecond: statistics.minimumFramesPerSecond,
      averageFrameTimeMilliseconds: statistics.averageFrameTimeMilliseconds,
      p95FrameTimeMilliseconds: statistics.p95FrameTimeMilliseconds,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      pixelRatio: viewport.pixelRatio,
      viewport: { width: viewport.width, height: viewport.height },
      cameraPosition: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
      sceneObjects: this.#scene.getObjectCount(),
      totalFrames: this.#monitor.totalFrames,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const unsubscribe of this.#unsubscribers) {
      unsubscribe();
    }
    this.#overlay?.dispose();
    this.#scene.dispose();
    this.#engine.dispose();
  }

  #renderFrame(frame: FrameState): void {
    this.#scene.update(frame.delta);
    this.#engine.render(this.#scene.scene, this.#scene.camera);
    this.#monitor.record(frame.delta);

    if (!this.#firstFrameRendered) {
      this.#firstFrameRendered = true;
      this.#setStatus(null);
    }

    this.#hudTimer += frame.delta;
    if (this.#hudTimer >= this.#config.diagnostics.hudUpdateIntervalSeconds) {
      this.#hudTimer = 0;
      this.#overlay?.update(this.getDiagnostics());
    }
  }

  #setStatus(message: string | null, tone: StatusTone = 'info'): void {
    const element = this.#statusElement;
    if (!element) {
      return;
    }
    element.textContent = message ?? '';
    element.dataset['tone'] = tone;
  }
}
