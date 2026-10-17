import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
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
import type { DaylightState } from '../environment/EnvironmentClock';
import type { Vec3 } from '../shared/vector';
import { scaleBaseline } from '../environment/daylight-levels';
import { createAtmosphereSky } from '../shaders/atmosphere-sky';
import type { Viewport } from './Engine';
import { createDrivingWorld } from '../world/DrivingWorld';
import type { SceneContent, SceneContentFactory } from '../world/WorldContent';
import type { TerrainSampler } from '../world/terrain-height';
import type { TreeHitEvent, TreeVisualState } from '../world/tree-collision';
import type { TownCarProbe, TownHit } from '../world/town';

export interface SceneManagerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly aspect: number;
  /**
   * What occupies the scene. Defaults to the driving world; the studio look-dev scene passes its
   * own material grid. Given the same environment either way — the lighting and shadows are
   * not the content's business.
   */
  readonly content?: SceneContentFactory;
  /**
   * The shared terrain sampler (Phase 4), forwarded to the content factory. One instance
   * is created by `Application` so the visual chunks and the physics heightfields sample
   * the identical height function.
   */
  readonly terrainSampler?: TerrainSampler;
}

export interface SceneDiagnostics {
  readonly objectCount: number;
  /** Backdrop currently drawn: the procedural Preetham sky or an HDRI background. */
  readonly skyMode: 'procedural' | 'hdri';
  /** Label of the mounted content: `driving`, `studio`, and so on. */
  /** Manifest id of the HDRI lighting the scene, or `null` while only the sun lights it. */
  readonly environmentId: string | null;
  readonly contentKind: string;
  /** Flat numeric content stats (terrain chunk counts, triangles, build budget usage). */
  readonly contentStats: Readonly<Record<string, number>>;
  /** Which distance-cueing model the frame used: height-aware, the linear band, or none. */
  /** Fog was removed completely; this stays in diagnostics so a capture can prove it. */
  readonly fogMode: 'off';
  /** Sun elevation in degrees, or `null` before the first daylight update. */
  readonly sunElevationDegrees: number | null;
  readonly isNight: boolean;
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
 *   camera uses;
 * - image-based lighting comes from a verified CC0 HDRI resolved through the asset manifest, so the
 *   scene reflects a real captured environment while remaining licence-auditable;
 * - shadows are cascaded (`CSMShadowNode`) so the car keeps a crisp shadow at distance without the
 *   single shadow camera either ballooning or being forced to chase it;
 * - the ground grid is a TSL node material. It used to be a GLSL patch injected through
 *   `onBeforeCompile`, which does not exist on the WebGPU backend; `npm run guard:glsl` now forbids
 *   that API from returning.
 *
 * Every resource created here is released in `dispose`. The world content remains temporary
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
  readonly #ambient: AmbientLight;
  /** Unit vector toward the sun, replaced by each daylight update. */
  readonly #sunDirection = new Vector3(0, 1, 0);
  readonly #sunOffset: Vector3;
  readonly #sunTarget = new Vector3();
  readonly #csm: CSMShadowNode | null;
  #content: SceneContent;
  #worldOffsetX = 0;
  #worldOffsetZ = 0;
  readonly #godraysLight: DirectionalLight | null;
  readonly #addedObjects = new Set<Object3D>();
  readonly #disposables: readonly (() => void)[];
  #environment: EnvironmentAsset | null = null;
  #daylight: DaylightState | null = null;
  readonly #sunDistance: number;
  #environmentTexture: Texture | null = null;
  #disposed = false;

  constructor(options: SceneManagerOptions) {
    const { config } = options;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1;

    this.#config = config;
    this.#sunDistance = config.lighting.sunDistance;
    this.scene = new Scene();
    // No fog is created here - not disabled, absent. Distance fog and the
    // height-fog node were deleted (owner direction, 2026-10-16): the scene
    // has no `fog` and no `fogNode`, and nothing downstream can re-add one
    // through configuration or URL switches.

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
    const ambient = new AmbientLight(
      config.lighting.ambientColor,
      config.lighting.ambientIntensity,
    );
    this.#ambient = ambient;
    this.#sun = createSun(config);
    // The configured sun position is the initial direction; `applyDaylight` replaces it once the
    // application has resolved the time of day, and `focusSun` places the light from it each frame.
    this.#sunOffset = new Vector3(...config.lighting.sunPosition).normalize();
    this.#csm = attachCascades(this.#sun, config);

    /**
     * The god-ray march samples a shadow map addressed by a single shadow matrix, which the
     * cascaded sun cannot provide (CSM keeps one target per cascade). So the effect gets its own
     * directional light that exists only to cast that map: intensity zero, so it contributes no
     * light and its shadows darken nothing; a tight frustum around the camera focus, where
     * shafts are readable, instead of the sun's whole cascade range. It is created only when the
     * configuration enables the effect, so tiers without god rays pay exactly nothing for it.
     */
    this.#godraysLight = config.postProcessing.godrays.enabled ? createGodraysLight(config) : null;

    this.#content = (options.content ?? createDrivingWorld)({
      config,
      worldConfig,
      ...(options.terrainSampler !== undefined ? { terrainSampler: options.terrainSampler } : {}),
    });

    this.scene.add(this.#sky, ambient, this.#sun, this.#sun.target, this.#content.root);
    if (this.#godraysLight !== null) {
      this.scene.add(this.#godraysLight, this.#godraysLight.target);
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
  async loadEnvironment(assetId?: string): Promise<EnvironmentAsset | null> {
    if (this.#disposed || !this.#config.environment.enabled) {
      return null;
    }
    const requestedId = assetId ?? this.#config.environment.assetId;

    try {
      const asset = await loadEnvironmentAsset(requestedId);
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
      // Swapping environments at runtime (the studio's HDRI switcher does) must not leak the
      // previous radiance map: it is the largest texture the app holds.
      this.#environmentTexture?.dispose();
      this.#environmentTexture = texture;
      this.#environment = asset;
    } catch (error) {
      console.warn(
        `could not load the environment HDRI (${requestedId}); ` +
          'falling back to the procedural sky',
        error,
      );
    }
    return this.#environment;
  }

  /**
   * Rotates the environment map around the world's vertical axis, in degrees.
   *
   * Rotating the *image* rather than the light is the standard look-dev control: it moves where the
   * bright part of the sky sits relative to a surface without changing the sun.
   */
  setEnvironmentRotation(degrees: number): void {
    this.scene.environmentRotation.y = degrees * DEG_TO_RAD;
  }

  /** Current environment rotation in degrees, for diagnostics. */
  get environmentRotationDegrees(): number {
    return this.scene.environmentRotation.y / DEG_TO_RAD;
  }

  /**
   * Switches image-based lighting off, leaving only the sun, sky, and ambient fill.
   *
   * Worth having as a switch rather than a config value: the fastest way to find out whether a
   * surface looks wrong because of its own parameters or because of the environment it is standing
   * in is to take the environment away.
   */
  setEnvironmentEnabled(enabled: boolean): void {
    if (enabled) {
      if (this.#environmentTexture !== null) {
        this.scene.environment = this.#environmentTexture;
      }
      return;
    }
    this.scene.environment = null;
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
    this.#sun.position.set(
      x + this.#sunOffset.x * this.#sunDistance,
      this.#sunOffset.y * this.#sunDistance,
      z + this.#sunOffset.z * this.#sunDistance,
    );
    this.#sun.target.updateMatrixWorld();
    this.#sun.updateMatrixWorld();

    // The shaft light shares the sun's direction and focus, so the map it casts covers the same
    // ground the cascades do — at its own, tighter extent.
    const shaft = this.#godraysLight;
    if (shaft !== null) {
      shaft.target.position.copy(this.#sunTarget);
      shaft.position.set(
        x + this.#sunOffset.x * this.#sunDistance,
        this.#sunOffset.y * this.#sunDistance,
        z + this.#sunOffset.z * this.#sunDistance,
      );
      shaft.target.updateMatrixWorld();
      shaft.updateMatrixWorld();
    }
  }

  /** The shadow-only light the god-ray march samples, or `null` when the effect is off. */
  get godraysLight(): DirectionalLight | null {
    return this.#godraysLight;
  }

  /** Fog was removed completely; diagnostics keep reporting the proof. */
  get fogMode(): 'off' {
    return 'off';
  }

  /**
   * Applies a resolved time of day to everything the scene owns.
   *
   * One call, one source of truth: the sun's direction, colour, and strength, the ambient fill, the
   * atmosphere's scattering and sun disc, and the intensity of the image-based
   * lighting all come from the same `DaylightState`. Nothing recomputes the sun separately, so the
   * sky, the shadows, and the light on the car can never disagree about where the sun is.
   *
   * The procedural sky always follows the clock. When the configuration makes the HDRI the backdrop
   * (tier C) that texture is a fixed daylight capture, so only its intensity is modulated — the sky
   * does not redden. That limitation is recorded in the handoff rather than hidden.
   */
  applyDaylight(state: DaylightState): void {
    const direction = this.#sunDirection.set(
      state.sunDirection.x,
      state.sunDirection.y,
      state.sunDirection.z,
    );
    this.#sunOffset.copy(direction);

    this.#sun.color.setHex(state.sunColorHex);
    // The clock's phase values are MULTIPLIERS on the baseline lighting
    // (config/daylight.ts says so). Applying them as absolute values ran
    // the daytime fill light at 1.0 instead of 0.35 and the sun at 1.0
    // instead of 2.4: a 1:1 sun/fill ratio with no shadow contrast, which
    // read as a milky haze over the whole frame (owner report, 2026-10-17).
    this.#sun.intensity = scaleBaseline(this.#config.lighting.sunIntensity, state.sunIntensity);
    this.#ambient.color.setHex(state.ambientColorHex);
    this.#ambient.intensity = scaleBaseline(
      this.#config.lighting.ambientIntensity,
      state.ambientIntensity,
    );

    // The sky model reads the vertical component as a distance, so the unit direction is scaled.
    const sunDistance = this.#config.atmosphere.sunDistance;
    this.#sky.sunPosition.value.set(
      direction.x * sunDistance,
      direction.y * sunDistance,
      direction.z * sunDistance,
    );
    this.#sky.turbidity.value = state.turbidity;
    this.#sky.rayleigh.value = state.rayleigh;
    this.#sky.showSunDisc.value = state.showSunDisc ? 1 : 0;

    const environmentIntensity = scaleBaseline(
      this.#config.environment.intensity,
      state.environmentIntensity,
    );
    this.scene.environmentIntensity = environmentIntensity;
    if (this.scene.background !== null) {
      this.scene.backgroundIntensity = environmentIntensity;
    }
    this.#daylight = state;
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

  /**
   * Which backdrop is drawn: the procedural Preetham sky, or the captured HDRI. The difference
   * matters to the time-of-day grade — a capture can only be dimmed, so it takes the full tint.
   */
  get skyMode(): 'procedural' | 'hdri' {
    return this.scene.background === null ? 'procedural' : 'hdri';
  }

  readonly #contactSunView = new Vector3();

  /**
   * Unit direction towards the sun in view space, for the contact-shadow march.
   *
   * `transformDirection` applies the rotation part of the camera's world-inverse and
   * renormalises, which is all a direction needs. The camera's matrices are refreshed by the
   * renderer each frame; this runs before the frame renders, so it reads last frame's camera
   * — a one-frame-old light direction during camera motion, invisible in practice.
   */
  contactSunViewDirection(): { x: number; y: number; z: number } {
    return this.#contactSunView
      .copy(this.#sunDirection)
      .transformDirection(this.camera.matrixWorldInverse);
  }

  getObjectCount(): number {
    let count = 0;
    this.scene.traverse(() => {
      count += 1;
    });
    return count;
  }

  /**
   * Replaces the scene's content.
   *
   * The content seam exists because the project has more than one thing to render; this is the part
   * of it that says *when*. Content that has to be downloaded — a model, and later a streamed world
   * chunk — cannot exist at construction time, so the manager starts with what the factory gives it
   * and accepts a replacement once the real thing has arrived. The outgoing content is disposed by
   * the caller rather than here, because the two are usually alive at the same instant during the
   * swap and only the caller knows which one is going away.
   */
  /**
   * Slides the whole content root by the floating-origin offset (world content is
   * authored in eternal world coordinates; the root carries it into the bounded
   * rendering space). The sky, lights and cameras are camera-anchored and do not move.
   */
  setWorldOffset(offsetX: number, offsetZ: number): void {
    this.#worldOffsetX = offsetX;
    this.#worldOffsetZ = offsetZ;
    this.#content.root.position.set(-offsetX, 0, -offsetZ);
  }

  setContent(content: SceneContent): void {
    const previous = this.#content;
    this.scene.remove(previous.root);
    this.#content = content;
    this.scene.add(content.root);
    content.root.position.set(-this.#worldOffsetX, 0, -this.#worldOffsetZ);
  }

  /**
   * Drives the content's streaming hook (Phase 4 terrain). Called once per frame with the
   * vehicle position by `Application`, beside the sun focus: ground and light follow the
   * same point. Content without streaming pays one optional-call check.
   */
  streamContent(focus: Vec3, velocity?: { x: number; z: number }, deltaSeconds?: number): void {
    this.#content.updateStreaming?.(focus, velocity, deltaSeconds);
  }

  /** Town collision via the content, when it has a town. */
  collideTown(car: TownCarProbe, deltaSeconds: number): readonly TownHit[] {
    return this.#content.collideTown?.(car, deltaSeconds) ?? [];
  }

  /** Forwards vegetation destruction events to the content, when it has any. */
  applyVegetationHits(events: readonly TreeHitEvent[]): void {
    this.#content.applyVegetationHits?.(events);
  }

  /** Wires the collision field's per-plant truth into the content's rebuilds. */
  setVegetationStateProvider(
    provider: ((key: string) => TreeVisualState | undefined) | null,
  ): void {
    this.#content.setVegetationStateProvider?.(provider);
  }

  /** Resolves the content's async surface loading (terrain scans), if it has any. */
  async loadContentSurfaces(): Promise<void> {
    await this.#content.loadSurfaces?.();
  }

  getDiagnostics(): SceneDiagnostics {
    const { x, y, z } = this.camera.position;
    return {
      objectCount: this.getObjectCount(),
      skyMode: this.skyMode,
      contentKind: this.#content.kind,
      contentStats: this.#content.getContentStats?.() ?? {},
      fogMode: this.fogMode,
      environmentId: this.#environment?.id ?? null,
      sunElevationDegrees: this.#daylight?.sunElevationDegrees ?? null,
      isNight: this.#daylight?.isNight ?? false,
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
    // The content's own release hook, called before the generic tree sweep below.
    this.#content.dispose();
    for (const dispose of this.#disposables) {
      dispose();
    }
  }
}

/**
 * The shadow-only light the god-ray march samples.
 *
 * Zero intensity is the whole design: the renderer still renders its shadow map (shadow maps are
 * rendered for every shadow-casting light), while the light's own contribution — the only thing
 * its shadows could darken — is nothing. Its frustum is a single orthographic box sized by the
 * effect's config rather than the cascade range, because the march only ever reads the near
 * field where shafts are visible.
 */
function createGodraysLight(config: RenderConfig): DirectionalLight {
  const godrays = config.postProcessing.godrays;
  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'godrays-sun';
  light.castShadow = true;
  light.shadow.mapSize.set(godrays.shadowMapSize, godrays.shadowMapSize);
  light.shadow.camera.left = -godrays.shadowExtentMeters;
  light.shadow.camera.right = godrays.shadowExtentMeters;
  light.shadow.camera.top = godrays.shadowExtentMeters;
  light.shadow.camera.bottom = -godrays.shadowExtentMeters;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = config.lighting.sunDistance * 4;
  light.shadow.bias = config.shadows.bias;
  light.shadow.normalBias = config.shadows.normalBias;
  light.target.name = 'godrays-sun-target';
  return light;
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
