import {
  CHASE_CAMERA_CONFIG,
  CHASE_CAMERA_VIEWS,
  DEBUG_CAMERA_CONFIG,
  type CameraMode,
} from '../config/camera';
import {
  STEERING_SENSITIVITY_SCALE,
  type PlayerCarModel,
  type SteeringSensitivity,
  type TouchSteeringMode,
  type TrafficIntensity,
} from '../config/game-preferences';
import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { ROAD_NETWORK_CONFIG } from '../config/roads';
import { ORIGIN_CONFIG } from '../config/origin';
import { terrainConfigForTier } from '../config/terrain';
import { DEFAULT_TIER } from '../config/tiers';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { resolveSpawnPoint, type SpawnPoint } from '../config/spawns';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TerrainSampler } from '../world/terrain-height';
import { OriginManager } from '../world/origin';
import { applyCollisionResponse, TreeCollisionField } from '../world/tree-collision';
import { createWorldTerrainSampler } from '../world/world-terrain';
import type { RapierModule } from '../physics/RapierModule';
import { yawFromQuat, type Vec3 } from '../shared/vector';
import { DiagnosticsOverlay, type DiagnosticsSnapshot } from '../ui/DiagnosticsOverlay';
import type { LoadingProgress } from '../ui/LoadingScreen';
import { Car } from '../vehicles/Car';
import { CarEffects } from '../vehicles/CarEffects';
import { NitroBoost, type NitroBoostState } from '../vehicles/NitroBoost';
import { PlayerCarVisual } from '../vehicles/PlayerCarVisual';
import { resolveHighSpeedMotionBlurIntensity } from '../vehicles/vehicle-effects';
import type { VehiclePose, VehicleTelemetry } from '../vehicles/types';
import { ChaseCamera } from '../cameras/ChaseCamera';
import { CockpitCamera } from '../cameras/CockpitCamera';
import {
  CHASE_ORBIT_CONFIG,
  isDriveInputActive,
  shouldRecenterOrbitForDriveStart,
} from '../cameras/camera-orbit';
import { InputManager } from '../input/InputManager';
import { OrbitGesture } from '../input/orbit-gesture';
import { TouchControls } from '../input/TouchControls';
import type { PerspectiveCamera } from 'three';
import { DaylightController } from '../environment/DaylightController';
import { applyNightMoodToClock } from '../environment/night-mood';
import {
  applySurfaceState,
  resolveSurfaceState,
  type SurfaceState,
  type WeatherPreset,
} from '../environment/SurfaceState';
import {
  EnvironmentClock,
  type DaylightState,
  type EnvironmentClockOptions,
} from '../environment/EnvironmentClock';
import { Engine, type FrameState } from './Engine';
import { loadLutAsset } from '../assets/LutAsset';
import { applyTier, type TierResolution } from './QualityTier';
import { PerformanceMonitor } from './PerformanceMonitor';
import { SceneManager } from './SceneManager';

export interface ApplicationOptions {
  readonly canvas: HTMLCanvasElement;
  /** Loaded Rapier module; the composition root awaits `loadRapier()` before constructing. */
  readonly rapier: RapierModule;
  readonly config?: RenderConfig;
  readonly worldConfig?: WorldConfig;
  /** DOM node that hosts the diagnostics HUD. */
  readonly overlayRoot?: HTMLElement | null;
  /** DOM node used for status/error messages. */
  readonly statusElement?: HTMLElement | null;
  /** Reports completed startup stages and first-frame readiness to the splash UI. */
  readonly onLoadingProgress?: (progress: LoadingProgress) => void;
  /**
   * Reports a fatal loading-stage problem (first frame never renders, context lost before the
   * first frame, a frame handler fails during startup). The entrypoint should fail the loading
   * screen with a retry so a stalled or lost GPU never leaves the player at 99% over a black
   * canvas forever.
   */
  readonly onLoadingError?: (message: string) => void;
  /**
   * Reports a graphics-context loss *after* the first frame: the loop is stopped over a frozen
   * last frame (the "totally frozen" report), so the entrypoint should re-show the overlay in
   * its error state with a retry (reload) instead of leaving a silent freeze.
   */
  readonly onGraphicsLost?: (message: string) => void;
  /**
   * Resolved quality tier. Resolved at the entrypoint (it needs device probes) and reported here so
   * every diagnostics snapshot and performance statement can name the tier it was taken under.
   */
  readonly tier?: TierResolution;
  /** Time-of-day options; the entrypoint forwards the `?time=` debug switch through this. */
  readonly clock?: EnvironmentClockOptions | undefined;
  /** Persistent night-mood preset; ignored by the entrypoint when `?time=` explicitly overrides it. */
  readonly nightMood?: boolean;
  /** Pinned start (`?spawn=<id>`); omit for the default Aohara Metropolis start. */
  readonly spawnId?: string;
  /** Random source used only when `spawnId` is explicitly `random`; injectable for tests/captures. */
  readonly spawnRandom?: () => number;
  /** Persistent player-selected visual car model. */
  readonly carModel?: PlayerCarModel;
  /** Player-selected Aohara traffic activity budget. */
  readonly trafficIntensity?: TrafficIntensity;
  /** Deterministic preset (`?weather=clear|rain`) drives tire response and the bounded Aohara road sheen. */
  readonly weather?: WeatherPreset;
  /** Optional camera selected on startup. */
  readonly cameraMode?: CameraMode;
  /** Applied to normalized steering input after smoothing. */
  readonly steeringSensitivity?: SteeringSensitivity;
  /** Receives the live N₂O tank level for the on-screen boost gauge. */
  readonly onBoostState?: (state: NitroBoostState) => void;
}

type StatusTone = 'info' | 'error';

/**
 * Phase 2 composition root.
 *
 * Wires the engine, scene, physics world, vehicle, input, chase camera, and diagnostics together,
 * and owns the per-frame order of operations:
 *
 * 1. input is smoothed into actions and one-shot commands are consumed;
 * 2. the vehicle receives its intent before the world steps;
 * 3. physics advances in whole fixed steps (bounded catch-up);
 * 4. the render state is interpolated between the last two physics poses;
 * 5. the car mesh, chase camera, and shadow frustum follow the interpolated pose;
 * 6. the frame is rendered through the active camera and statistics are recorded.
 *
 * Ownership flows one way: Application owns everything below it; the systems never reach back up.
 * The vehicle never touches the renderer, and the renderer never touches physics.
 */
/**
 * localStorage key for the player's chosen chase distance view. The `:v2` suffix is a
 * one-time reset: the default view moved to Far with the wider FOV (owner request,
 * 2026-10-16), and a stored pre-retune choice would otherwise silently keep the
 * narrow framing the retune exists to remove.
 */
const CAMERA_VIEW_STORAGE_KEY = 'endless-driver:camera-view:v2';

/**
 * How long the application will wait for the first rendered frame after the loop starts before
 * it fails the loading screen with a retry. Generous on purpose: the first frame pays for shader
 * compilation of every material, and on a weak mobile GPU that can take many seconds. Short
 * enough that a truly stalled or lost pipeline is reported instead of hanging forever.
 */
const FIRST_FRAME_WATCHDOG_TIMEOUT_MS = 30_000;

/**
 * How long the loading phase will wait for the material pre-compile before starting the frame
 * loop. The wait is bounded: after the timeout the compile keeps finishing in the background
 * and the first frame picks up whatever is ready.
 */
const GRAPHICS_WARMUP_TIMEOUT_MS = 20_000;

/**
 * After the first frame, a WebGL2 context loss usually restores within a second or two. If the
 * browser never does, this grace period turns the silent freeze into a recoverable retry screen.
 * (A WebGPU device loss has no restore event at all and is surfaced immediately.)
 */
const GRAPHICS_LOST_GRACE_MS = 10_000;

function scheduleWhenIdle(callback: () => void, timeoutMs: number): void {
  if (typeof window === 'undefined') {
    setTimeout(callback, 0);
    return;
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: (deadline: { readonly didTimeout: boolean; timeRemaining(): number }) => void,
      options?: { timeout: number },
    ) => number;
  };
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(() => callback(), { timeout: timeoutMs });
  } else {
    window.setTimeout(callback, 250);
  }
}

export class Application {
  readonly #config: RenderConfig;
  readonly #worldConfig: WorldConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #physics: PhysicsWorld;
  readonly #car: Car;

  readonly #terrainSampler: TerrainSampler;
  #carVisual: PlayerCarVisual;
  #carModelLoadTask: Promise<boolean> | null = null;
  #carModelLoadVisual: PlayerCarVisual | null = null;
  #heroPreloadStarted = false;
  readonly #carEffects: CarEffects;
  readonly #input: InputManager;

  #touchControls: TouchControls | null = null;
  #orbitGesture: OrbitGesture | null = null;
  readonly #boostTank = new NitroBoost();
  readonly #onBoostState: ((state: NitroBoostState) => void) | null;

  #touchActive = false;
  readonly #chaseCamera: ChaseCamera;
  readonly #cockpitCamera: CockpitCamera;
  readonly #monitor: PerformanceMonitor;
  readonly #overlay: DiagnosticsOverlay | null;

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F2') {
      event.preventDefault();
      this.toggleDiagnostics();
    }
  };
  readonly #statusElement: HTMLElement | null;
  readonly #onLoadingProgress: ((progress: LoadingProgress) => void) | null;
  readonly #onLoadingError: ((message: string) => void) | null;
  readonly #onGraphicsLost: ((message: string) => void) | null;
  readonly #tier: TierResolution;
  readonly #steeringSensitivity: SteeringSensitivity;
  readonly #surfaceState: SurfaceState;
  readonly #clock: EnvironmentClock;
  readonly #daylightController: DaylightController;
  #daylight: DaylightState | null = null;
  readonly #unsubscribers: readonly (() => void)[] = [];
  readonly #lastCameraTarget: Vec3 = { x: 0, y: 0, z: 0 };
  #cameraMode: CameraMode = 'chase';

  #hudTimer = 0;
  #firstFrameRendered = false;
  // Guards the "first frame never renders" failure mode: if the loop starts but the first
  // rendered frame does not arrive in time (stalled pipeline, lost context, a throwing frame
  // handler), fail the loading screen with a retry instead of sitting at 99% over a black
  // canvas forever.
  #firstFrameWatchdogTimer: number | null = null;
  #firstFrameWatchdogDeadline: number | null = null;
  #loadingErrorReported = false;
  /** Grace timer for a post-first-frame WebGL2 context loss that never restores. */
  #contextLostGraceTimer: number | null = null;
  #environmentLoaded = false;
  #deferredAssetsStarted = false;
  #shadowCamera: PerspectiveCamera | null = null;
  #shadowCameraFieldOfView = 0;
  #disposed = false;
  /**
   * Floating origin: world coordinates are eternal, physics/render coordinates are
   * world - offset. Slides by whole chunks (see `OriginManager`) so nothing ever
   * computes far from an origin in float32.
   */
  readonly #origin = new OriginManager(ORIGIN_CONFIG);
  /** Rising-edge guard so one driving start triggers one camera recenter. */
  #driveInputActive = false;
  /** Vegetation collision/destruction truth (visuals mirror it via the scene). */
  readonly #treeField: TreeCollisionField;
  /** This session's start: chosen once, and where the reset key returns to. */
  readonly #spawn: SpawnPoint & { readonly position: readonly [number, number, number] };

  constructor(options: ApplicationOptions) {
    this.#tier = options.tier ?? { id: DEFAULT_TIER, reason: 'unresolved' };
    this.#config = options.config ?? applyTier(RENDER_CONFIG, this.#tier.id);
    this.#worldConfig = options.worldConfig ?? WORLD_CONFIG;
    this.#cameraMode = options.cameraMode ?? 'chase';
    this.#steeringSensitivity = options.steeringSensitivity ?? 'standard';
    this.#onBoostState = options.onBoostState ?? null;
    this.#surfaceState = resolveSurfaceState(options.weather ?? 'clear');

    // One terrain sampler feeds the visual chunks (via SceneManager's content) and the
    // physics heightfields: ground you see and ground you drive on are the same function.
    const terrainSampler = createWorldTerrainSampler(
      terrainConfigForTier(this.#tier.id),
      ROAD_NETWORK_CONFIG,
    );
    this.#terrainSampler = terrainSampler;
    this.#treeField = new TreeCollisionField(terrainSampler);
    // Aohara is the default game start. Explicit `?spawn=<id>` requests still select rural
    // districts, and `?spawn=random` opts into the previous per-session rotation.
    const spawnRandom = options.spawnId === 'random' ? (options.spawnRandom ?? Math.random)() : 0;
    const spawnPoint = resolveSpawnPoint(options.spawnId, spawnRandom);
    this.#spawn = {
      ...spawnPoint,
      position: [
        spawnPoint.x,
        terrainSampler.heightAt(spawnPoint.x, spawnPoint.z) + 0.7,
        spawnPoint.z,
      ],
    };
    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    this.#physics = new PhysicsWorld({
      rapier: options.rapier,
      worldConfig: this.#worldConfig,
    });
    // Terrain owns the ground from here; the spawn window must exist before the first step.
    this.#physics.enableTerrain(terrainSampler);
    // The driving-world factory also creates moving traffic bodies, so the shared physics world
    // must exist before streamed content is constructed.
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig: this.#worldConfig,
      physics: this.#physics,
      aspect: this.#engine.viewport.aspect,
      terrainSampler,
      renderer: this.#engine.renderer,
      qualityTier: this.#tier.id,
      surfaceState: this.#surfaceState,
      ...(options.trafficIntensity !== undefined
        ? { trafficIntensity: options.trafficIntensity }
        : {}),
    });
    this.#engine.setGodraysLight(this.#scene.godraysLight);

    this.#car = new Car({
      rapier: options.rapier,
      physics: this.#physics,
      spawnPosition: this.#spawn.position,
      spawnYaw: this.#spawn.yaw,
      // The generator supplies the surface identity; Phase 7 conditions modify its physical
      // response only, never infer friction from rendered pixels.
      surfaceProvider: (x, z) => {
        const surface = this.#physics.surfaceAt(x, z);
        return surface === null ? null : applySurfaceState(surface, this.#surfaceState);
      },
      groundNormalProvider: (x, z) =>
        terrainSampler.normalAt(x + this.#origin.offset.x, z + this.#origin.offset.z),
    });

    this.#carVisual = new PlayerCarVisual(options.carModel ?? 'generic-sport-coupe');
    this.#scene.addObject(this.#carVisual.root);

    this.#chaseCamera = new ChaseCamera(CHASE_CAMERA_CONFIG, this.#engine.viewport.aspect);
    this.#restoreCameraView();
    this.#chaseCamera.setGroundHeightProvider((x, z) =>
      terrainSampler.heightAt(x + this.#origin.offset.x, z + this.#origin.offset.z),
    );
    this.#cockpitCamera = new CockpitCamera(undefined, this.#engine.viewport.aspect);
    this.#cockpitCamera.setEyeAnchor(this.#carVisual.cockpitEyeAnchor);
    this.#cockpitCamera.snapTo(this.#car.getInterpolatedPose(0), this.#car.telemetry);
    // Free-space swipe orbits the chase camera, or looks around from the cockpit. The canvas is
    // the gesture surface and every on-screen control captures its own pointers, so thumbs on the
    // steering wheel and pedals never fight a finger looking around (owner request 2026-10-17).
    this.#orbitGesture = new OrbitGesture(options.canvas, {
      onSwipe: (dx, dy, viewportWidth) => {
        if (this.#cameraMode === 'cockpit') {
          this.#cockpitCamera.lookBySwipe(dx, dy, viewportWidth);
        } else {
          this.#chaseCamera.orbitBySwipe(dx, dy, viewportWidth);
        }
      },
    });
    this.#input = new InputManager();
    this.#input.attach();

    this.#monitor = new PerformanceMonitor(this.#config.diagnostics.sampleWindow);
    // The overlay always exists when a root is offered (so it can be summoned with
    // F2 / the touch 📊 button), but it only STARTS visible when the URL asks for
    // diagnostics — a plain player session never sees it.
    this.#overlay = options.overlayRoot
      ? new DiagnosticsOverlay({
          root: options.overlayRoot,
          initiallyVisible: this.#config.diagnostics.overlayEnabled,
        })
      : null;
    this.#statusElement = options.statusElement ?? null;
    this.#onLoadingProgress = options.onLoadingProgress ?? null;
    this.#onLoadingError = options.onLoadingError ?? null;
    this.#onGraphicsLost = options.onGraphicsLost ?? null;
    this.#carEffects = new CarEffects(this.#tier.id);
    this.#scene.addObject(this.#carEffects.root);
    this.#clock = new EnvironmentClock(options.clock);
    if (options.nightMood === true) {
      applyNightMoodToClock(this.#clock, true);
    }
    this.#daylightController = new DaylightController(this.#clock);

    this.#scene.setVegetationStateProvider((key) => this.#treeField.getVisualState(key));

    // Lighting is resolved before the first frame so the scene never renders with the baseline sun
    // while the clock says something else.
    this.#applyDaylight();

    // F2 summons/dismisses the diagnostics panel on desktop (touch uses its 📊 button).
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.#handleKeyDown);
    }

    const initialPose = this.#car.getInterpolatedPose(0);
    // The spawn collider is created now; build the surrounding terrain window a chunk per frame
    // so first-frame startup does not synchronously sample nine heightfields.
    this.#physics.syncTerrain(initialPose.position, 1);
    // The complete initial terrain and foliage windows are prepared in `start()`, after
    // renderer/assets are ready and before the first frame is submitted.
    this.#carVisual.sync(initialPose);
    this.#chaseCamera.snapTo(initialPose);
    this.#scene.focusSun(initialPose.position);
    this.#scene.followCamera(this.#chaseCamera.camera.position);
    this.#syncDebugCamera(initialPose, true);

    this.#unsubscribers = [
      this.#physics.addCollisionHandler((event) => {
        const carHandle = this.#car.body.handle;
        const bodyAIsCar = event.bodyA?.handle === carHandle;
        const bodyBIsCar = event.bodyB?.handle === carHandle;
        if (!event.started || (!bodyAIsCar && !bodyBIsCar)) {
          return;
        }
        const other = bodyAIsCar ? event.bodyB : event.bodyA;
        const carVelocity = this.#car.body.linvel();
        const otherVelocity = other?.linvel() ?? { x: 0, y: 0, z: 0 };
        const relativeSpeed = Math.hypot(
          carVelocity.x - otherVelocity.x,
          carVelocity.z - otherVelocity.z,
        );
        const carPosition = this.#car.body.translation();
        const otherPosition = other?.translation() ?? carPosition;
        const yaw = yawFromQuat(this.#car.rotation);
        const lateralOffset =
          (otherPosition.x - carPosition.x) * Math.cos(yaw) -
          (otherPosition.z - carPosition.z) * Math.sin(yaw);
        this.#carVisual.triggerImpact(relativeSpeed, lateralOffset);
      }),
      this.#engine.onResize((viewport) => {
        this.#scene.resize(viewport);
        this.#chaseCamera.resize(viewport.aspect);
        this.#cockpitCamera.resize(viewport.aspect);
        // Cascade splits are derived from the camera frustum, so the aspect change invalidates them.
        this.#shadowCamera = null;
      }),
      this.#engine.onFrame((frame) => {
        this.#renderFrame(frame);
      }),
      this.#engine.onContextLost(() => {
        // Before the first frame a lost context can never be "restored later" from the player's
        // point of view — the loop is stopped and the loading bar would sit at 99% over a black
        // canvas forever. Fail the loading screen instead.
        if (!this.#firstFrameRendered) {
          this.#reportLoadingError(
            'The graphics context was lost before the first frame could render. Retry reloads the game.',
          );
          return;
        }
        // After the first frame the loop is stopped over a frozen last frame — the "totally
        // frozen after the game starts" report. A WebGPU device loss has no restore event at
        // all, so surface it immediately; a WebGL2 context loss usually restores, but if the
        // browser never does, the grace timer turns the silent freeze into a retry screen.
        if (this.#engine.backend === 'webgpu') {
          this.#surfaceGraphicsLost();
          return;
        }
        this.#setStatus('Graphics context lost — waiting for the browser to restore it…', 'error');
        if (this.#contextLostGraceTimer !== null) {
          window.clearTimeout(this.#contextLostGraceTimer);
        }
        this.#contextLostGraceTimer = window.setTimeout(() => {
          this.#contextLostGraceTimer = null;
          if (this.#disposed || !this.#engine.isContextLost) {
            return;
          }
          this.#surfaceGraphicsLost();
        }, GRAPHICS_LOST_GRACE_MS);
      }),
      this.#engine.onContextRestored(() => {
        if (this.#contextLostGraceTimer !== null) {
          window.clearTimeout(this.#contextLostGraceTimer);
          this.#contextLostGraceTimer = null;
        }
        this.#setStatus('Graphics context restored.', 'info');
      }),
      this.#engine.onFrameError((error) => {
        // The engine's loop survives frame-handler exceptions, but during loading the player has
        // no other signal that something went wrong. Surface it on the loading screen (retry)
        // before the first frame, and on the status bar plus diagnostics afterwards.
        const message = error instanceof Error ? error.message : String(error);
        if (!this.#firstFrameRendered) {
          this.#reportLoadingError(
            `A frame failed before the first frame rendered (${message}). Retry reloads the game.`,
          );
          return;
        }
        this.#setStatus(`Frame error: ${message}`, 'error');
        this.#overlay?.update(this.getDiagnostics());
      }),
    ];

    this.#scene.setDebugCameraEnabled(this.#cameraMode === 'orbit');
    this.#engine.resize();
    this.#hudTimer = this.#config.diagnostics.hudUpdateIntervalSeconds;
    this.#setStatus('Preparing the renderer…');
    this.#overlay?.update(this.getDiagnostics());
  }

  get engine(): Engine {
    return this.#engine;
  }

  get sceneManager(): SceneManager {
    return this.#scene;
  }

  /** The shared terrain sampler (roads, heights, districts) — HUD maps read it. */
  get terrainSampler(): TerrainSampler {
    return this.#terrainSampler;
  }

  get physics(): PhysicsWorld {
    return this.#physics;
  }

  get car(): Car {
    return this.#car;
  }

  get telemetry(): VehicleTelemetry {
    return this.#car.telemetry;
  }

  get cameraMode(): CameraMode {
    return this.#cameraMode;
  }

  /** Current time of day in hours, and the resolved lighting state. */
  get clock(): EnvironmentClock {
    return this.#clock;
  }

  /** Applies the live home-menu lighting preset through the shared daylight pipeline. */
  setNightMood(enabled: boolean): void {
    applyNightMoodToClock(this.#clock, enabled);
    this.#applyDaylight();
  }

  /** Swaps only the player presentation; car selection must not rebuild physics or the renderer. */
  async setPlayerCarModel(model: PlayerCarModel): Promise<boolean> {
    if (this.#disposed) return false;
    if (this.#carVisual.model === model) {
      return model === 'generic-sport-coupe' ? this.#loadCarModel(this.#carVisual) : true;
    }

    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    const previous = this.#carVisual;
    const next = new PlayerCarVisual(model);
    next.setHeadlightsEnabled(this.#daylight?.isNight ?? false);
    next.sync(pose);
    this.#scene.addObject(next.root);
    this.#carVisual = next;
    // A pending hero load for the previous visual must not block the new one.
    if (this.#carModelLoadVisual === previous) {
      this.#carModelLoadTask = null;
      this.#carModelLoadVisual = null;
    }
    this.#scene.removeObject(previous.root);
    previous.dispose();

    if (this.#cameraMode === 'cockpit') {
      this.#cockpitCamera.setEyeAnchor(next.cockpitEyeAnchor);
      this.#cockpitCamera.snapTo(pose, this.#car.telemetry);
    }

    return model === 'generic-sport-coupe' ? this.#loadCarModel(next) : true;
  }

  get isRunning(): boolean {
    return this.#engine.isRunning;
  }

  /** Starts nonessential image/model upgrades only after the playable view is visible. */
  startDeferredAssetLoading(): void {
    if (this.#disposed || this.#deferredAssetsStarted) {
      return;
    }
    this.#deferredAssetsStarted = true;
    const schedule = (delayMs: number, task: () => void): void => {
      globalThis.setTimeout(() => {
        if (this.#disposed) {
          return;
        }
        scheduleWhenIdle(() => {
          if (!this.#disposed) {
            task();
          }
        }, 2_000);
      }, delayMs);
    };

    // Keep the follow-up work in small waves: the player gets a responsive first drive before
    // HDR, LUT, surface-map and scanned-model downloads compete for bandwidth or decode time.
    schedule(0, () => {
      void this.#loadEnvironment();
      void this.#loadLook();
      void this.#loadCarModel(this.#carVisual);
    });
    schedule(1_200, () => {
      void this.#scene.loadContentSurfaces().catch((error: unknown) => {
        console.warn('surface upgrades unavailable; keeping authored materials:', error);
      });
    });
    schedule(3_200, () => {
      void this.#scene.loadDeferredContentAssets().catch((error: unknown) => {
        console.warn('scanned vegetation unavailable:', error);
      });
    });
  }

  /**
   * Starts the renderer and the frame loop.
   *
   * Async because `WebGPURenderer` builds its device, backend, and node systems asynchronously.
   * Only the spawn-adjacent ground and foliage block the first frame. HDRI, LUT, surface maps,
   * scanned trees and the detailed hero model load in idle slices after the loading overlay clears.
   */
  async start(): Promise<void> {
    if (!this.#engine.isInitialized) {
      this.#reportLoadingProgress(0.2, 'Preparing the renderer…');
      await this.#engine.init();
      this.#carEffects.configureBackend(this.#engine.backend, this.#engine.renderer);
      this.#shadowCamera = null;
      this.#syncShadowCamera(this.#activeCamera());

      const initialPose = this.#car.getInterpolatedPose(0);
      const yaw = yawFromQuat(initialPose.rotation);
      const forwardSpeed = this.#car.telemetry.forwardSpeed;
      const worldFocus = {
        x: initialPose.position.x + this.#origin.offset.x,
        y: initialPose.position.y,
        z: initialPose.position.z + this.#origin.offset.z,
      };
      this.#setStatus('Preparing the nearby road and terrain…');
      this.#reportLoadingProgress(0.55, 'Preparing the playable area…');
      // Kick the hero model fetch early so it downloads while terrain builds, but do not block the first frame on it.
      let heroPreload: Promise<boolean> | null = null;
      if (!this.#heroPreloadStarted && this.#carVisual.model === 'generic-sport-coupe') {
        this.#heroPreloadStarted = true;
        heroPreload = this.#loadCarModel(this.#carVisual).catch(() => false);
      }
      await this.#scene.prepareInitialContent(
        worldFocus,
        {
          x: -Math.sin(yaw) * forwardSpeed,
          z: -Math.cos(yaw) * forwardSpeed,
        },
        (fraction) => {
          const boundedFraction = Number.isFinite(fraction)
            ? Math.min(1, Math.max(0, fraction))
            : 0;
          this.#reportLoadingProgress(
            0.55 + boundedFraction * 0.39,
            'Preparing the nearby road, terrain and trees…',
          );
        },
      );
      // Hero preload continues in the background; do not await it here.
      void heroPreload?.catch(() => undefined);
      this.#reportLoadingProgress(0.9, 'Warming up the graphics pipeline…');
      // Pre-compile the scene's materials while the loading screen is still up, and *wait* for
      // it (bounded). The first frames after start used to pay live shader-compile cost; on a
      // weak mobile GPU that long in-frame GPU work trips the watchdog and loses the context —
      // the "totally frozen after the game starts" report. `compile` is asynchronous in the
      // WebGPU renderer, so it yields to the loading UI instead of stalling it.
      await this.#warmupGraphics();
      this.#reportLoadingProgress(0.94, 'Starting the simulation…');
    }

    this.#physics.resetAccumulator();
    this.#input.reset();
    this.#driveInputActive = false;
    this.#engine.start();
    this.#armFirstFrameWatchdog();

    if (!this.#firstFrameRendered) {
      this.#setStatus(
        this.#touchActive
          ? 'Touch controls ready — steer with the selected wheel or arrows; hold N₂O for a quick boost, with or without GAS.'
          : 'Drive with W A S D; hold Shift for a quick N₂O boost, with or without throttle. Space handbrake, R reset, C camera.',
      );
    }
  }

  stop(): void {
    this.#input.reset();
    this.#onBoostState?.(this.#boostTank.deactivate());
    this.#driveInputActive = false;
    this.#engine.stop();
  }

  /** Switches between chase/cockpit gameplay cameras and the debug orbit camera. */
  setCameraMode(mode: CameraMode): void {
    if (mode === this.#cameraMode) {
      return;
    }
    this.#cameraMode = mode;
    this.#scene.setDebugCameraEnabled(mode === 'orbit');
    // The render camera changed, so the cascade splits have to be rebuilt for it.
    this.#shadowCamera = null;
    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    if (mode === 'orbit') {
      this.#syncDebugCamera(pose, true);
    } else if (mode === 'cockpit') {
      this.#cockpitCamera.resetLook();
      this.#cockpitCamera.snapTo(pose, this.#car.telemetry);
    } else {
      this.#chaseCamera.snapTo(pose);
    }
  }

  /**
   * Places the car at a world position instantly (capture/debug tooling exposed through
   * the `?debug=1` handle): the height comes from the shared sampler, so the car lands
   * exactly on the ground it would have driven to. Streaming recentres on the next
   * frames just as it does when driving.
   */
  teleportCar(x: number, z: number, yaw = 0): void {
    const y = this.#terrainSampler.heightAt(x, z);
    this.#car.reset([x - this.#origin.offset.x, y + 0.7, z - this.#origin.offset.z], yaw);
    this.#carEffects.reset();
    this.#carVisual.resetImpact();
    this.#physics.resetAccumulator();
    const pose = this.#car.getInterpolatedPose(0);
    this.#chaseCamera.snapTo(pose);
    this.#cockpitCamera.snapTo(pose, this.#car.telemetry);
    this.#syncDebugCamera(pose, true);
  }

  /** Shows/hides the diagnostics panel (F2, the touch 📊 button, the panel's × ). */
  setDiagnosticsVisible(visible: boolean): void {
    this.#overlay?.setVisible(visible);
  }

  toggleDiagnostics(): void {
    if (this.#overlay) {
      this.#overlay.setVisible(!this.#overlay.isVisible);
    }
  }

  get diagnosticsVisible(): boolean {
    return this.#overlay?.isVisible ?? false;
  }

  /**
   * Attaches the on-screen touch driving surface (mobile) to a DOM root. The surface
   * decides for itself whether the device wants it (coarse pointer, or forced for
   * captures); portrait rotation is handled by the in-page fallback. Desktop sessions
   * are untouched.
   */
  attachTouchControls(
    root: HTMLElement,
    options: {
      force?: boolean;
      steeringMode?: TouchSteeringMode;
      controlScalePercent?: number;
    } = {},
  ): void {
    this.#touchControls?.dispose();
    this.#touchControls = new TouchControls(root, {
      force: options.force ?? false,
      ...(options.steeringMode === undefined ? {} : { steeringMode: options.steeringMode }),
      ...(options.controlScalePercent === undefined
        ? {}
        : { controlScalePercent: options.controlScalePercent }),
      onState: (state) => {
        this.#input.setTouchState(state);
      },
      onCommand: (command) => {
        if (command === 'reset') {
          this.#input.requestReset();
        } else if (command === 'toggleDiagnostics') {
          this.toggleDiagnostics();
        } else {
          this.#input.requestToggleCamera();
        }
      },
    });
    this.#touchActive = !root.hidden;
  }

  /** Applies touch layout and scale edits immediately while the pause menu is open. */
  setTouchControlPreferences(steeringMode: TouchSteeringMode, controlScalePercent: number): void {
    this.#touchControls?.setPreferences(steeringMode, controlScalePercent);
  }

  /**
   * One press of the camera control (C / 📷), cycling Close → Normal → Far chase, debug orbit,
   * cockpit, then Close again. The chase distances glide between framings; the cockpit is a true
   * driver-seat view and free-space swipes look around from inside the cabin.
   */
  toggleCameraMode(): void {
    if (this.#cameraMode === 'orbit') {
      this.setCameraMode('cockpit');
    } else if (this.#cameraMode === 'cockpit') {
      this.#chaseCamera.setView(CHASE_CAMERA_VIEWS[0]!.id);
      this.setCameraMode('chase');
    } else if (
      this.#chaseCamera.view.id === CHASE_CAMERA_VIEWS[CHASE_CAMERA_VIEWS.length - 1]!.id
    ) {
      this.setCameraMode('orbit');
    } else {
      this.#chaseCamera.cycleView();
    }
    this.#rememberCameraView();
  }

  /** Restores/persists the player's distance view (never the debug orbit). */
  #rememberCameraView(): void {
    try {
      globalThis.localStorage?.setItem(CAMERA_VIEW_STORAGE_KEY, this.#chaseCamera.view.id);
    } catch {
      // Private-mode storage failures must never break the camera.
    }
  }

  #restoreCameraView(): void {
    try {
      const saved = globalThis.localStorage?.getItem(CAMERA_VIEW_STORAGE_KEY);
      if (saved !== null && saved !== undefined) {
        this.#chaseCamera.setView(saved);
      }
    } catch {
      // Same reasoning as above.
    }
  }

  getDiagnostics(): DiagnosticsSnapshot {
    const statistics = this.#monitor.snapshot();
    const render = this.#engine.getRenderStatistics();
    const viewport = this.#engine.viewport;
    const activeCamera = this.#activeCamera();
    const cameraPosition = activeCamera.position;
    const telemetry = this.#car.telemetry;
    const physics = this.#physics.statistics;
    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    const scene = this.#scene.getDiagnostics();

    return {
      qualityTier: this.#tier.id,
      tierReason: this.#tier.reason,
      timeOfDay: this.#clock.label,
      sunElevationDegrees: this.#daylight?.sunElevationDegrees ?? 0,
      isNight: this.#daylight?.isNight ?? false,
      rendererBackend: this.#engine.backend ?? 'pending',
      graphicsLost: this.#engine.isContextLost,
      frameErrors: {
        count: this.#engine.frameErrorCount,
        last:
          this.#engine.lastFrameError === null
            ? null
            : this.#engine.lastFrameError instanceof Error
              ? this.#engine.lastFrameError.message
              : String(this.#engine.lastFrameError),
      },
      particleSimulation: this.#carEffects.simulationMode,
      postProcessing: this.#engine.isPostProcessingEnabled,
      antialiasing: this.#config.postProcessing.antiAliasing,
      postEffects: this.#engine.postEffects,
      look: this.#engine.lookSize,
      focusDistance: this.#engine.focusDistance,
      renderScale: this.#engine.resolutionScale,
      shadowCascades: this.#config.shadows.csm.cascades,
      skyMode: scene.skyMode,
      environmentId: scene.environmentId,
      fogMode: scene.fogMode,
      spawnId: this.#spawn.id,
      spawnLabel: this.#spawn.label,
      framesPerSecond: statistics.averageFramesPerSecond,
      minimumFramesPerSecond: statistics.minimumFramesPerSecond,
      averageFrameTimeMilliseconds: statistics.averageFrameTimeMilliseconds,
      p95FrameTimeMilliseconds: statistics.p95FrameTimeMilliseconds,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      pixelRatio: viewport.pixelRatio,
      viewport: { width: viewport.width, height: viewport.height },
      cameraPosition: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
      sceneObjects: scene.objectCount,
      contentStats: {
        ...scene.contentStats,
        worldOriginOffsetX: this.#origin.offset.x,
        worldOriginOffsetZ: this.#origin.offset.z,
        worldOriginRebases: this.#origin.rebases,
      },
      totalFrames: this.#monitor.totalFrames,
      cameraMode: this.#cameraMode,
      cameraOrbit: {
        yawDegrees: (this.#chaseCamera.orbit.yaw * 180) / Math.PI,
        pitchDegrees: (this.#chaseCamera.orbit.pitch * 180) / Math.PI,
      },
      cameraView:
        this.#cameraMode === 'orbit'
          ? 'Orbit'
          : this.#cameraMode === 'cockpit'
            ? 'Cockpit'
            : this.#chaseCamera.view.label,
      cameraFov: activeCamera.fov,
      weather: this.#surfaceState.weather,
      wetness: this.#surfaceState.wetness,
      averageSurfaceGripModifier: telemetry.averageSurfaceGripModifier,
      averageSurfaceRollingResistance: telemetry.averageSurfaceRollingResistance,
      speedKph: telemetry.speedKph,
      forwardSpeed: telemetry.forwardSpeed,
      gear: telemetry.gear,
      rpm: telemetry.rpm,
      throttle: telemetry.throttle,
      brake: telemetry.brake,
      handbrake: telemetry.handbrake,
      steerAngleDegrees: (telemetry.steerAngle * 180) / Math.PI,
      contactCount: telemetry.contactCount,
      drifting: telemetry.drifting,
      slipAngleDegrees: (telemetry.slipAngle * 180) / Math.PI,
      distanceMeters: telemetry.distanceTravelled,
      physicsSteps: physics.stepsLastUpdate,
      physicsBodies: physics.bodies,
      physicsStalledFrames: physics.stalledFrames,
      physicsElapsedSeconds: physics.elapsedSeconds,
      carHeadingDegrees: (yawFromQuat(pose.rotation) * 180) / Math.PI,
      wheelSteerDegrees: pose.wheels.map((wheel) => (wheel.steerAngle * 180) / Math.PI),
      wheelSpinRadians: pose.wheels.map((wheel) => wheel.spinAngle),
      carPosition: {
        x: this.#car.position.x + this.#origin.offset.x,
        y: this.#car.position.y,
        z: this.#car.position.z + this.#origin.offset.z,
      },
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#disarmFirstFrameWatchdog();
    if (this.#contextLostGraceTimer !== null) {
      window.clearTimeout(this.#contextLostGraceTimer);
      this.#contextLostGraceTimer = null;
    }
    for (const unsubscribe of this.#unsubscribers) {
      unsubscribe();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.#handleKeyDown);
    }
    this.#orbitGesture?.dispose();
    this.#touchControls?.dispose();
    this.#touchControls = null;
    this.#input.detach();
    this.#car.dispose();
    this.#scene.removeObject(this.#carEffects.root);
    this.#carEffects.dispose();
    this.#scene.removeObject(this.#carVisual.root);
    this.#carVisual.dispose();
    this.#chaseCamera.dispose();
    this.#overlay?.dispose();
    this.#scene.dispose();
    this.#physics.dispose();
    this.#engine.dispose();
  }

  #renderFrame(frame: FrameState): void {
    const delta = frame.delta;

    // 1. Input becomes intent. Smoothing runs on frame time; the vehicle consumes it per step.
    this.#input.update(delta);
    const actions = this.#input.actions;
    const boostState = this.#boostTank.update(delta, actions.boost, this.#car.telemetry.gear > 0);
    this.#onBoostState?.(boostState);
    this.#car.setActions({
      ...actions,
      boost: boostState.active,
      steer: Math.max(
        -1,
        Math.min(1, actions.steer * STEERING_SENSITIVITY_SCALE[this.#steeringSensitivity]),
      ),
    });
    const driveInputActive = isDriveInputActive(
      actions.throttle,
      actions.brake,
      CHASE_ORBIT_CONFIG,
    );
    if (
      shouldRecenterOrbitForDriveStart(
        this.#driveInputActive,
        actions.throttle,
        actions.brake,
        CHASE_ORBIT_CONFIG,
      )
    ) {
      // A fresh drive input returns either free-look camera to the forward road view.
      this.#chaseCamera.resetOrbit();
      this.#cockpitCamera.resetLook();
    }
    this.#driveInputActive = driveInputActive;

    const commands = this.#input.consumeCommands();
    if (commands.toggleCamera) {
      this.toggleCameraMode();
    }
    if (commands.reset) {
      const spawn = this.#spawn;
      this.#car.reset(
        [
          spawn.position[0] - this.#origin.offset.x,
          spawn.position[1],
          spawn.position[2] - this.#origin.offset.z,
        ],
        spawn.yaw,
      );
      this.#carEffects.reset();
      this.#carVisual.resetImpact();
      this.#physics.resetAccumulator();
      const pose = this.#car.getInterpolatedPose(0);
      this.#chaseCamera.snapTo(pose);
      this.#cockpitCamera.resetLook();
      this.#cockpitCamera.snapTo(pose, this.#car.telemetry);
      this.#syncDebugCamera(pose, true);
    }

    // 1b. Vegetation collision: standing trunks near the car are tested against
    // the chassis (world space; the impulse lands on the body before the step,
    // so Rapier integrates the outcome). Real impacts mirror into the visuals.
    {
      const carWorldX = this.#car.position.x + this.#origin.offset.x;
      const carWorldZ = this.#car.position.z + this.#origin.offset.z;
      this.#treeField.sync(carWorldX, carWorldZ, 1);
      const linvel = this.#car.body.linvel();
      const hits = this.#treeField.evaluate(
        {
          x: carWorldX,
          z: carWorldZ,
          yaw: yawFromQuat(this.#car.rotation),
          velocityX: linvel.x,
          velocityZ: linvel.z,
          massKg: this.#car.body.mass(),
        },
        delta,
      );
      if (hits.length > 0) {
        for (const hit of hits) {
          this.#treeField.respond(this.#car.body, hit);
        }
        const impacts = hits.filter((hit) => hit.impact);
        if (impacts.length > 0) {
          this.#scene.applyVegetationHits(impacts);
          const strongest = impacts.reduce((best, hit) =>
            hit.impactSpeed > best.impactSpeed ? hit : best,
          );
          this.#carVisual.triggerImpact(strongest.impactSpeed, strongest.lateralOffset);
        }
      }
      // Buildings stop the car; poles fold. Same response contract as trees.
      const townHits = this.#scene.collideTown(
        {
          x: carWorldX,
          z: carWorldZ,
          yaw: yawFromQuat(this.#car.rotation),
          velocityX: linvel.x,
          velocityZ: linvel.z,
        },
        delta,
      );
      for (const hit of townHits) {
        applyCollisionResponse(this.#car.body, hit);
      }
      const strongestTownHit = townHits
        .filter((hit) => hit.impact)
        .reduce<(typeof townHits)[number] | null>(
          (best, hit) => (best === null || hit.impactSpeed > best.impactSpeed ? hit : best),
          null,
        );
      if (strongestTownHit !== null) {
        this.#carVisual.triggerImpact(strongestTownHit.impactSpeed, strongestTownHit.lateralOffset);
      }
    }

    // 2. Physics advances in whole fixed steps; the car applies its impulses inside each step.
    this.#physics.update(delta);

    // 2a. Floating origin: if the car has strayed past the precision bound, slide
    // the world under it (body, colliders, content root) in this one frame. World
    // coordinates do not change; only where the local origin sits beneath them.
    const shift = this.#origin.update(this.#car.position.x, this.#car.position.z);
    if (shift !== null) {
      this.#car.shiftBy(shift.dx, shift.dz);
      this.#carEffects.shiftBy(shift.dx, shift.dz);
      this.#physics.setOriginOffset(this.#origin.offset.x, this.#origin.offset.z);
      this.#scene.setWorldOffset(this.#origin.offset.x, this.#origin.offset.z);
      const settled = this.#car.getInterpolatedPose(0);
      this.#chaseCamera.snapTo(settled);
      this.#cockpitCamera.snapTo(settled, this.#car.telemetry);
      this.#syncDebugCamera(settled, true);
    }

    // 2b. Time advances, and time becomes light for the next frame.
    this.#daylight = this.#daylightController.update(delta, this.#scene, this.#engine);
    this.#carVisual.setHeadlightsEnabled(this.#daylight.isNight);

    // 3. Presentation interpolates between the last two authoritative poses.
    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    this.#carVisual.sync(pose);
    this.#carVisual.updateImpact(delta);
    this.#scene.focusSun(pose.position);
    // Ground follows the same point as the light: terrain chunks stream and heightfield
    // colliders slide their window with the car, each inside its own budget.
    const yaw = yawFromQuat(pose.rotation);
    const forwardSpeed = this.#car.telemetry.forwardSpeed;
    const worldFocus = {
      x: pose.position.x + this.#origin.offset.x,
      y: pose.position.y,
      z: pose.position.z + this.#origin.offset.z,
    };
    this.#scene.streamContent(
      worldFocus,
      {
        x: -Math.sin(yaw) * forwardSpeed,
        z: -Math.cos(yaw) * forwardSpeed,
      },
      delta,
    );
    this.#physics.syncTerrain(worldFocus, 1);
    this.#cockpitCamera.setEyeAnchor(this.#carVisual.cockpitEyeAnchor);

    if (this.#cameraMode === 'chase') {
      this.#chaseCamera.update(delta, pose, this.#car.telemetry);
    } else if (this.#cameraMode === 'cockpit') {
      this.#cockpitCamera.update(delta, pose, this.#car.telemetry);
    } else {
      this.#syncDebugCamera(pose);
    }
    // Content-owned systems (Aohara signal phases, for example) advance regardless of camera mode.
    this.#scene.update(delta);

    const activeCamera = this.#activeCamera();
    this.#carVisual.updateForCamera(activeCamera.position);
    const telemetry = this.#car.telemetry;
    this.#carEffects.update(delta, pose, telemetry, this.#car.wheels, this.#car.body.linvel());
    this.#engine.setMotionBlurIntensity(
      resolveHighSpeedMotionBlurIntensity(
        telemetry.speedKph,
        this.#config.postProcessing.motionBlur.intensity,
      ),
    );
    this.#syncShadowCamera(activeCamera);
    this.#scene.followCamera(activeCamera.position);
    // Only a frame that was actually submitted counts as the first frame: when the context is
    // lost the render is a silent no-op, and completing the loading screen over a black canvas
    // is exactly the "loading screen turns black" report.
    const rendered = this.#engine.render(this.#scene.scene, activeCamera);
    this.#monitor.record(delta);

    if (rendered && !this.#firstFrameRendered) {
      this.#firstFrameRendered = true;
      this.#disarmFirstFrameWatchdog();
      this.#reportLoadingProgress(1, 'Ready — the drive starts automatically');
      this.#setStatus(null);
    }

    // The car is the subject, so the car is what the lens focuses on: the focus plane sits at the
    // distance from the camera to the car's own centre, and the road ahead and the scenery behind fall
    // away from it. Smoothed in the engine, so a crest or a kerb does not snap the focus.
    const focusCamera = this.#activeCamera();
    this.#engine.focusOn(
      Math.hypot(
        focusCamera.position.x - pose.position.x,
        focusCamera.position.y - pose.position.y,
        focusCamera.position.z - pose.position.z,
      ),
    );

    this.#hudTimer += delta;
    if (this.#hudTimer >= this.#config.diagnostics.hudUpdateIntervalSeconds) {
      this.#hudTimer = 0;
      this.#overlay?.update(this.getDiagnostics());
    }
  }

  /**
   * Resolves the current time into lighting values and applies them.
   *
   * Called once before the first frame and then once per frame; both paths go through here, so
   * there is no way for the scene to be lit by a different sun than the one the clock reports.
   */
  #applyDaylight(): void {
    // `update(0, …)` advances nothing (the clock is either frozen or has already been advanced this
    // frame) and still resolves and applies the light, so the pre-first-frame call and the per-frame
    // call are the same code path. Player headlights consume this same resolved night gate.
    this.#daylight = this.#daylightController.update(0, this.#scene, this.#engine);
    this.#carVisual.setHeadlightsEnabled(this.#daylight.isNight);
  }

  #loadCarModel(visual: PlayerCarVisual): Promise<boolean> {
    if (this.#disposed || visual !== this.#carVisual || visual.model !== 'generic-sport-coupe') {
      return Promise.resolve(false);
    }
    if (visual.isHeroModelLoaded) return Promise.resolve(true);

    const pending = this.#carModelLoadTask;
    const pendingVisual = this.#carModelLoadVisual;
    if (pending !== null && pendingVisual === visual) {
      return pending;
    }
    // If a previous visual's load is still pending, abandon its tracking and start fresh for the current visual.
    if (pending !== null && pendingVisual !== null && pendingVisual !== visual) {
      // Do not chain on the stale task; it will clear itself when it settles.
      this.#carModelLoadTask = null;
      this.#carModelLoadVisual = null;
    }

    let task: Promise<boolean>;
    try {
      task = visual.load(this.#engine.renderer);
    } catch (error) {
      console.warn('hero model load could not start:', error);
      return Promise.resolve(false);
    }
    this.#carModelLoadTask = task;
    this.#carModelLoadVisual = visual;
    const clearTask = (): void => {
      if (this.#carModelLoadTask === task) {
        this.#carModelLoadTask = null;
        this.#carModelLoadVisual = null;
      }
    };
    void task.then(clearTask, clearTask);
    void task.catch((error: unknown) => {
      console.warn('hero model failed; keeping the authored fallback:', error);
    });
    return task;
  }

  /**
   * Loads the colour look and hands it to the renderer.
   *
   * Failure is not fatal, and it is not silent either: the frame renders ungraded — which is a correct
   * image — and the console says why. The alternatives are worse: refusing to start turns a missing
   * 100 KB file into a broken build, and starting with a half-applied grade is a bug nobody can see.
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
      console.info(
        `Endless Driver: colour look from "${asset.name}" (${asset.licence}, ${asset.creator})`,
      );
    } catch (error) {
      console.warn(
        'Endless Driver: the colour look could not be applied; rendering ungraded.',
        error,
      );
    }
  }

  /**
   * Loads the environment lighting once. Failure is not fatal: the scene keeps the procedural sky
   * and the directional sun, so a missing asset degrades the look instead of breaking the build.
   */
  async #loadEnvironment(): Promise<void> {
    if (this.#environmentLoaded) {
      return;
    }
    this.#environmentLoaded = true;
    const asset = await this.#scene.loadEnvironment();
    if (asset !== null) {
      console.info(
        `Endless Driver: environment lighting from "${asset.name}" (${asset.licence}, ${asset.creator})`,
      );
    }
  }

  /**
   * Keeps the cascade shadow maps pointed at the camera that is actually rendering.
   *
   * Rebuilding cascades is event-driven, not per-frame: `CSMShadowNode` caches its splits, so it is
   * told only when the camera identity or its field of view changes (mode switch, speed-based zoom,
   * resize).
   */
  #syncShadowCamera(camera: PerspectiveCamera): void {
    if (camera === this.#shadowCamera && camera.fov === this.#shadowCameraFieldOfView) {
      return;
    }
    this.#shadowCamera = camera;
    this.#shadowCameraFieldOfView = camera.fov;
    this.#scene.setShadowCamera(camera);
  }

  #activeCamera(): PerspectiveCamera {
    if (this.#cameraMode === 'orbit') {
      return this.#scene.camera;
    }
    return this.#cameraMode === 'cockpit' ? this.#cockpitCamera.camera : this.#chaseCamera.camera;
  }

  /**
   * Keeps the debug orbit camera riding along with the car: the camera and its orbit target move
   * by the same delta, so the operator's chosen angle and zoom survive while the car drives.
   */
  #syncDebugCamera(pose: VehiclePose, snap = false): void {
    const controls = this.#scene.controls;
    const target = controls.target;
    const desiredX = pose.position.x;
    const desiredY = pose.position.y + DEBUG_CAMERA_CONFIG.targetHeight;
    const desiredZ = pose.position.z;

    const deltaX = desiredX - this.#lastCameraTarget.x;
    const deltaY = desiredY - this.#lastCameraTarget.y;
    const deltaZ = desiredZ - this.#lastCameraTarget.z;
    this.#lastCameraTarget.x = desiredX;
    this.#lastCameraTarget.y = desiredY;
    this.#lastCameraTarget.z = desiredZ;

    if (snap) {
      const [offsetX, offsetY, offsetZ] = DEBUG_CAMERA_CONFIG.offset;
      target.set(desiredX, desiredY, desiredZ);
      this.#scene.camera.position.set(desiredX + offsetX, desiredY + offsetY, desiredZ + offsetZ);
      this.#scene.camera.lookAt(target);
      controls.update();
      return;
    }

    if (this.#cameraMode !== 'orbit') {
      return;
    }
    target.x += deltaX;
    target.y += deltaY;
    target.z += deltaZ;
    this.#scene.camera.position.x += deltaX;
    this.#scene.camera.position.y += deltaY;
    this.#scene.camera.position.z += deltaZ;
  }

  #reportLoadingProgress(progress: number, label: string): void {
    this.#onLoadingProgress?.({ progress, label });
  }

  /**
   * Fails the loading screen with a recoverable error (the retry button reloads the game) instead
   * of leaving the player at 99% over a black canvas. Only the first report wins: a stalled
   * pipeline may keep firing errors, and one visible failure is all the player needs.
   */
  #reportLoadingError(message: string): void {
    if (this.#loadingErrorReported || this.#disposed) {
      return;
    }
    this.#loadingErrorReported = true;
    this.#disarmFirstFrameWatchdog();
    this.#setStatus(message, 'error');
    console.error('Endless Driver loading failed:', message);
    this.#onLoadingError?.(message);
  }

  /**
   * The loop is stopped and the last frame is frozen on screen — the "totally frozen" report.
   * Re-show the loading overlay in its error state (the entrypoint wires it up) so the player
   * gets a visible, actionable retry (reload) instead of a silent freeze with a status pill.
   */
  #surfaceGraphicsLost(): void {
    this.#setStatus(
      'Graphics context lost — the game cannot continue. Use retry to reload.',
      'error',
    );
    console.error(
      'Endless Driver: graphics context lost after the first frame; the frame loop is stopped.',
    );
    this.#onGraphicsLost?.(
      'The game stopped because the graphics context was lost. Retry reloads the page.',
    );
  }

  /**
   * Pre-compiles the scene's materials during the loading phase, bounded by a timeout.
   *
   * The first frames after start used to pay live shader-compile cost; on a weak mobile GPU
   * that long in-frame GPU work is what trips the watchdog and loses the context (the freeze
   * report). `renderer.compile` is asynchronous in the WebGPU renderer, so it yields to the
   * loading UI; the timeout only stops *waiting* — the compile keeps finishing in the
   * background and the first frame picks up whatever is ready. On the WebGL2 fallback the
   * work is chunked with yields, so the loading bar keeps living through it.
   */
  async #warmupGraphics(timeoutMs = GRAPHICS_WARMUP_TIMEOUT_MS): Promise<void> {
    try {
      const compile = this.#engine.renderer
        .compile(this.#scene.scene, this.#activeCamera())
        .catch((error: unknown) => {
          console.warn('graphics warm-up failed; the first frame will compile on demand:', error);
        });
      await Promise.race([
        compile,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, timeoutMs);
        }),
      ]);
    } catch (error) {
      console.warn('graphics warm-up interrupted; the first frame will compile on demand:', error);
    }
  }

  /**
   * Fails the loading screen if the first rendered frame has not arrived within the timeout.
   *
   * `engine.start()` only schedules requestAnimationFrame callbacks; a stalled or lost pipeline
   * (GPU watchdog timeout, context loss before the first draw, a frame handler that throws
   * before the render) means the first frame may never come. Without this guard the loading bar
   * would sit at 99% forever — the "loading screen gets stuck randomly" report.
   */
  #armFirstFrameWatchdog(): void {
    if (this.#firstFrameWatchdogTimer !== null || this.#disposed || this.#firstFrameRendered) {
      return;
    }
    this.#firstFrameWatchdogDeadline = performance.now() + FIRST_FRAME_WATCHDOG_TIMEOUT_MS;
    this.#firstFrameWatchdogTimer = window.setInterval(() => {
      if (this.#disposed || this.#firstFrameRendered || this.#loadingErrorReported) {
        this.#disarmFirstFrameWatchdog();
        return;
      }
      const deadline = this.#firstFrameWatchdogDeadline;
      if (deadline !== null && performance.now() >= deadline) {
        this.#reportLoadingError(
          'The first frame has not rendered yet — the graphics pipeline may have stalled. Retry reloads the game.',
        );
      }
    }, 1000);
  }

  #disarmFirstFrameWatchdog(): void {
    if (this.#firstFrameWatchdogTimer !== null) {
      window.clearInterval(this.#firstFrameWatchdogTimer);
      this.#firstFrameWatchdogTimer = null;
    }
    this.#firstFrameWatchdogDeadline = null;
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
