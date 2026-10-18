import { Color, DoubleSide, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { describe, expect, it } from 'vitest';

import { FOLIAGE_LIGHTING_CONFIG } from '../../src/config/foliage-lighting';
import {
  createScannedFoliageMaterial,
  isFoliageMaterial,
  resolveFoliageBacklightStrength,
} from '../../src/world/foliage-lighting';
import { buildSpeciesGeometry } from '../../src/world/vegetation';

describe('foliage light response', () => {
  it('lifts authored leaf albedo and marks only the foliage vertices for backlighting', () => {
    const geometry = buildSpeciesGeometry('broadleaf', 0);
    const foliageMask = geometry.getAttribute('foliageMask');
    const colors = geometry.getAttribute('color');
    expect(foliageMask).toBeDefined();
    expect(colors).toBeDefined();

    const leafIndex = Array.from({ length: foliageMask.count }, (_, index) => index).find(
      (index) => foliageMask.getX(index) === 1,
    );
    const barkIndex = Array.from({ length: foliageMask.count }, (_, index) => index).find(
      (index) => foliageMask.getX(index) === 0,
    );
    expect(leafIndex).toBeDefined();
    expect(barkIndex).toBeDefined();

    const leafTint = new Color(0x4d7c3a).multiplyScalar(FOLIAGE_LIGHTING_CONFIG.albedoLift);
    const barkTint = new Color(0x6e4f36);
    expect(colors.getX(leafIndex!)).toBeCloseTo(leafTint.r);
    expect(colors.getY(leafIndex!)).toBeCloseTo(leafTint.g);
    expect(colors.getZ(leafIndex!)).toBeCloseTo(leafTint.b);
    expect(colors.getX(barkIndex!)).toBeCloseTo(barkTint.r);
    geometry.dispose();
  });

  it('keeps backlighting directional, daylight-scaled, and off at night', () => {
    expect(resolveFoliageBacklightStrength(1, false)).toBe(FOLIAGE_LIGHTING_CONFIG.backlightStrength);
    expect(resolveFoliageBacklightStrength(0.5, false)).toBeCloseTo(
      FOLIAGE_LIGHTING_CONFIG.backlightStrength / 2,
    );
    expect(resolveFoliageBacklightStrength(3, false)).toBe(FOLIAGE_LIGHTING_CONFIG.backlightStrength);
    expect(resolveFoliageBacklightStrength(-1, false)).toBe(0);
    expect(resolveFoliageBacklightStrength(Number.NaN, false)).toBe(0);
    expect(resolveFoliageBacklightStrength(1, true)).toBe(0);
  });

  it('converts named scanned leaves while preserving the GLTF material settings and emissive base', () => {
    const texture = new Texture();
    const source = new MeshStandardMaterial({
      name: 'fir_tree_01_twig',
      color: 0x294528,
      map: texture,
      transparent: true,
      alphaTest: 0.32,
      side: DoubleSide,
      emissive: 0x160b04,
      emissiveIntensity: 0.6,
    });
    const direction = uniform(new Vector3(0, 1, 0));
    const tint = uniform(new Vector3(1, 0.9, 0.75));
    const strength = uniform(0.1);
    const enhanced = createScannedFoliageMaterial(source, direction, tint, strength);

    expect(isFoliageMaterial(source)).toBe(true);
    expect(enhanced).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(enhanced.color.r).toBeCloseTo(source.color.r * FOLIAGE_LIGHTING_CONFIG.albedoLift);
    expect(enhanced.map).toBe(texture);
    expect(enhanced.transparent).toBe(source.transparent);
    expect(enhanced.alphaTest).toBe(source.alphaTest);
    expect(enhanced.side).toBe(source.side);
    expect(enhanced.emissive.r).toBeCloseTo(source.emissive.r);
    expect(enhanced.emissiveIntensity).toBe(source.emissiveIntensity);
    expect(enhanced.emissiveNode).not.toBeNull();

    const bark = new MeshStandardMaterial({ name: 'fir_tree_01_bark' });
    expect(isFoliageMaterial(bark)).toBe(false);
    enhanced.dispose();
    source.dispose();
    bark.dispose();
    texture.dispose();
  });
});
