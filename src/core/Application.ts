import { CHASE_CAMERA_CONFIG, DEBUG_CAMERA_CONFIG, type CameraMode } from '../config/camera';
import { RENDER_CONFIG, type RenderConfig } from '../config/render';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierModule } from '../physics/RapierModule';
import { yawFromQuat, type Vec3 } from '../shared/vector';
import { DiagnosticsOverlay, type DiagnosticsSnapshot } from '../ui/DiagnosticsOverlay';
import { Car } from '../vehicles/Car';
import { CarVisual } from '../vehicles/CarVisual';
import type { VehiclePose, VehicleTelemetry } from '../vehicles/types';
import { ChaseCamera } from '../cameras/ChaseCamera';
import { InputManager } from '../input/InputManager';
import type { PerspectiveCamera } from 'three';
import { Engine, type FrameState } from './Engine';
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
export class Application {
  readonly #config: RenderConfig;
  readonly #worldConfig: WorldConfig;
  readonly #engine: Engine;
  readonly #scene: SceneManager;
  readonly #physics: PhysicsWorld;
  readonly #car: Car;
  readonly #carVisual: CarVisual;
  readonly #input: InputManager;
  readonly #chaseCamera: ChaseCamera;
  readonly #monitor: PerformanceMonitor;
  readonly #overlay: DiagnosticsOverlay | null;
  readonly #statusElement: HTMLElement | null;
  readonly #unsubscribers: readonly (() => void)[] = [];
  readonly #lastCameraTarget: Vec3 = { x: 0, y: 0, z: 0 };
  #cameraMode: CameraMode = 'chase';
  #hudTimer = 0;
  #firstFrameRendered = false;
  #disposed = false;

  constructor(options: ApplicationOptions) {
    this.#config = options.config ?? RENDER_CONFIG;
    this.#worldConfig = options.worldConfig ?? WORLD_CONFIG;

    this.#engine = new Engine({ canvas: options.canvas, config: this.#config });
    this.#scene = new SceneManager({
      canvas: options.canvas,
      config: this.#config,
      worldConfig: this.#worldConfig,
      aspect: this.#engine.viewport.aspect,
    });

    this.#physics = new PhysicsWorld({
      rapier: options.rapier,
      worldConfig: this.#worldConfig,
    });
    this.#car = new Car({ rapier: options.rapier, physics: this.#physics });

    this.#carVisual = new CarVisual();
    this.#scene.addObject(this.#carVisual.root);

    this.#chaseCamera = new ChaseCamera(CHASE_CAMERA_CONFIG, this.#engine.viewport.aspect);
    this.#input = new InputManager();
    this.#input.attach();

    this.#monitor = new PerformanceMonitor(this.#config.diagnostics.sampleWindow);
    this.#overlay =
      options.overlayRoot && this.#config.diagnostics.overlayEnabled
        ? new DiagnosticsOverlay({ root: options.overlayRoot })
        : null;
    this.#statusElement = options.statusElement ?? null;

    const initialPose = this.#car.getInterpolatedPose(0);
    this.#carVisual.sync(initialPose);
    this.#chaseCamera.snapTo(initialPose);
    this.#scene.focusSun(initialPose.position);
    this.#syncDebugCamera(initialPose, true);

    this.#unsubscribers = [
      this.#engine.onResize((viewport) => {
        this.#scene.resize(viewport);
        this.#chaseCamera.resize(viewport.aspect);
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
    this.#setStatus('Loading complete — drive with W A S D, Space handbrake, R reset, C camera.');
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

  get isRunning(): boolean {
    return this.#engine.isRunning;
  }

  start(): void {
    this.#physics.resetAccumulator();
    this.#input.reset();
    this.#engine.start();
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
    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    if (mode === 'orbit') {
      this.#syncDebugCamera(pose, true);
    } else {
      this.#chaseCamera.snapTo(pose);
    }
  }

  toggleCameraMode(): void {
    this.setCameraMode(this.#cameraMode === 'chase' ? 'orbit' : 'chase');
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
      cameraMode: this.#cameraMode,
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
        x: this.#car.position.x,
        y: this.#car.position.y,
        z: this.#car.position.z,
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
      this.#car.reset();
      this.#physics.resetAccumulator();
      const pose = this.#car.getInterpolatedPose(0);
      this.#chaseCamera.snapTo(pose);
      this.#syncDebugCamera(pose, true);
    }

    // 2. Physics advances in whole fixed steps; the car applies its impulses inside each step.
    this.#physics.update(delta);

    // 3. Presentation interpolates between the last two authoritative poses.
    const pose = this.#car.getInterpolatedPose(this.#physics.interpolationAlpha);
    this.#carVisual.sync(pose);
    this.#scene.focusSun(pose.position);

    if (this.#cameraMode === 'chase') {
      this.#chaseCamera.update(delta, pose, this.#car.telemetry);
    } else {
      this.#syncDebugCamera(pose);
      this.#scene.update(delta);
    }

    this.#engine.render(this.#scene.scene, this.#activeCamera());
    this.#monitor.record(delta);

    if (!this.#firstFrameRendered) {
      this.#firstFrameRendered = true;
      this.#setStatus(null);
    }

    this.#hudTimer += delta;
    if (this.#hudTimer >= this.#config.diagnostics.hudUpdateIntervalSeconds) {
      this.#hudTimer = 0;
      this.#overlay?.update(this.getDiagnostics());
    }
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
