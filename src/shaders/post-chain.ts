import {
  float,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  screenUV,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';
import { RenderPipeline } from 'three/webgpu';
import { Vector3, type Camera, type Scene } from 'three';
import type { Node, WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { builtinAOContext } from 'three/tsl';
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
  | 'smaa'
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
 * - SMAA is documented as requiring **pre**-sRGB input, while FXAA requires **post**-sRGB input —
 *   they are the same stage conceptually but sit on opposite sides of the colour-space conversion;
 * - chromatic aberration, sharpening, grain, and the vignette are all display-referred lens/grade
 *   effects and run after tone mapping; sharpening precedes grain so it never amplifies noise;
 * - FXAA runs last, on the finished sRGB image.
 */
const EFFECT_ORDER: readonly PostEffectName[] = [
  'ao',
  'grade',
  'bloom',
  'smaa',
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
  if (postProcessing.antiAliasing === 'smaa') enabled.add('smaa');
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

  return { pipeline, scenePass, effects, gradeTint };
}
