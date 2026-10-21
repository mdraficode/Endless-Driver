import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  createAutomotivePaintMaterial,
  createExhaustInteriorMaterial,
  createHeadlightMaterial,
  createRubberMaterial,
  createTintedCabinMaterial,
} from '../../src/vehicles/vehicle-materials';

describe('vehicle node materials', () => {
  it('builds node-based paint with physical clearcoat and macro variation', () => {
    const material = createAutomotivePaintMaterial();
    expect(material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(material.colorNode).not.toBeNull();
    expect(material.clearcoatNode).not.toBeNull();
    expect(material.roughnessNode).not.toBeNull();
    material.dispose();
  });

  it('keeps transparent glazing and emissives free of invented texture maps', () => {
    const glass = createTintedCabinMaterial();
    const lamp = createHeadlightMaterial();
    expect(glass).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(glass.map).toBeNull();
    expect(glass.transparent).toBe(false);
    expect(lamp).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(lamp.map).toBeNull();
    expect(lamp.emissiveMap).toBeNull();
    glass.dispose();
    lamp.dispose();
  });

  it('uses a rough opaque rubber surface and does not fabricate exhaust maps', () => {
    const tire = createRubberMaterial();
    const interior = createExhaustInteriorMaterial();
    expect(tire.roughness).toBeGreaterThan(0.8);
    expect(tire.metalness).toBe(0);
    expect(interior.map).toBeNull();
    tire.dispose();
    interior.dispose();
  });
});
