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

export interface RoadWetPatchMaskOptions {
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
 * Builds a repeatable, one-channel world mask made from feathered, rotated, irregular puddle shapes.
 * The broad dry gaps are intentional: rainfall darkens and glosses only these patches, leaving the
 * scanned asphalt roughness visible between them. This is a visual surface mask, not water depth.
 */
export function generateRoadWetPatchMask(options: RoadWetPatchMaskOptions = {}): Uint8Array {
  const patchConfig = URBAN_CITY_CONFIG.wetRoad.patches;
  const resolution = Math.max(32, Math.floor(options.resolution ?? patchConfig.textureResolution));
  const random = createSeededRandom(options.seed ?? patchConfig.seed);
  const pixels = new Uint8Array(resolution * resolution);
  const pixelsPerMeter = resolution / patchConfig.tileSizeMeters;
  const cellCount = Math.ceil(patchConfig.tileSizeMeters / patchConfig.cellSizeMeters);
  const featherMeters = patchConfig.edgeFeatherMeters;
  const waviness = patchConfig.boundaryWaviness;

  for (let cellZ = 0; cellZ < cellCount; cellZ += 1) {
    for (let cellX = 0; cellX < cellCount; cellX += 1) {
      if (random() > patchConfig.spawnProbability) continue;

      const centreX = (cellX + 0.5 + (random() - 0.5) * 0.56) * patchConfig.cellSizeMeters;
      const centreZ = (cellZ + 0.5 + (random() - 0.5) * 0.56) * patchConfig.cellSizeMeters;
      const radiusX =
        patchConfig.minRadiusXMeters +
        random() * (patchConfig.maxRadiusXMeters - patchConfig.minRadiusXMeters);
      const radiusZ =
        patchConfig.minRadiusZMeters +
        random() * (patchConfig.maxRadiusZMeters - patchConfig.minRadiusZMeters);
      const rotation = random() * Math.PI * 2;
      const opacity = 0.72 + random() * 0.28;
      const phaseA = random() * Math.PI * 2;
      const phaseB = random() * Math.PI * 2;
      const phaseC = random() * Math.PI * 2;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const feather = Math.max(0.08, featherMeters / Math.max(radiusX, radiusZ));
      const supportRadius = Math.max(radiusX, radiusZ) * (1 + waviness) + featherMeters;
      const radiusPixels = Math.ceil(supportRadius * pixelsPerMeter);
      const centrePixelX = centreX * pixelsPerMeter;
      const centrePixelZ = centreZ * pixelsPerMeter;
      const basePixelX = Math.floor(centrePixelX);
      const basePixelZ = Math.floor(centrePixelZ);

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
          const edgeNoise =
            Math.sin(angle * 3 + phaseA) * 0.52 +
            Math.sin(angle * 5 + phaseB) * 0.3 +
            Math.sin(angle * 8 + phaseC) * 0.18;
          const edgeRadius = 1 + edgeNoise * waviness;
          const alpha = smoothUnit((edgeRadius - radialDistance) / feather);
          if (alpha <= 0) continue;

          const index = pixelZ * resolution + pixelX;
          pixels[index] = Math.max(pixels[index] ?? 0, Math.round(alpha * opacity * 255));
        }
      }
    }
  }

  return pixels;
}

/** Creates the small, deterministic mask texture shared by road material nodes. */
export function createRoadWetPatchMaskTexture(): DataTexture {
  const size = URBAN_CITY_CONFIG.wetRoad.patches.textureResolution;
  const mask = new DataTexture(generateRoadWetPatchMask(), size, size, RedFormat, UnsignedByteType);
  mask.name = 'aohara-irregular-road-wet-patches';
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
 * Converts the repeatable patch texture and shared weather/daylight wetness into one local mask.
 * RoadWorld uses authored mesh-local coordinates so a floating-origin rebase cannot move the art;
 * the standalone city preview may pass `positionWorld` for its transformed PlaneGeometry.
 */
export function createRoadWetnessNode(
  maskTexture: DataTexture,
  wetness: Node<'float'>,
  positionNode: Node<'vec3'> = positionLocal,
): Node<'float'> {
  const worldXZ = positionNode.xz.div(URBAN_CITY_CONFIG.wetRoad.patches.tileSizeMeters);
  return texture(maskTexture, worldXZ).r.mul(wetness).clamp(0, 1);
}
