import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { RenderConfig } from '../config/render';

/**
 * Procedural atmosphere.
 *
 * `SkyMesh` is three's Preetham model implemented as TSL nodes: turbidity, Rayleigh scattering, and
 * Mie coefficients feed a physical daytime sky, with a sun disc and a drifting cloud layer, all
 * driven by one sun direction. It replaces the hand-written gradient dome this project used in
 * Phases 1–2, which could not produce a sun glow, a horizon that reddens, or clouds.
 *
 * Two properties of the mesh shape how it is used:
 * - the shader writes `z = w`, so the dome is always drawn at the far plane. Scaling only affects
 *   the direction each pixel looks in, never depth, so the dome can never clip against the camera's
 *   far distance;
 * - the shader derives directions from `positionWorld - cameraPosition`, so the dome is moved along
 *   with the camera each frame (`SceneManager.followCamera`) and the horizon stays stable while
 *   driving.
 */
export function createAtmosphereSky(config: RenderConfig): SkyMesh {
  const { atmosphere } = config;
  const sky = new SkyMesh();
  sky.name = 'sky-atmosphere';
  sky.turbidity.value = atmosphere.turbidity;
  sky.rayleigh.value = atmosphere.rayleigh;
  sky.mieCoefficient.value = atmosphere.mieCoefficient;
  sky.mieDirectionalG.value = atmosphere.mieDirectionalG;
  sky.showSunDisc.value = atmosphere.showSunDisc ? 1 : 0;
  sky.cloudScale.value = atmosphere.clouds.scale;
  sky.cloudSpeed.value = atmosphere.clouds.speed;
  // A coverage of zero switches the cloud branch off entirely inside the model.
  sky.cloudCoverage.value = atmosphere.clouds.enabled ? atmosphere.clouds.coverage : 0;
  sky.cloudDensity.value = atmosphere.clouds.density;
  sky.cloudElevation.value = atmosphere.clouds.elevation;
  applySunPosition(sky, config);
  sky.scale.setScalar(config.camera.far * config.sky.domeScaleFactor);
  // The camera is always inside the dome; skip culling math for a static backdrop.
  sky.frustumCulled = false;
  return sky;
}

/**
 * Points the sky model at the configured sun.
 *
 * The model reads the vertical component of `sunPosition` as a distance when it fades the horizon
 * glow, so the unit direction is scaled by the configured sun distance before it is handed over.
 * Only the direction matters: the shader normalises it for everything else.
 */
export function applySunPosition(sky: SkyMesh, config: RenderConfig): void {
  const [x, y, z] = config.lighting.sunPosition;
  const length = Math.hypot(x, y, z) || 1;
  const distance = config.atmosphere.sunDistance;
  sky.sunPosition.value.set(
    (x / length) * distance,
    (y / length) * distance,
    (z / length) * distance,
  );
}
