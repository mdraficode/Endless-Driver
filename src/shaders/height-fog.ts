import { Color, Vector3 } from 'three';
import {
  cameraPosition,
  densityFogFactor,
  exponentialHeightFogFactor,
  float,
  fog,
  max,
  mix,
  positionWorld,
  uniform,
} from 'three/tsl';
import type { Node, UniformNode } from 'three/webgpu';
import type { SkyConfig } from '../config/render';

/**
 * Height-aware aerial perspective, as a `scene.fogNode`.
 *
 * three's fog node runs *inside* each material's fragment stage, after lighting: `output` is the
 * lit colour and the node mixes it towards the fog colour by a factor. Building the factor from
 * `densityFogFactor` (distance) combined with `exponentialHeightFogFactor` (low places pool,
 * high places clear) replaces the old linear `fogNear`/`fogFar` band with the three cues that
 * make distance read as depth:
 *
 * 1. **Distance** — exponential, so the transition has no visible near edge where fog switches on.
 * 2. **Height** — fragments below `heightMeters` gather extra fog in proportion to depth below
 *    the threshold times distance marched; a ridge above it gets none. The valley fills; the
 *    skyline stays readable. This is the term a distance band cannot express at all.
 * 3. **Sun in-scatter** — the fog *colour* is view-dependent: looking towards the sun, the air
 *    itself brightens towards the sun's colour (forward scattering); looking away, it stays the
 *    sky's haze colour. The mix is computed per fragment from the world-space view direction, so
 *    the brightening sweeps correctly as the camera turns.
 *
 * All live values are uniform nodes owned by the caller (`SceneManager`), written per frame from
 * the resolved daylight state — the same contract as the post chain's grade tint: write the
 * node's `.value`, never rebuild the graph. The sun colour uniform arrives pre-scaled by the
 * sun's intensity, so the scatter lobe fades out at night without a second switch.
 */
export interface HeightFogUniforms {
  /** Haze colour, from the daylight state's fog tint. */
  readonly fogColour: UniformNode<'color', Color>;
  /** Sun colour, pre-multiplied by sun intensity (black at night). */
  readonly sunColour: UniformNode<'color', Color>;
  /** Unit vector towards the sun, world space. */
  readonly sunDirection: UniformNode<'vec3', Vector3>;
  readonly distanceDensity: UniformNode<'float', number>;
  readonly heightDensity: UniformNode<'float', number>;
}

/** The node plus the uniforms it samples, so the owner can drive it per frame. */
export interface HeightFog {
  readonly node: Node<'vec4'>;
  readonly uniforms: HeightFogUniforms;
}

export function createHeightFog(sky: SkyConfig): HeightFog {
  const { heightFog } = sky;
  const uniforms: HeightFogUniforms = {
    fogColour: uniform(new Color(sky.fogColorDay)),
    sunColour: uniform(new Color(0x000000)),
    sunDirection: uniform(new Vector3(0, 1, 0)),
    distanceDensity: uniform(heightFog.distanceDensity),
    heightDensity: uniform(heightFog.heightDensity),
  };

  // Forward-scatter lobe: 0 looking away from the sun, 1 looking into it.
  const viewDirection = positionWorld.sub(cameraPosition).normalize();
  const intoSun = max(viewDirection.dot(uniforms.sunDirection), float(0));
  const scatter = intoSun
    .pow(float(heightFog.sunScatterPower))
    .mul(float(heightFog.sunScatterStrength));
  const colour = mix(uniforms.fogColour, uniforms.sunColour, scatter);

  // Union of the two density terms: either one alone can fully fog a fragment, and together
  // they saturate rather than double-count.
  const distanceFactor = densityFogFactor(uniforms.distanceDensity) as unknown as Node<'float'>;
  const heightFactor = exponentialHeightFogFactor(
    uniforms.heightDensity,
    float(heightFog.heightMeters),
  ) as unknown as Node<'float'>;
  const factor = distanceFactor.add(heightFactor).sub(distanceFactor.mul(heightFactor));

  return {
    node: fog(colour as unknown as Node<'vec3'>, factor) as unknown as Node<'vec4'>,
    uniforms,
  };
}
