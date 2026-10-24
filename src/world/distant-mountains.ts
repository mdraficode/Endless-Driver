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

/** A broken, multi-peak skyline rather than a single primitive cone. */
function skylineEnvelope(along: number, seed: number): number {
  const phase = seed * 0.071;
  const broad = Math.sin(along * Math.PI * 2.1 + phase) * 0.19;
  const middle = Math.sin(along * Math.PI * 5.3 + phase * 1.7) * 0.13;
  const crags = Math.abs(Math.sin(along * Math.PI * 12.7 + phase * 2.3)) * 0.12;
  const fine = Math.sin(along * Math.PI * 27.1 + phase * 3.1) * 0.045;
  return Math.min(1, Math.max(0.27, 0.58 + broad + middle + crags + fine));
}

function mountainColor(relativeHeight: number, variation: number): MountainVertexColor {
  const exposedRock = smoothstep(0.22, 0.82, relativeHeight);
  const lower = { r: 0.17, g: 0.215, b: 0.18 };
  const upper = { r: 0.255, g: 0.275, b: 0.285 };
  const high = smoothstep(0.72, 1, relativeHeight) * 0.14;
  const shade = variation * 0.035;
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
  const phase = range.seed * 0.071;

  for (let alongIndex = 0; alongIndex <= alongSegments; alongIndex += 1) {
    const alongUnit = alongIndex / alongSegments;
    const alongMeters = (alongUnit - 0.5) * range.lengthMeters;
    const skyline = skylineEnvelope(alongUnit, range.seed);
    for (let crossIndex = 0; crossIndex <= crossSegments; crossIndex += 1) {
      const crossUnit = (crossIndex / crossSegments) * 2 - 1;
      const crossDistance = crossUnit * range.halfWidthMeters;
      const x = range.centerX + cosYaw * alongMeters - sinYaw * crossDistance;
      const z = range.centerZ + sinYaw * alongMeters + cosYaw * crossDistance;
      const crossProfile = Math.max(0, 1 - Math.abs(crossUnit));
      const slopeProfile = Math.pow(crossProfile, 1.18);
      const ridgelineRoughness =
        0.96 +
        0.04 *
          Math.sin(alongUnit * Math.PI * 38 + phase) *
          Math.max(0, 1 - Math.abs(crossUnit) * 2.4);
      const relativeHeight = skyline * slopeProfile * ridgelineRoughness;
      const baseHeight = sampler.heightAt(x, z) - footClearanceMeters;
      const y = baseHeight + relativeHeight * range.heightMeters;
      const vertexIndex = alongIndex * verticesPerRow + crossIndex;
      const offset = vertexIndex * 3;
      const tint = mountainColor(relativeHeight, Math.sin(alongUnit * 51 + crossUnit * 7 + phase));
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
