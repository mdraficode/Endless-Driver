import type { CameraMode } from '../config/camera';
import type { AntiAliasingMode, RendererBackendName } from '../config/render';
import type { TierId } from '../config/tiers';
import type { TierReason } from '../core/QualityTier';
import type { WeatherPreset } from '../environment/SurfaceState';

/**
 * Diagnostics HUD.
 *
 * Phase 1 reported render health; Phase 2 added vehicle and physics state; Phase 3 reports which
 * renderer backend is actually running and where the scene's light comes from, because "did the
 * WebGL2 fallback engage, and did the HDRI load?" is the first question any rendering problem on a
 * given machine starts with. The overlay only touches the DOM when `update` is called on the
 * application's HUD interval, keeping per-frame work out of the render loop. All values are
 * formatted from the snapshot; nothing here reads engine internals directly. When opened, the report
 * occupies the full game surface above the minimap and touch HUD, lays every metric into a compact
 * responsive grid, and remains non-scrollable so a device capture includes the entire snapshot.
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
  /** World clock, `HH:MM`. */
  readonly timeOfDay: string;
  /** Sun elevation in degrees; negative means below the horizon. */
  readonly sunElevationDegrees: number;
  readonly isNight: boolean;
  /**
   * Backend that ended up rendering: `webgpu` when the browser exposes a working WebGPU device,
   * `webgl2` when the renderer fell back, `pending` before initialisation resolves.
   */
  readonly rendererBackend: RendererBackendName | 'pending';
  /**
   * Frame-handler exceptions the engine has survived. `count` is total since startup; `last` is
   * the most recent message, or `null` before the first one. Anything above zero is a real
   * problem worth sending back with a device report.
   */
  readonly frameErrors: { readonly count: number; readonly last: string | null };
  /** Vehicle particle path: compute on WebGPU, intentionally disabled on WebGL2. */
  readonly particleSimulation: 'pending' | 'webgpu-compute' | 'webgl2-disabled';
  /** Whether frames go through the `RenderPipeline` output chain (grade, bloom, tone mapping). */
  readonly postProcessing: boolean;
  /** Anti-aliasing strategy in force: `msaa` in the renderer, `fxaa`/`smaa` as a post effect. */
  readonly antialiasing: AntiAliasingMode;
  /** Post effects applied to this frame, in order — the chain made observable. */
  readonly postEffects: readonly string[];
  /** Lattice size of the look LUT in force (`17³`), or `null` when the frame is ungraded. */
  readonly look: string | null;
  /** Focus distance the depth-of-field plane is using, in metres; `null` when it is off. */
  readonly focusDistance: number | null;
  /**
   * Fraction of the drawing buffer the scene pass is drawn at before TAAU reconstruction or spatial-AA
   * upscaling, or `null` when the active post chain cannot scale the scene pass.
   *
   * Dynamic resolution is invisible by design, so a scale that never moves, a scale at its floor, and a
   * controller that has stopped observing anything can otherwise look like the same normal frame.
   */
  readonly renderScale: number | null;
  /** Cascades in the shadow atlas; 1 means the plain single-frustum shadow path. */
  readonly shadowCascades: number;
  /** Backdrop in use; `hdri` means the environment texture is also the background. */
  readonly skyMode: 'procedural' | 'hdri';
  /** Manifest id of the HDRI lighting the scene, or `null` when only the sun lights it. */
  readonly environmentId: string | null;
  /** Fog was removed completely, so this must always read `off`. */
  readonly fogMode: 'off';
  /** Session start id (`home-meadow`, `Kiri-cedar`, ...), picked per load. */
  readonly spawnId: string;
  /** Player-facing name of that start, e.g. `Kiri Pass`. */
  readonly spawnLabel: string;
  readonly pixelRatio: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly sceneObjects: number;
  /** Streamed-content stats (terrain chunks loaded/desired/pending, build budget, triangles). */
  readonly contentStats: Readonly<Record<string, number>>;
  readonly totalFrames: number;
  /** Active render camera. */
  readonly cameraMode: CameraMode;
  /** Active framing name (Close / Normal / Far / Orbit / Cockpit). */
  readonly cameraView: string;
  /** Swipe-to-orbit offset around the car, degrees (yaw / pitch). */
  readonly cameraOrbit: { readonly yawDegrees: number; readonly pitchDegrees: number };
  readonly cameraFov: number;
  readonly weather: WeatherPreset;
  /** Normalized wetness of the active weather preset (0 = dry, 1 = saturated). */
  readonly wetness: number;
  /** Mean effective grip multiplier across wheels currently contacting the ground. */
  readonly averageSurfaceGripModifier: number | null;
  /** Mean rolling-resistance coefficient across wheels currently contacting the ground. */
  readonly averageSurfaceRollingResistance: number | null;
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
  /** Start hidden (player sessions); toggled later via `setVisible` / F2 / the 📊 button. */
  readonly initiallyVisible?: boolean;
  /** Called when the player dismisses the panel with its close button. */
  readonly onClose?: () => void;
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
    label: 'Weather',
    format: (snapshot) =>
      snapshot.wetness === 0
        ? `${snapshot.weather} · dry`
        : `${snapshot.weather} · ${(snapshot.wetness * 100).toFixed(0)}% wet`,
  },
  {
    label: 'Surface',
    format: (snapshot) => {
      if (
        snapshot.averageSurfaceGripModifier === null ||
        snapshot.averageSurfaceRollingResistance === null
      ) {
        return 'no tire contact';
      }
      return `grip ${snapshot.averageSurfaceGripModifier.toFixed(2)}× · RR ${snapshot.averageSurfaceRollingResistance.toFixed(4)}`;
    },
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
    label: 'Time',
    format: (snapshot) =>
      `${snapshot.timeOfDay} · sun ${snapshot.sunElevationDegrees.toFixed(0)}°${snapshot.isNight ? ' · night' : ''}`,
  },
  {
    label: 'Tier',
    format: (snapshot) =>
      `${snapshot.qualityTier} · ${snapshot.tierReason.replace('-', ' ')} · ${snapshot.shadowCascades}x shadow`,
  },
  {
    label: 'Start',
    format: (snapshot) => snapshot.spawnLabel,
  },
  {
    label: 'Renderer',
    format: (snapshot) => `${snapshot.rendererBackend} · ${snapshot.antialiasing}`,
  },
  {
    label: 'Particles',
    format: (snapshot) => snapshot.particleSimulation,
  },
  {
    // Keep the active reconstruction/AA path beside its scene-pass scale. TAAU reconstructs reduced frames;
    // FXAA/SMAA use a linear upscale and cannot restore detail, so the row names the path honestly.
    label: 'Resolution',
    format: (snapshot) => formatResolution(snapshot.renderScale, snapshot.postEffects),
  },
  {
    label: 'Post',
    format: (snapshot) =>
      snapshot.postProcessing ? snapshot.postEffects.join(' → ') || 'passthrough' : 'off',
  },
  {
    // The look and the focus plane are the two post-processing settings a screenshot cannot report:
    // a look that failed to load, a look that is switched off, and a look that is doing nothing all
    // render the same frame — and a focus plane parked at the wrong distance reads as a soft lens
    // rather than as a bug. Printing them turns three silent states into one readable row.
    label: 'Look',
    format: (snapshot) => formatLook(snapshot.look, snapshot.focusDistance),
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
    label: 'Terrain',
    format: (snapshot) => {
      const stats = snapshot.contentStats;
      const loaded = stats.terrainChunksLoaded;
      if (loaded === undefined) {
        return '—';
      }
      return `${loaded}/${stats.terrainChunksDesired ?? 0} chunks · ${stats.terrainBuildsPending ?? 0} queued · ${((stats.terrainTriangles ?? 0) / 1000).toFixed(0)}k tris`;
    },
  },
  {
    label: 'Camera',
    format: (snapshot) =>
      `${snapshot.cameraView}${snapshot.cameraMode === 'chase' ? orbitSuffix(snapshot) : ''} · ${snapshot.cameraFov.toFixed(1)}° fov · ${snapshot.cameraPosition.x.toFixed(0)}, ${snapshot.cameraPosition.y.toFixed(0)}, ${snapshot.cameraPosition.z.toFixed(0)}`,
  },
  { label: 'Frames', format: (snapshot) => snapshot.totalFrames.toLocaleString('en-US') },
  {
    label: 'Frame errors',
    format: (snapshot) =>
      snapshot.frameErrors.count === 0
        ? 'none'
        : `${snapshot.frameErrors.count} · ${snapshot.frameErrors.last ?? 'unknown'}`,
  },
];

/**
 * One line describing the colour look and the focus plane.
 *
 * Both are `null` when the effect is not in the chain, which is a *state*, not a failure: depth of
 * field is deliberately off on the constrained tier, and an ungraded frame is what a project with no
 * look should render. The row says so rather than showing zeroes.
 */
function formatResolution(renderScale: number | null, effects: readonly string[]): string {
  if (renderScale === null) {
    return 'off';
  }
  const reconstruction = effects.includes('taa')
    ? 'taau'
    : effects.includes('fxaa')
      ? 'fxaa'
      : effects.includes('smaa')
        ? 'smaa'
        : 'scene';
  return `${reconstruction} @ ${Math.round(renderScale * 100)}%`;
}

function formatLook(look: string | null, focusDistance: number | null): string {
  const parts: string[] = [];
  parts.push(look === null ? 'ungraded' : `LUT ${look}`);
  parts.push(focusDistance === null ? 'no dof' : `focus ${focusDistance.toFixed(1)} m`);
  return parts.join(' · ');
}

const PANEL_CLASSES = ['diagnostics-panel', 'pointer-events-auto', 'select-none', 'font-mono'].join(
  ' ',
);

const LABEL_CLASSES = 'diagnostics-label';
const VALUE_CLASSES = 'diagnostics-value';

/** Orbit angles only earn screen space once a thumb has actually moved the camera. */
function orbitSuffix(snapshot: {
  readonly cameraOrbit: { readonly yawDegrees: number; readonly pitchDegrees: number };
}): string {
  const { yawDegrees, pitchDegrees } = snapshot.cameraOrbit;
  if (Math.abs(yawDegrees) + Math.abs(pitchDegrees) < 0.5) {
    return '';
  }
  return ` · orbit ${yawDegrees.toFixed(0)}°/${pitchDegrees.toFixed(0)}°`;
}

export class DiagnosticsOverlay {
  readonly #panel: HTMLElement;
  readonly #valueNodes: readonly HTMLElement[];
  #disposed = false;
  #visible: boolean;

  constructor(options: DiagnosticsOverlayOptions) {
    this.#panel = document.createElement('section');
    this.#panel.className = PANEL_CLASSES;
    this.#panel.setAttribute('role', 'region');
    this.#panel.setAttribute('aria-label', 'Live diagnostics report');
    this.#visible = options.initiallyVisible ?? true;
    this.setVisible(this.#visible);

    const header = document.createElement('header');
    header.className = 'diagnostics-header';
    const headingGroup = document.createElement('div');
    headingGroup.className = 'diagnostics-heading-group';
    const heading = document.createElement('h2');
    heading.className = 'diagnostics-title';
    heading.textContent = 'Diagnostics report';
    const subtitle = document.createElement('p');
    subtitle.className = 'diagnostics-subtitle';
    subtitle.textContent = options.subtitle ?? 'Live telemetry · tap × or press F2 to close';
    headingGroup.append(heading, subtitle);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Close diagnostics report');
    closeButton.className = 'diagnostics-close';
    closeButton.addEventListener('click', () => {
      this.setVisible(false);
      options.onClose?.();
    });
    header.append(headingGroup, closeButton);
    this.#panel.append(header);

    const list = document.createElement('dl');
    list.className = 'diagnostics-grid';

    const valueNodes: HTMLElement[] = [];
    for (const row of ROW_DEFINITIONS) {
      const metric = document.createElement('div');
      metric.className = 'diagnostics-metric';

      const term = document.createElement('dt');
      term.className = LABEL_CLASSES;
      term.textContent = row.label;

      const value = document.createElement('dd');
      value.className = VALUE_CLASSES;
      value.textContent = '—';

      metric.append(term, value);
      list.append(metric);
      valueNodes.push(value);
    }

    this.#panel.append(list);
    this.#valueNodes = valueNodes;
    options.root.append(this.#panel);
  }

  get element(): HTMLElement {
    return this.#panel;
  }

  get isVisible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#panel.hidden = !visible;
    this.#panel.setAttribute('aria-hidden', String(!visible));
  }

  update(snapshot: DiagnosticsSnapshot): void {
    if (this.#disposed || !this.#visible) {
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
