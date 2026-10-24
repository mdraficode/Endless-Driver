import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  createAutomotivePaintMaterial,
  createBrakeLightMaterial,
  createExhaustInteriorMaterial,
  createHeadlightMaterial,
  createRubberMaterial,
  createTintedCabinMaterial,
  createVehicleInteriorMaterial,
  createWheelMetalMaterial,
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
    expect(lamp.emissiveIntensity).toBe(0);
    glass.dispose();
    lamp.dispose();
  });

  it('keeps open-cabin upholstery, wheel metal, and brake emitters as separate map-free materials', () => {
    const interior = createVehicleInteriorMaterial();
    const wheelMetal = createWheelMetalMaterial();
    const brakeLight = createBrakeLightMaterial();
    expect(interior).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(interior.map).toBeNull();
    expect(interior.roughness).toBeGreaterThan(0.5);
    expect(wheelMetal).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(wheelMetal.metalness).toBeGreaterThan(0.5);
    expect(brakeLight.emissiveIntensity).toBeGreaterThan(0);
    expect(brakeLight.emissiveMap).toBeNull();
    interior.dispose();
    wheelMetal.dispose();
    brakeLight.dispose();
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
