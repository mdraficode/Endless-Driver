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
import {
  warmupProgressAsymptotic,
  warmupProgressFraction,
  waitForWithinBudget,
} from '../shared/budget';
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
import { PerspectiveCamera } from 'three';
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
import { prefetchAssetBytes, warmAssetHttpCache } from '../assets/AssetBytes';
import { readAssetManifest } from '../assets/AssetManifest';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import { buildSettleViews, type PrewarmView } from './settle-views';
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
   * Fires once the first frame has actually been submitted. The entrypoint uses it to arm the
   * passive fullscreen gesture retries: entering fullscreen swaps the display surface, and on
   * mobile GPUs that swap in the middle of the startup shader pre-compile (peak GPU load) can
   * black-screen the page.
   */
  readonly onFirstFrame?: () => void;
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
 * The main material pre-compile is awaited *in full* before the first frame — there is no
 * budget to expire.
 *
 * The scene's shaders can only be compiled in one of two places: before the first frame
 * (loading screen up, a moving bar) or during gameplay (in-frame GPU stalls that read as a
 * long freeze and can trip a weak GPU's watchdog — the "totally frozen after the game starts"
 * report). There is no third place. The 25 s budget (the old behaviour) expired on the
 * owner's device, where the full scene takes one to three minutes to compile: the first frame
 * then started over an unready pipeline and the game sat frozen until the remainder finished
 * in the background. On that GPU a budget can never be "long enough" without being "too
 * long" elsewhere, so the wait is now unbounded: fast GPUs finish in a few seconds (the wait
 * ends as soon as the compile does, no change), and on weak GPUs the loading bar creeps
 * forward for the whole time (`#awaitWarmupIndefinite`, asymptotic progress) so it reads as
 * visible work, not a stall. The loading screen's backstop still catches a truly dead
 * pipeline — it now fires on a progress *stall*, not a lifetime, so a legitimately slow
 * compile can never trip it.
 */
/**
 * How long the loading phase waits for the selected hero car model before the first frame.
 * The authored fallback (the roadster) stays *hidden* while the download runs, so the first
 * frame never shows the wrong car; the download overlaps terrain preparation, so a normal
 * connection adds no time. 60 s covers a slow mobile connection for the 2.9 MB model (the
 * earlier 20 s budget expired on the owner's device at about 20 s in and the roadster was
 * visible for the first moment of the drive before the swap). If the budget expires anyway,
 * the fail-soft kicks in: the roadster is revealed, the drive starts, and a late-arriving
 * model still swaps in during the drive.
 */
const HERO_CAR_READY_TIMEOUT_MS = 60_000;

/**
 * How long the loading bar waits for the visual upgrades (environment, look, surfaces, scanned
 * vegetation) before starting on the authored materials. Generous on purpose: the download is
 * ~28 MB, so a slow first-time connection can legitimately need a couple of minutes — but a dead
 * network must never park the player at 92% forever.
 */
const UPGRADES_READY_TIMEOUT_MS = 150_000;

/**
 * After the first frame, a WebGL2 context loss usually restores within a second or two. If the
 * browser never does, this grace period turns the silent freeze into a recoverable retry screen.
 * (A WebGPU device loss has no restore event at all and is surfaced immediately.)
 */
const GRAPHICS_LOST_GRACE_MS = 10_000;

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
  /** True once the main material pre-compile finished before the first frame. */
  #warmupComplete = false;
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
  readonly #onFirstFrame: (() => void) | null;
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
  #shadowCamera: PerspectiveCamera | null = null;
  #shadowCameraFieldOfView = 0;
  /**
   * The settle sweep's temporary camera: the CSM and sky are pointed at it per view, and it is
   * discarded when the sweep finishes. Null until the sweep creates it.
   */
  #settleCamera: PerspectiveCamera | null = null;
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
    this.#onFirstFrame = options.onFirstFrame ?? null;
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
    // Mid-drive switch: the player chose this, so the car stays visible (on the roadster)
    // while the new model is fetched rather than vanishing.
    const next = new PlayerCarVisual(model, { revealFallback: true });
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

  /**
   * Starts the renderer and the frame loop.
   *
   * Async because `WebGPURenderer` builds its device, backend, and node systems asynchronously.
   * What blocks the first frame: the spawn-adjacent ground and foliage, the selected hero car
   * model within HERO_CAR_READY_TIMEOUT_MS (the authored roadster stays hidden while it
   * downloads, so the first frame never shows the wrong car), the visual upgrades (environment
   * light, colour look, scanned road/terrain surfaces, scanned vegetation — all material
   * swaps, so they must land before the compiles that bake the final programs), the full
   * material pre-compile, and the full-frame pre-warm that leaves every GPU pipeline the real
   * frame uses (scene-pass MRT variants, the post chain's program, shadow depth) already
   * built. Every wait feeds the loading bar creeping progress so it reads as visible work, not
   * a stall — the first visible frame pays no pipeline-creation cost (the post-start freeze).
   */
  async start(): Promise<void> {
    // The network must not stack on top of the GPU. Everything the first drive can need — the
    // hero car and tree models (bytes kept, so their parse is scheduled, not accidental), the
    // road/terrain surfaces, the HDRIs, the LUT (bodies fetched and discarded, priming the
    // browser's HTTP cache for the loaders' own URL fetches) — starts downloading now, beside
    // terrain generation and the renderer init, instead of serially after the hero gate. On a
    // slow mobile link that is the difference between a load that is network-bound once and a
    // load that is network-bound three times in a row. Idempotent: the byte cache dedupes.
    void this.#prefetchStartupAssets();

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
            0.55 + boundedFraction * 0.3,
            'Preparing the nearby road, terrain and trees…',
          );
        },
      );
      // Gate the first frame on the selected hero car (bounded). The authored fallback is a
      // roadster and stays hidden while the 2.9 MB coupé loads, so the first frame never shows
      // the wrong car — the "Roadster, then Generic Sports Car" report.
      //
      // The bytes were already downloading beside the terrain (the t=0 asset prefetch), so this
      // phase is parse-only in the common case: `#loadCarModel` -> `loadModelAsset` finds the
      // bytes in the shared cache and parses them HERE. That is the deliberate fix for the
      // mid-terrain freeze — `GLTFLoader.parse` is a main-thread spike (meshopt decode plus
      // ~114k triangles), and it used to land whenever the download happened to finish, which
      // on mobile was in the middle of the 55-85% stage. The gate owns its parse now: one
      // bounded spike under a label that says what it is doing. On a very slow connection the
      // budget expires and the roadster is revealed as the fail-soft car; the parse then runs
      // on arrival and the model swaps in over the first seconds, as before.
      if (this.#carVisual.model === 'generic-sport-coupe') {
        const heroReady = await this.#awaitWarmupProgress(
          this.#loadCarModel(this.#carVisual),
          HERO_CAR_READY_TIMEOUT_MS,
          0.85,
          0.88,
          'Loading your car model…',
        );
        if (!heroReady) {
          this.#carVisual.revealFallback();
          console.info(
            'Endless Driver: the hero car was not ready in time; the drive starts on the authored roadster and the model swaps in as soon as it arrives.',
          );
        }
      }
      // Visual upgrades come next, still under the loading bar: environment lighting, the colour
      // look, the scanned road/terrain surfaces and the scanned vegetation. Every one of these
      // swaps materials (new textures, new model programs), so doing them here means the compile
      // pass below bakes the FINAL materials — and no recompile or texture upload lands on the
      // first seconds of gameplay. The old "after the overlay clears" waves were the post-start
      // lag: two full material re-variants plus model decode while the player is driving. The
      // download is bounded: a network stalled this long gets the game on the authored
      // materials rather than no game at all.
      await this.#awaitWarmupIndefinite(
        (async () => {
          await waitForWithinBudget(
            Promise.all([
              this.#loadEnvironment(),
              this.#loadLook(),
              this.#scene.loadContentSurfaces().catch((error: unknown) => {
                console.warn('surface upgrades unavailable; keeping authored materials:', error);
              }),
              this.#scene.loadDeferredContentAssets().catch((error: unknown) => {
                console.warn('scanned vegetation unavailable:', error);
              }),
            ]),
            UPGRADES_READY_TIMEOUT_MS,
          );
        })(),
        0.88,
        0.92,
        'Preparing the road surfaces, lighting and vegetation…',
      );
      // Build the frame graph and kick off creation of every pipeline in the real frame's
      // context, before the compile: the main compile below then produces exactly the
      // pipelines the first frame draws with — one full-scene compile, never two.
      this.#reportLoadingProgress(0.92, 'Warming up the graphics pipeline (first run is slower)…');
      if (!this.#engine.prepareFrameGraph(this.#scene.scene, this.#activeCamera())) {
        this.#reportLoadingError(
          'The graphics pipeline could not be prepared; the game cannot start.',
        );
        return;
      }
      // The main pre-compile is awaited in full: the shaders can only compile here or during
      // gameplay, and a weak GPU needs one to three minutes for the full scene. It compiles at
      // the scene pass's own render target and attachments (the variant the first frame draws
      // with) plus the post chain's full-screen program. Asymptotic progress keeps the bar
      // visibly creeping for however long the GPU needs.
      await this.#awaitWarmupIndefinite(
        this.#engine.compileFrameGraph(this.#scene.scene, this.#activeCamera()),
        0.92,
        0.97,
        'Warming up the graphics pipeline (first run is slower)…',
      );
      this.#warmupComplete = true;
      // Second pass: picks up the hero car's materials and anything the first pass missed;
      // everything else is a cache hit, so this pass is short.
      await this.#awaitWarmupIndefinite(
        this.#engine.compileFrameGraph(this.#scene.scene, this.#activeCamera()),
        0.97,
        0.985,
        'Warming up the car and effects…',
      );
      // Settle: render until the drawn workload is stable, then sweep the bounded off-screen
      // views of the playable area, then close back in the spawn context. The shadow depth
      // programs and the nested effect passes (SSAO/SSR internal quads) only an actual render
      // creates; the sweep makes the render cover the whole area the player can first drive
      // through, so nothing that becomes visible while driving compiles on its first gameplay
      // frame (the "stutter while driving a bit" residue). Bounded by render count and wall
      // clock so a pathological device starts the drive instead of parking at 99%.
      const spawnPose = this.#car.getInterpolatedPose(0);
      const settleViews = this.#buildSettleViews(spawnPose);
      const settle = this.#engine.prewarmSettle(this.#scene.scene, this.#activeCamera(), {
        views: settleViews,
        prepareView: (view) => this.#prepareSettleView(view, spawnPose),
      });
      await this.#awaitWarmupIndefinite(
        settle.then(() => undefined),
        0.985,
        0.99,
        'Finishing the first view…',
      );
      if ((await settle) === false) {
        // The settle render was a no-op (context lost mid-loading): report it rather than
        // starting a loop that cannot draw.
        this.#reportLoadingError(
          'The graphics pipeline could not be prepared; the game cannot start.',
        );
        return;
      }
      this.#endSettleSweep(spawnPose);
      this.#reportLoadingProgress(0.99, 'Starting the simulation…');
    }

    // Pre-build the whole physics window under the loading bar: the per-frame budget otherwise
    // builds it one chunk per frame, hitching the first seconds of driving while the ground
    // appears around the car.
    const settledPose = this.#car.getInterpolatedPose(0);
    this.#physics.syncTerrain({
      x: settledPose.position.x + this.#origin.offset.x,
      y: settledPose.position.y,
      z: settledPose.position.z + this.#origin.offset.z,
    });
    // A few simulation steps under the loading bar: the first gameplay step must not also build
    // the physics broad phase over the whole city. Traffic drifts a couple of frames — invisible.
    const preWarmPosition = { x: this.#car.position.x, z: this.#car.position.z };
    this.#physics.update(5 * this.#physics.fixedTimestep);
    if (
      Math.hypot(
        this.#car.position.x - preWarmPosition.x,
        this.#car.position.z - preWarmPosition.z,
      ) > 0.05
    ) {
      // A traffic body touched the car during the warm-up. Restore the authored spawn pose so
      // the drive always starts exactly where it was designed to start.
      this.#car.reset(this.#spawn.position, this.#spawn.yaw);
      this.#carEffects.reset();
      this.#carVisual.resetImpact();
      const settled = this.#car.getInterpolatedPose(0);
      this.#chaseCamera.snapTo(settled);
      this.#cockpitCamera.snapTo(settled, this.#car.telemetry);
      this.#syncDebugCamera(settled, true);
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
      warmupComplete: this.#warmupComplete,
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
      // The GPU is no longer in its startup shader pre-compile; from here a fullscreen
      // surface swap is safe, so the entrypoint may arm passive fullscreen retries.
      this.#onFirstFrame?.();
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

  /**
   * Starts every asset download the first drive can need, at t=0. Model files keep their bytes
   * (the parse is a scheduled main-thread spike, not an accidental one); everything else primes
   * the HTTP cache. Fail-soft and idempotent — the loaders' own fetches are the fallback, and
   * the byte cache dedupes.
   */
  async #prefetchStartupAssets(): Promise<void> {
    try {
      const manifest = await readAssetManifest();
      const modelFiles: string[] = [];
      const urlFiles: string[] = [];
      for (const asset of manifest.assets) {
        for (const file of asset.files) {
          if (asset.kind === 'model') {
            modelFiles.push(file.path);
          } else {
            urlFiles.push(file.path);
          }
        }
      }
      prefetchAssetBytes(modelFiles);
      warmAssetHttpCache(urlFiles);
    } catch (error) {
      // A missing manifest is an operator problem (stale checkout); the loaders report it
      // per-asset when they hit the same wall, and the game starts on authored assets.
      console.warn('asset prefetch unavailable; loaders fetch on demand:', error);
    }
  }

  /**
   * The off-screen warm-up views, in WORLD coordinates: a ring around the spawn (every side the
   * player can first approach the district from) plus high views over Aohara (the tower tops
   * and far-block casters no low view sees). The terrain sampler and the district config are
   * world-coordinate authorities, so the views are built in world space and converted to scene
   * coordinates (world minus the floating-origin offset) when they are placed.
   */
  #buildSettleViews(spawnPose: VehiclePose): readonly PrewarmView[] {
    const spawn = spawnPose.position;
    const heightAt = (x: number, z: number): number => {
      const height = this.#scene.sampleHeight(x, z);
      return height === null ? spawn.y : height;
    };
    return buildSettleViews({
      spawn: {
        x: spawn.x + this.#origin.offset.x,
        y: spawn.y,
        z: spawn.z + this.#origin.offset.z,
      },
      districtCenter: {
        x: AOHARA_DISTRICT_CONFIG.centerX,
        z: AOHARA_DISTRICT_CONFIG.centerZ,
      },
      heightAt,
    });
  }

  /**
   * Points the settle sweep's scene state at one view: a dedicated camera (the chase camera
   * keeps its own state), the CSM following it — the same focus behaviour gameplay uses, so the
   * view's shadow pass compiles the casters it covers — and the sky/moon centred on it. The
   * view is world-space; the scene, camera and sun focus are scene-space (the floating-origin
   * offset is horizontal, so heights pass through).
   */
  #prepareSettleView(view: PrewarmView, spawnPose: VehiclePose): void {
    if (this.#disposed) {
      return;
    }
    const offset = this.#origin.offset;
    const active = this.#activeCamera();
    if (this.#settleCamera === null) {
      this.#settleCamera = new PerspectiveCamera(
        active.fov,
        active.aspect,
        active.near,
        active.far,
      );
    }
    const camera = this.#settleCamera;
    camera.position.set(view.position[0] - offset.x, view.position[1], view.position[2] - offset.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(view.lookAt[0] - offset.x, view.lookAt[1], view.lookAt[2] - offset.z);
    this.#syncShadowCamera(camera);
    // World XZ straight into the height query; the sun focus takes scene coordinates.
    const groundY =
      this.#scene.sampleHeight(view.lookAt[0], view.lookAt[2]) ?? spawnPose.position.y;
    this.#scene.focusSun({
      x: view.lookAt[0] - offset.x,
      y: groundY,
      z: view.lookAt[2] - offset.z,
    });
    this.#scene.followCamera(camera.position);
  }

  /**
   * Restores the scene state the sweep moved: the CSM back on the real camera and the spawn
   * focus, the sky back on the spawn, and the sweep camera released. (The first gameplay frame
   * re-syncs all of this anyway; this keeps the closing settle render — and any diagnostic read
   * between settle and start — in the true first-frame context.)
   */
  #endSettleSweep(spawnPose: VehiclePose): void {
    const active = this.#activeCamera();
    this.#syncShadowCamera(active);
    // Scene coordinates, exactly as the frame loop feeds focusSun.
    this.#scene.focusSun(spawnPose.position);
    this.#scene.followCamera(active.position);
    this.#settleCamera?.dispose();
    this.#settleCamera = null;
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
   * Awaits a bounded warm-up pass while feeding the loading bar steady, visible progress
   * (from→to across the whole timeout window, reported every 250 ms). Returns true when the
   * pass finished within the budget; when it did not, the pass keeps finishing in the
   * background and the first frame picks up whatever is ready.
   */
  async #awaitWarmupProgress(
    task: Promise<unknown>,
    timeoutMs: number,
    from: number,
    to: number,
    label: string,
  ): Promise<boolean> {
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      if (this.#disposed) {
        return;
      }
      this.#reportLoadingProgress(
        warmupProgressFraction(performance.now() - startedAt, timeoutMs, from, to),
        label,
      );
    }, 250);
    try {
      return (await waitForWithinBudget(task, timeoutMs)) !== null;
    } finally {
      window.clearInterval(interval);
    }
  }

  /**
   * Awaits an *unbounded* pass while feeding the loading bar progress that approaches `to`
   * asymptotically (`warmupProgressAsymptotic`): the bar keeps visibly creeping however long a
   * weak GPU needs, and the loading screen's stall-based backstop keeps being refreshed by the
   * 250 ms ticks, so a legitimately slow compile can never trip it. Resolves only when the
   * pass itself finishes.
   */
  async #awaitWarmupIndefinite(
    task: Promise<void>,
    from: number,
    to: number,
    label: string,
    tauMs = 45_000,
  ): Promise<void> {
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      if (this.#disposed) {
        return;
      }
      this.#reportLoadingProgress(
        warmupProgressAsymptotic(performance.now() - startedAt, tauMs, from, to),
        label,
      );
    }, 250);
    try {
      await task;
    } finally {
      window.clearInterval(interval);
      if (!this.#disposed) {
        this.#reportLoadingProgress(to, label);
      }
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
