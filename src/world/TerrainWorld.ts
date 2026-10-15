import { Group, Mesh } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { float, fract, positionWorld, sin, vec2, vertexColor } from 'three/tsl';

import type { TerrainConfig } from '../config/terrain';
import type { TerrainSampler } from './terrain-height';
import type { SceneContent } from './WorldContent';
import { buildChunkGeometry } from './terrain-geometry';
import { chunkKey, planChunks } from './terrain-chunks';

interface LoadedChunk {
  readonly mesh: Mesh;
  segments: number;
  triangles: number;
}

/**
 * Streamed procedural terrain: the Phase 4 ground.
 *
 * A square of chunks (config: (2·viewRadius+1)² = 11×11 chunks of 128 m at three LODs)
 * follows the car. The plan comes from the pure planner in `terrain-chunks.ts`; this class
 * is only the stateful executor — it builds at most `maxBuildsPerFrame` chunks per frame
 * (the recorded upload budget: geometry construction is CPU work today and moves to the
 * generation worker next increment; either way the *budget* is what the acceptance test
 * measures), swaps LODs in place, and disposes what falls out of the square.
 *
 * One material for every chunk: per-chunk vertex colours carry the splat (grass/soil/
 * rock/snow by height and slope, from the same sampler the physics uses), and a two-scale
 * procedural grain in the shader breaks the flat tint up close. Scanned CC0 detail sets
 * take over the colour term next increment without touching the streaming logic.
 */
export class TerrainWorld implements SceneContent {
  readonly kind = 'terrain';
  readonly root = new Group();

  readonly #sampler: TerrainSampler;
  readonly #config: TerrainConfig;
  readonly #material: MeshStandardNodeMaterial;
  readonly #chunks = new Map<string, LoadedChunk>();
  #desiredCount = 0;
  #pendingBuilds = 0;
  #buildsLastFrame = 0;
  #totalBuilds = 0;
  #triangles = 0;

  constructor(sampler: TerrainSampler) {
    this.#sampler = sampler;
    this.#config = sampler.config;
    this.root.name = 'TerrainWorld';

    // Two-scale value-noise grain over the vertex-colour splat: a 0.35 m cell hash for
    // close-up breakup and a slow 14 m undulation so the lowlands do not read as one flat
    // green. Amplitude is deliberately small — the splat carries the colour story.
    const cell = positionWorld.xz.mul(1.6).floor();
    const grain = fract(sin(cell.dot(vec2(127.1, 311.7))).mul(43758.5453123));
    const swell = sin(positionWorld.x.mul(0.21)).mul(sin(positionWorld.z.mul(0.17)));
    const detail = float(0.94).add(grain.mul(0.07)).add(swell.mul(0.03));

    const material = new MeshStandardNodeMaterial();
    material.colorNode = vertexColor().mul(detail);
    material.roughnessNode = float(0.96);
    material.metalnessNode = float(0);
    this.#material = material;
  }

  updateStreaming(focus: { x: number; y: number; z: number }): void {
    const plan = planChunks(this.#config, focus.x, focus.z);
    this.#desiredCount = plan.length;
    const desired = new Map(plan.map((chunk) => [chunkKey(chunk.cx, chunk.cz), chunk]));

    // Evict what the plan no longer wants. Disposal is cheap and unbounded; construction
    // is the budgeted resource.
    for (const [key, loaded] of this.#chunks) {
      if (!desired.has(key)) {
        this.root.remove(loaded.mesh);
        loaded.mesh.geometry.dispose();
        this.#triangles -= loaded.triangles;
        this.#chunks.delete(key);
      }
    }

    const queue = plan.filter((chunk) => {
      const loaded = this.#chunks.get(chunkKey(chunk.cx, chunk.cz));
      return loaded === undefined || loaded.segments !== chunk.segments;
    });
    this.#pendingBuilds = queue.length;
    this.#buildsLastFrame = 0;
    for (const chunk of queue.slice(0, this.#config.maxBuildsPerFrame)) {
      const key = chunkKey(chunk.cx, chunk.cz);
      const geometry = buildChunkGeometry(this.#sampler, chunk.cx, chunk.cz, chunk.segments);
      const triangles = (geometry.index?.count ?? 0) / 3;
      const existing = this.#chunks.get(key);
      if (existing !== undefined) {
        this.#triangles -= existing.triangles;
        existing.mesh.geometry.dispose();
        existing.mesh.geometry = geometry;
        existing.segments = chunk.segments;
        existing.triangles = triangles;
      } else {
        const mesh = new Mesh(geometry, this.#material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.root.add(mesh);
        this.#chunks.set(key, { mesh, segments: chunk.segments, triangles });
      }
      this.#triangles += triangles;
      this.#buildsLastFrame += 1;
      this.#totalBuilds += 1;
    }
    if (this.#buildsLastFrame > 0) {
      this.#pendingBuilds -= this.#buildsLastFrame;
    }
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      terrainChunksLoaded: this.#chunks.size,
      terrainChunksDesired: this.#desiredCount,
      terrainBuildsPending: this.#pendingBuilds,
      terrainBuildsLastFrame: this.#buildsLastFrame,
      terrainBuildsTotal: this.#totalBuilds,
      terrainTriangles: this.#triangles,
    };
  }

  dispose(): void {
    for (const loaded of this.#chunks.values()) {
      loaded.mesh.geometry.dispose();
    }
    this.#chunks.clear();
    this.#material.dispose();
    this.root.clear();
  }
}
