import { float, mix, screenSize, screenUV, smoothstep, uniform, vec2 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { VignetteConfig } from '../config/render';

/**
 * Custom TSL vignette.
 *
 * Three's display library has no vignette node, so this is written directly in TSL — custom shading
 * in this project is TSL and nothing else (ADR 0004; `npm run guard:glsl` enforces it).
 *
 * Two properties are deliberate:
 *
 * - the falloff is measured in **aspect-corrected** screen space, derived from `screenSize` inside
 *   the shader. Without that, the darkening is an ellipse on a widescreen display and the corners —
 *   exactly where vignetting is meant to work — barely darken at all;
 * - it is applied **after** tone mapping, so it shapes the finished image instead of the linear HDR
 *   values. Applied earlier it would read as a lighting change rather than a look.
 *
 * `start` is the normalised radius (0 = centre, 1 = frame corner) where the darkening begins, so a
 * value near 1 confines the effect to the corners and the centre of the road stays untouched.
 */
export function createVignetteNode(input: Node<'vec4'>, config: VignetteConfig): Node<'vec4'> {
  const intensity = uniform(config.intensity);
  const start = uniform(config.smoothness);

  // Aspect-corrected coordinates, normalised so the frame corners sit at radius 1.
  const aspect = screenSize.x.div(screenSize.y);
  const centred = screenUV.sub(vec2(0.5, 0.5)).mul(vec2(aspect, 1));
  const cornerExtent = vec2(0.5, 0.5).mul(vec2(aspect, 1)).length();
  const radius = centred.length().div(cornerExtent);

  const falloff = smoothstep(start, float(1), radius);
  const scale = mix(float(1), float(1).sub(intensity), falloff);

  return input.mul(scale);
}
