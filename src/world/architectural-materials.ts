import { Color } from 'three';
import { MeshPhysicalNodeMaterial, type Node } from 'three/webgpu';
import { float, positionWorld, sin, vec4, vertexColor } from 'three/tsl';

export interface ArchitecturalMaterialOptions {
  readonly name: string;
  readonly colorHex: number;
  readonly roughness: number;
  readonly metalness: number;
  /** Low-amplitude world-space albedo/roughness breakup; intentionally not a dirt/weather state. */
  readonly detailAmplitude?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
}

interface SurfaceDetailNodes {
  readonly albedo: Node<'float'>;
  readonly roughness: Node<'float'>;
}

function createSurfaceDetailNodes(roughness: number, amplitude: number): SurfaceDetailNodes {
  // Two restrained, continuous TSL bands create material-scale variation without a texture
  // dependency or screen-space effect. The HDRI remains the actual environment-light source.
  const broad = sin(positionWorld.x.mul(0.083).add(positionWorld.z.mul(0.117))).mul(
    sin(positionWorld.z.mul(0.071).sub(positionWorld.y.mul(0.049))),
  );
  const fine = sin(
    positionWorld.x.mul(2.31).add(positionWorld.y.mul(1.67)).add(positionWorld.z.mul(2.83)),
  );
  const albedo = float(1)
    .add(broad.mul(amplitude))
    .add(fine.mul(amplitude * 0.22));
  const roughnessNode = float(roughness)
    .add(broad.mul(0.055))
    .add(fine.mul(0.018))
    .clamp(0.06, 0.98);
  return { albedo, roughness: roughnessNode };
}

/** PBR facade/trim material with restrained procedural variation under the existing HDRI/ACES path. */
export function createArchitecturalMaterial(
  options: ArchitecturalMaterialOptions,
): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  const color = new Color(options.colorHex);
  const detail = createSurfaceDetailNodes(options.roughness, options.detailAmplitude ?? 0.025);
  material.color.setHex(options.colorHex);
  material.roughness = options.roughness;
  material.metalness = options.metalness;
  material.colorNode = vec4(color.r, color.g, color.b, 1).mul(detail.albedo);
  material.roughnessNode = detail.roughness;
  material.clearcoatNode = float(options.clearcoat ?? 0.08);
  material.clearcoatRoughnessNode = float(options.clearcoatRoughness ?? 0.34);
  material.name = options.name;
  return material;
}

/** Vertex-coloured authored building kits with the same subtle TSL surface response. */
export function createVertexColorArchitecturalMaterial(
  options: Omit<ArchitecturalMaterialOptions, 'colorHex'>,
): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  const detail = createSurfaceDetailNodes(options.roughness, options.detailAmplitude ?? 0.025);
  material.color.setHex(0xffffff);
  material.roughness = options.roughness;
  material.metalness = options.metalness;
  material.colorNode = vertexColor().mul(detail.albedo);
  material.roughnessNode = detail.roughness;
  material.clearcoatNode = float(options.clearcoat ?? 0.06);
  material.clearcoatRoughnessNode = float(options.clearcoatRoughness ?? 0.38);
  material.name = options.name;
  return material;
}
