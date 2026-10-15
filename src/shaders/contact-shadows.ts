import { Vector3, type Camera } from 'three';
import {
  Fn,
  If,
  Loop,
  float,
  getScreenPosition,
  getViewPosition,
  int,
  interleavedGradientNoise,
  max,
  min,
  perspectiveDepthToViewZ,
  screenCoordinate,
  screenUV,
  smoothstep,
  uniform,
  vec4,
} from 'three/tsl';
import type { Node, UniformNode } from 'three/webgpu';
import type { ContactShadowsConfig } from '../config/render';

/**
 * Screen-space contact shadows, as one TSL march over the scene depth.
 *
 * Cascaded shadow maps cannot resolve the last few centimetres: the near cascade spreads its
 * texels over tens of metres, so the contact line where a tyre, a kerb, or a fence post meets
 * the ground is exactly the detail the shadow map throws away — and the eye reads its absence
 * as floating. This pass restores it from the depth buffer the frame already has: from each
 * surface point, step a short distance towards the sun; if another surface sits between the
 * point and the sun within that distance, the point is in contact shadow and darkens.
 *
 * The march runs in the linear HDR stage, before the temporal resolve, for the same reason
 * the occlusion term does: the resolve accumulates whatever is upstream, so the stepping
 * noise this produces is averaged away instead of being sharpened into the finished frame.
 * Like every screen-space technique it can only see what is on screen — an occluder outside
 * the frame casts nothing, which is why the distance is kept at contact scale (under two
 * metres): at that range the occluder is nearly always in frame with its shadow.
 *
 * The light direction and strength are live uniforms owned by the caller, written per frame
 * from the daylight state (see `Engine.setContactSun`): view-space unit direction towards
 * the sun, and the configured strength pre-multiplied by the daylight gate, so the effect
 * fades out at night rather than darkening a scene the sun has left.
 */
export interface ContactShadowHandles {
  readonly node: Node<'vec4'>;
  /** View-space unit direction towards the sun. Mutate in place; never replace. */
  readonly sunDirectionView: Vector3;
  /** Live strength: configured strength × daylight gate, written per frame. */
  readonly sunStrength: UniformNode<'float', number>;
  /** The configured strength, so the engine can apply the gate without re-reading config. */
  readonly baseStrength: number;
}

type TexturedColorNode = Node<'vec4'> & {
  sample(uvNode: Node): Node<'vec4'>;
};

export function createContactShadowNode(
  input: Node<'vec4'>,
  depthNode: Node<'vec4'>,
  camera: Camera,
  config: ContactShadowsConfig,
): ContactShadowHandles {
  const sunDirectionView = new Vector3(0, 1, 0);
  const sunStrength = uniform(config.strength);

  const clipNear = 'near' in camera ? (camera.near as number) : 0.1;
  const clipFar = 'far' in camera ? (camera.far as number) : 1000;
  const near = float(clipNear);
  const far = float(clipFar);
  // References, not copies: the camera mutates these matrices in place on resize, and the
  // uniform holds the same instance, so the march always projects through the live camera.
  const projection = uniform(camera.projectionMatrix);
  const projectionInverse = uniform(camera.projectionMatrixInverse);

  const colorTexture = input as unknown as TexturedColorNode;
  const depthTexture = depthNode as unknown as TexturedColorNode;

  const shade = Fn(() => {
    const color = colorTexture.sample(screenUV);
    const depth = depthTexture.sample(screenUV).r;

    // Sky and far plane: no surface, hence nothing to ground. The factor starts at zero and
    // the guard below keeps it there for depth at the far plane.
    const occlusion = float(0).toVar();
    const isSurface = depth.lessThan(0.99999);

    If(isSurface, () => {
      const viewPosition = getViewPosition(screenUV, depth, projectionInverse);
      const sunView = uniform(sunDirectionView).normalize();
      const stepLength = float(config.maxDistanceMeters / config.steps);
      // One interleaved-gradient offset per pixel, so the steps do not land on the same
      // distances across the frame (which would print as banding along the shadow edge).
      const jitter = interleavedGradientNoise(screenCoordinate);

      Loop({ start: 0, end: int(config.steps) }, ({ i }) => {
        const along = float(i).add(jitter).add(0.25).mul(stepLength);
        const point = viewPosition.add(sunView.mul(along));
        const stepUv = getScreenPosition(point, projection);
        const stepDepth = depthTexture.sample(stepUv).r;
        const sceneDistance = perspectiveDepthToViewZ(stepDepth, near, far).negate();
        const pointDistance = point.z.negate();

        // An occluder counts when it is nearer the camera than the march point (something
        // is between the surface and the sun) but not implausibly far in front of it
        // (that is a nearer object, not a contact occluder: thickness is the tolerance).
        const occludes = sceneDistance
          .lessThan(pointDistance)
          .and(pointDistance.sub(sceneDistance).lessThan(float(config.thicknessMeters)));
        // Steps that project outside the frame see nothing; fade the last of the march so
        // the shadow ends softly instead of at the full distance.
        const inFrame = stepUv.x
          .greaterThanEqual(0)
          .and(stepUv.x.lessThanEqual(1))
          .and(stepUv.y.greaterThanEqual(0))
          .and(stepUv.y.lessThanEqual(1));
        const edge = smoothstep(
          float(0),
          float(0.04),
          min(min(stepUv.x, float(1).sub(stepUv.x)), min(stepUv.y, float(1).sub(stepUv.y))),
        );
        const fading = float(1).sub(along.div(float(config.maxDistanceMeters)));
        const contribution = occludes.and(inFrame).select(fading.mul(fading).mul(edge), float(0));
        occlusion.assign(max(occlusion, contribution));
      });
    });

    const darkened = color.rgb.mul(float(1).sub(occlusion.mul(sunStrength)));
    return vec4(darkened, color.a);
  });

  return {
    node: shade() as unknown as Node<'vec4'>,
    sunDirectionView,
    sunStrength,
    baseStrength: config.strength,
  };
}
