import { Color, Vector3 } from 'three';
import { MeshPhysicalNodeMaterial, type Node } from 'three/webgpu';
import { float, positionWorld, sin, uniform, vec4, vertexColor } from 'three/tsl';

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

/**
 * One sine term: the wave vector (radians per metre) in world space. Each coordinate with a
 * zero component is omitted from the expression, so a term may mix two or three axes.
 */
export interface FacadeDetailTerm {
  readonly kx: number;
  readonly ky: number;
  readonly kz: number;
}

/**
 * 12.4d — the facade's procedural detail octaves, as data. Every architectural surface
 * shares these constants, so every material built from them shares one GPU program (the
 * per-material values stay uniforms). Each octave is the product of its terms — two terms
 * at different orientations read as patchy weathering rather than stripes.
 *
 * Wavelengths (2π/|k|): broad ≈ 44/73 m, mid ≈ 9.3/10.7 m, fine ≈ 1.6 m — an octave spread
 * of roughly 6× per step, so the scales do not alias into one another.
 */
export interface FacadeDetailOctave {
  readonly label: 'broad' | 'mid' | 'fine';
  readonly terms: readonly FacadeDetailTerm[];
  /** Weight of the octave value (in [−1, 1]) on the albedo, relative to `amplitude`. */
  readonly albedoWeight: number;
  /** Weight of the octave value (in [−1, 1]) on the roughness. */
  readonly roughnessWeight: number;
}

export const FACADE_DETAIL_OCTAVES: readonly FacadeDetailOctave[] = [
  {
    label: 'broad',
    terms: [
      { kx: 0.083, ky: 0, kz: 0.117 },
      { kx: 0, ky: -0.049, kz: 0.071 },
    ],
    albedoWeight: 1,
    roughnessWeight: 0.055,
  },
  // 12.4d: the missing mid scale — slab-line / stain patches at ~10 m, between the
  // building-scale broad band and the 1.6 m fine band.
  {
    label: 'mid',
    terms: [
      { kx: 0.58, ky: 0.34, kz: 0 },
      { kx: -0.29, ky: 0, kz: 0.51 },
    ],
    albedoWeight: 0.4,
    roughnessWeight: 0.03,
  },
  {
    label: 'fine',
    terms: [{ kx: 2.31, ky: 1.67, kz: 2.83 }],
    albedoWeight: 0.22,
    roughnessWeight: 0.018,
  },
];

/** The 12.4d device A/B scale of the mid octave: 1 = as shipped, 0 = the pre-12.4d look. */
let facadeMidScale = 1;

export function setFacadeMidScale(scale: number): void {
  facadeMidScale = Math.max(0, Math.min(2, scale));
}

export function getFacadeMidScale(): number {
  return facadeMidScale;
}

/** One term evaluated at a world point: sin(Σ k·p over the non-zero axes). */
export function facadeDetailTermAt(
  term: FacadeDetailTerm,
  x: number,
  y: number,
  z: number,
): number {
  let phase = 0;
  if (term.kx !== 0) phase += term.kx * x;
  if (term.ky !== 0) phase += term.ky * y;
  if (term.kz !== 0) phase += term.kz * z;
  return Math.sin(phase);
}

/** One octave evaluated at a world point: the product of its terms, in [−1, 1]. */
export function facadeDetailOctaveAt(
  octave: FacadeDetailOctave,
  x: number,
  y: number,
  z: number,
): number {
  let value = 1;
  for (const term of octave.terms) {
    value *= facadeDetailTermAt(term, x, y, z);
  }
  return value;
}

/**
 * CPU mirror of the TSL surface-detail expression (the same table, the same math) — the
 * deterministic reference the unit tests assert against. `midScale` mirrors the 12.4d
 * device knob (default 1).
 */
export function facadeSurfaceDetail(
  x: number,
  y: number,
  z: number,
  roughness: number,
  amplitude: number,
  midScale: number = 1,
): { readonly albedo: number; readonly roughness: number } {
  let albedo = 1;
  let rough = roughness;
  for (const octave of FACADE_DETAIL_OCTAVES) {
    const scale = octave.label === 'mid' ? midScale : 1;
    const value = facadeDetailOctaveAt(octave, x, y, z);
    albedo += value * octave.albedoWeight * amplitude * scale;
    rough += value * octave.roughnessWeight * scale;
  }
  return { albedo, roughness: Math.min(0.98, Math.max(0.06, rough)) };
}

/**
 * TSL constants are baked into the generated code, so every material built with a different
 * literal becomes its own GPU program (the phone compiled 58 of these as separate 20 KB
 * scene fragments). Per-instance values are exposed as uniform nodes instead: materials that
 * share this graph share one program, with the values bound as uniforms at render time. The
 * octave table is shared data, so every architectural material compiles into the same graph.
 */
function termNode(term: FacadeDetailTerm): Node<'float'> {
  let phase: Node<'float'> | null = null;
  const add = (k: number, axis: Node<'float'>): void => {
    if (k === 0) return;
    const contribution = axis.mul(k);
    phase = phase === null ? contribution : phase.add(contribution);
  };
  add(term.kx, positionWorld.x);
  add(term.ky, positionWorld.y);
  add(term.kz, positionWorld.z);
  if (phase === null) {
    throw new Error('facade detail term has no axes');
  }
  return sin(phase);
}

function createSurfaceDetailNodes(roughness: number, amplitude: number): SurfaceDetailNodes {
  // Restrained, continuous world-space bands create material-scale variation without a
  // texture dependency or screen-space effect. The HDRI remains the actual environment-light
  // source. Built from FACADE_DETAIL_OCTAVES — the same table the CPU mirror uses.
  let albedo: Node<'float'> | null = null;
  let roughnessAccumulator: Node<'float'> | null = null;
  const baseRoughness = uniform(roughness);
  const amplitudeNode = uniform(amplitude);
  const midScaleNode = uniform(facadeMidScale);
  for (const octave of FACADE_DETAIL_OCTAVES) {
    let value: Node<'float'> | null = null;
    for (const term of octave.terms) {
      const termNodeValue = termNode(term);
      value = value === null ? termNodeValue : value.mul(termNodeValue);
    }
    if (value === null) {
      throw new Error(`facade detail octave ${octave.label} has no terms`);
    }
    const weight =
      octave.label === 'mid'
        ? float(octave.albedoWeight).mul(midScaleNode)
        : float(octave.albedoWeight);
    albedo =
      albedo === null
        ? value.mul(weight.mul(amplitudeNode))
        : albedo.add(value.mul(weight.mul(amplitudeNode)));
    const roughWeight =
      octave.label === 'mid'
        ? float(octave.roughnessWeight).mul(midScaleNode)
        : float(octave.roughnessWeight);
    const roughContribution = value.mul(roughWeight);
    roughnessAccumulator =
      roughnessAccumulator === null
        ? roughContribution
        : roughnessAccumulator.add(roughContribution);
  }
  const albedoNode = float(1).add(albedo ?? float(0));
  const roughnessNode = baseRoughness.add(roughnessAccumulator ?? float(0)).clamp(0.06, 0.98);
  return { albedo: albedoNode, roughness: roughnessNode };
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
  material.colorNode = vec4(uniform(new Vector3(color.r, color.g, color.b), 'vec3'), 1).mul(
    detail.albedo,
  );
  material.roughnessNode = detail.roughness;
  material.clearcoatNode = uniform(options.clearcoat ?? 0.08);
  material.clearcoatRoughnessNode = uniform(options.clearcoatRoughness ?? 0.34);
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
  material.clearcoatNode = uniform(options.clearcoat ?? 0.06);
  material.clearcoatRoughnessNode = uniform(options.clearcoatRoughness ?? 0.38);
  material.name = options.name;
  return material;
}
