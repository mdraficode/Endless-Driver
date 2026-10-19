/**
 * Rendering configuration: everything the renderer, camera rig, lighting, atmosphere, environment,
 * post-processing stack, and HUD need. World content (terrain, roads, town) lives in
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
 * Procedural sky.
 *
 * The visible sky is a Preetham sky model (`SkyMesh`) driven by `AtmosphereConfig`, so there are no
 * zenith/horizon color constants any more: the model derives them from the sun position.
 *
 * There is deliberately no fog configuration here. Distance fog and height
 * fog were removed completely (owner direction, 2026-10-16, after repeated
 * "the screen is foggy" reports): the scene creates no `Fog`, installs no
 * `fogNode`, and no tier or URL switch can bring either back. Distance is
 * read from geometry, texture, and shadow - never from a white wash.
 */
export interface SkyConfig {
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
/**
 * Anti-aliasing strategy.
 *
 * `taa` is a *temporal* strategy and therefore behaves differently from the others: it is the only one
 * that needs the scene rendered with motion vectors, it must run with MSAA switched off, and it is the
 * only one whose result cannot be judged from a single frame. It also has a fallback that the others do
 * not — when temporal AA is switched off (by a tier or by `?taa=0`), a tier whose mode is `taa` resolves
 * with SMAA instead, so turning the temporal path off never leaves the frame un-antialiased.
 */
export type AntiAliasingMode = 'msaa' | 'fxaa' | 'smaa' | 'taa' | 'none';

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

/**
 * Depth of field.
 *
 * Focus is expressed as a distance along the camera's own axis, in world units, plus how far from that
 * plane an object may sit before it is fully blurred. That is a lens description rather than a shader
 * description — which is what makes it possible to say "the car is in focus and the horizon is not"
 * and have it stay true as the camera moves.
 */
export interface DepthOfFieldConfig {
  readonly enabled: boolean;
  /** Initial focus distance in metres. Replaced every frame by whatever the scene focuses on. */
  readonly focusDistance: number;
  /** Distance from the focal plane at which blur reaches its maximum, in metres. */
  readonly focalLength: number;
  /**
   * Blur radius at maximum defocus, as a fraction of the frame's short side — the aperture.
   *
   * This was the one value that had to be *measured* rather than reasoned about. The node describes it
   * as "unitless, for artistic purposes", and its own default is 1: at 1, and at the 2.6 this project
   * first shipped, the effect runs, blurs correctly, and is invisible — a 2.6 px radius on a 1440 px
   * frame is less than the antialiasing. Depth of field only reads as a lens once the far field is
   * blurred by roughly one percent of the frame, which is why the value here is an order of magnitude
   * above the node's default.
   */
  readonly bokehScale: number;
  /**
   * Seconds for the focus plane to travel most of the way to a new subject.
   *
   * A camera racking focus between two subjects is a camera *pulling* focus — it takes time, and the
   * movement is most of what makes the effect read as a lens rather than as a mask. Snapping is what
   * a chase camera does when the car crosses a crest, and it looks like a bug.
   */
  readonly focusSmoothingSeconds: number;
}

/**
 * Per-object and camera motion blur.
 *
 * This is the effect that makes speed *readable*. A still frame cannot express 200 km/h; every frame of
 * a racing game is an exposure, and what the shutter integrates is what the player perceives as velocity.
 * It is also the cheapest large realism win available here, because it consumes the same velocity buffer
 * the temporal anti-aliasing needs — one attachment, two effects.
 */
export interface MotionBlurConfig {
  readonly enabled: boolean;
  /**
   * Taps along the velocity vector. The loop is unrolled at graph build time, so this is a compile-time
   * cost as well as a per-pixel one: 8 on the balanced tier, 16 when there is budget to spare.
   */
  readonly samples: number;
  /**
   * Multiplier on the motion vectors — the shutter angle, in effect.
   *
   * 1 leaves the image as the frame's own motion describes it; lower values read as a faster shutter
   * (crisper, more stroboscopic), higher as a longer one (smoother, smeared). It is a live uniform, so
   * the number can be dialled while the car is moving, which is the only way to judge it.
   */
  readonly intensity: number;
}

/**
 * Temporal anti-aliasing (TAAU) and the dynamic resolution scaling it makes possible.
 *
 * TAA is ranked first in `docs/REALISM_PLAN.md` §3 for a reason that has nothing to do with taste:
 * temporal instability — crawling edges, sparkling specular highlights, foliage that flickers — is the
 * loudest available signal that an image is synthetic, and it is the one flaw no amount of material or
 * lighting work can hide. It is also the only effect in the stack that *accumulates*: the resolve keeps a
 * history buffer, reprojects it with the motion vectors, and blends the current jittered frame into it, so
 * a pixel's colour is the average of what several frames saw at that surface point. That is what makes
 * both the aliasing and the noise from the effects upstream of it (ambient occlusion, shadow edges) settle
 * down instead of boiling.
 *
 * The cost is a history buffer, a full-screen resolve, and one hard constraint: **MSAA must be off**.
 * MSAA and temporal accumulation are alternative answers to the same question and the node rejects the
 * combination, so a tier with TAA is a tier without MSAA — which is the standard trade in every shipping
 * renderer, because MSAA does nothing for specular aliasing or shadow edges while TAA helps with all three.
 */
export interface TemporalAntiAliasingConfig {
  readonly enabled: boolean;
  /**
   * Whether the render scale is allowed to move with the frame time.
   *
   * The scene pass renders at `renderScale x` the canvas and the resolve reconstructs it at full size —
   * so the same node that anti-aliases also upscales, and lowering the scale buys frame rate for the
   * whole scene pass rather than for one effect. What that buys in practice is a *stable* frame time
   * instead of a fluctuating one: the scale moves a step at a time towards the target and settles.
   */
  readonly dynamicResolution: boolean;
  /** Render scale used when dynamic resolution is off; 1 renders at native resolution. */
  readonly renderScale: number;
  /** Floor for the dynamic scale. Below this the reconstruction stops looking like an upscale. */
  readonly minScale: number;
  /** Ceiling for the dynamic scale. 1 means the effect may never supersample. */
  readonly maxScale: number;
  /**
   * Frame time the controller aims for, in milliseconds.
   *
   * Deliberately *not* a frame rate: the controller is driven by delivered frame times, and a page whose
   * frames are capped by the display can only see a GPU that is already missing the display's deadline.
   * Targeting the display's own period would therefore fight vsync. 16.6 ms with a proportional dead band
   * reacts to genuinely dropped frames and leaves a display that is comfortably keeping up alone — see
   * the note on `tolerance`.
   */
  readonly targetFrameTimeMs: number;
  /**
   * Dead band as a fraction of the target.
   *
   * Without one, a frame time that sits exactly at the target oscillates: the scale moves down, the frame
   * gets faster than the target, the scale moves back up, and the image resolution visibly breathes. The
   * dead band is asymmetric by construction — the controller only shrinks above `target x (1 + tolerance)`
   * and only grows below `target x (1 - tolerance)` — so a frame time parked *at* the target is a stable
   * state rather than a boundary to be crossed.
   */
  readonly tolerance: number;
  /** Fraction of the scale moved per adjustment, e.g. 0.08 for a twentieth of a step per half second. */
  readonly step: number;
  /** Minimum seconds between adjustments. The hysteresis that keeps a single slow frame from resizing. */
  readonly adjustmentIntervalSeconds: number;
  /** Exponential weight of the newest frame time; 0.1 is a ten-frame-ish window. */
  readonly smoothing: number;
}

/**
 * The look, applied as a display-referred 3D LUT.
 *
 * After tone mapping and the sRGB transfer, because that is the only place a LUT may be sampled: the
 * node reads `rgb` directly as texture coordinates, so an HDR value would sample outside the table.
 * `intensity` is a live uniform — it trims the authored look towards the ungraded image without
 * rebuilding the graph, which is what makes the "is this too much?" comparison a keystroke.
 */
export interface LutConfig {
  readonly enabled: boolean;
  /** Manifest id of the table to load; `null` uses the document's own default. */
  readonly assetId: string | null;
  /** Default trim: 1 applies the look as authored, 0 applies none. */
  readonly intensity: number;
  /**
   * Lattice size per axis of the table, and therefore of the texture that samples it.
   *
   * This has to be known before the file arrives, because it sizes the texture the node graph is
   * built around — so it is declared here and *checked* against the file's own `LUT_3D_SIZE` when it
   * loads. A mismatch is rejected rather than sampled: sampling a 33³ table with 17³ coordinates, or
   * the reverse, produces a wrong grade that still looks like a grade, which is the kind of error that
   * survives every screenshot review.
   */
  readonly size: number;
}

/**
 * Screen-space god rays: a raymarch through the sun's shadow map, accumulating the light that
 * survives between occluders (`GodraysNode`, from three-good-godrays).
 *
 * This is the one volumetric effect whose cost and character fit a browser budget: it needs no
 * volume texture and no compute pass, just the shadow map the scene already renders — sixty
 * shadow taps per pixel at half resolution, gated to the high tier. What it buys is the single
 * most dramatic lighting event available to the project: shafts through the route canopy at
 * dawn, headlight-cone drama's daylight cousin. It is also elevation-gated by construction —
 * the tint the daylight controller feeds it fades to nothing once the sun is high or down, so
 * the pass is only ever *visible* when shafts are plausible, and `?godrays=0` removes it.
 *
 * The node marches a *dedicated* shadow map, not the cascaded one: CSM splits its shadow into
 * per-cascade targets the node's single shadow matrix cannot address. `SceneManager` therefore
 * owns a second, shadow-only directional light (zero intensity, so it lights nothing) whose
 * frustum hugs the near field where shafts are readable.
 */
export interface GodraysConfig {
  readonly enabled: boolean;
  /** Raymarch taps per pixel. The dominant cost of the effect; the loop is fixed at build. */
  readonly raymarchSteps: number;
  /** Accumulation rate per step — roughly how humid the air is. */
  readonly density: number;
  /** Ceiling on accumulated shaft brightness, so a clear gap cannot blow out the frame. */
  readonly maxDensity: number;
  /** How quickly shafts fade with distance from the light. */
  readonly distanceAttenuation: number;
  /** Fraction of the drawing buffer the raymarch runs at. */
  readonly resolutionScale: number;
  /** Half-extent in metres of the dedicated shadow frustum the march samples. */
  readonly shadowExtentMeters: number;
  /** Resolution of the dedicated shadow map. */
  readonly shadowMapSize: number;
}

/**
 * Screen-space contact shadows: a short raymarch from each surface point towards the sun,
 * through the depth buffer the frame already has. Where an occluder sits within
 * `maxDistanceMeters` along that ray, the pixel darkens.
 *
 * This is the centimetre-scale half of shadowing that cascaded maps cannot resolve: a 2048
 * shadow map spread over 300 m has ~15 cm texels, so the tyre's contact patch, the kerb's
 * foot, and the underside of a guardrail all float. GTAO darkens crevices without knowing
 * where the light is; this knows, and grounds objects *against the sun's side*. It is cheap
 * (a dozen depth taps), entirely screen-space (its known failure is the same as every
 * screen-space effect: an occluder off-screen casts nothing), and gated by the daylight
 * controller so it only bites while the sun is up to cast it.
 */
export interface ContactShadowsConfig {
  readonly enabled: boolean;
  /** Depth taps along the sun ray. The dominant cost; fixed at graph build. */
  readonly steps: number;
  /** How far along the sun ray to look for an occluder, metres. Contact scale, by design. */
  readonly maxDistanceMeters: number;
  /** How far behind the ray point an occluder may sit and still count, metres. */
  readonly thicknessMeters: number;
  /** 0-1 ceiling on the darkening at full occlusion. */
  readonly strength: number;
}

/**
 * Screen-space global illumination (`SSGINode`, SSRT3-derived): horizon-based ray sampling
 * of the rendered frame itself, producing bounced diffuse light plus its own ambient
 * occlusion term. When enabled it *replaces* GTAO — the composite is
 * `beauty × ssao + diffuse × gi`, the form three's own example uses — because running both
 * occlusion terms would darken every crevice twice.
 *
 * High tier only: the sampling is the most expensive per-pixel work in the stack after the
 * god-ray march, it needs two extra scene attachments (normals, diffuse), and its noise is
 * only acceptable because the temporal resolve downstream accumulates it (the node's
 * temporal filtering assumes exactly that). The WebGL2 fallback runs the same TSL; what it
 * cannot do is take the cost anywhere, which is the tier system's problem to state honestly.
 */
export interface SsgiConfig {
  readonly enabled: boolean;
  /** Hemisphere slices per pixel. Samples per pixel = slices × steps × 2. */
  readonly sliceCount: number;
  /** Samples along each side of a slice. */
  readonly stepCount: number;
  /** Indirect diffuse intensity (the node's own scale; its default is 10). */
  readonly giIntensity: number;
  /** Power applied to the occlusion term. */
  readonly aoIntensity: number;
  /** World-space radius the bounce can arrive from, metres. */
  readonly radiusMeters: number;
  /** Assumed surface thickness for occlusion, metres. */
  readonly thicknessMeters: number;
}

export interface PostProcessingConfig {
  readonly enabled: boolean;
  readonly antiAliasing: AntiAliasingMode;
  readonly grade: GradeConfig;
  readonly lut: LutConfig;
  readonly depthOfField: DepthOfFieldConfig;
  readonly motionBlur: MotionBlurConfig;
  readonly temporalAntiAliasing: TemporalAntiAliasingConfig;
  readonly godrays: GodraysConfig;
  readonly contactShadows: ContactShadowsConfig;
  readonly ssgi: SsgiConfig;
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
    // WebGL2 is the backend every capture, test and CI run in this project
    // verifies, so it is the shipped default. WebGPU remains implemented but
    // unreached until a proof exists on real hardware: the owner's devices
    // showed artefacts (an all-white ground) that no WebGL2 capture, at any
    // tier or spawn, has ever reproduced (2026-10-17). Switching the default
    // back to 'auto' is a one-line change once WebGPU captures exist.
    backendPreference: 'webgl',
    // MSAA off in the baseline for the same reason the tier table has it off: the AA strategy in force is
    // temporal, and the two cannot both be on. Tier C, which has no TAA, keeps MSAA off as well and uses
    // FXAA; a caller that wants MSAA asks for it explicitly, and the tier test asserts the pairing.
    antialias: false,
    samples: 0,
    toneMapping: 'aces',
    // Baseline exposure, multiplied by the daylight phase (1 at noon). 0.94 put the
    // whole daytime frame at or past the top of the tone curve: grass, tree lines and
    // high-ground textures all compressed into the same near-white and read as fog (owner
    // report, 2026-10-17). 0.72 keeps mid-tones on the steep part of the curve.
    toneMappingExposure: 0.72,
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
    intensity: 0.5,
    rotationDegrees: 0,
    useAsBackground: false,
  },
  lighting: {
    ambientColor: 0xa8c2de,
    ambientIntensity: 0.25,
    sunColor: 0xfff2dd,
    sunIntensity: 3.4,
    sunPosition: [70, 95, 55],
    sunDistance: 130,
  },
  postProcessing: {
    enabled: true,
    lut: {
      enabled: true,
      assetId: null,
      // The look is authored to be *visible* on top of ACES and the time-of-day grade, and this trim
      // is where the project decides how much of it to take. Full strength is the authored look; the
      // interesting property of a LUT is that it can be dialled without being re-authored.
      intensity: 1,
      // Must match the shipped table. Chosen by measurement in `scripts/build-lut.mjs --analyse`.
      size: 17,
    },
    depthOfField: {
      // OFF for gameplay (owner report, 2026-10-16): a 12 m focus with full blur
      // beyond ~26 m made every distant road unreadable on the desktop tiers —
      // and the Far chase view pushed even more of the frame past the blur line.
      // The effect stays implemented for photo mode (Phase 8), where a frozen
      // frame is exactly what it is for.
      enabled: false,
      focusDistance: 12,
      // 20 m of falloff. The number that matters is not taste but *where the player is looking*: the
      // chase camera sits about 6.7 m behind the car, and everything past focus + falloff is fully
      // blurred — so a 9 m falloff makes the road 15 m ahead unreadable, which is precisely the
      // surface the car is about to drive on. 20 m puts full blur beyond 26 m, so the near road stays
      // legible, the mid-ground softens, and the horizon and the treeline still dissolve.
      focalLength: 20,
      // 17/1000 of the frame's short side: about 15 px at 1440x900, and the same *share* of the frame
      // at every other resolution, because the offsets are in UV rather than in pixels.
      bokehScale: 17,
      // Focus is a third of a second behind the subject, which is about how fast a camera operator's
      // hand moves. Faster reads as a snap, slower reads as a lens that cannot keep up with the car.
      focusSmoothingSeconds: 0.35,
    },
    antiAliasing: 'taa',
    // A restrained high-speed shutter. Application holds this uniform at zero through normal road
    // speeds, then eases toward the configured maximum above 120 km/h. Samples are fixed at build time;
    // intensity is a live uniform.
    motionBlur: {
      enabled: true,
      samples: 12,
      intensity: 0.32,
    },
    temporalAntiAliasing: {
      enabled: true,
      dynamicResolution: true,
      renderScale: 1,
      // Two thirds of native. The resolve already reconstructs from jittered samples, so a reduced render
      // scale degrades less here than it would anywhere else — and it is the only reason the effect can
      // pay for itself on a mid-range GPU.
      minScale: 0.8,
      maxScale: 1,
      // A 60 Hz deadline, with the dead band below doing the work of keeping the controller from fighting
      // a display that is comfortably meeting it.
      targetFrameTimeMs: 16.6,
      tolerance: 0.15,
      step: 0.08,
      // Two adjustments a second at most. Faster than that and one hitched frame resizes the frame.
      adjustmentIntervalSeconds: 0.5,
      smoothing: 0.1,
    },
    // Off in the baseline: the raymarch is the high tier's budget to spend (tier A enables it),
    // and `?godrays=1` turns it on anywhere for comparison.
    godrays: {
      enabled: false,
      raymarchSteps: 60,
      density: 0.7,
      maxDensity: 0.45,
      distanceAttenuation: 2,
      resolutionScale: 0.5,
      shadowExtentMeters: 110,
      shadowMapSize: 1024,
    },
    // On from tier B up (the tiers set the tap counts); off in the baseline config so the
    // effect is always a tier's deliberate purchase, never an accident of the defaults.
    contactShadows: {
      enabled: false,
      steps: 12,
      maxDistanceMeters: 1.6,
      thicknessMeters: 0.6,
      strength: 0.55,
    },
    // High tier only, for the reasons in `SsgiConfig`. The preset is three's medium
    // with-temporal-filtering recommendation (2 slices x 8 steps): our temporal resolve is
    // downstream of the composite, which is the arrangement the preset assumes.
    ssgi: {
      enabled: false,
      sliceCount: 2,
      stepCount: 8,
      giIntensity: 1.4,
      aoIntensity: 1,
      radiusMeters: 4,
      thicknessMeters: 0.5,
    },
    bloom: {
      // OFF in gameplay, at every tier. Root cause of the 'camera fog' reports:
      // the HDR sky sits above any practical threshold, so bloom's wide kernel
      // veiled the whole frame in white, worst towards the horizon and the sun —
      // indistinguishable from fog, and it turned green highlands into a snow
      // field (owner reports 2026-10-16/17; proven by A/B captures 2026-10-17:
      // with bloom the frame's black level sat at 195/255, without it at 33).
      // Photo mode (Phase 8) may re-enable it per shot; gameplay clarity wins.
      enabled: false,
      strength: 0.1,
      radius: 0.45,
      threshold: 4,
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
      strength: 0.12,
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
      intensity: 0.3,
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

/**
 * Applies the `?dof=`, `?bokeh=`, `?lut=`, and `?lutmix=` switches to a resolved configuration.
 *
 * These exist for the same reason `?tier=` and `?time=` do: an effect that can only be judged in the
 * one state the code ships it in cannot be judged at all. Depth of field in particular is off on the
 * constrained tier by design, so without `?dof=1` the effect is unverifiable on any machine that
 * resolves to that tier — including every headless capture.
 *
 * Returns a new configuration; the input is never mutated, so a caller may hold the baseline and
 * apply different switches to it.
 */
export function applyRenderSwitches(config: RenderConfig, search: string): RenderConfig {
  const params = new URLSearchParams(search);
  const dof = params.get('dof');
  const bokeh = Number.parseFloat(params.get('bokeh') ?? '');
  const lut = params.get('lut');
  const mix = Number.parseFloat(params.get('lutmix') ?? '');
  const taa = params.get('taa');
  const res = Number.parseFloat(params.get('res') ?? '');
  const dynres = params.get('dynres');
  const mblur = params.get('mblur');
  const mbStrength = Number.parseFloat(params.get('mb') ?? '');
  const aa = params.get('aa');
  const godrays = params.get('godrays');
  const contact = params.get('contact');
  const ssgiSwitch = params.get('ssgi');
  const tonemap = params.get('tonemap');
  const grain = params.get('grain');
  const clouds = params.get('clouds');

  const depthOfField = {
    ...config.postProcessing.depthOfField,
    ...(dof === null || dof === '' ? {} : { enabled: dof !== '0' && dof !== 'false' }),
    ...(Number.isFinite(bokeh) ? { bokehScale: Math.max(0, bokeh) } : {}),
  };

  const lutEnabled =
    lut === 'none' || lut === '0' || lut === 'false' ? false : config.postProcessing.lut.enabled;
  const lutConfig = {
    ...config.postProcessing.lut,
    enabled: lutEnabled,
    ...(lut === null || lut === '' || lutEnabled === false
      ? {}
      : { assetId: lut === 'default' ? config.postProcessing.lut.assetId : lut }),
    ...(Number.isFinite(mix) ? { intensity: Math.min(1, Math.max(0, mix)) } : {}),
  };

  /**
   * `?aa=<mode>` names the strategy outright, which is what makes an A/B between strategies a URL change
   * rather than a rebuild. Naming a *spatial* strategy has to switch the temporal path off as well, or the
   * switch would not do what it says: with the resolve still running, `?aa=fxaa` would resolve temporally
   * and then run FXAA over the result — a frame that is neither of the two things being compared.
   *
   * `?taa=` is the narrower question ("should the temporal path run at all?") and is applied *after*
   * `?aa=`, so if a URL asks both, the narrow switch wins. That is the useful precedence: the case worth
   * supporting is `?aa=taa&taa=0`, which is how a temporal frame and the SMAA fallback are captured from
   * one URL pattern.
   */
  const antiAliasing: AntiAliasingMode =
    aa === 'msaa' || aa === 'fxaa' || aa === 'smaa' || aa === 'taa' || aa === 'none'
      ? aa
      : config.postProcessing.antiAliasing;
  const namedStrategy =
    aa === 'msaa' || aa === 'fxaa' || aa === 'smaa' || aa === 'taa' || aa === 'none';
  const taaEnabled =
    taa === null || taa === ''
      ? namedStrategy
        ? aa === 'taa'
        : config.postProcessing.temporalAntiAliasing.enabled
      : taa !== '0' && taa !== 'false';

  const temporalAntiAliasing = {
    ...config.postProcessing.temporalAntiAliasing,
    enabled: taaEnabled,
    // A fixed render scale implies fixed resolution: asking for `?res=0.6` and still letting the controller
    // move the scale would be two answers to one question, so the explicit scale wins and the adaptive
    // path is switched off with it.
    ...(Number.isFinite(res) && res > 0
      ? {
          dynamicResolution: false,
          renderScale: Math.min(config.postProcessing.temporalAntiAliasing.maxScale, res),
        }
      : {}),
    ...(dynres === null || dynres === ''
      ? {}
      : { dynamicResolution: dynres !== '0' && dynres !== 'false' }),
  };

  const motionBlur = {
    ...config.postProcessing.motionBlur,
    ...(mblur === null || mblur === '' ? {} : { enabled: mblur !== '0' && mblur !== 'false' }),
    ...(Number.isFinite(mbStrength) ? { intensity: Math.max(0, mbStrength) } : {}),
  };

  const godraysConfig = {
    ...config.postProcessing.godrays,
    ...(godrays === null || godrays === ''
      ? {}
      : { enabled: godrays !== '0' && godrays !== 'false' }),
  };

  const contactShadows = {
    ...config.postProcessing.contactShadows,
    ...(contact === null || contact === ''
      ? {}
      : { enabled: contact !== '0' && contact !== 'false' }),
  };

  const ssgi = {
    ...config.postProcessing.ssgi,
    ...(ssgiSwitch === null || ssgiSwitch === ''
      ? {}
      : { enabled: ssgiSwitch !== '0' && ssgiSwitch !== 'false' }),
  };

  /**
   * `?tonemap=aces|agx|neutral` replays the same frame through a different tone curve. The
   * look LUT was authored on top of ACES, so an AgX frame is *not* the shipped look — it is
   * the comparison the plan owes (which curve's highlight behaviour suits this game's sky),
   * and it can only be run as a switch, never by editing the default between captures.
   */
  const renderer: RendererConfig = {
    ...config.renderer,
    ...(tonemap === 'aces' || tonemap === 'agx' || tonemap === 'neutral'
      ? { toneMapping: tonemap }
      : {}),
  };

  /**
   * The diagnostics overlay is developer instrumentation, not a player HUD: it is only
   * shown when the URL asks for it (`?debug`, or explicitly `?overlay=1`) and
   * `?overlay=0` always hides it. A plain player visit gets a clean screen.
   */
  const overlaySwitch = params.get('overlay');
  const diagnostics = {
    ...config.diagnostics,
    overlayEnabled:
      overlaySwitch !== null && overlaySwitch !== ''
        ? overlaySwitch !== '0' && overlaySwitch !== 'false'
        : params.has('debug'),
  };

  return {
    ...config,
    diagnostics,
    renderer,
    atmosphere: {
      ...config.atmosphere,
      clouds: {
        ...config.atmosphere.clouds,
        // The cloud layer animates with wall-clock time even when the sun is frozen, so a
        // temporal-stability capture needs to be able to hold it still.
        ...(clouds === null || clouds === ''
          ? {}
          : { enabled: clouds !== '0' && clouds !== 'false' }),
      },
    },
    postProcessing: {
      ...config.postProcessing,
      antiAliasing,
      depthOfField,
      motionBlur,
      temporalAntiAliasing,
      godrays: godraysConfig,
      contactShadows,
      ssgi,
      // A switch of its own because grain is per-frame random: any A/B measurement between two
      // captures is grain noise until it can be turned off.
      filmGrain: {
        ...config.postProcessing.filmGrain,
        ...(grain === null || grain === '' ? {} : { enabled: grain !== '0' && grain !== 'false' }),
      },
      lut: lutConfig,
    },
  };
}
