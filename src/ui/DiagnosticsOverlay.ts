import type { CameraMode } from '../config/camera';
import type { RendererBackendName } from '../config/render';
import type { TierId } from '../config/tiers';
import type { TierReason } from '../core/QualityTier';

/**
 * Diagnostics HUD.
 *
 * Phase 1 reported render health; Phase 2 added vehicle and physics state; Phase 3 reports which
 * renderer backend is actually running and where the scene's light comes from, because "did the
 * WebGL2 fallback engage, and did the HDRI load?" is the first question any rendering problem on a
 * given machine starts with. The overlay only touches the DOM when `update` is called on the
 * application's HUD interval, keeping per-frame work out of the render loop. All values are
 * formatted from the snapshot; nothing here reads engine internals directly.
 */
export interface DiagnosticsSnapshot {
  readonly framesPerSecond: number;
  readonly minimumFramesPerSecond: number;
  readonly averageFrameTimeMilliseconds: number;
  readonly p95FrameTimeMilliseconds: number;
  readonly drawCalls: number;
  readonly triangles: number;
  /** Quality tier this frame was rendered under; see `docs/VISUAL_TARGET.md` §3. */
  readonly qualityTier: TierId;
  /** Why that tier was chosen, so a quality report can explain itself. */
  readonly tierReason: TierReason;
  /**
   * Backend that ended up rendering: `webgpu` when the browser exposes a working WebGPU device,
   * `webgl2` when the renderer fell back, `pending` before initialisation resolves.
   */
  readonly rendererBackend: RendererBackendName | 'pending';
  /** Whether frames go through the `RenderPipeline` output chain (bloom, tone mapping). */
  readonly postProcessing: boolean;
  /** Cascades in the shadow atlas; 1 means the plain single-frustum shadow path. */
  readonly shadowCascades: number;
  /** Backdrop in use; `hdri` means the environment texture is also the background. */
  readonly skyMode: 'procedural' | 'hdri';
  /** Manifest id of the HDRI lighting the scene, or `null` when only the sun lights it. */
  readonly environmentId: string | null;
  readonly pixelRatio: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly sceneObjects: number;
  readonly totalFrames: number;
  /** Active render camera. */
  readonly cameraMode: CameraMode;
  readonly cameraFov: number;
  readonly speedKph: number;
  /** Signed speed along the chassis forward axis, m/s (negative when reversing). */
  readonly forwardSpeed: number;
  /** 1..n forward gears, -1 reverse. */
  readonly gear: number;
  readonly rpm: number;
  readonly throttle: number;
  readonly brake: number;
  readonly handbrake: boolean;
  readonly steerAngleDegrees: number;
  /** Wheels currently touching the ground. */
  readonly contactCount: number;
  readonly drifting: boolean;
  readonly slipAngleDegrees: number;
  readonly distanceMeters: number;
  /** Fixed physics steps executed in the last rendered frame. */
  readonly physicsSteps: number;
  readonly physicsBodies: number;
  /** Frames where the catch-up budget was exhausted and backlog was discarded. */
  readonly physicsStalledFrames: number;
  /** Simulated time since load, in seconds. Differs from wall time when frames are slow. */
  readonly physicsElapsedSeconds: number;
  /** Chassis heading (yaw about +Y) in degrees; 0 faces -Z. */
  readonly carHeadingDegrees: number;
  readonly carPosition: { readonly x: number; readonly y: number; readonly z: number };
  /**
   * Per-wheel presentation state consumed by the car visual, in wheel order
   * (front-left, front-right, rear-left, rear-right). Steering is in degrees and spin in radians;
   * they are exposed so the rendered wheel pose can be verified without reading scene internals.
   */
  readonly wheelSteerDegrees: readonly number[];
  readonly wheelSpinRadians: readonly number[];
}

export interface DiagnosticsOverlayOptions {
  readonly root: HTMLElement;
  readonly subtitle?: string;
}

interface RowDefinition {
  readonly label: string;
  readonly format: (snapshot: DiagnosticsSnapshot) => string;
}

const formatGear = (gear: number): string => (gear < 0 ? 'R' : String(gear));

const ROW_DEFINITIONS: readonly RowDefinition[] = [
  {
    label: 'Speed',
    format: (snapshot) => `${snapshot.speedKph.toFixed(1)} km/h`,
  },
  {
    label: 'Gear',
    format: (snapshot) => `${formatGear(snapshot.gear)} @ ${Math.round(snapshot.rpm)} rpm`,
  },
  {
    label: 'Input',
    format: (snapshot) =>
      `T ${snapshot.throttle.toFixed(2)} · B ${snapshot.brake.toFixed(2)} · S ${snapshot.steerAngleDegrees.toFixed(
        1,
      )}°${snapshot.handbrake ? ' · HB' : ''}`,
  },
  {
    label: 'Wheels',
    format: (snapshot) => `${snapshot.contactCount}/4 on ground`,
  },
  {
    label: 'Drift',
    format: (snapshot) =>
      `${snapshot.drifting ? 'sliding' : 'grip'} · ${snapshot.slipAngleDegrees.toFixed(1)}° slip`,
  },
  {
    label: 'Distance',
    format: (snapshot) => `${snapshot.distanceMeters.toFixed(0)} m`,
  },
  {
    label: 'Physics',
    format: (snapshot) =>
      `${snapshot.physicsSteps} steps · ${snapshot.physicsBodies} bodies${
        snapshot.physicsStalledFrames > 0 ? ` · ${snapshot.physicsStalledFrames} stalled` : ''
      }`,
  },
  {
    label: 'Car',
    format: (snapshot) =>
      `${snapshot.carPosition.x.toFixed(1)}, ${snapshot.carPosition.y.toFixed(1)}, ${snapshot.carPosition.z.toFixed(1)}`,
  },
  {
    label: 'FPS',
    format: (snapshot) => `${snapshot.framesPerSecond.toFixed(1)} avg`,
  },
  {
    label: 'FPS low',
    format: (snapshot) => `${snapshot.minimumFramesPerSecond.toFixed(1)} worst`,
  },
  {
    label: 'Frame',
    format: (snapshot) => `${snapshot.averageFrameTimeMilliseconds.toFixed(2)} ms`,
  },
  {
    label: 'Frame p95',
    format: (snapshot) => `${snapshot.p95FrameTimeMilliseconds.toFixed(2)} ms`,
  },
  {
    label: 'Viewport',
    format: (snapshot) =>
      `${snapshot.viewport.width}×${snapshot.viewport.height} @ ${snapshot.pixelRatio.toFixed(2)}x`,
  },
  {
    label: 'Tier',
    format: (snapshot) =>
      `${snapshot.qualityTier} · ${snapshot.tierReason.replace('-', ' ')} · ${snapshot.shadowCascades}x shadow`,
  },
  {
    label: 'Renderer',
    format: (snapshot) => `${snapshot.rendererBackend}${snapshot.postProcessing ? ' · post' : ''}`,
  },
  {
    label: 'Sky',
    format: (snapshot) =>
      snapshot.environmentId === null
        ? snapshot.skyMode
        : `${snapshot.skyMode} · ${snapshot.environmentId}`,
  },
  { label: 'Draw calls', format: (snapshot) => String(snapshot.drawCalls) },
  { label: 'Triangles', format: (snapshot) => snapshot.triangles.toLocaleString('en-US') },
  { label: 'Scene objects', format: (snapshot) => String(snapshot.sceneObjects) },
  {
    label: 'Camera',
    format: (snapshot) =>
      `${snapshot.cameraMode} · ${snapshot.cameraFov.toFixed(1)}° fov · ${snapshot.cameraPosition.x.toFixed(0)}, ${snapshot.cameraPosition.y.toFixed(0)}, ${snapshot.cameraPosition.z.toFixed(0)}`,
  },
  { label: 'Frames', format: (snapshot) => snapshot.totalFrames.toLocaleString('en-US') },
];

const PANEL_CLASSES = [
  'pointer-events-none',
  'absolute',
  'top-3',
  'left-3',
  'select-none',
  'rounded-xl',
  'border',
  'border-white/10',
  'bg-slate-950/70',
  'px-3',
  'py-2',
  'font-mono',
  'text-[11px]',
  'leading-5',
  'tabular-nums',
  'text-slate-200',
  'shadow-lg',
  'backdrop-blur-sm',
].join(' ');

const LABEL_CLASSES = 'text-slate-400';
const VALUE_CLASSES = 'text-right text-teal-200';

export class DiagnosticsOverlay {
  readonly #panel: HTMLElement;
  readonly #valueNodes: readonly HTMLElement[];
  #disposed = false;

  constructor(options: DiagnosticsOverlayOptions) {
    this.#panel = document.createElement('section');
    this.#panel.className = PANEL_CLASSES;
    this.#panel.setAttribute('aria-hidden', 'true');

    const heading = document.createElement('p');
    heading.className = 'mb-1 font-sans text-[10px] font-semibold tracking-[0.18em] uppercase';
    heading.textContent = options.subtitle ?? 'Phase 3 · renderer & lighting';
    heading.classList.add('text-teal-300');
    this.#panel.append(heading);

    const list = document.createElement('dl');
    list.className = 'grid grid-cols-[auto_auto] gap-x-4';

    const valueNodes: HTMLElement[] = [];
    for (const row of ROW_DEFINITIONS) {
      const term = document.createElement('dt');
      term.className = LABEL_CLASSES;
      term.textContent = row.label;

      const value = document.createElement('dd');
      value.className = VALUE_CLASSES;
      value.textContent = '—';

      list.append(term, value);
      valueNodes.push(value);
    }

    this.#panel.append(list);
    this.#valueNodes = valueNodes;
    options.root.append(this.#panel);
  }

  get element(): HTMLElement {
    return this.#panel;
  }

  update(snapshot: DiagnosticsSnapshot): void {
    if (this.#disposed) {
      return;
    }
    ROW_DEFINITIONS.forEach((row, index) => {
      const node = this.#valueNodes[index];
      if (node) {
        node.textContent = row.format(snapshot);
      }
    });
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#panel.remove();
  }
}
