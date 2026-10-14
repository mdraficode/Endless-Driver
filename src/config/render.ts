/**
 * Rendering configuration: everything the renderer, camera rig, lighting, atmosphere, environment,
 * post-processing stack, and HUD need. World content (ground, grid, obstacles) lives in
 * `config/world.ts` because the physics world builds colliders from the same definitions.
 *
 * All values are data, never inline constants, so quality tiers and later phases can override them
 * without touching engine or scene code. Phase 3 moved rendering to `WebGPURenderer` with TSL node
 * materials and a `RenderPipeline` post stack (ADR 0004); the fields below describe that pipeline,
 * not the retired `WebGLRenderer` + GLSL setup.
 */

/** Shadow filtering mode. Both are supported by the WebGPU renderer and its WebGL2 backend. */
export type ShadowMapTypeName = 'pcf' | 'vsm';

/**
 * Which backend the engine should request.
 *
 * - `auto` — `WebGPURenderer` with its built-in WebGL2 fallback (the default; recommended);
 * - `webgl` — force the WebGL2 backend, used for comparisons and for browsers where a driver's
 *   WebGPU path is known to misbehave.
 */
export type RendererBackendPreference = 'auto' | 'webgl';

/** The backend that actually ended up rendering, resolved after `renderer.init()`. */
export type RendererBackendName = 'webgpu' | 'webgl2';

export type ToneMappingName = 'aces' | 'agx' | 'neutral';

export interface RendererConfig {
  readonly backendPreference: RendererBackendPreference;
  /** MSAA on the default framebuffer. */
  readonly antialias: boolean;
  readonly samples: number;
  /**
   * Output transform. `aces` keeps highlight roll-off filmic and matches the look the scene was
   * authored against; `agx`/`neutral` are available for comparison without code changes.
   */
  readonly toneMapping: ToneMappingName;
  readonly toneMappingExposure: number;
}

export interface ShadowConfig {
  /**
   * Shadow filtering mode.
   *
   * - `pcf` — filtered percentage-closer shadows (default, supported everywhere);
   * - `vsm` — variance shadow maps for genuinely soft edges, at the cost of light bleeding.
   */
  readonly shadowMapType: ShadowMapTypeName;
  /** Only used by the `vsm` mode. */
  readonly vsmBlurSamples: number;
  /**
   * Square shadow map resolution in pixels per side, applied to *each* cascade. This is the single
   * largest GPU cost in the scene (cascades × mapSize²), and the first thing a mobile quality tier
   * must reduce.
   */
  readonly mapSize: number;
  /** Half-extent of the orthographic shadow camera in meters. Bounds the non-CSM fallback path. */
  readonly cameraBounds: number;
  readonly cameraNear: number;
  readonly cameraFar: number;
  readonly bias: number;
  readonly normalBias: number;
  readonly csm: CsmConfig;
}

/** Cascaded shadow map tuning (`CSMShadowNode` on the WebGPU path). */
export interface CsmConfig {
  /** Number of cascades. Each cascade is a separate shadow pass at `mapSize`². */
  readonly cascades: number;
  /** Far distance covered by the cascade split, in meters. */
  readonly maxFar: number;
  /** Cascade split scheme; `practical` blends logarithmic and uniform splits. */
  readonly mode: 'practical' | 'uniform' | 'logarithmic';
  /** Padding in meters around the cascades, so casters just outside a cascade still register. */
  readonly lightMargin: number;
  /** Cross-fades between cascades instead of hard switching at the boundaries. */
  readonly fade: boolean;
}

export interface CameraConfig {
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly minDistance: number;
  readonly maxDistance: number;
  /** Keeps the debug camera above the horizon. */
  readonly maxPolarAngle: number;
  readonly dampingFactor: number;
}

/**
 * Procedural sky and distance fog.
 *
 * The visible sky is a Preetham sky model (`SkyMesh`) driven by `AtmosphereConfig`, so there are no
 * zenith/horizon color constants any more: the model derives them from the sun position. Fog color
 * is still configured, as two endpoints the scene interpolates by sun elevation so the fogged
 * distance always matches the sky it is seen against.
 */
export interface SkyConfig {
  readonly fogEnabled: boolean;
  readonly fogNear: number;
  readonly fogFar: number;
  /** Fog tint at high sun. */
  readonly fogColorDay: number;
  /** Fog tint as the sun approaches the horizon, warmer and hazier. */
  readonly fogColorHorizon: number;
  /**
   * Sky dome scale as a multiple of the camera far plane. The dome follows the camera, so it must
   * stay inside the far plane (its corners included) to never be clipped.
   */
  readonly domeScaleFactor: number;
}

/** Preetham atmospheric scattering parameters plus the optional cloud layer. */
export interface AtmosphereConfig {
  /** Aerosol haze. 2–4 is a clear day, higher values thicken the haze near the horizon. */
  readonly turbidity: number;
  /** Rayleigh scattering strength; lifts the blue and the horizon glow at low sun. */
  readonly rayleigh: number;
  readonly mieCoefficient: number;
  readonly mieDirectionalG: number;
  /**
   * Distance the sky model is told the sun sits at, in its own units. The model uses the vertical
   * component to fade the horizon glow, so the sun direction must be scaled by this before it is
   * handed over.
   */
  readonly sunDistance: number;
  readonly showSunDisc: boolean;
  readonly clouds: CloudConfig;
}

export interface CloudConfig {
  readonly enabled: boolean;
  readonly scale: number;
  readonly speed: number;
  /** 0–1; higher values fill more of the sky. */
  readonly coverage: number;
  readonly density: number;
  readonly elevation: number;
}

/**
 * Image-based lighting. The HDRI named here must exist in `public/assets/manifest.json`; the
 * environment loader resolves it from the manifest rather than accepting a raw path, so nothing can
 * reference an asset that the licence register does not know about.
 */
export interface EnvironmentConfig {
  readonly enabled: boolean;
  /** Manifest asset id, e.g. `hdri-ninomaru-teien-1k`. */
  readonly assetId: string;
  /** `scene.environmentIntensity`. The sky mesh is the visible backdrop; this lights the surfaces. */
  readonly intensity: number;
  /** Rotation about +Y in degrees; aligns the HDRI's interesting features with the scene. */
  readonly rotationDegrees: number;
  /** Draw the HDRI as the background instead of the procedural sky (photo-mode style). */
  readonly useAsBackground: boolean;
}

export interface LightingConfig {
  readonly ambientColor: number;
  /** Kept low: the HDRI environment supplies most of the indirect light. */
  readonly ambientIntensity: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  /**
   * Initial sun direction; the time-of-day clock replaces it on the first frame
   * (`src/config/daylight.ts`). Kept so the scene has a sane light before the clock runs, and so
   * the baseline is readable on its own.
   */
  readonly sunPosition: readonly [number, number, number];
  /** Distance the directional light sits from its target. Direction is what matters; this sets range. */
  readonly sunDistance: number;
}

export interface BloomConfig {
  readonly enabled: boolean;
  readonly strength: number;
  readonly radius: number;
  /** Bloom only picks up pixels brighter than this, so it never hazes the whole image. */
  readonly threshold: number;
}

/** Anti-aliasing strategy. MSAA happens in the renderer; the others are post effects. */
export type AntiAliasingMode = 'msaa' | 'fxaa' | 'smaa' | 'none';

/**
 * Ground-truth ambient occlusion. Applied to the scene pass through `builtinAOContext`, which is why
 * it is described here as part of the scene rather than as another link in the post chain.
 */
export interface AmbientOcclusionConfig {
  readonly enabled: boolean;
  /** Fraction of the render resolution the occlusion is computed at; 0.5 is the balanced tier. */
  readonly resolutionScale: number;
  /** Sample radius in world units. */
  readonly radius: number;
  /** Depth difference above which a sample is treated as a separate surface. */
  readonly thickness: number;
  /** How quickly sampling distance falls off with range. */
  readonly distanceExponent: number;
  /** Darkening strength of the resulting occlusion (1 = fully applied). */
  readonly intensity: number;
  /** Taps per pixel; the dominant cost of the effect. */
  readonly samples: number;
  readonly scale: number;
}

/** Lens colour fringing. Display-referred: applied after tone mapping. */
export interface ChromaticAberrationConfig {
  readonly enabled: boolean;
  readonly strength: number;
  /** Radial scale of the fringing falloff. */
  readonly scale: number;
}

/** Contrast-adaptive sharpening (RCAS). */
export interface SharpenConfig {
  readonly enabled: boolean;
  /** 0 = maximum sharpening, 2 = none (the node's own scale). */
  readonly sharpness: number;
  /** Attenuates sharpening in noisy areas; worth enabling once grain is on. */
  readonly denoise: boolean;
}

export interface FilmGrainConfig {
  readonly enabled: boolean;
  readonly intensity: number;
}

/** Custom TSL vignette: darkens the frame corners to draw the eye to the centre of the road. */
export interface VignetteConfig {
  readonly enabled: boolean;
  /** 0 = no darkening, 1 = black corners. */
  readonly intensity: number;
  /** Higher values push the darkening further towards the corners. */
  readonly smoothness: number;
}

/**
 * Time-of-day grade.
 *
 * A linear-space RGB multiplier resolved from the clock (`config/daylight.ts` owns the tint values).
 * It exists because the tier-C backdrop is a *captured* daylight HDRI: it can be dimmed, but unlike
 * the procedural sky it cannot colour itself as the sun drops, so dawn and dusk would otherwise read
 * as a dimmed noon. The grade multiplies the whole frame — backdrop included — in the linear stage
 * before tone mapping, which is where a creative grade belongs: it warms the sky and the shadows
 * together, and it cannot crush highlights, because the tone curve runs afterwards.
 */
export interface GradeConfig {
  readonly enabled: boolean;
}

export interface PostProcessingConfig {
  readonly enabled: boolean;
  readonly antiAliasing: AntiAliasingMode;
  readonly grade: GradeConfig;
  readonly bloom: BloomConfig;
  readonly ambientOcclusion: AmbientOcclusionConfig;
  readonly chromaticAberration: ChromaticAberrationConfig;
  readonly sharpen: SharpenConfig;
  readonly filmGrain: FilmGrainConfig;
  readonly vignette: VignetteConfig;
}

export interface DiagnosticsConfig {
  readonly overlayEnabled: boolean;
  /** Seconds between HUD refreshes; keeps DOM work off the per-frame path. */
  readonly hudUpdateIntervalSeconds: number;
  /** Number of recent frames retained for FPS/frame-time statistics. */
  readonly sampleWindow: number;
  /** Master switch for the `window.__ENDLESS_DRIVER__` diagnostics handle. */
  readonly exposeDebugHandle: boolean;
}

export interface RenderConfig {
  /** Hard cap on devicePixelRatio; mobile GPUs must not render at 3x/4x. */
  readonly maxPixelRatio: number;
  /** Upper bound for a single frame delta so tab-switch stalls cannot teleport state. */
  readonly maxFrameDeltaSeconds: number;
  readonly renderer: RendererConfig;
  readonly camera: CameraConfig;
  readonly shadows: ShadowConfig;
  readonly sky: SkyConfig;
  readonly atmosphere: AtmosphereConfig;
  readonly environment: EnvironmentConfig;
  readonly lighting: LightingConfig;
  readonly postProcessing: PostProcessingConfig;
  readonly diagnostics: DiagnosticsConfig;
}

export const RENDER_CONFIG: RenderConfig = {
  maxPixelRatio: 2,
  maxFrameDeltaSeconds: 0.1,
  renderer: {
    backendPreference: 'auto',
    antialias: true,
    samples: 4,
    toneMapping: 'aces',
    toneMappingExposure: 1,
  },
  camera: {
    fov: 60,
    near: 0.1,
    far: 2000,
    position: [26, 12, 34],
    target: [0, 1.5, 0],
    minDistance: 4,
    maxDistance: 400,
    maxPolarAngle: Math.PI / 2 - 0.02,
    dampingFactor: 0.08,
  },
  shadows: {
    shadowMapType: 'pcf',
    vsmBlurSamples: 8,
    mapSize: 2048,
    cameraBounds: 70,
    cameraNear: 1,
    cameraFar: 320,
    bias: -0.0004,
    normalBias: 0.02,
    csm: {
      cascades: 3,
      maxFar: 300,
      mode: 'practical',
      lightMargin: 200,
      fade: true,
    },
  },
  sky: {
    fogEnabled: true,
    fogNear: 140,
    fogFar: 760,
    fogColorDay: 0x9ec6ea,
    fogColorHorizon: 0xe8b98a,
    domeScaleFactor: 1.05,
  },
  atmosphere: {
    turbidity: 2.6,
    rayleigh: 1.6,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    sunDistance: 450000,
    showSunDisc: true,
    clouds: {
      enabled: true,
      scale: 0.0002,
      speed: 0.00002,
      coverage: 0.42,
      density: 0.4,
      elevation: 0.5,
    },
  },
  environment: {
    enabled: true,
    assetId: 'hdri-ninomaru-teien-1k',
    intensity: 1,
    rotationDegrees: 0,
    useAsBackground: false,
  },
  lighting: {
    ambientColor: 0xa8c2de,
    ambientIntensity: 0.35,
    sunColor: 0xfff2dd,
    sunIntensity: 2.4,
    sunPosition: [70, 95, 55],
    sunDistance: 130,
  },
  postProcessing: {
    enabled: true,
    antiAliasing: 'msaa',
    bloom: {
      enabled: true,
      strength: 0.22,
      radius: 0.45,
      threshold: 1,
    },
    ambientOcclusion: {
      enabled: true,
      resolutionScale: 0.5,
      radius: 0.3,
      thickness: 1,
      distanceExponent: 1.2,
      intensity: 0.85,
      samples: 16,
      scale: 1.2,
    },
    grade: {
      enabled: true,
    },
    chromaticAberration: {
      enabled: true,
      strength: 0.4,
      scale: 1.1,
    },
    sharpen: {
      enabled: true,
      sharpness: 0.6,
      denoise: true,
    },
    filmGrain: {
      enabled: false,
      intensity: 0.06,
    },
    vignette: {
      enabled: true,
      intensity: 0.55,
      smoothness: 0.85,
    },
  },
  diagnostics: {
    overlayEnabled: true,
    hudUpdateIntervalSeconds: 0.25,
    sampleWindow: 120,
    exposeDebugHandle: true,
  },
};
