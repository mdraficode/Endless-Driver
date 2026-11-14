import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  BRAKE_LAMP_ACTIVE_INTENSITY,
  BRAKE_LAMP_ACTIVE_THRESHOLD,
  BRAKE_LAMP_IDLE_INTENSITY,
  createAutomotivePaintMaterial,
  createBrakeLightMaterial,
  createExhaustInteriorMaterial,
  createHeadlightMaterial,
  createRubberMaterial,
  createTintedCabinMaterial,
  createVehicleInteriorMaterial,
  createWheelMetalMaterial,
  resolveBrakeLampIntensity,
} from '../../src/vehicles/vehicle-materials';

describe('brake lamp intensity (12.4f, pure)', () => {
  it('shows the bright state only for a real brake demand in forward gears', () => {
    expect(resolveBrakeLampIntensity(0, false)).toBe(BRAKE_LAMP_IDLE_INTENSITY);
    expect(resolveBrakeLampIntensity(0.02, false)).toBe(BRAKE_LAMP_IDLE_INTENSITY);
    // The threshold is a strict comparison: at the threshold the lamp stays in its tail state.
    expect(resolveBrakeLampIntensity(BRAKE_LAMP_ACTIVE_THRESHOLD, false)).toBe(
      BRAKE_LAMP_IDLE_INTENSITY,
    );
    expect(resolveBrakeLampIntensity(BRAKE_LAMP_ACTIVE_THRESHOLD + 0.01, false)).toBe(
      BRAKE_LAMP_ACTIVE_INTENSITY,
    );
    expect(resolveBrakeLampIntensity(1, false)).toBe(BRAKE_LAMP_ACTIVE_INTENSITY);
  });

  it('stays in the tail state while reversing, even with the brake key held (reverse throttle)', () => {
    expect(resolveBrakeLampIntensity(1, true)).toBe(BRAKE_LAMP_IDLE_INTENSITY);
    expect(resolveBrakeLampIntensity(0.7, true)).toBe(BRAKE_LAMP_IDLE_INTENSITY);
    expect(resolveBrakeLampIntensity(0, true)).toBe(BRAKE_LAMP_IDLE_INTENSITY);
  });
});

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
