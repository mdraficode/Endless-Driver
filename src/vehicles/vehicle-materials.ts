import { Color } from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { float, positionLocal, sin, vec4 } from 'three/tsl';

const PAINT_COLOR = 0x2359a8;
const GLASS_COLOR = 0x141a22;
const TIRE_COLOR = 0x14171b;
const HUB_COLOR = 0xb9c0c8;
const MARKER_COLOR = 0xe0e6ee;
const LIGHT_COLOR = 0xfff3d0;
const LIGHT_EMISSIVE = 0x2a2413;

/** Project-authored metallic paint response: TSL macro-flake modulation and physical clearcoat. */
export function createAutomotivePaintMaterial(colorHex = PAINT_COLOR): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  const paint = new Color(colorHex);
  const broadVariation = sin(positionLocal.x.mul(0.73).add(positionLocal.z.mul(0.41))).mul(0.018);
  const flakeVariation = sin(
    positionLocal.x.mul(37).add(positionLocal.y.mul(53)).add(positionLocal.z.mul(29)),
  ).mul(0.007);
  const brightness = float(1).add(broadVariation).add(flakeVariation);

  material.name = 'kaminari-gt-metallic-paint-no-map';
  material.color.set(colorHex);
  material.colorNode = vec4(paint.r, paint.g, paint.b, 1).mul(brightness);
  material.metalness = 0.72;
  material.metalnessNode = float(0.72);
  material.roughness = 0.27;
  material.roughnessNode = float(0.26).add(flakeVariation.abs().mul(0.5));
  material.clearcoat = 0.92;
  material.clearcoatNode = float(0.92);
  material.clearcoatRoughness = 0.12;
  material.clearcoatRoughnessNode = float(0.12);
  return material;
}

/** Opaque tinted automotive glazing with no fabricated maps or transmission trickery. */
export function createTintedCabinMaterial(): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  material.name = 'kaminari-gt-tinted-glazing-no-map';
  material.color.set(GLASS_COLOR);
  material.metalness = 0.04;
  material.metalnessNode = float(0.04);
  material.roughness = 0.14;
  material.roughnessNode = float(0.14);
  material.clearcoat = 0.78;
  material.clearcoatNode = float(0.78);
  material.clearcoatRoughness = 0.09;
  material.clearcoatRoughnessNode = float(0.09);
  material.ior = 1.48;
  return material;
}

/** Low-gloss charcoal upholstery for the in-house open-top cabin. */
export function createVehicleInteriorMaterial(): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  material.name = 'kaminari-gt-charcoal-upholstery-no-map';
  material.color.set(0x242b32);
  material.metalness = 0.02;
  material.metalnessNode = float(0.02);
  material.roughness = 0.66;
  material.roughnessNode = float(0.66);
  material.clearcoat = 0.12;
  material.clearcoatNode = float(0.12);
  material.clearcoatRoughness = 0.42;
  return material;
}

export function createRubberMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'rubber';
  material.color.set(TIRE_COLOR);
  material.metalness = 0;
  material.metalnessNode = float(0);
  material.roughness = 0.94;
  material.roughnessNode = float(0.94);
  return material;
}

export function createWheelMetalMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'unbadged-brushed-wheel-metal';
  material.color.set(HUB_COLOR);
  material.metalness = 0.62;
  material.metalnessNode = float(0.62);
  material.roughness = 0.34;
  material.roughnessNode = float(0.34);
  return material;
}

export function createMarkerMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'wheel-motion-marker';
  material.color.set(MARKER_COLOR);
  material.metalness = 0.08;
  material.metalnessNode = float(0.08);
  material.roughness = 0.52;
  material.roughnessNode = float(0.52);
  return material;
}

export function createHeadlightMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'headlamp-emissive-no-map';
  material.color.set(LIGHT_COLOR);
  material.emissive.set(LIGHT_EMISSIVE);
  material.metalness = 0;
  material.roughness = 0.4;
  return material;
}

/** Local red tail lamps; `CarVisual` raises intensity only while the player brakes. */
export function createBrakeLightMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'kaminari-gt-brake-lamps-no-map';
  material.color.set(0x9a1820);
  material.emissive.set(0x5e090e);
  material.emissiveIntensity = 0.24;
  material.metalness = 0;
  material.roughness = 0.36;
  return material;
}

export function createExhaustMetalMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'exhaust-steel';
  material.color.set(0x77818a);
  material.metalness = 0.72;
  material.metalnessNode = float(0.72);
  material.roughness = 0.32;
  material.roughnessNode = float(0.32);
  return material;
}

export function createExhaustInteriorMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'exhaust-interior-no-map';
  material.color.set(0x11151a);
  material.metalness = 0.1;
  material.roughness = 0.92;
  return material;
}
