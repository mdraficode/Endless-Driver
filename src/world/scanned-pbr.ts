import type { Texture } from 'three';
import type { MeshStandardNodeMaterial, Node } from 'three/webgpu';
import { float, mix, normalMap, texture, vec2 } from 'three/tsl';

/**
 * A scanned, non-emissive opaque PBR surface. The asset manifest assigns sRGB to `diffuse` and
 * linear colour space to the tangent-space normal and packed AO/roughness/metalness map.
 */
export interface ScannedPbrMaps {
  readonly diffuse: Texture;
  readonly normal: Texture;
  /** Red = ambient occlusion, green = roughness, blue = metalness. */
  readonly arm: Texture | null;
}

export interface ScannedPbrOptions {
  /** Optional linear tint/large-scale modulation applied to the scanned albedo. */
  readonly albedoTint?: Node<'vec4'>;
  /** Scalar applied to the tangent-space normal before the TBN transform. */
  readonly normalStrength?: number;
  /** Blend between unoccluded white and the packed AO channel. */
  readonly aoStrength?: number;
  /** Scalar for the packed metallic channel, useful for documented authoring adjustments. */
  readonly metalnessScale?: number;
  /** Zero-centred adjustment that preserves an authored roughness detail node around the scan. */
  readonly roughnessAdjustment?: Node<'float'>;
}

/**
 * Binds physically meaningful scanned maps to a WebGPU/TSL standard material.
 *
 * `normalMap()` is important here: sampled RGB is tangent-space data, not a view-space normal.
 * Assigning it straight to `normalNode` bypasses the TBN transform and produces incorrect
 * lighting. Glass and emissive materials intentionally do not use this helper.
 */
export function bindScannedPbrMaps(
  material: MeshStandardNodeMaterial,
  maps: ScannedPbrMaps,
  uvNode: Node<'vec2'>,
  options: ScannedPbrOptions = {},
): void {
  const albedo = texture(maps.diffuse, uvNode);
  material.colorNode = options.albedoTint === undefined ? albedo : albedo.mul(options.albedoTint);
  material.normalNode = normalMap(
    texture(maps.normal, uvNode).rgb,
    vec2(options.normalStrength ?? 0.8, options.normalStrength ?? 0.8),
  );

  if (maps.arm !== null) {
    const packed = texture(maps.arm, uvNode);
    material.roughnessNode = packed.g.add(options.roughnessAdjustment ?? float(0)).clamp(0.04, 1);
    material.metalnessNode = packed.b.mul(float(options.metalnessScale ?? 1)).clamp(0, 1);
    material.aoNode = mix(float(1), packed.r, float(options.aoStrength ?? 1)).clamp(0, 1);
  }

  material.needsUpdate = true;
}
