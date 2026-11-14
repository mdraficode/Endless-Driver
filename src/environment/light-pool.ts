import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';

/**
 * Night-rain light pooling (Phase 10.5 pass C): when it is wet at night, the street lamps
 * cast soft pools of light on the pavement. The pools are one instanced additive quad per
 * lamp with a procedural radial falloff — no new shader program, no point light, no fog
 * (the owner's no-fog rule stands: this is a surface decal, not a visibility term).
 *
 * The pool reads as rain, not as the clear-night baseline: the opacity is driven by the
 * live weather wetness, so it fades in as the roads wet up and fades out as they dry.
 *
 * Phase 12.4e (light-pool hygiene): the quad is centred under the light source (the bulb
 * at the arm's tip), not under the pole, and each pool carries the temperature of the lamp
 * above it — the same deterministic per-bulb pick the point lights and bulb emitters use.
 */

/** Maximum pool opacity at full wetness and full night gain (a soft sheen, not a spotlight). */
export const LIGHT_POOL_MAX_OPACITY = 0.5;
/** Wetness below which the pools are invisible (the clear-night baseline look). */
export const LIGHT_POOL_WETNESS_EDGE = 0.15;
/** Wetness at which the pools are at full strength. */
export const LIGHT_POOL_WETNESS_FULL = 0.7;
/** Pool quad side length in metres (a lamp at ~6 m height throws a pool roughly this wide). */
export const LIGHT_POOL_SIZE_METERS = 9;
/** The lift that keeps the decal clear of the pavement (no Z-fighting, no visible float). */
export const LIGHT_POOL_GROUND_LIFT = 0.04;
/**
 * The pool's tint when the caller does not carry the lamp palette (e.g. a fixture). The
 * classic halogen warm white — the middle of the street-lamp palette.
 */
export const LIGHT_POOL_DEFAULT_TINT = 0xffe9c4;

/** A lamp placement the pools are derived from: the pole base and the bulb (light source). */
export interface LightPoolSourcePlacement {
  readonly pole: { readonly x: number; readonly y: number; readonly z: number };
  /** The bulb position (city-local metres) — where the light actually is. */
  readonly bulb: readonly [number, number, number];
}

/**
 * The ground point a pool is centred on (12.4e): directly under the light source, not
 * under the pole. A lamp's arm reaches over the road, so the pavement glows brightest
 * under the bulb — a pool centred on the pole sits a metre and a half back on the
 * sidewalk, detached from the light it is standing in for. Pure in the placement — the
 * same expression the home city composes with, and the deterministic reference the tests
 * assert against.
 */
export function lightPoolCenter(placement: LightPoolSourcePlacement): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return {
    x: placement.bulb[0],
    y: placement.pole.y + LIGHT_POOL_GROUND_LIFT,
    z: placement.bulb[2],
  };
}

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
 *
 * 12.4e: the falloff is neutral white (the temperature comes from the per-instance tint,
 * never from the texture — the old warm bake double-tinted every pool), and it samples
 * linear with mipmaps so the 9 m quad feathers instead of showing 7 cm contour steps at
 * the nearest-filter edges.
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
      const value = Math.round(Math.pow(core, 1.6) * 255);
      const o = (y * size + x) * 4;
      data[o] = value;
      data[o + 1] = value;
      data[o + 2] = value;
      data[o + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  sharedTexture = texture;
  return texture;
}

export interface LightPoolHandle {
  readonly mesh: InstancedMesh;
  readonly material: MeshBasicMaterial;
  readonly geometry: BufferGeometry;
  /** Per-instance brightness (1 = lamp on, 0 = broken/dark); the global opacity stays the wetness term. */
  setLamp(index: number, brightness: number): void;
}

/**
 * Builds the pool layer for a set of lamp positions (world metres). The quads lie on the
 * ground (y per position) and additive-blend over the pavement; instance colour carries
 * both the lamp's temperature (12.4e — the same palette the point lights use) and the
 * per-lamp state (a broken lamp's pool goes dark with its light). The material colour is
 * white by construction: the per-instance tint is the single source of temperature.
 */
export function buildLightPools(
  positions: readonly { readonly x: number; readonly y: number; readonly z: number }[],
  tints?: readonly number[],
): LightPoolHandle | null {
  if (positions.length === 0) return null;
  const geometry = new PlaneGeometry(LIGHT_POOL_SIZE_METERS, LIGHT_POOL_SIZE_METERS, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: lightPoolTexture(),
    color: 0xffffff, // 12.4e: the per-instance tint carries the lamp temperature
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
  const tint = new Color();
  const setInstanceTint = (index: number, brightness: number): void => {
    tint.setHex(tints?.[index] ?? LIGHT_POOL_DEFAULT_TINT);
    tint.multiplyScalar(Math.max(0, Math.min(1, brightness)));
    mesh.setColorAt(index, tint);
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  };
  positions.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    setInstanceTint(i, 1);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  return {
    mesh,
    material,
    geometry,
    setLamp(index: number, brightness: number): void {
      setInstanceTint(index, brightness);
    },
  };
}
