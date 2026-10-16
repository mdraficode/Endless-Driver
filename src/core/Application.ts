import {
  CHASE_CAMERA_CONFIG,
  CHASE_CAMERA_VIEWS,
  DEBUG_CAMERA_CONFIG,
  type CameraMode,
} from '../config/camera';
import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { ROAD_NETWORK_CONFIG } from '../config/roads';
import { ORIGIN_CONFIG } from '../config/origin';
import { TERRAIN_CONFIG } from '../config/terrain';
import { VEHICLE_CONFIG } from '../config/vehicle';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TerrainSampler } from '../world/terrain-height';
import { OriginManager } from '../world/origin';
import { applyCollisionResponse, TreeCollisionField } from '../world/tree-collision';
import { createWorldTerrainSampler } from '../world/world-terrain';
import type { RapierModule } from '../physics/RapierModule';
import { yawFromQuat, type Vec3 } from '../shared/vector';
import { DiagnosticsOverlay, type DiagnosticsSnapshot } from '../ui/DiagnosticsOverlay';
import { Car } from '../vehicles/Car';
import { CarVisual } from '../vehicles/CarVisual';
import type { VehiclePose, VehicleTelemetry } from '../vehicles/types';
import { ChaseCamera } from '../cameras/ChaseCamera';
import { InputManager } from '../input/InputManager';
import { TouchControls } from '../input/TouchControls';
import type { PerspectiveCamera } from 'three';
import { DaylightController } from '../environment/DaylightController';
import {
  EnvironmentClock,
  type DaylightState,
  type EnvironmentClockOptions,
} from '../environment/EnvironmentClock';
import { Engine, type FrameState } from './Engine';
import { loadLutAsset } from '../assets/LutAsset';
import type { TierResolution } from './QualityTier';
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
  /**
   * Resolved quality tier. Resolved at the entrypoint (it needs device probes) and reported here so
   * every diagnostics snapshot and performance statement can name the tier it was taken under.
   */
  readonly tier?: TierResolution;
  /** Time-of-day options; the entrypoint forwards the `?time=` debug switch through this. */
  readonly clock?: EnvironmentClockOptions | undefined;
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

export class Application {
  readonly #config: RenderConfig;
  readonly #worldConfig: WorldConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #physics: PhysicsWorld;
  readonly #car: Car;

  readonly #terrainSampler: TerrainSampler;
  readonly #carVisual: CarVisual;
  readonly #input: InputManager;

  #touchControls: TouchControls | null = null;

  #touchActive = false;
  readonly #chaseCamera: ChaseCamera;
  readonly #monitor: PerformanceMonitor;
  readonly #overlay: DiagnosticsOverlay | null;

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F2') {
      event.preventDefault();
      this.toggleDiagnostics();
    }
  };
  readonly #statusElement: HTMLElement | null;
  readonly #tier: TierResolution;
  readonly #clock: EnvironmentClock;
  readonly #daylightController: DaylightController;
  #daylight: DaylightState | null = null;
  readonly #unsubscribers: readonly (() => void)[] = [];
  readonly #lastCameraTarget: Vec3 = { x: 0, y: 0, z: 0 };
  #cameraMode: CameraMode = 'chase';

  #hudTimer = 0;
  #firstFrameRendered = false;
  #environmentLoaded = false;
  #shadowCamera: PerspectiveCamera | null = null;
  #shadowCameraFieldOfView = 0;
  #disposed = false;
  /**
   * Floating origin: world coordinates are eternal, physics/render coordinates are
   * world - offset. Slides by whole chunks (see `OriginManager`) so nothing ever
   * computes far from an origin in float32.
   */
  readonly #origin = new OriginManager(ORIGIN_CONFIG);
  /** Vegetation collision/destruction truth (visuals mirror it via the scene). */
  readonly #treeField: TreeCollisionField;

  constructor(options: ApplicationOptions) {
    this.#config = options.config ?? RENDER_CONFIG;
    this.#worldConfig = options.worldConfig ?? WORLD_CONFIG;

    // One terrain sampler feeds the visual chunks (via SceneManager's content) and the
    // physics heightfields: ground you see and ground you drive on are the same function.
    const terrainSampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    this.#terrainSampler = terrainSampler;
    this.#treeField = new TreeCollisionField(terrainSampler);
    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig: this.#worldConfig,
      aspect: this.#engine.viewport.aspect,
      terrainSampler,
    });
    this.#engine.setGodraysLight(this.#scene.godraysLight);

    this.#physics = new PhysicsWorld({
      rapier: options.rapier,
      worldConfig: this.#worldConfig,
    });
    // Terrain owns the ground from here; the spawn window must exist before the first step.
    this.#physics.enableTerrain(terrainSampler);
    this.#car = new Car({
      rapier: options.rapier,
      physics: this.#physics,
      // The car asks the physics world what it stands on; the answer comes from the same
      // terrain weights the renderer blends, so grip follows looks by construction.
      surfaceProvider: (x, z) => this.#physics.surfaceAt(x, z),
      groundNormalProvider: (x, z) =>
        terrainSampler.normalAt(x + this.#origin.offset.x, z + this.#origin.offset.z),
    });

    this.#carVisual = new CarVisual();
    this.#scene.addObject(this.#carVisual.root);

    this.#chaseCamera = new ChaseCamera(CHASE_CAMERA_CONFIG, this.#engine.viewport.aspect);
    this.#restoreCameraView();
    this.#chaseCamera.setGroundHeightProvider((x, z) =>
      terrainSampler.heightAt(x + this.#origin.offset.x, z + this.#origin.offset.z),
    );
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
    this.#tier = options.tier ?? { id: 'B', reason: 'unresolved' };
    this.#clock = new EnvironmentClock(options.clock);
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
    this.#physics.syncTerrain(initialPose.position);
    // Pre-build the chunks under and around the car (the first budgeted calls happen here,
    // before the loading veil lifts); the rest of the square streams in over the first
    // seconds of driving, nearest first.
    for (let i = 0; i < 6; i += 1) {
      this.#scene.streamContent(initialPose.position);
    }
    this.#carVisual.sync(initialPose);
    this.#chaseCamera.snapTo(initialPose);
    this.#scene.focusSun(initialPose.position);
    this.#scene.followCamera(this.#chaseCamera.camera.position);
    this.#syncDebugCamera(initialPose, true);

    this.#unsubscribers = [
      this.#engine.onResize((viewport) => {
        this.#scene.resize(viewport);
        this.#chaseCamera.resize(viewport.aspect);
        // Cascade splits are derived from the camera frustum, so the aspect change invalidates them.
        this.#shadowCamera = null;
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

  get isRunning(): boolean {
    return this.#engine.isRunning;
  }

  /**
   * Starts the renderer and the frame loop.
   *
   * Async because `WebGPURenderer` builds its device, backend, and node systems asynchronously, and
   * the environment HDRI is fetched from the asset manifest after that. The first frame is only
   * scheduled once both are ready, so the loop never renders against a renderer that is still
   * initialising.
   */
  async start(): Promise<void> {
    if (!this.#engine.isInitialized) {
      await this.#engine.init();
      await this.#loadEnvironment();
      await this.#scene.loadContentSurfaces();
      await this.#loadLook();
      this.#shadowCamera = null;
      this.#syncShadowCamera(this.#activeCamera());
    }

    this.#physics.resetAccumulator();
    this.#input.reset();
    this.#engine.start();

    if (!this.#firstFrameRendered) {
      this.#setStatus(
        this.#touchActive
          ? 'Loading complete — steer with the left joystick, GAS/BRAKE on the right. Landscape works best.'
          : 'Loading complete — drive with W A S D, Space handbrake, R reset, C camera.',
      );
    }
  }

  stop(): void {
    this.#input.reset();
    this.#engine.stop();
  }

  /** Switches between the gameplay chase camera and the debug orbit camera. */
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
    this.#physics.resetAccumulator();
    const pose = this.#car.getInterpolatedPose(0);
    this.#chaseCamera.snapTo(pose);
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
   * captures); when active it also reveals the rotate-to-landscape prompt. Desktop
   * sessions are untouched.
   */
  attachTouchControls(root: HTMLElement, options: { force?: boolean } = {}): void {
    this.#touchControls?.dispose();
    this.#touchControls = new TouchControls(root, {
      force: options.force ?? false,
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
    if (this.#touchActive) {
      document.querySelector('#rotate-overlay')?.removeAttribute('hidden');
    }
  }

  /**
   * One press of the camera control (C / 📷), cycling the framings the player can
   * actually use: Close → Normal → Far chase distances, then the debug orbit, then
   * back to Close. The chase camera glides between distances; the choice persists.
   */
  toggleCameraMode(): void {
    if (this.#cameraMode === 'orbit') {
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
      cameraView: this.#cameraMode === 'orbit' ? 'Orbit' : this.#chaseCamera.view.label,
      cameraFov: activeCamera.fov,
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
    for (const unsubscribe of this.#unsubscribers) {
      unsubscribe();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.#handleKeyDown);
    }
    this.#touchControls?.dispose();
    this.#touchControls = null;
    this.#input.detach();
    this.#car.dispose();
    this.#scene.removeObject(this.#carVisual.root);
    this.#carVisual.dispose();
    this.#chaseCamera.dispose();
    this.#physics.dispose();
    this.#overlay?.dispose();
    this.#scene.dispose();
    this.#engine.dispose();
  }

  #renderFrame(frame: FrameState): void {
    const delta = frame.delta;

    // 1. Input becomes intent. Smoothing runs on frame time; the vehicle consumes it per step.
    this.#input.update(delta);
    this.#car.setActions(this.#input.actions);

    const commands = this.#input.consumeCommands();
    if (commands.toggleCamera) {
      this.toggleCameraMode();
    }
    if (commands.reset) {
      const spawn = VEHICLE_CONFIG.spawn;
      this.#car.reset(
        [
          spawn.position[0] - this.#origin.offset.x,
          spawn.position[1],
          spawn.position[2] - this.#origin.offset.z,
        ],
        spawn.yaw,
      );
      this.#physics.resetAccumulator();
      const pose = this.#car.getInterpolatedPose(0);
      this.#chaseCamera.snapTo(pose);
      this.#syncDebugCamera(pose, true);
    }

    // 1b. Vegetation collision: standing trunks near the car are tested against
    // the chassis (world space; the impulse lands on the body before the step,
    // so Rapier integrates the outcome). Real impacts mirror into the visuals.
    {
      const carWorldX = this.#car.position.x + this.#origin.offset.x;
      const carWorldZ = this.#car.position.z + this.#origin.offset.z;
      this.#treeField.sync(carWorldX, carWorldZ);
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
    }

    // 2. Physics advances in whole fixed steps; the car applies its impulses inside each step.
    this.#physics.update(delta);

    // 2a. Floating origin: if the car has strayed past the precision bound, slide
    // the world under it (body, colliders, content root) in this one frame. World
    // coordinates do not change; only where the local origin sits beneath them.
    const shift = this.#origin.update(this.#car.position.x, this.#car.position.z);
    if (shift !== null) {
      this.#car.shiftBy(shift.dx, shift.dz);
      this.#physics.setOriginOffset(this.#origin.offset.x, this.#origin.offset.z);
      this.#scene.setWorldOffset(this.#origin.offset.x, this.#origin.offset.z);
      const settled = this.#car.getInterpolatedPose(0);
      this.#chaseCamera.snapTo(settled);
      this.#syncDebugCamera(settled, true);
    }

    // 2b. Time advances, and time becomes light for the next frame.
    this.#daylight = this.#daylightController.update(delta, this.#scene, this.#engine);

    // 3. Presentation interpolates between the last two authoritative poses.
    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    this.#carVisual.sync(pose);
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
    this.#physics.syncTerrain(worldFocus);

    if (this.#cameraMode === 'chase') {
      this.#chaseCamera.update(delta, pose, this.#car.telemetry);
    } else {
      this.#syncDebugCamera(pose);
      this.#scene.update(delta);
    }

    const activeCamera = this.#activeCamera();
    this.#syncShadowCamera(activeCamera);
    this.#scene.followCamera(activeCamera.position);
    this.#engine.render(this.#scene.scene, activeCamera);
    this.#monitor.record(delta);

    if (!this.#firstFrameRendered) {
      this.#firstFrameRendered = true;
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
    // call are the same code path.
    this.#daylight = this.#daylightController.update(0, this.#scene, this.#engine);
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
    return this.#cameraMode === 'orbit' ? this.#scene.camera : this.#chaseCamera.camera;
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

  #setStatus(message: string | null, tone: StatusTone = 'info'): void {
    const element = this.#statusElement;
    if (!element) {
      return;
    }
    element.textContent = message ?? '';
    element.dataset['tone'] = tone;
  }
}
