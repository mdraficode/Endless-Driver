import { MeshStandardMaterial, type Material } from 'three';
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import {
  cameraPosition,
  float,
  materialEmissive,
  normalWorld,
  positionWorld,
  vec3,
} from 'three/tsl';

import { FOLIAGE_LIGHTING_CONFIG } from '../config/foliage-lighting';
import type { TierId } from '../config/tiers';
import { createFoliageWindPositionNode } from './foliage-wind';

/** Only leaf-like scanned materials get the foliage treatment; bark and dead branches stay put. */
export function isFoliageMaterial(material: Material): material is MeshStandardMaterial {
  return (
    material instanceof MeshStandardMaterial &&
    /leaf|leaves|twig|needle|foliage/i.test(material.name)
  );
}

/**
 * Resolves a daylight multiplier for foliage backlighting. The clock's phase intensity is a
 * multiplier in [0, 1]; the night gate prevents a fake emissive glow after the sun has set.
 */
export function resolveFoliageBacklightStrength(sunIntensity: number, isNight: boolean): number {
  if (isNight || !Number.isFinite(sunIntensity)) {
    return 0;
  }
  const daylight = Math.max(0, Math.min(1, sunIntensity));
  return FOLIAGE_LIGHTING_CONFIG.backlightStrength * daylight;
}

/**
 * A thin, shared leaf-transmission approximation: only foliage facing the camera and away from
 * the sun receives the added tint. It is deliberately bounded, follows the resolved daylight
 * direction/colour, and adds to `materialEmissive` so existing GLTF emissive maps are retained.
 */
export function createFoliageEmissiveNode(
  foliageMask: Node<'float'>,
  sunDirection: Node<'vec3'>,
  sunTint: Node<'vec3'>,
  sunStrength: Node<'float'>,
): Node<'vec3'> {
  const viewDirection = cameraPosition.sub(positionWorld).normalize();
  const facingCamera = normalWorld.dot(viewDirection).max(0);
  const sunBehindLeaf = normalWorld.dot(sunDirection).negate().max(0);
  const transmission = sunBehindLeaf
    .mul(facingCamera)
    .pow(FOLIAGE_LIGHTING_CONFIG.backlightPower)
    .mul(sunStrength)
    .mul(foliageMask);

  return materialEmissive.add(vec3(sunTint).mul(transmission));
}

/**
 * Scanned foliage needs its own node material because the authored trees use a vertex mask.
 * `copy` preserves the GLTF material's standard maps, alpha settings, sidedness, roughness and
 * existing emissive values before the small albedo lift and leaf-only lighting are applied.
 */
export function createScannedFoliageMaterial(
  source: MeshStandardMaterial,
  sunDirection: Node<'vec3'>,
  sunTint: Node<'vec3'>,
  sunStrength: Node<'float'>,
  tier: TierId = 'A',
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial().copy(source);
  // Material stores this behind `_alphaTest`, which NodeMaterial.copy deliberately skips as a
  // private field. Copy the public value explicitly so cutout foliage keeps its silhouette.
  material.alphaTest = source.alphaTest;
  material.color.multiplyScalar(FOLIAGE_LIGHTING_CONFIG.albedoLift);
  material.emissiveNode = createFoliageEmissiveNode(
    // Each scanned part is a foliage material, so it does not need an extra geometry attribute.
    // A constant node mask keeps the graph shared and avoids modifying the derived GLB geometry.
    float(1),
    sunDirection,
    sunTint,
    sunStrength,
  );
  const foliageWind = createFoliageWindPositionNode(float(1), tier);
  if (foliageWind !== null) {
    material.positionNode = foliageWind;
  }
  return material;
}
