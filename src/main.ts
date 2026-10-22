import './style.css';
import { Application, type ApplicationOptions } from './core/Application';
import { RENDER_CONFIG, applyRenderSwitches, type RenderConfig } from './config/render';
import { WORLD_CONFIG } from './config/world';
import { loadRapier } from './physics/RapierModule';
import {
  applyBackendOverride,
  applyTier,
  describeTierDetail,
  readBackendRequest,
  readTierRequest,
  resolveTier,
  type TierEnvironment,
} from './core/QualityTier';
import { StudioApplication, type StudioDiagnostics } from './lab/StudioApplication';
import { PropLabApplication, type PropLabDiagnostics } from './lab/PropLabApplication';
import { RouteApplication, type RouteDiagnostics } from './lab/RouteApplication';
import { UrbanNightApplication, type UrbanNightDiagnostics } from './lab/UrbanNightApplication';
import type { DiagnosticsSnapshot } from './ui/DiagnosticsOverlay';
import { Minimap } from './ui/Minimap';
import { CreditsPanel } from './ui/CreditsPanel';
import { yawFromQuat } from './shared/vector';

export interface EndlessDriverDebugHandle {
  getDiagnostics():
    | DiagnosticsSnapshot
    | StudioDiagnostics
    | PropLabDiagnostics
    | RouteDiagnostics
    | UrbanNightDiagnostics;
  pause(): void;
  resume(): void;
  /** Driving scene only: instantly place the car at a world (x, z) for captures. */
  teleportCar?(x: number, z: number, yaw?: number): void;
  /** Driving scene only: cycle the minimap's next-destination target by hand. */
  cycleMinimapTarget?(): string | null;
}

/**
 * Reads the `?time=` debug switch, in hours (`?time=18.5` for half past six in the evening).
 *
 * Useful for looking at the world at a specific hour without waiting for the clock to reach it, and
 * for the screenshot set that documents the time-of-day curves.
 */
function readTimeRequest(search: string): number | null {
  const raw = new URLSearchParams(search).get('time');
  if (raw === null) {
    return null;
  }
  const hour = Number.parseFloat(raw);
  return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : null;
}

/**
 * Reads the `?scene=` switch: `drive` (the default), `studio`, `props`, `route`, or `city`.
 *
 * Each look-dev scene is a separate composition root rather than a mode on the driving application.
 * The studio has no vehicle and the prop inspector has no track; pretending otherwise would mean
 * threading `if (studio)` and `if (props)` through the whole driving path. All three share the engine,
 * the scene manager, the lighting, and the post chain, which is what makes them honest places to judge
 * what the game will look like.
 */
function readSpawnRequest(search: string): string | undefined {
  const id = new URLSearchParams(search).get('spawn');
  return id === null || id === '' ? undefined : id;
}

function readSceneRequest(search: string): 'drive' | 'studio' | 'props' | 'route' | 'city' {
  const scene = new URLSearchParams(search).get('scene');
  if (scene === 'studio' || scene === 'props' || scene === 'route' || scene === 'city') {
    return scene;
  }
  return 'drive';
}

/** Reads `?bookmark=<id>`: which fixed camera the validation route opens on. */
function readBookmarkRequest(search: string): string | undefined {
  const id = new URLSearchParams(search).get('bookmark');
  return id === null || id === '' ? undefined : id;
}

/** Reads `?model=<manifest id>`: which model the prop inspector opens on. */
function readModelRequest(search: string): string | undefined {
  const id = new URLSearchParams(search).get('model');
  return id === null || id === '' ? undefined : id;
}

export interface StudioRequest {
  readonly environmentId?: string;
  readonly rotationDegrees?: number;
  /** Material id to open the camera on, framed close up (`?focus=chrome`). */
  readonly focus?: string;
  /** `?panel=0` hides the control panel, for a clean capture. */
  readonly showPanel: boolean;
}

/** Reads `?hdri=<manifest id>` and `?rot=<degrees>`, the studio's capture-friendly switches. */
export function readStudioRequest(search: string): StudioRequest {
  const params = new URLSearchParams(search);
  const environmentId = params.get('hdri');
  const rotation = Number.parseFloat(params.get('rot') ?? '');
  const panel = params.get('panel');
  const focus = params.get('focus');
  return {
    ...(environmentId === null || environmentId === '' ? {} : { environmentId }),
    ...(Number.isFinite(rotation) ? { rotationDegrees: rotation } : {}),
    ...(focus === null || focus === '' ? {} : { focus }),
    showPanel: panel !== '0' && panel !== 'false',
  };
}

/**
 * Resolves the render configuration for this device: tier first (it decides the backend preference,
 * pixel-ratio cap, and shadow budget), then any forced-backend switch, then the switchable post
 * effects — which come last so that `?dof=1` can re-enable on a constrained device what the tier
 * switched off, and `?lut=none` can remove a look without a code change.
 */
function resolveRenderConfig(): { config: RenderConfig; tier: ReturnType<typeof resolveTier> } {
  const tier = resolveTier(probeEnvironment());
  const backendPreference = readBackendRequest(window.location.search);
  const config = applyRenderSwitches(
    applyBackendOverride(applyTier(RENDER_CONFIG, tier.id), backendPreference),
    window.location.search,
  );
  console.info(
    `Endless Driver: ${describeTierDetail(tier)}` +
      (backendPreference === null ? '' : `, backend forced to ${backendPreference}`),
  );
  return { config, tier };
}

/**
 * Describes the device for tier selection.
 *
 * Every signal is optional at runtime — `deviceMemory` is non-standard and absent in several
 * browsers — so the defaults are deliberately conservative rather than optimistic.
 */
function probeEnvironment(): TierEnvironment {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const coarsePointer =
    typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  return {
    requested: readTierRequest(window.location.search),
    isMobile: coarsePointer || mobileAgent,
    viewportWidth: window.innerWidth,
    hardwareConcurrency: navigator.hardwareConcurrency ?? CONSTRAINED_CORES_FALLBACK,
    deviceMemory: navigatorWithMemory.deviceMemory ?? null,
  };
}

/** Used when the browser does not report a core count; treats the device as low-end. */
const CONSTRAINED_CORES_FALLBACK = 4;

declare global {
  interface Window {
    __ENDLESS_DRIVER__?: EndlessDriverDebugHandle;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#viewport-canvas');
const overlayRoot = document.querySelector<HTMLElement>('#diagnostics-overlay');
const studioPanelRoot = document.querySelector<HTMLElement>('#studio-panel');
const creditsButton = document.querySelector<HTMLButtonElement>('#credits-toggle');
const creditsRoot = document.querySelector<HTMLElement>('#credits-root');
const statusElement = document.querySelector<HTMLElement>('#scene-status');
if (creditsButton && creditsRoot) {
  void new CreditsPanel(creditsButton, creditsRoot).load();
}

function setStatus(message: string | null, tone: 'info' | 'error' = 'info'): void {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message ?? '';
  statusElement.dataset['tone'] = tone;
}

function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Unable to start the 3D scene: ${message}`, 'error');
  console.error('Endless Driver failed to start.', error);
}

function isDebugEnabled(): boolean {
  if (!RENDER_CONFIG.diagnostics.exposeDebugHandle) {
    return false;
  }
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
}

async function startDrivingScene(): Promise<void> {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  setStatus('Loading physics engine…', 'info');

  let application: Application;
  let minimap: Minimap | null = null;
  try {
    // Two async preconditions before the first frame: Rapier ships as WebAssembly and has to
    // initialise before the vehicle can be wired, and `WebGPURenderer` builds its device and
    // backend asynchronously. `start()` awaits the renderer and the environment HDRI.
    const rapier = await loadRapier();
    const { config, tier } = resolveRenderConfig();

    const startHour = readTimeRequest(window.location.search);
    const spawnId = readSpawnRequest(window.location.search);
    const options: ApplicationOptions = {
      canvas,
      rapier,
      overlayRoot,
      statusElement,
      config,
      worldConfig: WORLD_CONFIG,
      tier,
      clock: startHour === null ? undefined : { startHour },
      ...(spawnId === undefined ? {} : { spawnId }),
    };

    application = new Application(options);
    // Mobile driving surface: shows itself on touch devices; `?touch=1` forces it
    // (captures, desktop testing), `?touch=0` hides it everywhere.
    const touchRoot = document.querySelector<HTMLElement>('#touch-controls');
    if (touchRoot !== null) {
      const touchParam = new URLSearchParams(window.location.search).get('touch');
      if (touchParam !== '0') {
        application.attachTouchControls(touchRoot, { force: touchParam === '1' });
      }
    }
    await application.start();
    // Minimap HUD (owner request, 2026-10-18): heading-up scope with the road
    // and trail networks and an edge arrow to the next point of interest.
    // `?map=0` hides it for clean captures; a failure never blocks the boot.
    const mapParam = new URLSearchParams(window.location.search).get('map');
    if (mapParam !== '0') {
      try {
        minimap = new Minimap({
          sampler: application.terrainSampler,
          getPose: () => {
            const pose = application.car.getInterpolatedPose(
              application.physics.interpolationAlpha,
            );
            return {
              x: pose.position.x,
              z: pose.position.z,
              yaw: yawFromQuat(pose.rotation),
            };
          },
        });
      } catch (error) {
        console.warn('minimap unavailable:', (error as Error).message);
      }
    }
  } catch (error) {
    reportStartupFailure(error);
    return;
  }

  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => application.getDiagnostics(),
      cycleMinimapTarget: () => minimap?.cycleTarget().label ?? null,
      pause: () => {
        application.stop();
      },
      resume: () => {
        void application.start();
      },
      teleportCar: (x, z, yaw) => {
        application.teleportCar(x, z, yaw);
      },
    };
  }
}

/**
 * Boots the material studio.
 *
 * No Rapier and no vehicle, so the only async precondition is the renderer's device. The driving
 * scene's HUD is hidden rather than reused: half of its rows report vehicle state that does not
 * exist here, and a readout that lies is worse than no readout.
 */
async function startStudio(): Promise<void> {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  if (studioPanelRoot && readStudioRequest(window.location.search).showPanel) {
    studioPanelRoot.hidden = false;
  }
  if (overlayRoot) {
    overlayRoot.hidden = true;
  }
  setStatus('Loading the material studio…', 'info');

  let studio: StudioApplication;
  try {
    const { config, tier } = resolveRenderConfig();
    const startHour = readTimeRequest(window.location.search);
    const request = readStudioRequest(window.location.search);

    studio = await StudioApplication.create({
      canvas,
      config,
      tier,
      panelRoot: studioPanelRoot,
      statusElement,
      clock: startHour === null ? undefined : { startHour },
      ...(request.environmentId === undefined ? {} : { environmentId: request.environmentId }),
      ...(request.rotationDegrees === undefined
        ? {}
        : { rotationDegrees: request.rotationDegrees }),
      ...(request.focus === undefined ? {} : { focus: request.focus }),
      panel: request.showPanel,
    });
  } catch (error) {
    reportStartupFailure(error);
    return;
  }

  setStatus(null);
  window.addEventListener('resize', () => {
    studio.resize();
  });

  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => studio.getDiagnostics(),
      pause: () => {
        studio.dispose();
      },
      resume: () => undefined,
    };
  }
}

/**
 * Boots the prop inspector: the scene that shows a derived model at every level of detail.
 *
 * No Rapier and no vehicle, so the only async preconditions are the renderer's device and the model
 * itself — and the model is loaded *after* the first frame, so a slow download shows a lit stage
 * rather than a blank screen.
 */
async function startProps(): Promise<void> {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  const request = readStudioRequest(window.location.search);
  if (studioPanelRoot && request.showPanel) {
    studioPanelRoot.hidden = false;
  }
  if (overlayRoot) {
    overlayRoot.hidden = true;
  }
  setStatus('Loading the prop model…', 'info');

  let application: PropLabApplication;
  try {
    const { config, tier } = resolveRenderConfig();
    const startHour = readTimeRequest(window.location.search);
    const assetId = readModelRequest(window.location.search);

    application = await PropLabApplication.create({
      canvas,
      config,
      tier,
      panelRoot: studioPanelRoot,
      clock: startHour === null ? undefined : { startHour },
      ...(assetId === undefined ? {} : { assetId }),
      panel: request.showPanel,
    });
  } catch (error) {
    reportStartupFailure(error);
    return;
  }

  setStatus(null);
  window.addEventListener('resize', () => {
    application.resize();
  });

  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => application.getDiagnostics(),
      pause: () => {
        application.dispose();
      },
      resume: () => undefined,
    };
  }
}

/**
 * Boots the bounded Aohara Metropolis night-lighting slice (`?scene=city`).
 *
 * This look-dev scene has its own orbit camera and production lighting/post chain, but deliberately
 * no vehicle or physics. It is a visual prototype, not evidence that the city is already driveable.
 */
async function startCityNightScene(): Promise<void> {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  if (overlayRoot) {
    overlayRoot.hidden = true;
  }
  if (studioPanelRoot) {
    studioPanelRoot.hidden = true;
  }
  setStatus('Loading the Aohara city night-lighting preview…', 'info');

  let application: UrbanNightApplication;
  try {
    const { config, tier } = resolveRenderConfig();
    const startHour = readTimeRequest(window.location.search);
    application = await UrbanNightApplication.create({
      canvas,
      config,
      tier,
      ...(startHour === null ? {} : { hourOverride: startHour }),
    });
  } catch (error) {
    reportStartupFailure(error);
    return;
  }

  setStatus(null);
  window.addEventListener('resize', () => {
    application.resize();
  });

  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => application.getDiagnostics(),
      pause: () => {
        application.dispose();
      },
      resume: () => undefined,
    };
  }
}

/**
 * Boots the validation route: the 2 km strip under one of its fixed camera bookmarks.
 *
 * No Rapier and no vehicle, for the same reason the other look-dev scenes are separate
 * composition roots: the bookmarks have to be reachable without driving to them, or the
 * captures would measure the driving instead of the rendering. The driving HUD is hidden
 * rather than reused — it would report a vehicle that does not exist here.
 */
async function startRoute(): Promise<void> {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  if (overlayRoot) {
    overlayRoot.hidden = true;
  }
  if (studioPanelRoot) {
    studioPanelRoot.hidden = true;
  }
  setStatus('Loading the validation route…', 'info');

  let application: RouteApplication;
  try {
    const { config, tier } = resolveRenderConfig();
    const startHour = readTimeRequest(window.location.search);
    const bookmarkId = readBookmarkRequest(window.location.search);

    application = await RouteApplication.create({
      canvas,
      config,
      tier,
      ...(bookmarkId === undefined ? {} : { bookmarkId }),
      ...(startHour === null ? {} : { hourOverride: startHour }),
    });
  } catch (error) {
    reportStartupFailure(error);
    return;
  }

  setStatus(null);
  window.addEventListener('resize', () => {
    application.resize();
  });

  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => application.getDiagnostics(),
      pause: () => {
        application.dispose();
      },
      resume: () => undefined,
    };
  }
}

async function start(): Promise<void> {
  switch (readSceneRequest(window.location.search)) {
    case 'studio':
      await startStudio();
      return;
    case 'props':
      await startProps();
      return;
    case 'route':
      await startRoute();
      return;
    case 'city':
      await startCityNightScene();
      return;
    default:
      await startDrivingScene();
  }
}

void start();
