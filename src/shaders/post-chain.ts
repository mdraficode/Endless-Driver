import {
  float,
  mrt,
  normalView,
  output,
  pass,
  perspectiveDepthToViewZ,
  renderOutput,
  screenUV,
  texture3D,
  uniform,
  vec2,
  vec4,
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
  | 'grade'
  | 'bloom'
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
  if (postProcessing.antiAliasing === 'smaa') enabled.add('smaa');
  if (postProcessing.lut.enabled) enabled.add('lut');
  if (postProcessing.chromaticAberration.enabled) enabled.add('chromaticAberration');
  if (postProcessing.sharpen.enabled) enabled.add('sharpen');
  if (postProcessing.filmGrain.enabled) enabled.add('filmGrain');
  if (postProcessing.vignette.enabled) enabled.add('vignette');
  if (postProcessing.antiAliasing === 'fxaa') enabled.add('fxaa');

  return EFFECT_ORDER.filter((effect) => enabled.has(effect));
}

/** True when any effect needs the scene rendered with a normals attachment (AO does). */
export function requiresSceneNormals(effects: readonly PostEffectName[]): boolean {
  return effects.includes('ao');
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

  // --- ambient occlusion: applied to the scene pass, not chained after it -------------------
  if (requiresSceneNormals(effects)) {
    const aoConfig = config.postProcessing.ambientOcclusion;
    // One scene render producing colour + view normals; AO reads both from this pass.
    scenePass.setMRT(mrt({ output, normal: normalView }));
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
    lutTexture,
    lutSize,
  };
}
