import type { TemporalAntiAliasingConfig } from '../config/render';
import type { PostEffectName } from '../shaders/post-chain';

/**
 * Whether a built post chain can use a scaled scene pass.
 *
 * TAAU reconstructs the scene at output resolution. Spatial AA (FXAA/SMAA) can also use a bounded
 * scene-pass scale when requested; the final image is linearly upscaled and can be softer.
 */
export function supportsScenePassResolutionScale(
  effects: readonly PostEffectName[],
  temporal: Pick<TemporalAntiAliasingConfig, 'dynamicResolution' | 'renderScale'>,
): boolean {
  if (effects.includes('taa')) {
    return true;
  }
  const hasSpatialAntialiasing = effects.includes('fxaa') || effects.includes('smaa');
  return hasSpatialAntialiasing && (temporal.dynamicResolution || temporal.renderScale !== 1);
}
