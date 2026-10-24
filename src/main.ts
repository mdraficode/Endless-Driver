import './style.css';
import { Application, type ApplicationOptions } from './core/Application';
import { RENDER_CONFIG, applyRenderSwitches, type RenderConfig } from './config/render';
import { WORLD_CONFIG } from './config/world';
import { DEFAULT_SPAWN_ID, SPAWN_POINTS } from './config/spawns';
import {
  readGamePreferences,
  saveGamePreferences,
  type GamePreferences,
} from './config/game-preferences';
import { trafficVehicleCountFor } from './config/urban-city';
import { loadRapier } from './physics/RapierModule';
import {
  applyBackendOverride,
  applyTier,
  describeTierDetail,
  readBackendRequest,
  readTierRequest,
  resolveBackendPreference,
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
import { LandscapeFallback } from './ui/LandscapeFallback';
import { LoadingScreen } from './ui/LoadingScreen';
import { FullscreenOnStart } from './ui/FullscreenOnStart';
import { urlForSpawn } from './ui/StartLocationSelector';
import { PauseMenu } from './ui/PauseMenu';
import { yawFromQuat } from './shared/vector';
import { readWeatherPreset } from './environment/SurfaceState';
import { EnvironmentClock } from './environment/EnvironmentClock';

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
 * Resolves the render configuration for this device: tier first (pixel-ratio cap and shadow budget),
 * then an explicit backend request or the Android/WebGPU compatibility default, then the switchable
 * post effects — which come last so that `?dof=1` can re-enable on a constrained device what the tier
 * switched off, and `?lut=none` can remove a look without a code change.
 */
function resolveRenderConfig(preferences: GamePreferences = readGamePreferences()): {
  config: RenderConfig;
  tier: ReturnType<typeof resolveTier>;
} {
  const requestedTier =
    readTierRequest(window.location.search) ??
    (preferences.graphicsTier === 'auto' ? null : preferences.graphicsTier);
  const tier = resolveTier({ ...probeEnvironment(), requested: requestedTier });
  const requestedBackend = readBackendRequest(window.location.search);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const webGpuAvailable = typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined';
  const backendPreference = resolveBackendPreference(requestedBackend, {
    isAndroid,
    webGpuAvailable,
  });
  const config = applyRenderSwitches(
    applyBackendOverride(applyTier(RENDER_CONFIG, tier.id), backendPreference),
    window.location.search,
  );
  const backendNote =
    requestedBackend !== null
      ? `, backend forced to ${requestedBackend}`
      : isAndroid && webGpuAvailable
        ? ', Android WebGPU compatibility default: WebGL2'
        : '';
  console.info(`Endless Driver: ${describeTierDetail(tier)}${backendNote}`);
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

let canvas = document.querySelector<HTMLCanvasElement>('#viewport-canvas');
const appRoot = document.querySelector<HTMLElement>('#app');
const loadingRoot = document.querySelector<HTMLElement>('#loading-screen');
const loadingScreen = loadingRoot === null ? null : new LoadingScreen(loadingRoot);
const fullscreenOnStart = new FullscreenOnStart();
const landscapeFallback = appRoot === null ? null : new LandscapeFallback(appRoot);
const overlayRoot = document.querySelector<HTMLElement>('#diagnostics-overlay');
const studioPanelRoot = document.querySelector<HTMLElement>('#studio-panel');
const pauseToggleButton = document.querySelector<HTMLButtonElement>('#pause-toggle');
const pauseMenuRoot = document.querySelector<HTMLElement>('#pause-menu-root');
const creditsRoot = document.querySelector<HTMLElement>('#credits-root');
const creditsPanel = creditsRoot === null ? null : new CreditsPanel(creditsRoot);
if (creditsPanel !== null) void creditsPanel.load();
const statusElement = document.querySelector<HTMLElement>('#scene-status');

let drivingApplication: Application | null = null;
let drivingMinimap: Minimap | null = null;
let drivingPauseMenu: PauseMenu | null = null;
let driveRestartTask: Promise<void> | null = null;

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
  if (loadingRoot !== null && !loadingRoot.hidden) {
    loadingScreen?.fail(message);
  }
  console.error('Endless Driver failed to start.', error);
}

function persistPreference<K extends keyof GamePreferences>(
  key: K,
  value: GamePreferences[K],
): boolean {
  const current = readGamePreferences();
  const next = { ...current, [key]: value } as GamePreferences;
  return saveGamePreferences(next);
}

function clearTimeOverrideFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('time')) return;
  url.searchParams.delete('time');
  window.history.replaceState(window.history.state, '', url.toString());
}

function updateDriveUrl(spawnId: string | undefined, clearGraphicsOverride: boolean): void {
  const url = new URL(
    spawnId === undefined
      ? window.location.href
      : urlForSpawn(window.location.href, spawnId, DEFAULT_SPAWN_ID),
  );
  if (clearGraphicsOverride) url.searchParams.delete('tier');
  window.history.replaceState(window.history.state, '', url.toString());
}

function restartCurrentDrive(clearGraphicsOverride: boolean): void {
  void restartDriveInPlace(clearGraphicsOverride);
}

function applySpawnInPlace(spawnId: string, clearGraphicsOverride: boolean): void {
  void restartDriveInPlace(clearGraphicsOverride, spawnId);
}

async function restartDriveInPlace(
  clearGraphicsOverride: boolean,
  spawnId?: string,
): Promise<void> {
  if (driveRestartTask !== null) return driveRestartTask;

  const task = (async () => {
    try {
      updateDriveUrl(spawnId, clearGraphicsOverride);
      drivingPauseMenu?.dispose();
      drivingPauseMenu = null;
      drivingMinimap?.dispose();
      drivingMinimap = null;
      const previousApplication = drivingApplication;
      drivingApplication = null;
      previousApplication?.stop();
      previousApplication?.dispose();
      if (pauseToggleButton !== null) pauseToggleButton.hidden = true;

      // A fresh canvas lets the renderer honor newly selected graphics settings. Fullscreen is
      // requested on the persistent document root, so replacing only the canvas cannot exit it.
      if (canvas !== null) {
        const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
        canvas.replaceWith(nextCanvas);
        canvas = nextCanvas;
      }
      await startDrivingScene(true);
    } catch (error) {
      reportStartupFailure(error);
    }
  })();
  driveRestartTask = task;
  try {
    await task;
  } finally {
    if (driveRestartTask === task) driveRestartTask = null;
  }
}

function isDebugEnabled(): boolean {
  if (!RENDER_CONFIG.diagnostics.exposeDebugHandle) {
    return false;
  }
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
}

async function startDrivingScene(restarting = false): Promise<void> {
  void fullscreenOnStart.request();
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  landscapeFallback?.update();
  loadingScreen?.show(restarting ? 'Restarting your drive…' : undefined);
  loadingScreen?.update(
    0.05,
    restarting ? 'Preparing the restart…' : 'Loading the physics engine…',
  );
  setStatus(restarting ? 'Restarting the drive…' : 'Loading physics engine…', 'info');

  let application: Application | null = null;
  let minimap: Minimap | null = null;
  try {
    // Two async preconditions before the first frame: Rapier ships as WebAssembly and has to
    // initialise before the vehicle can be wired, and `WebGPURenderer` builds its device and
    // backend asynchronously. `start()` awaits the renderer and the environment HDRI.
    const rapier = await loadRapier();
    loadingScreen?.update(0.14, 'Physics ready — selecting the graphics profile…');
    const preferences = readGamePreferences();
    const startHour = readTimeRequest(window.location.search);
    const nightMood = startHour === null && preferences.nightMood;
    const menuNightMood =
      startHour === null
        ? preferences.nightMood
        : new EnvironmentClock({ startHour }).daylight().isNight;
    const effectivePreferences: GamePreferences = {
      ...preferences,
      graphicsTier: readTierRequest(window.location.search) ?? preferences.graphicsTier,
      nightMood: menuNightMood,
    };
    const { config, tier } = resolveRenderConfig(preferences);

    const spawnId = readSpawnRequest(window.location.search);
    const options: ApplicationOptions = {
      canvas,
      rapier,
      overlayRoot,
      statusElement,
      onLoadingProgress: ({ progress, label }) => loadingScreen?.update(progress, label),
      config,
      worldConfig: WORLD_CONFIG,
      tier,
      clock: startHour === null ? undefined : { startHour },
      nightMood,
      ...(spawnId === undefined ? {} : { spawnId }),
      carModel: preferences.carModel,
      trafficIntensity: preferences.trafficIntensity,
      weather: readWeatherPreset(window.location.search),
      cameraMode: preferences.cameraMode,
      steeringSensitivity: preferences.steeringSensitivity,
    };

    const activeApplication = new Application(options);
    application = activeApplication;
    drivingApplication = activeApplication;
    // Mobile driving surface: shows itself on touch devices; `?touch=1` forces it
    // (captures, desktop testing), `?touch=0` hides it everywhere.
    const touchRoot = document.querySelector<HTMLElement>('#touch-controls');
    if (touchRoot !== null) {
      const touchParam = new URLSearchParams(window.location.search).get('touch');
      if (touchParam !== '0') {
        activeApplication.attachTouchControls(touchRoot, { force: touchParam === '1' });
      }
    }
    await activeApplication.start();

    // Keep the minimap inside the app's stacking/rotation context and hide it while paused.
    // `?map=0` still disables it for clean captures.
    const mapParam = new URLSearchParams(window.location.search).get('map');
    if (mapParam !== '0') {
      try {
        minimap = new Minimap({
          sampler: activeApplication.terrainSampler,
          ...(appRoot === null ? {} : { parent: appRoot }),
          getPose: () => {
            const pose = activeApplication.car.getInterpolatedPose(
              activeApplication.physics.interpolationAlpha,
            );
            return {
              x: pose.position.x,
              z: pose.position.z,
              yaw: yawFromQuat(pose.rotation),
            };
          },
        });
        drivingMinimap = minimap;
      } catch (error) {
        console.warn('minimap unavailable:', (error as Error).message);
      }
    }

    if (pauseToggleButton !== null && pauseMenuRoot !== null) {
      const diagnostics = activeApplication.getDiagnostics();
      drivingPauseMenu = new PauseMenu({
        root: pauseMenuRoot,
        triggerButton: pauseToggleButton,
        preferences: effectivePreferences,
        spawnPoints: SPAWN_POINTS,
        currentSpawnId: diagnostics.spawnId,
        defaultSpawnId: DEFAULT_SPAWN_ID,
        activeTier: tier.id,
        activeRenderer: diagnostics.rendererBackend,
        activeTrafficVehicleCount: trafficVehicleCountFor(tier.id, preferences.trafficIntensity),
        onPause: () => {
          activeApplication.stop();
          if (minimap !== null) minimap.canvas.hidden = true;
        },
        onResume: () => {
          if (minimap !== null) minimap.canvas.hidden = false;
          void activeApplication.start().catch(reportStartupFailure);
        },
        onRestart: restartCurrentDrive,
        onApplySpawn: applySpawnInPlace,
        onPreferenceChange: (key, value) => {
          const saved = persistPreference(key, value);
          if (key === 'nightMood' && typeof value === 'boolean') {
            activeApplication.setNightMood(value);
            clearTimeOverrideFromUrl();
          }
          return saved;
        },
        onOpenCredits: (source) => creditsPanel?.open(source),
        isCreditsOpen: () => creditsPanel?.isOpen ?? false,
        onFullscreen: (event) => fullscreenOnStart.request(event),
      });
    }
  } catch (error) {
    drivingPauseMenu?.dispose();
    drivingPauseMenu = null;
    minimap?.dispose();
    drivingMinimap = null;
    if (application !== null) {
      application.stop();
      application.dispose();
      if (drivingApplication === application) drivingApplication = null;
    }
    if (pauseToggleButton !== null) pauseToggleButton.hidden = true;
    reportStartupFailure(error);
    return;
  }

  const activeApplication = application;
  if (activeApplication === null) return;
  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => activeApplication.getDiagnostics(),
      cycleMinimapTarget: () => minimap?.cycleTarget().label ?? null,
      pause: () => {
        activeApplication.stop();
        if (minimap !== null) minimap.canvas.hidden = true;
      },
      resume: () => {
        if (minimap !== null) minimap.canvas.hidden = false;
        void activeApplication.start().catch(reportStartupFailure);
      },
      teleportCar: (x, z, yaw) => {
        activeApplication.teleportCar(x, z, yaw);
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
