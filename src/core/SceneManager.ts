import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import {
  loadEnvironmentAsset,
  loadHdrTexture,
  type EnvironmentAsset,
} from '../assets/AssetManifest';
import type { RenderConfig } from '../config/render';
import { WORLD_CONFIG, type WorldConfig } from '../config/world';
import type { Vec3 } from '../shared/vector';
import { createAtmosphereSky } from '../shaders/atmosphere-sky';
import { createGroundGridColorNode, linearColor } from '../shaders/ground-grid';
import type { Viewport } from './Engine';

export interface SceneManagerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly aspect: number;
}

export interface SceneDiagnostics {
  readonly objectCount: number;
  /** Backdrop currently drawn: the procedural Preetham sky or an HDRI background. */
  readonly skyMode: 'procedural' | 'hdri';
  /** Manifest id of the HDRI lighting the scene, or `null` while only the sun lights it. */
  readonly environmentId: string | null;
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
}

/** Sun/shadow focus quantization in meters; keeps the shadow map from crawling under motion. */
const SHADOW_FOCUS_SNAP = 2;

/** Degrees to radians. */
const DEG_TO_RAD = Math.PI / 180;

/**
 * Owns the scene graph: sky, lighting, the static arena ground, the debug orbit camera, and the
 * environment lighting.
 *
 * Phase 3 responsibilities:
 * - the sky is a Preetham atmosphere model (`SkyMesh`, TSL) instead of a hand-written gradient
 *   shader, so the horizon, sun disc, and cloud layer respond to the same sun direction the shadow
 *   camera and the fog colour use;
 * - image-based lighting comes from a verified CC0 HDRI resolved through the asset manifest, so the
 *   scene reflects a real captured environment while remaining licence-auditable;
 * - shadows are cascaded (`CSMShadowNode`) so the car keeps a crisp shadow at distance without the
 *   single shadow camera either ballooning or being forced to chase it;
 * - the ground grid is a TSL node material. It used to be a GLSL patch injected through
 *   `onBeforeCompile`, which does not exist on the WebGPU backend; `npm run guard:glsl` now forbids
 *   that API from returning.
 *
 * Every resource created here is released in `dispose`. The ground and obstacles remain temporary
 * placeholders for the procedural world planned in Phase 4.
 */
export class SceneManager {
  readonly scene: Scene;
  /** Debug orbit camera. Gameplay renders through the chase camera owned by the application. */
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly #config: RenderConfig;
  readonly #sky: SkyMesh;
  readonly #sun: DirectionalLight;
  readonly #sunOffset: Vector3;
  readonly #sunTarget = new Vector3();
  readonly #csm: CSMShadowNode | null;
  readonly #fog: Fog | null;
  readonly #addedObjects = new Set<Object3D>();
  readonly #disposables: readonly (() => void)[];
  #environment: EnvironmentAsset | null = null;
  #environmentTexture: { dispose(): void } | null = null;
  #disposed = false;

  constructor(options: SceneManagerOptions) {
    const { config } = options;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1;

    this.#config = config;
    this.scene = new Scene();
    this.#fog = config.sky.fogEnabled
      ? new Fog(resolveFogColor(config), config.sky.fogNear, config.sky.fogFar)
      : null;
    this.scene.fog = this.#fog;

    this.camera = new PerspectiveCamera(
      config.camera.fov,
      aspect,
      config.camera.near,
      config.camera.far,
    );
    this.camera.position.set(...config.camera.position);
    this.camera.lookAt(...config.camera.target);

    this.controls = new OrbitControls(this.camera, options.canvas);
    this.controls.target.set(...config.camera.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = config.camera.dampingFactor;
    this.controls.minDistance = config.camera.minDistance;
    this.controls.maxDistance = config.camera.maxDistance;
    this.controls.maxPolarAngle = config.camera.maxPolarAngle;
    this.controls.update();

    this.#sky = createAtmosphereSky(config);
    const ground = createGround(worldConfig);
    const obstacles = createObstacles(worldConfig);
    const ambient = new AmbientLight(
      config.lighting.ambientColor,
      config.lighting.ambientIntensity,
    );
    this.#sun = createSun(config);
    this.#sunOffset = new Vector3(...config.lighting.sunPosition);
    this.#csm = attachCascades(this.#sun, config);

    this.scene.add(this.#sky, ground, ambient, this.#sun, this.#sun.target);
    if (obstacles.length > 0) {
      this.scene.add(...obstacles);
    }

    this.#disposables = [() => this.controls.dispose(), () => disposeObjectTree(this.scene)];
  }

  /**
   * Loads the configured HDRI from the asset manifest and lights the scene with it.
   *
   * Called once by the composition root after the renderer is initialised. Until (and if) the asset
   * resolves, the scene is lit by the procedural sky and the directional sun alone, which is a valid
   * — if flatter — look, never a black scene.
   */
  async loadEnvironment(): Promise<EnvironmentAsset | null> {
    if (this.#disposed || !this.#config.environment.enabled) {
      return null;
    }

    try {
      const asset = await loadEnvironmentAsset(this.#config.environment.assetId);
      if (asset === null) {
        return null;
      }
      const texture = await loadHdrTexture(asset.file);
      if (this.#disposed) {
        texture.dispose();
        return null;
      }
      this.scene.environment = texture;
      this.scene.environmentIntensity = this.#config.environment.intensity;
      this.scene.environmentRotation.y = this.#config.environment.rotationDegrees * DEG_TO_RAD;
      if (this.#config.environment.useAsBackground) {
        this.scene.background = texture;
        this.scene.backgroundIntensity = 1;
        // The HDRI *is* the backdrop on this tier (tier C). The procedural sky draws at the far
        // plane with depth writes off, so leaving it visible would paint straight over the HDRI.
        this.#sky.visible = false;
      }
      this.#environmentTexture = texture;
      this.#environment = asset;
    } catch (error) {
      console.warn(
        `could not load the environment HDRI (${this.#config.environment.assetId}); ` +
          'falling back to the procedural sky',
        error,
      );
    }
    return this.#environment;
  }

  /**
   * Advances camera damping. Only the debug camera needs per-frame updates; the chase camera is
   * driven by its own system.
   */
  update(delta: number): void {
    if (this.controls.enabled) {
      this.controls.update(delta);
    }
  }

  /** Enables or disables the debug orbit camera and its input handling. */
  setDebugCameraEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
    if (enabled) {
      this.controls.update();
    }
  }

  /** Adds a render object that the scene manager must dispose with the scene. */
  addObject(object: Object3D): void {
    this.#addedObjects.add(object);
    this.scene.add(object);
  }

  removeObject(object: Object3D): void {
    this.#addedObjects.delete(object);
    object.removeFromParent();
  }

  /**
   * Keeps the sky centred on the rendering camera. The dome is drawn at the far plane, so it is the
   * *direction* from the camera that matters: moving it along means the atmosphere never shears as
   * the car drives away from the origin.
   */
  followCamera(position: Vec3): void {
    this.#sky.position.set(position.x, position.y, position.z);
  }

  /**
   * Points the cascade shadow maps at the camera that is actually rendering.
   *
   * `CSMShadowNode` derives its cascade splits from a camera frustum and caches them, so this is
   * called whenever the active camera or its projection changes (mode switch, field-of-view change,
   * resize). It is cheap but not free, which is why it is event-driven rather than per-frame.
   *
   * Calls before the node's first render are deliberately ignored. `CSMShadowNode` initialises
   * itself lazily inside `setup()`, which only runs `_init()` while its `camera` is still null:
   *
   * - calling `updateFrustums()` first dereferences a null `mainFrustum` and throws;
   * - assigning `camera` first is worse — `setup()` then skips `_init()` permanently, so the
   *   cascades are never built at all and the scene silently loses its shadows.
   *
   * Both are real failures that only appear at runtime with a GPU, so the guard keys on
   * `mainFrustum`, which `_init()` creates and nothing else does.
   */
  setShadowCamera(camera: PerspectiveCamera): void {
    const csm = this.#csm;
    if (csm === null || csm.mainFrustum === null) {
      return;
    }
    csm.camera = camera;
    csm.updateFrustums();
  }

  /**
   * Moves the sun and its shadow focus to follow the vehicle.
   *
   * The focus is quantized to a couple of meters so the shadow map does not shimmer as the car
   * creeps forward, and the vertical focus stays at ground level so the shadow camera always points
   * at the surface shadows land on. Direction is what matters for a directional light; the cascade
   * splits do the rest.
   */
  focusSun(position: Vec3): void {
    const x = Math.round(position.x / SHADOW_FOCUS_SNAP) * SHADOW_FOCUS_SNAP;
    const z = Math.round(position.z / SHADOW_FOCUS_SNAP) * SHADOW_FOCUS_SNAP;
    this.#sunTarget.set(x, 0, z);
    this.#sun.target.position.copy(this.#sunTarget);
    this.#sun.position.set(x + this.#sunOffset.x, this.#sunOffset.y, z + this.#sunOffset.z);
    this.#sun.target.updateMatrixWorld();
    this.#sun.updateMatrixWorld();
  }

  /**
   * The debug camera's aspect follows the canvas. Cascades are not rebuilt here: the application
   * invalidates its shadow-camera cache on resize and re-syncs on the next frame, so there is
   * exactly one place that touches the cascade splits and one place to get the guard right.
   */
  resize(viewport: Viewport): void {
    this.camera.aspect = viewport.aspect;
    this.camera.updateProjectionMatrix();
  }

  getObjectCount(): number {
    let count = 0;
    this.scene.traverse(() => {
      count += 1;
    });
    return count;
  }

  getDiagnostics(): SceneDiagnostics {
    const { x, y, z } = this.camera.position;
    return {
      objectCount: this.getObjectCount(),
      skyMode: this.scene.background === null ? 'procedural' : 'hdri',
      environmentId: this.#environment?.id ?? null,
      cameraPosition: { x, y, z },
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#addedObjects.clear();
    this.scene.environment = null;
    this.scene.background = null;
    this.#environmentTexture?.dispose();
    this.#environmentTexture = null;
    for (const dispose of this.#disposables) {
      dispose();
    }
  }
}

/**
 * Fog colour for the configured sun elevation.
 *
 * Fog is what hides the end of the render distance, so it has to match the sky it is seen against: a
 * warm, hazy tint near the horizon at low sun, a cooler blue once the sun is high. Interpolating
 * between two endpoints keeps this a two-line rule while still being driven by the same sun the sky
 * and the shadows use - when a later phase animates the sun, this follows for free.
 */
function resolveFogColor(config: RenderConfig): Color {
  const [, sunY] = config.lighting.sunPosition;
  const length = Math.hypot(...config.lighting.sunPosition);
  const elevation = length > 0 ? sunY / length : 1;
  // 0 at the horizon, 1 once the sun is well up.
  const blend = Math.min(1, Math.max(0, (elevation - 0.08) / 0.35));
  return new Color(config.sky.fogColorHorizon).lerp(new Color(config.sky.fogColorDay), blend);
}

/**
 * Static obstacle meshes. These are still the Phase 1 reference blocks used as physics test targets;
 * the collider for each one is built by `PhysicsWorld` from the same definitions, so visuals and
 * colliders cannot drift apart. Phases 4-5 replace them with authored props.
 */
function createObstacles(worldConfig: WorldConfig): Mesh[] {
  return worldConfig.obstacles.map((obstacle) => {
    const material = new MeshStandardNodeMaterial({
      color: new Color(obstacle.color),
      roughness: 0.8,
      metalness: 0,
    });
    const mesh = new Mesh(new BoxGeometry(...obstacle.size), material);
    mesh.name = `obstacle-${obstacle.id}`;
    mesh.position.set(...obstacle.position);
    mesh.castShadow = obstacle.castShadow;
    mesh.receiveShadow = true;
    return mesh;
  });
}

function createGround(worldConfig: WorldConfig): Mesh {
  const { ground } = worldConfig;
  const material = new MeshStandardNodeMaterial({
    name: 'ground',
    roughness: ground.roughness,
    metalness: ground.metalness,
  });
  material.colorNode = ground.grid.enabled
    ? createGroundGridColorNode(ground)
    : uniform(linearColor(ground.color));

  const mesh = new Mesh(new PlaneGeometry(ground.size, ground.size), material);
  mesh.name = 'ground-plane';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Shadow-casting sun.
 *
 * With cascades the shadow camera no longer has to be a compromise between a tight focus around the
 * car and a usable range; each cascade covers a slice of the view frustum. The single-frustum values
 * in the config remain as the path used when cascades are disabled.
 */
function createSun(config: RenderConfig): DirectionalLight {
  const sun = new DirectionalLight(
    new Color(config.lighting.sunColor),
    config.lighting.sunIntensity,
  );
  sun.name = 'sun';
  sun.position.set(...config.lighting.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(config.shadows.mapSize, config.shadows.mapSize);
  sun.shadow.camera.left = -config.shadows.cameraBounds;
  sun.shadow.camera.right = config.shadows.cameraBounds;
  sun.shadow.camera.top = config.shadows.cameraBounds;
  sun.shadow.camera.bottom = -config.shadows.cameraBounds;
  sun.shadow.camera.near = config.shadows.cameraNear;
  sun.shadow.camera.far = config.shadows.cameraFar;
  sun.shadow.bias = config.shadows.bias;
  sun.shadow.normalBias = config.shadows.normalBias;
  // Only consulted by the VSM filter; ignored by PCF.
  sun.shadow.blurSamples = config.shadows.vsmBlurSamples;
  sun.target.name = 'sun-target';
  return sun;
}

/**
 * Attaches the cascaded shadow node to the sun's shadow.
 *
 * `AnalyticLightNode` checks `light.shadow.shadowNode` first and uses it verbatim when present, so
 * assigning it here is the whole integration. A single cascade is not cascaded shadows, so the
 * plain shadow path is used when the config asks for one.
 */
function attachCascades(sun: DirectionalLight, config: RenderConfig): CSMShadowNode | null {
  const { csm } = config.shadows;
  if (csm.cascades < 2) {
    return null;
  }
  const node = new CSMShadowNode(sun, {
    cascades: csm.cascades,
    maxFar: Math.min(csm.maxFar, config.camera.far),
    mode: csm.mode,
    lightMargin: csm.lightMargin,
  });
  // `fade` is a public property of the node; the pinned type definitions predate it.
  node.fade = csm.fade;
  sun.shadow.shadowNode = node;
  return node;
}

function disposeObjectTree(scene: Scene): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        materials.add(material);
      }
    } else {
      materials.add(object.material);
    }
  });

  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  scene.clear();
}
