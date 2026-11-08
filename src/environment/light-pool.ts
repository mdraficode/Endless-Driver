import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';

/**
 * Night-rain light pooling (Phase 10.5 pass C): when it is wet at night, the street lamps
 * cast soft pools of light on the pavement. The pools are one instanced additive quad per
 * lamp with a procedural radial falloff — no new shader program, no point light, no fog
 * (the owner's no-fog rule stands: this is a surface decal, not a visibility term).
 *
 * The pool reads as rain, not as the clear-night baseline: the opacity is driven by the
 * live weather wetness, so it fades in as the roads wet up and fades out as they dry.
 */

/** Maximum pool opacity at full wetness and full night gain (a soft sheen, not a spotlight). */
export const LIGHT_POOL_MAX_OPACITY = 0.5;
/** Wetness below which the pools are invisible (the clear-night baseline look). */
export const LIGHT_POOL_WETNESS_EDGE = 0.15;
/** Wetness at which the pools are at full strength. */
export const LIGHT_POOL_WETNESS_FULL = 0.7;
/** Pool quad side length in metres (a lamp at ~6 m height throws a pool roughly this wide). */
export const LIGHT_POOL_SIZE_METERS = 9;

/**
 * The live pool opacity: zero until the road is meaningfully wet, then ramped by the
 * night gain so the pools exist only at night. Pure in (wetness, nightGain) — the same
 * expression the home city and every streamed city compose with.
 */
export function resolveLightPoolOpacity(wetness: number, nightGain: number): number {
  if (wetness <= LIGHT_POOL_WETNESS_EDGE || nightGain <= 0.01) return 0;
  const wet = Math.max(
    0,
    Math.min(
      1,
      (wetness - LIGHT_POOL_WETNESS_EDGE) / (LIGHT_POOL_WETNESS_FULL - LIGHT_POOL_WETNESS_EDGE),
    ),
  );
  return Math.min(1, nightGain) * wet * LIGHT_POOL_MAX_OPACITY;
}

let sharedTexture: DataTexture | null = null;

/**
 * The radial falloff, built once per process (a 128² RGBA upload, negligible and shared
 * by every city — never disposed, since streamed cities dispose independently).
 */
export function lightPoolTexture(): DataTexture {
  if (sharedTexture !== null) return sharedTexture;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half + 0.5) / half;
      const dy = (y - half + 0.5) / half;
      const r2 = dx * dx + dy * dy;
      // Smooth radial falloff with a slightly elongated core (wet asphalt sheens hardest
      // directly under the bulb and feather out to the pool edge).
      const core = Math.max(0, 1 - Math.min(1, r2 * 1.15));
      const value = Math.pow(core, 1.6) * 255;
      const o = (y * size + x) * 4;
      data[o] = value;
      data[o + 1] = Math.round(value * 0.96);
      data[o + 2] = Math.round(value * 0.88);
      data[o + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  sharedTexture = texture;
  return texture;
}

export interface LightPoolHandle {
  readonly mesh: InstancedMesh;
  readonly material: Material;
  readonly geometry: BufferGeometry;
  /** Per-instance brightness (1 = lamp on, 0 = broken/dark); the global opacity stays the wetness term. */
  setLamp(index: number, brightness: number): void;
}

/**
 * Builds the pool layer for a set of lamp positions (world metres). The quads lie on the
 * ground (y per position) and additive-blend over the pavement; instance colour carries
 * the per-lamp state (a broken lamp's pool goes dark with its light).
 */
export function buildLightPools(
  positions: readonly { readonly x: number; readonly y: number; readonly z: number }[],
): LightPoolHandle | null {
  if (positions.length === 0) return null;
  const geometry = new PlaneGeometry(LIGHT_POOL_SIZE_METERS, LIGHT_POOL_SIZE_METERS, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: lightPoolTexture(),
    color: 0xffe9c4, // halogen warm, to match the lamp palette
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  material.name = 'light-pools';
  const mesh = new InstancedMesh(geometry, material, positions.length);
  mesh.name = 'light-pools';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  const m = new Matrix4();
  const white = new Color(1, 1, 1);
  positions.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, white);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  const color = new Color();
  return {
    mesh,
    material,
    geometry,
    setLamp(index: number, brightness: number): void {
      color.setScalar(brightness);
      mesh.setColorAt(index, color);
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    },
  };
}
