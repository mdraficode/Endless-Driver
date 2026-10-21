import { DataTexture, LinearSRGBColorSpace, SRGBColorSpace } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { float, uv, vec4 } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { bindScannedPbrMaps } from '../../src/world/scanned-pbr';

function makeTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

describe('scanned PBR map binding', () => {
  it('uses sRGB albedo and linear normal/ARM data with a TBN-decoded normal node', () => {
    const diffuse = makeTexture();
    const normal = makeTexture();
    const arm = makeTexture();
    diffuse.colorSpace = SRGBColorSpace;
    normal.colorSpace = LinearSRGBColorSpace;
    arm.colorSpace = LinearSRGBColorSpace;
    const material = new MeshStandardNodeMaterial();

    bindScannedPbrMaps(material, { diffuse, normal, arm }, uv(), {
      albedoTint: vec4(0.9, 0.95, 1, 1),
      normalStrength: 0.7,
      aoStrength: 0.8,
      roughnessAdjustment: float(0.03),
    });

    expect(diffuse.colorSpace).toBe(SRGBColorSpace);
    expect(normal.colorSpace).toBe(LinearSRGBColorSpace);
    expect(arm.colorSpace).toBe(LinearSRGBColorSpace);
    expect(material.colorNode).not.toBeNull();
    expect(material.normalNode).not.toBeNull();
    expect(material.roughnessNode).not.toBeNull();
    expect(material.metalnessNode).not.toBeNull();
    expect(material.aoNode).not.toBeNull();

    material.dispose();
    diffuse.dispose();
    normal.dispose();
    arm.dispose();
  });

  it('does not invent packed channels when an asset has no ARM map', () => {
    const diffuse = makeTexture();
    const normal = makeTexture();
    const material = new MeshStandardNodeMaterial();
    bindScannedPbrMaps(material, { diffuse, normal, arm: null }, uv());
    expect(material.colorNode).not.toBeNull();
    expect(material.normalNode).not.toBeNull();
    expect(material.roughnessNode).toBeNull();
    expect(material.metalnessNode).toBeNull();
    expect(material.aoNode).toBeNull();
    material.dispose();
    diffuse.dispose();
    normal.dispose();
  });
});
