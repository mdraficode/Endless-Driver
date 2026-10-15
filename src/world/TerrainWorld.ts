import { Group, Mesh, RepeatWrapping } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  float,
  fract,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';

import type { TerrainConfig } from '../config/terrain';
import { loadMaterialTextureSet, type MaterialTextureSet } from '../assets/AssetManifest';
import type { TerrainSampler } from './terrain-height';
import type { SceneContent } from './WorldContent';
import { ChunkGenerator } from './chunk-generator';
import {
  buildChunkGeometryData,
  chunkGeometryFromData,
  type ChunkGeometryData,
} from './terrain-geometry';
import { chunkKey, planChunksAround, resolveWindowCenter, type ChunkCoord } from './terrain-chunks';

interface LoadedChunk {
  readonly mesh: Mesh;
  segments: number;
  triangles: number;
}

/** Manifest ids of the scanned CC0 sets, in splat order [grass, soil, rock, snow]. */
const SURFACE_ASSETS = [
  'tex-leafy-grass-1k',
  'tex-brown-mud-dry-1k',
  'tex-rock-face-03-1k',
  'tex-snow-01-1k',
] as const;

/**
 * Streamed procedural terrain: the Phase 4 ground.
 *
 * A square of chunks (config: (2·viewRadius+1)² = 11×11 chunks of 128 m at three LODs)
 * follows the car. The plan comes from the pure planner in `terrain-chunks.ts`; this class
 * is only the stateful executor — it applies at most `maxBuildsPerFrame` chunks per
 * frame (the recorded upload budget). Geometry construction itself runs in the
 * generation worker pool (`chunk-generator.ts`) whenever the platform allows, with a
 * synchronous main-thread fallback that produces bit-identical chunks; the budget
 * bounds mesh/upload work per frame either way. It swaps LODs in place and disposes
 * what falls out of the square.
 *
 * One material for every chunk. Per-vertex data carries the splat weights and a macro
 * tint (hundred-metre variation + curvature occlusion); the scanned CC0 sets supply the
 * detail — grass/soil/rock/snow albedos with normal and packed AO/roughness maps, tiled
 * by world position, rock triplanar so cliffs do not stretch, all fading back to the
 * macro tint with distance so far LODs stay calm. The weights are the same numbers the
 * physics surface query mixes grip from (`terrain-surface.ts`): what a slope looks like
 * and how it drives cannot disagree.
 */
export class TerrainWorld implements SceneContent {
  readonly kind = 'terrain';
  readonly root = new Group();

  readonly #sampler: TerrainSampler;
  readonly #config: TerrainConfig;
  readonly #generator: ChunkGenerator;
  readonly #material: MeshStandardNodeMaterial;
  readonly #chunks = new Map<string, LoadedChunk>();
  #surfaceSets: readonly MaterialTextureSet[] = [];
  #center: ChunkCoord | null = null;
  #desiredCount = 0;
  #pendingBuilds = 0;
  #buildsLastFrame = 0;
  #totalBuilds = 0;
  #triangles = 0;

  constructor(sampler: TerrainSampler) {
    this.#sampler = sampler;
    this.#config = sampler.config;
    // Generation runs in a worker pool when the platform allows it and falls back to
    // this same sampler on the main thread otherwise; either way chunks are
    // bit-identical (one height function, two hosts).
    this.#generator = new ChunkGenerator(
      sampler,
      sampler.config,
      sampler.roadNetwork?.config ?? null,
    );
    this.root.name = 'TerrainWorld';

    const material = new MeshStandardNodeMaterial();
    this.#applyFlatNodes(material);
    material.roughnessNode = float(0.96);
    material.metalnessNode = float(0);
    this.#material = material;
  }

  /**
   * The pre-texture material: vertex-colour splat with a two-scale procedural grain. It is
   * what renders until `loadSurfaces` resolves (and forever, if the sets fail to load —
   * a missing texture must never take the ground with it).
   */
  #applyFlatNodes(material: MeshStandardNodeMaterial): void {
    const cell = positionWorld.xz.mul(1.6).floor();
    const grain = fract(sin(cell.dot(vec2(127.1, 311.7))).mul(43758.5453123));
    const swell = sin(positionWorld.x.mul(0.21)).mul(sin(positionWorld.z.mul(0.17)));
    const detail = float(0.94).add(grain.mul(0.07)).add(swell.mul(0.03));
    material.colorNode = vertexColor().mul(detail);
  }

  /**
   * Loads the four scanned surface sets through the asset manifest and switches the
   * material to the textured splat. Called once by `Application.start` beside the HDRI
   * load; failures keep the flat material and are reported, never thrown — the game must
   * boot on a partial asset set.
   */
  async loadSurfaces(): Promise<void> {
    const sets = await Promise.all(SURFACE_ASSETS.map((id) => loadMaterialTextureSet(id)));
    if (sets.some((set) => set === null)) {
      for (const set of sets) {
        set?.dispose();
      }
      console.warn('terrain: a scanned surface set is unavailable; keeping the flat splat');
      return;
    }
    const loaded = sets as MaterialTextureSet[];
    for (const set of loaded) {
      for (const map of [set.diffuse, set.normal, set.arm]) {
        if (map !== null) {
          map.wrapS = RepeatWrapping;
          map.wrapT = RepeatWrapping;
          map.anisotropy = 8;
        }
      }
    }
    this.#surfaceSets = loaded;
    this.#applySurfaceNodes(loaded);
  }

  /** The textured splat: world-space tiling, triplanar rock, distance fade to macro tint. */
  #applySurfaceNodes(sets: readonly MaterialTextureSet[]): void {
    const [grass, soil, rock, snow] = sets as [
      MaterialTextureSet,
      MaterialTextureSet,
      MaterialTextureSet,
      MaterialTextureSet,
    ];
    const splat = attribute('splat', 'vec4');
    const tint = attribute('tint', 'float');
    const wxz = positionWorld.xz;
    // Detail fades out between 90 m and 260 m: beyond that the macro tint (which every
    // LOD shares) carries the colour, so chunk resolution changes stop changing the
    // average colour of the ground and texture shimmer dies with distance.
    const detailFade = float(1).sub(
      smoothstep(float(90), float(260), positionWorld.sub(cameraPosition).length()),
    );

    // The leafy-grass scan grades straw-brown under warm sun (it is half leaf litter);
    // a saturation lift and a green-leaning tint pull it back to living grass while the
    // scan's detail — blades, twigs, soil — survives untouched.
    const grassRaw = texture(grass.diffuse, wxz.mul(0.85)).rgb;
    const grassLuma = grassRaw.dot(vec3(0.299, 0.587, 0.114));
    const grassAlbedo = mix(vec3(grassLuma), grassRaw, float(1.45)).mul(vec3(0.74, 1.12, 0.62));
    const soilAlbedo = texture(soil.diffuse, wxz.mul(0.65)).rgb;
    const snowAlbedo = texture(snow.diffuse, wxz.mul(0.5)).rgb;
    // Rock triplanar: three projections blended by the world normal, so a cliff face
    // samples the scan across its own plane instead of smearing the top-down tile.
    const axis = normalWorld.abs();
    const axisWeights = vec3(axis.x.pow(4), axis.y.pow(4), axis.z.pow(4));
    const axisTotal = axisWeights.x.add(axisWeights.y).add(axisWeights.z);
    const rockAlbedo = texture(rock.diffuse, wxz.mul(0.22))
      .rgb.mul(axisWeights.y)
      .add(texture(rock.diffuse, positionWorld.zy.mul(0.22)).rgb.mul(axisWeights.x))
      .add(texture(rock.diffuse, positionWorld.xy.mul(0.22)).rgb.mul(axisWeights.z))
      .div(axisTotal);

    const detailAlbedo = grassAlbedo
      .mul(splat.x)
      .add(soilAlbedo.mul(splat.y))
      .add(rockAlbedo.mul(splat.z))
      .add(snowAlbedo.mul(splat.w));

    const sampleArm = (set: MaterialTextureSet, uvScale: number) =>
      set.arm !== null ? texture(set.arm, wxz.mul(uvScale)) : null;
    const grassArm = sampleArm(grass, 0.85);
    const soilArm = sampleArm(soil, 0.65);
    const rockArm = sampleArm(rock, 0.22);
    const snowArm = sampleArm(snow, 0.5);
    const mixArm = (channel: 'r' | 'g', fallback: number) => {
      if (grassArm === null || soilArm === null || rockArm === null || snowArm === null) {
        return float(fallback);
      }
      return grassArm[channel]
        .mul(splat.x)
        .add(soilArm[channel].mul(splat.y))
        .add(rockArm[channel].mul(splat.z))
        .add(snowArm[channel].mul(splat.w));
    };

    const macro = vertexColor();
    this.#material.colorNode = mix(macro, detailAlbedo.mul(tint), detailFade);
    this.#material.roughnessNode = mix(float(0.96), mixArm('g', 0.95), detailFade);
    this.#material.aoNode = mix(float(1), mixArm('r', 1), detailFade);

    // Normal detail, blended like the albedo and faded with it: the far field keeps the
    // geometry normals, which is what makes distant LOD steps stop crawling.
    const flatNormal = vec3(0.5, 0.5, 1);
    const detailNormal = texture(grass.normal, wxz.mul(0.85))
      .rgb.mul(splat.x)
      .add(texture(soil.normal, wxz.mul(0.65)).rgb.mul(splat.y))
      .add(texture(rock.normal, wxz.mul(0.22)).rgb.mul(splat.z))
      .add(texture(snow.normal, wxz.mul(0.5)).rgb.mul(splat.w));
    this.#material.normalNode = mix(flatNormal, detailNormal, detailFade.mul(0.85));
  }

  updateStreaming(
    focus: { x: number; y: number; z: number },
    velocity: { x: number; z: number } = { x: 0, z: 0 },
  ): void {
    // Velocity-aware prefetch: the window is planned around where the car is heading,
    // capped so a fast car still keeps ground behind it; the build order stays sorted by
    // distance to the car itself, so the ground under the wheels always wins the budget.
    const speed = Math.hypot(velocity.x, velocity.z);
    const bias =
      speed > 0.01
        ? Math.min(this.#config.prefetchMaxMeters, speed * this.#config.prefetchSeconds) / speed
        : 0;
    const biasedX = focus.x + velocity.x * bias;
    const biasedZ = focus.z + velocity.z * bias;
    this.#center = resolveWindowCenter(this.#center, this.#config, biasedX, biasedZ);
    const plan = planChunksAround(this.#config, this.#center.cx, this.#center.cz, focus.x, focus.z);
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

    // Applies one generated chunk (from either thread) within the per-frame budget:
    // mesh creation and GPU upload stay capped even though generation itself moved
    // off-thread — the budget now bounds uploads, not CPU construction.
    const applyChunk = (
      cx: number,
      cz: number,
      segments: number,
      data: ChunkGeometryData,
    ): void => {
      const key = chunkKey(cx, cz);
      const geometry = chunkGeometryFromData(data);
      const triangles = (geometry.index?.count ?? 0) / 3;
      const existing = this.#chunks.get(key);
      if (existing !== undefined) {
        this.#triangles -= existing.triangles;
        existing.mesh.geometry.dispose();
        existing.mesh.geometry = geometry;
        existing.segments = segments;
        existing.triangles = triangles;
      } else {
        const mesh = new Mesh(geometry, this.#material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.root.add(mesh);
        this.#chunks.set(key, { mesh, segments, triangles });
      }
      this.#triangles += triangles;
      this.#buildsLastFrame += 1;
      this.#totalBuilds += 1;
    };

    if (this.#generator.mode === 'worker') {
      this.#generator.syncQueue(
        queue.map((chunk) => ({
          key: chunkKey(chunk.cx, chunk.cz),
          cx: chunk.cx,
          cz: chunk.cz,
          segments: chunk.segments,
        })),
      );
      for (const result of this.#generator.takeCompleted(this.#config.maxBuildsPerFrame)) {
        const want = desired.get(chunkKey(result.chunkX, result.chunkZ));
        if (want !== undefined && want.segments === result.segments) {
          applyChunk(result.chunkX, result.chunkZ, result.segments, result.data);
        }
      }
    } else {
      for (const chunk of queue.slice(0, this.#config.maxBuildsPerFrame)) {
        applyChunk(
          chunk.cx,
          chunk.cz,
          chunk.segments,
          buildChunkGeometryData(this.#sampler, chunk.cx, chunk.cz, chunk.segments),
        );
      }
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
      terrainSurfacesLoaded: this.#surfaceSets.length > 0 ? 1 : 0,
      terrainGeneratorMode: this.#generator.mode === 'worker' ? 1 : 0,
      terrainWorkerBacklog: this.#generator.backlog,
      terrainWorkerBuilds: this.#generator.workerBuilds,
    };
  }

  dispose(): void {
    this.#generator.dispose();
    for (const loaded of this.#chunks.values()) {
      loaded.mesh.geometry.dispose();
    }
    this.#chunks.clear();
    for (const set of this.#surfaceSets) {
      set.dispose();
    }
    this.#surfaceSets = [];
    this.#material.dispose();
    this.root.clear();
  }
}
