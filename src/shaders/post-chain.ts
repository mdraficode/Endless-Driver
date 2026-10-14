import {
  float,
  mrt,
  normalView,
  output,
  pass,
  perspectiveDepthToViewZ,
  renderOutput,
  screenUV,
  int,
  texture3D,
  uniform,
  vec2,
  vec4,
  velocity,
} from 'three/tsl';
import { RenderPipeline } from 'three/webgpu';
import { Vector3, type Camera, type Scene } from 'three';
import type { Node, UniformNode, WebGPURenderer } from 'three/webgpu';
import type { Data3DTexture } from 'three';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { builtinAOContext } from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { motionBlur as motionBlurNode } from 'three/addons/tsl/display/MotionBlur.js';
import { createLookTexture } from './lut-identity';
import type { RenderConfig } from '../config/render';
import { createVignetteNode } from './vignette';

/**
 * The display-library nodes are typed as `TempNode` subclasses in `@types/three` while the runtime
 * classes are ordinary nodes, so a cast is needed to keep them in one expression chain. The cast is
 * cosmetic: each of these nodes resolves to a `vec4` at build time.
 */
type ColorNode = Node<'vec4'>;
const asColor = (node: unknown): ColorNode => node as ColorNode;

/** The same cast for the `vec2` side of the graph — the motion vectors, and nothing else. */
type TexelNode = Node<'vec2'>;
const asTexel = (node: unknown): TexelNode => node as TexelNode;

/**
 * The post-processing chain.
 *
 * `resolvePostEffects()` is the single source of truth for *which* effects run and *in what order*;
 * `buildPostChain()` walks that list and assembles the TSL graph. Keeping the order in a pure
 * function means it can be asserted in Node without a GPU, and the HUD can print exactly what the
 * frame went through.
 */
export type PostEffectName =
  | 'ao'
  | 'taa'
  | 'grade'
  | 'bloom'
  | 'motionBlur'
  | 'dof'
  | 'smaa'
  | 'lut'
  | 'chromaticAberration'
  | 'sharpen'
  | 'filmGrain'
  | 'vignette'
  | 'fxaa';

/**
 * Canonical order. The constraints that fix it:
 *
 * - ambient occlusion modulates *lighting*, so it is applied to the scene pass while the image is
 *   still linear HDR — not as a link in the display chain;
 * - temporal anti-aliasing wraps the *scene pass* rather than the finished frame, immediately after the
 *   occlusion term. That placement is the whole point of it: the resolve accumulates jittered samples of
 *   whatever is upstream, so putting it here means the noise the scene pass itself produces — occlusion
 *   estimate, shadow-map edges, specular highlights crawling across a surface — is what gets averaged
 *   away. Placed at the end of the chain it would still smooth edges, but the frame it would be averaging
 *   is one that already has grain and sharpening in it, and neither is something to accumulate;
 * - motion blur is an exposure: it integrates the light the sensor received while the shutter was open,
 *   so it belongs on the *scene* image in the linear HDR stage — directly on the resolved scene pass,
 *   ahead of the grade, the bloom, and the depth of field. That position is also the only one the effect
 *   can take: `motionBlur` samples its input as a texture (it walks `input.sample(uv + offset)` along the
 *   motion vector), so the node it is handed has to *be* a texture. Handing it a composed expression —
 *   a multiply, an add, the output of another effect — is a `TypeError` inside three's node setup, which
 *   three catches, logs, and then renders around, producing a black frame with no exception on the page.
 *   It was the second bug this slice found the hard way, and the reason the effect is not further down;
 * - the grade is a linear-light multiplier, so it sits in the HDR stage too, ahead of bloom so the
 *   highlights it warms are the ones that bloom;
 * - bloom is additive light, so it belongs in linear HDR before tone mapping;
 * - depth of field blurs *light*, so it also belongs in the HDR stage: blurring after tone mapping
 *   blurs compressed-and-clamped pixels, which is why out-of-focus highlights in a display-referred
 *   pipeline look like grey discs instead of the bright blobs a real lens produces. It runs before
 *   SMAA, which wants to resolve edges rather than re-antialias a blur;
 * - SMAA is documented as requiring **pre**-sRGB input, while FXAA requires **post**-sRGB input —
 *   they are the same stage conceptually but sit on opposite sides of the colour-space conversion;
 * - the look LUT is display-referred by necessity, not by preference: `Lut3DNode` reads the incoming
 *   `rgb` *as* the lookup coordinates, so anything outside 0-1 samples outside the table. It is
 *   therefore the first effect after tone mapping and the colour-space transfer;
 * - chromatic aberration, sharpening, grain, and the vignette are all display-referred lens/grade
 *   effects and run after tone mapping; sharpening precedes grain so it never amplifies noise;
 * - FXAA runs last, on the finished sRGB image.
 */
const EFFECT_ORDER: readonly PostEffectName[] = [
  'ao',
  'taa',
  'motionBlur',
  'grade',
  'bloom',
  'dof',
  'smaa',
  'lut',
  'chromaticAberration',
  'sharpen',
  'filmGrain',
  'vignette',
  'fxaa',
];

/** Every effect the configuration switches on, in the order the chain applies them. */
export function resolvePostEffects(config: RenderConfig): PostEffectName[] {
  const { postProcessing } = config;
  if (!postProcessing.enabled) {
    return [];
  }

  const enabled = new Set<PostEffectName>();
  if (postProcessing.ambientOcclusion.enabled) enabled.add('ao');
  if (postProcessing.grade.enabled) enabled.add('grade');
  if (postProcessing.bloom.enabled) enabled.add('bloom');
  if (postProcessing.depthOfField.enabled) enabled.add('dof');
  if (postProcessing.motionBlur.enabled) enabled.add('motionBlur');
  if (postProcessing.lut.enabled) enabled.add('lut');

  /**
   * The temporal resolve and the spatial ones are mutually exclusive, and the resolution of that conflict
   * is what `AntiAliasingMode` is for. Temporal AA wins when it is switched on — it is strictly the more
   * capable of the two, and running both would anti-alias an image that has already been resolved, on top
   * of paying for a second full-screen pass. When the temporal path is *off* but the tier's strategy is
   * `taa`, the frame falls back to SMAA rather than to nothing: `?taa=0` is a comparison switch, and a
   * comparison against a jagged frame says nothing about temporal stability.
   */
  const temporal = postProcessing.temporalAntiAliasing.enabled;
  if (temporal) {
    enabled.add('taa');
  } else if (postProcessing.antiAliasing === 'taa') {
    enabled.add('smaa');
  }
  if (!temporal && postProcessing.antiAliasing === 'smaa') enabled.add('smaa');
  if (postProcessing.chromaticAberration.enabled) enabled.add('chromaticAberration');
  if (postProcessing.sharpen.enabled) enabled.add('sharpen');
  if (postProcessing.filmGrain.enabled) enabled.add('filmGrain');
  if (postProcessing.vignette.enabled) enabled.add('vignette');
  if (!temporal && postProcessing.antiAliasing === 'fxaa') enabled.add('fxaa');

  return EFFECT_ORDER.filter((effect) => enabled.has(effect));
}

/**
 * True when any effect needs the scene rendered with a normals attachment (AO does).
 *
 * A normals attachment costs a second colour target for the whole scene, so it is requested only when an
 * effect in the chain actually reads it — which is also why the MRT dictionary is assembled rather than
 * written out.
 */
export function requiresSceneNormals(effects: readonly PostEffectName[]): boolean {
  return effects.includes('ao');
}

/**
 * True when any effect needs per-pixel motion vectors.
 *
 * Motion vectors are the single shared cost of the two effects this version adds, and the reason they were
 * built in one slice: the velocity attachment is written once per frame by the scene pass whether one
 * effect reads it or three, and both `taa` and `motionBlur` read *the same buffer*. One attachment, two
 * effects — and the same buffer is what a future screen-space reflection or denoiser pass would reproject
 * with.
 *
 * The attachment is only requested when something reads it, because writing velocity is not free: it makes
 * every material in the scene emit a second output, and it switches the renderer into keeping
 * previous-frame matrices per object (`NodeBuilder.needsPreviousData()` keys off exactly this).
 */
export function requiresSceneVelocity(effects: readonly PostEffectName[]): boolean {
  return effects.includes('taa') || effects.includes('motionBlur');
}

/**
 * True when the chain performs its own tone mapping and colour-space conversion.
 *
 * Any effect positioned after tone mapping forces this: `renderOutput()` has to run inside the chain
 * so those effects see display-referred colour, and `RenderPipeline.outputColorTransform` must then
 * be switched off so the image is not transformed twice.
 */
export function chainsOwnsOutputTransform(effects: readonly PostEffectName[]): boolean {
  return effects.some((effect) =>
    effect === 'smaa' ||
    effect === 'lut' ||
    effect === 'chromaticAberration' ||
    effect === 'sharpen' ||
    effect === 'filmGrain' ||
    effect === 'vignette' ||
    effect === 'fxaa'
      ? true
      : false,
  );
}

export interface PostChain {
  readonly pipeline: RenderPipeline;
  readonly scenePass: ReturnType<typeof pass>;
  readonly effects: readonly PostEffectName[];
  /**
   * Live linear-RGB multiplier for the grade, mutated in place by `Engine.setGrade()`.
   *
   * It is a plain vector rather than a setter because TSL uniform nodes read `.value` at draw time:
   * writing `set()` on the same instance updates the next frame with no graph rebuild, exactly like
   * `renderer.toneMappingExposure`. The vector is neutral when the grade effect is not in the chain,
   * so a caller that writes to it unconditionally still cannot tint a frame it did not ask for.
   */
  readonly gradeTint: Vector3;
  /**
   * The uniform nodes the graph actually samples. Write `.value` on these; nothing else is connected.
   *
   * Handing out the *node* rather than a number is deliberate, and it is the difference between a
   * working effect and one that silently does nothing: `uniform(plainNumber)` wraps a copy of that
   * number, so a later write to the copy — or to the object it came from — never reaches the shader.
   * The effect still runs, the diagnostics still report the value the engine thinks it set, and the
   * frame is blurred at whatever number happened to be there when the graph was built. There is no
   * error, no warning, and no way to see it without measuring the image.
   *
   * These are nodes, not numbers, for that reason: a caller cannot accidentally write to a copy.
   */
  readonly focusDistance: UniformNode<'float', number>;
  /** Aperture multiplier, same contract as `focusDistance`. */
  readonly bokehScale: UniformNode<'float', number>;
  /** Look trim: 0 leaves the image ungraded, 1 applies the look as authored. */
  readonly lutIntensity: UniformNode<'float', number>;
  /**
   * Live multiplier on the motion vectors — the shutter angle. Same contract as `focusDistance`: a node,
   * not a number, so a caller cannot write to a copy and be told the effect is running.
   */
  readonly motionBlurIntensity: UniformNode<'float', number>;
  /**
   * The table the look is sampled from, deliberately owned by the chain rather than handed to it.
   *
   * The look arrives over the network, long after the node graph exists, and a graph that had to be
   * rebuilt when it did would either stutter on load or force every scene to wait for 100 KB of
   * colour before its first frame. The table starts as the identity, so "no look yet" and "no look
   * wanted" render identically — and a failed fetch degrades to no grading rather than no frame.
   */
  readonly lutTexture: Data3DTexture;
  readonly lutSize: number;
}

export interface PostChainOptions {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly config: RenderConfig;
}

/**
 * Builds the render pipeline for one scene/camera pair.
 *
 * The caller keeps the returned pipeline and re-points `scenePass.scene` / `scenePass.camera` when
 * the render camera changes, rather than rebuilding the graph: node graphs are expensive to
 * construct and cheap to re-target.
 */
export function buildPostChain(options: PostChainOptions): PostChain {
  const { renderer, scene, camera, config } = options;
  const effects = resolvePostEffects(config);
  const scenePass = pass(scene, camera);

  const wantsNormals = requiresSceneNormals(effects);
  const wantsVelocity = requiresSceneVelocity(effects);

  /**
   * One scene render, as many attachments as the chain actually reads.
   *
   * The dictionary is assembled rather than written out because each attachment is a real cost paid by
   * every material in the scene: normals double the colour output of the pass, motion vectors add a
   * second target and force every object to keep its previous-frame matrix. Requesting a buffer nothing
   * samples is the kind of overhead that never shows up in a screenshot and always shows up in a frame
   * time, so the attachments follow the chain exactly.
   */
  if (wantsNormals || wantsVelocity) {
    const attachments: Record<string, Node> = { output };
    if (wantsNormals) {
      attachments.normal = normalView;
    }
    if (wantsVelocity) {
      attachments.velocity = velocity;
    }
    scenePass.setMRT(mrt(attachments));
  }

  // --- ambient occlusion: applied to the scene pass, not chained after it -------------------
  if (wantsNormals) {
    const aoConfig = config.postProcessing.ambientOcclusion;
    const aoNode = ao(
      scenePass.getTextureNode('depth'),
      scenePass.getTextureNode('normal'),
      camera,
    );
    aoNode.radius.value = aoConfig.radius;
    aoNode.thickness.value = aoConfig.thickness;
    aoNode.distanceExponent.value = aoConfig.distanceExponent;
    aoNode.samples.value = aoConfig.samples;
    aoNode.scale.value = aoConfig.scale;
    aoNode.resolutionScale = aoConfig.resolutionScale;
    // `contextNode` is how an occlusion term reaches the lighting of the scene pass itself.
    scenePass.contextNode = builtinAOContext(
      aoNode.getTextureNode().sample(screenUV).r.mul(aoConfig.intensity),
    );
  }

  let color: ColorNode = asColor(scenePass.getTextureNode('output'));

  // --- temporal resolve: wraps the scene pass, before anything else touches the colour -------------
  if (effects.includes('taa')) {
    // TAAU, not TRAA: the same node also upscales, which is what lets `dynamicResolution` buy frame rate
    // from the scene pass rather than from a single effect. At a render scale of 1 it resolves at native
    // resolution with the same reconstruction filter, so one node covers both cases and the dynamic path
    // does not switch node types when the scale moves.
    //
    // The node owns its own history buffer, its own jitter sequence, and the camera's view offset: it
    // installs a `OnBeforeRenderPipeline` hook to jitter the projection matrix each frame and clears it
    // afterwards, which is why nothing in the engine has to know that jitter exists. That coupling is also
    // why the camera passed here must be the one the pass renders with — a mismatch would reproject the
    // history through the wrong projection and produce a frame that smears in the wrong direction, or
    // ghosts, rather than an error.
    const resolve = taau(
      scenePass.getTextureNode('output'),
      scenePass.getTextureNode('depth'),
      scenePass.getTextureNode('velocity'),
      camera,
    );
    // The *texture node*, not the resolve node itself, even though the resolve node's own setup returns
    // this same texture. The distinction matters downstream: several effects (motion blur, and any future
    // one) sample their input as a texture and so need an object that still has `.sample()`. The resolve
    // node is a `TempNode` — a perfectly good thing to end a chain with, and exactly the wrong thing to
    // feed into another effect.
    color = asColor(resolve.getTextureNode());
  }

  // --- shutter: the exposure itself, on the scene image -------------------------------------------
  const motionBlurConfig = config.postProcessing.motionBlur;
  const motionBlurIntensity = uniform(motionBlurConfig.intensity);
  if (effects.includes('motionBlur')) {
    /**
     * The velocity texture is sampled at the pixel's own screen position, and converted from the space the
     * node writes it in to the space the blur walks in.
     *
     * `VelocityNode` returns a delta in **normalised device coordinates**: x to the right, y **up**, both
     * in -1..1. The blur offsets a texture coordinate: x to the right, y **down**, both in 0..1. Passing
     * the vector through unchanged therefore blurs in the wrong direction on one axis and at twice the
     * intended distance on both — which renders as a plausible-looking smear, in the wrong direction, that
     * a still frame gives no way to catch. `vec2(0.5, -0.5)` is the conversion, and it is the same one
     * three's own temporal resolve applies to the same buffer.
     *
     * The multiplier after it is the shutter angle: 1 exposes the frame the motion vectors describe, less
     * than 1 reads as a faster shutter, more as a longer one. It is a uniform, so the number can be moved
     * while the car is driving, which is the only condition under which it can be judged.
     */
    const velocityUv = asTexel(
      scenePass
        .getTextureNode('velocity')
        .sample(screenUV)
        .mul(vec2(0.5, -0.5))
        .mul(motionBlurIntensity),
    );
    color = asColor(motionBlurNode(color, velocityUv, int(motionBlurConfig.samples)));
  }

  const gradeTint = new Vector3(1, 1, 1);
  const dofConfig = config.postProcessing.depthOfField;
  // Built once, here, and passed into the graph as *nodes*: see the note on `PostChain.focusDistance`.
  const focusDistance = uniform(dofConfig.focusDistance);
  const bokehScale = uniform(dofConfig.bokehScale);
  const lutConfig = config.postProcessing.lut;
  const lutIntensity = uniform(lutConfig.intensity);
  const lutSize = lutConfig.size;
  const lutTexture = createLookTexture(lutSize);

  // --- linear HDR stage ----------------------------------------------------------------------
  if (effects.includes('grade')) {
    // One `vec4` multiply: the tint is a colour, so the alpha channel is left alone.
    color = asColor(color.mul(vec4(uniform(gradeTint), 1)));
  }
  if (effects.includes('bloom')) {
    const bloomConfig = config.postProcessing.bloom;
    color = asColor(
      color.add(bloom(color, bloomConfig.strength, bloomConfig.radius, bloomConfig.threshold)),
    );
  }

  // --- pre-sRGB stage (SMAA documents that it must run before the colour-space conversion) ---
  if (effects.includes('dof')) {
    // `DepthOfFieldNode` wants view-space Z: the depth buffer run back through the projection, in
    // metres, negative in front of the camera. Passing the raw depth buffer compiles, renders, and
    // blurs by the wrong amount everywhere — a non-linear 0-1 depth is not a distance.
    // Every camera this project renders through is perspective — the chase camera and the debug orbit
    // camera both are — and the clip planes come from the scene's configuration rather than from a
    // guess. The `in` check is a guard against a future orthographic camera producing a NaN-blurred
    // frame rather than a compile error, not a statement that one is expected.
    const clipNear = 'near' in camera ? (camera.near as number) : 0.1;
    const clipFar = 'far' in camera ? (camera.far as number) : 1000;
    // `float()` around the clip planes because three's overloads take nodes; the runtime would accept
    // the numbers, and the conversion to a uniform is free.
    const viewZ = perspectiveDepthToViewZ(
      scenePass.getTextureNode('depth'),
      float(clipNear),
      float(clipFar),
    );
    color = asColor(dof(color, viewZ, focusDistance, float(dofConfig.focalLength), bokehScale));
  }
  if (effects.includes('smaa')) {
    color = asColor(smaa(color));
  }

  const ownsOutput = chainsOwnsOutputTransform(effects);
  if (ownsOutput) {
    // Tone mapping and colour-space conversion run here, inside the chain, so the display-referred
    // effects below see finished pixels. `outputColorTransform` is switched off to match.
    color = asColor(renderOutput(color));
  }

  // --- display-referred stage ---------------------------------------------------------------
  if (effects.includes('lut')) {
    // `Lut3DNode` reads the incoming rgb *as* the lookup coordinates, so this has to run where the
    // pixel is 0-1: after tone mapping and the colour-space transfer, before the lens effects.
    //
    // `texture3D`, not `texture`: the table is a `Data3DTexture`, and binding it through the 2D
    // accessor hands the shader a 2D sampler over a 3D texture — which compiles, reports nothing, and
    // samples black. The whole frame goes black, which is at least honest, but the absence of an error
    // is what makes it worth naming: there is no diagnostic between the wrong accessor and a black
    // screen. Verified in a browser: the same chain with `texture()` renders a black frame.
    color = asColor(lut3D(color, texture3D(lutTexture), lutSize, lutIntensity));
  }
  if (effects.includes('chromaticAberration')) {
    const ca = config.postProcessing.chromaticAberration;
    // The centre must be an explicit node. Passing `undefined` (which the node's own default, and
    // its documentation, suggest is fine) makes its internal `Fn` receive a null input; three logs
    // `Cannot read properties of null (reading 'build')` from `generateInput()` instead of throwing,
    // so the frame silently renders black. Verified in a browser: the effect works with a real
    // centre and fails without one.
    color = asColor(
      chromaticAberration(color, float(ca.strength), vec2(0.5, 0.5), float(ca.scale)),
    );
  }
  if (effects.includes('sharpen')) {
    const sharpenConfig = config.postProcessing.sharpen;
    color = asColor(sharpen(color, sharpenConfig.sharpness, sharpenConfig.denoise));
  }
  if (effects.includes('filmGrain')) {
    color = asColor(film(color, float(config.postProcessing.filmGrain.intensity)));
  }
  if (effects.includes('vignette')) {
    color = createVignetteNode(color, config.postProcessing.vignette);
  }
  if (effects.includes('fxaa')) {
    color = asColor(fxaa(color));
  }

  const pipeline = new RenderPipeline(renderer, color);
  pipeline.outputColorTransform = !ownsOutput;

  return {
    pipeline,
    scenePass,
    effects,
    gradeTint,
    focusDistance,
    bokehScale,
    lutIntensity,
    motionBlurIntensity,
    lutTexture,
    lutSize,
  };
}
