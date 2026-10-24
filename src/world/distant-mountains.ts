import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { vertexColor } from 'three/tsl';

import {
  DISTANT_MOUNTAIN_MESH_CONFIG,
  DISTANT_MOUNTAIN_RANGES,
  type DistantMountainRangeConfig,
} from '../config/distant-mountains';
import type { TerrainSampler } from './terrain-height';

interface MountainVertexColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hashUnit(index: number, seed: number): number {
  let value = Math.imul(index | 0, 0x45d9f3b) ^ Math.imul(seed | 0, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

/** Smooth, seeded value noise: irregular ridge sections without repeating sine-wave peaks. */
function valueNoise(along: number, seed: number): number {
  const left = Math.floor(along);
  const blend = smoothstep(0, 1, along - left);
  const a = hashUnit(left, seed);
  const b = hashUnit(left + 1, seed);
  return a + (b - a) * blend;
}

/** A broken, multi-scale skyline with tapered ends and distinct saddles between peaks. */
function skylineEnvelope(along: number, seed: number): number {
  const broad = valueNoise(along * 4.2, seed);
  const middle = valueNoise(along * 11.5, seed + 29);
  const fine = valueNoise(along * 24, seed + 71);
  const ridge = 0.52 + (broad - 0.5) * 0.9 + (middle - 0.5) * 0.34 + (fine - 0.5) * 0.14;
  const endFade = smoothstep(0, 0.08, along) * (1 - smoothstep(0.91, 1, along));
  return Math.max(0, Math.min(1, ridge)) * endFade;
}

function mountainColor(relativeHeight: number, variation: number): MountainVertexColor {
  const exposedRock = smoothstep(0.2, 0.74, relativeHeight);
  const lower = { r: 0.135, g: 0.19, b: 0.16 };
  const upper = { r: 0.22, g: 0.245, b: 0.265 };
  const high = smoothstep(0.62, 1, relativeHeight) * 0.045;
  const shade = variation * 0.025;
  return {
    r: lower.r + (upper.r - lower.r) * exposedRock + high + shade,
    g: lower.g + (upper.g - lower.g) * exposedRock + high + shade,
    b: lower.b + (upper.b - lower.b) * exposedRock + high + shade,
  };
}

/** Builds a terrain-seated, low-poly ridge with a locally varied skyline and rocky upper slopes. */
export function buildDistantMountainGeometry(
  sampler: TerrainSampler,
  range: DistantMountainRangeConfig,
): BufferGeometry {
  const { alongSegments, crossSegments, footClearanceMeters } = DISTANT_MOUNTAIN_MESH_CONFIG;
  const verticesPerRow = crossSegments + 1;
  const vertexCount = (alongSegments + 1) * verticesPerRow;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const cosYaw = Math.cos(range.yawRadians);
  const sinYaw = Math.sin(range.yawRadians);

  for (let alongIndex = 0; alongIndex <= alongSegments; alongIndex += 1) {
    const alongUnit = alongIndex / alongSegments;
    const alongMeters = (alongUnit - 0.5) * range.lengthMeters;
    const skyline = skylineEnvelope(alongUnit, range.seed);
    for (let crossIndex = 0; crossIndex <= crossSegments; crossIndex += 1) {
      const crossUnit = (crossIndex / crossSegments) * 2 - 1;
      const crossDistance = crossUnit * range.halfWidthMeters;
      const x = range.centerX + cosYaw * alongMeters - sinYaw * crossDistance;
      const z = range.centerZ + sinYaw * alongMeters + cosYaw * crossDistance;
      // The crest wanders gently across the mass; asymmetric exponents give each flank a different
      // shoulder, instead of a symmetric tent profile repeated at every cross-section.
      const crestOffset = (valueNoise(alongUnit * 3.6, range.seed + 101) - 0.5) * 0.2;
      const fromCrest = crossUnit - crestOffset;
      const flankSpan = fromCrest < 0 ? 1 + crestOffset : 1 - crestOffset;
      const normalizedFlank = clamp01(Math.abs(fromCrest) / Math.max(0.1, flankSpan));
      const flankExponent = fromCrest < 0 ? 1.28 : 0.9;
      const crossProfile = Math.pow(Math.cos(normalizedFlank * Math.PI * 0.5), flankExponent);
      const flankVariation =
        0.94 +
        0.12 * valueNoise(alongUnit * 13 + crossUnit * 0.9, range.seed + 139);
      const relativeHeight = skyline * crossProfile * flankVariation;
      const baseHeight = sampler.heightAt(x, z) - footClearanceMeters;
      const y = baseHeight + relativeHeight * range.heightMeters;
      const vertexIndex = alongIndex * verticesPerRow + crossIndex;
      const offset = vertexIndex * 3;
      const colorVariation =
        valueNoise(alongUnit * 19 + crossUnit * 0.9, range.seed + 173) - 0.5;
      const tint = mountainColor(relativeHeight, colorVariation);
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      colors[offset] = tint.r;
      colors[offset + 1] = tint.g;
      colors[offset + 2] = tint.b;
    }
  }

  const indices = new Uint32Array(alongSegments * crossSegments * 6);
  let cursor = 0;
  for (let alongIndex = 0; alongIndex < alongSegments; alongIndex += 1) {
    for (let crossIndex = 0; crossIndex < crossSegments; crossIndex += 1) {
      const a = alongIndex * verticesPerRow + crossIndex;
      const b = a + verticesPerRow;
      const c = a + 1;
      const d = b + 1;
      // Counter-clockwise from above; the material is double-sided for every viewing azimuth.
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }

  const geometry = new BufferGeometry();
  geometry.name = `${range.id}-distant-mountain-geometry`;
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Static horizon layer for the driving scene. It uses only a few thousand terrain-sampled
 * vertices, sits outside the authored road corridors, and adds neither fog nor snow.
 */
export class DistantMountainWorld {
  readonly root = new Group();
  readonly #rangeCount = DISTANT_MOUNTAIN_RANGES.length;

  constructor(sampler: TerrainSampler) {
    this.root.name = 'DistantMountainWorld';
    const material = new MeshStandardNodeMaterial();
    material.name = 'distant-mountain-rock-and-forest-pbr';
    material.colorNode = vertexColor();
    material.roughness = 0.96;
    material.metalness = 0;
    material.side = DoubleSide;

    for (const range of DISTANT_MOUNTAIN_RANGES) {
      const mesh = new Mesh(buildDistantMountainGeometry(sampler, range), material);
      mesh.name = `${range.id}-distant-mountain`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.root.add(mesh);
    }
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      distantMountainRanges: this.#rangeCount,
      distantMountainVertices:
        this.#rangeCount *
        (DISTANT_MOUNTAIN_MESH_CONFIG.alongSegments + 1) *
        (DISTANT_MOUNTAIN_MESH_CONFIG.crossSegments + 1),
    };
  }
}
