/**
 * Phase 10.4 (C4) — the dry damage decals on urban asphalt: potholes and broad grime
 * patches, baked into a repeatable world-anchored mask the way the wet patches are.
 *
 * The mask is a *visual* layer only: it darkens the albedo and coarsens the roughness
 * where the surface is damaged. Traction still comes from the surface state, never from
 * rendered pixels. World anchoring (position divided by the tile size) keeps the damage
 * fixed in the world so it cannot swim with the floating-origin rebase or follow the car.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three';
import type { Node } from 'three/webgpu';
import { positionLocal, texture } from 'three/tsl';

import { URBAN_CITY_CONFIG } from '../config/urban-city';

export interface RoadWearMaskOptions {
  readonly resolution?: number;
  readonly seed?: number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function smoothUnit(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/**
 * Bakes the damage mask: broad soft grime first, then the small dark potholes on top.
 * One channel, tileable by construction (every shape wraps around the tile edges).
 */
export function generateRoadWearMask(options: RoadWearMaskOptions = {}): Uint8Array {
  const wear = URBAN_CITY_CONFIG.roadWear;
  const resolution = Math.max(32, Math.floor(options.resolution ?? wear.textureResolution));
  const random = createSeededRandom(options.seed ?? wear.seed);
  const pixels = new Uint8Array(resolution * resolution);
  const pixelsPerMeter = resolution / wear.tileSizeMeters;

  const paintBlob = (
    centreXMeters: number,
    centreZMeters: number,
    radiusX: number,
    radiusZ: number,
    rotation: number,
    alpha: number,
    featherMeters: number,
    waviness: number,
  ): void => {
    const feather = Math.max(0.06, featherMeters / Math.max(radiusX, radiusZ));
    const supportRadius = Math.max(radiusX, radiusZ) * (1 + waviness) + featherMeters;
    const radiusPixels = Math.ceil(supportRadius * pixelsPerMeter);
    const centrePixelX = centreXMeters * pixelsPerMeter;
    const centrePixelZ = centreZMeters * pixelsPerMeter;
    const basePixelX = Math.floor(centrePixelX);
    const basePixelZ = Math.floor(centrePixelZ);
    const phaseA = random() * Math.PI * 2;
    const phaseB = random() * Math.PI * 2;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    for (let offsetZ = -radiusPixels; offsetZ <= radiusPixels; offsetZ += 1) {
      const pixelZ = wrapIndex(basePixelZ + offsetZ, resolution);
      const localZ = (basePixelZ + offsetZ + 0.5 - centrePixelZ) / pixelsPerMeter;
      for (let offsetX = -radiusPixels; offsetX <= radiusPixels; offsetX += 1) {
        const pixelX = wrapIndex(basePixelX + offsetX, resolution);
        const localX = (basePixelX + offsetX + 0.5 - centrePixelX) / pixelsPerMeter;
        const rotatedX = (localX * cosine + localZ * sine) / radiusX;
        const rotatedZ = (-localX * sine + localZ * cosine) / radiusZ;
        const radialDistance = Math.hypot(rotatedX, rotatedZ);
        if (radialDistance > 1 + waviness + feather) continue;
        const angle = Math.atan2(rotatedZ, rotatedX);
        const edgeNoise = Math.sin(angle * 3 + phaseA) * 0.5 + Math.sin(angle * 6 + phaseB) * 0.3;
        const edgeRadius = 1 + edgeNoise * waviness;
        const a = smoothUnit((edgeRadius - radialDistance) / feather) * alpha;
        if (a <= 0) continue;
        const index = pixelZ * resolution + pixelX;
        pixels[index] = Math.max(pixels[index] ?? 0, Math.round(a * 255));
      }
    }
  };

  // Grime: the broad low-contrast film.
  const grimeCells = Math.ceil(wear.tileSizeMeters / wear.grimeCellMeters);
  for (let cellZ = 0; cellZ < grimeCells; cellZ += 1) {
    for (let cellX = 0; cellX < grimeCells; cellX += 1) {
      if (random() > wear.grimeSpawnProbability) continue;
      const centreX = (cellX + 0.5 + (random() - 0.5) * 0.5) * wear.grimeCellMeters;
      const centreZ = (cellZ + 0.5 + (random() - 0.5) * 0.5) * wear.grimeCellMeters;
      paintBlob(
        centreX,
        centreZ,
        wear.grimeMinRadiusMeters +
          random() * (wear.grimeMaxRadiusMeters - wear.grimeMinRadiusMeters),
        wear.grimeMinRadiusMeters +
          random() * (wear.grimeMaxRadiusMeters - wear.grimeMinRadiusMeters),
        random() * Math.PI * 2,
        wear.grimeAlpha * (0.7 + random() * 0.3),
        wear.grimeFeatherMeters,
        0.35,
      );
    }
  }

  // Potholes: small, dark, irregular — they win over the grime (higher alpha).
  const potholeCells = Math.ceil(wear.tileSizeMeters / wear.potholeCellMeters);
  for (let cellZ = 0; cellZ < potholeCells; cellZ += 1) {
    for (let cellX = 0; cellX < potholeCells; cellX += 1) {
      if (random() > wear.potholeSpawnProbability) continue;
      const centreX = (cellX + 0.5 + (random() - 0.5) * 0.6) * wear.potholeCellMeters;
      const centreZ = (cellZ + 0.5 + (random() - 0.5) * 0.6) * wear.potholeCellMeters;
      const radiusX =
        wear.potholeMinRadiusMeters +
        random() * (wear.potholeMaxRadiusMeters - wear.potholeMinRadiusMeters);
      paintBlob(
        centreX,
        centreZ,
        radiusX,
        radiusX * (0.65 + random() * 0.5),
        random() * Math.PI * 2,
        wear.potholeAlpha * (0.8 + random() * 0.2),
        wear.potholeFeatherMeters,
        0.3,
      );
    }
  }

  return pixels;
}

/** Creates the small, deterministic mask texture shared by the urban road material. */
export function createRoadWearMaskTexture(): DataTexture {
  const wear = URBAN_CITY_CONFIG.roadWear;
  const mask = new DataTexture(
    generateRoadWearMask(),
    wear.textureResolution,
    wear.textureResolution,
    RedFormat,
    UnsignedByteType,
  );
  mask.name = 'urban-road-wear-mask';
  mask.colorSpace = NoColorSpace;
  mask.wrapS = RepeatWrapping;
  mask.wrapT = RepeatWrapping;
  mask.magFilter = LinearFilter;
  mask.minFilter = LinearMipmapLinearFilter;
  mask.generateMipmaps = true;
  mask.flipY = false;
  mask.needsUpdate = true;
  return mask;
}

/**
 * Converts the repeatable wear mask into a 0..1 local value. World anchoring, same
 * contract as the wet patches.
 */
export function createRoadWearNode(maskTexture: DataTexture): Node<'float'> {
  const worldXZ = positionLocal.xz.div(URBAN_CITY_CONFIG.roadWear.tileSizeMeters);
  return texture(maskTexture, worldXZ).r.clamp(0, 1);
}
