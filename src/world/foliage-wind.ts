import type { Node } from 'three/webgpu';
import { float, positionGeometry, positionLocal, sin, smoothstep, time, vec3 } from 'three/tsl';

import { FOLIAGE_WIND_CONFIG } from '../config/foliage-wind';
import type { TierId } from '../config/tiers';

/**
 * Returns a bounded TSL vertex-position node for leaf sway, or null when the tier has wind off.
 * `foliageMask` leaves trunks, rocks and other authored vertices fixed; scanned leaf parts pass 1.
 * World-position and local crown phases avoid synchronized motion and remain stable across stream rebuilds.
 */
export function createFoliageWindPositionNode(
  foliageMask: Node<'float'>,
  tier: TierId,
): Node<'vec3'> | null {
  const amplitude = FOLIAGE_WIND_CONFIG.amplitudeMetersByTier[tier];
  if (amplitude <= 0) {
    return null;
  }

  const fieldPhase = positionLocal.x
    .mul(FOLIAGE_WIND_CONFIG.fieldPhaseRadiansPerMeter.x)
    .add(positionLocal.z.mul(FOLIAGE_WIND_CONFIG.fieldPhaseRadiansPerMeter.z));
  const crownPhase = positionGeometry.x
    .mul(FOLIAGE_WIND_CONFIG.crownPhaseRadiansPerMeter.x)
    .add(positionGeometry.y.mul(FOLIAGE_WIND_CONFIG.crownPhaseRadiansPerMeter.y))
    .add(positionGeometry.z.mul(FOLIAGE_WIND_CONFIG.crownPhaseRadiansPerMeter.z));
  const phase = time
    .mul(FOLIAGE_WIND_CONFIG.angularSpeedRadiansPerSecond)
    .add(fieldPhase)
    .add(crownPhase);
  const heightGate = smoothstep(
    FOLIAGE_WIND_CONFIG.heightGateStartMeters,
    FOLIAGE_WIND_CONFIG.heightGateEndMeters,
    positionGeometry.y,
  );
  const sway = sin(phase).mul(amplitude).mul(heightGate).mul(foliageMask);

  return positionLocal.add(vec3(sway, float(0), sway.mul(FOLIAGE_WIND_CONFIG.lateralRatio)));
}

/** Resolves the maximum authored canopy displacement used by diagnostics and tests. */
export function resolveFoliageWindAmplitude(tier: TierId): number {
  return FOLIAGE_WIND_CONFIG.amplitudeMetersByTier[tier];
}
