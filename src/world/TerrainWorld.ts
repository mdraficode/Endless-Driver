import { Group, Mesh, RepeatWrapping, type Texture } from 'three';
import { MeshStandardNodeMaterial, type Node, type WebGPURenderer } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  clamp,
  float,
  fract,
  mix,
  normalMap,
  normalWorld,
  positionLocal,
  positionWorld,
  select,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';

import { ACTIVE_TERRAIN_SURFACE_ASSETS, type TerrainConfig } from '../config/terrain';
import {
  loadMaterialTextureSet,
  type AssetResolution,
  type MaterialTextureSet,
} from '../assets/AssetManifest';
import { surfaceAssetIdAtResolution } from '../config/asset-resolution';
import type { TerrainSampler } from './terrain-height';
import type { SceneContent } from './WorldContent';
import { ChunkGenerator } from './chunk-generator';
import {
  buildChunkGeometryData,
  chunkGeometryFromData,
  type ChunkGeometryData,
} from './terrain-geometry';
import {
  chunkKey,
  planChunksAround,
  predictPrefetchFocus,
  resolveWindowCenter,
  type ChunkCoord,
  type PlannedChunk,
} from './terrain-chunks';
import { HeightfieldRasterizer } from './terrain-heightfield-gpu';

/**
 * Phase 11.0d: how long a chunk may wait on a GPU base read-back before the CPU path takes
 * the chunk. The rasteriser's own 1 s stall reject fires first on a live device; this is
 * the net for the pathologies it cannot see (a device that neither resolves nor rejects).
 */
const GPU_BASE_TIMEOUT_MS = 4_000;
/** Consecutive GPU base failures before the rasteriser is retired for the session. */
const GPU_BASE_MAX_FAILURES = 8;

interface LoadedChunk {
  readonly mesh: Mesh;
  segments: number;
  triangles: number;
  /** True while the mesh wears the near (POM) material. */
  pom: boolean;
}

export interface TerrainWorldOptions {
  /** Enable the costly near-ring displacement march; reserved for an explicitly selected high tier. */
  readonly enableParallaxOcclusion?: boolean;
  /** Override the number of rings that must be ready before the first frame (default 1 → 9 chunks). */
  readonly initialReadyRing?: number;
  /**
   * Enable the Phase 11.0d GPU base rasteriser on WebGPU backends (default true). The GPU
   * rasterises the pre-carve base heightfield; the carve still runs on the CPU on top of it.
   * The CPU path stays the fallback — off here, on a non-WebGPU backend, or whenever the
   * rasteriser fails.
   */
  readonly enableHeightfieldGpu?: boolean;
}

/*
 * World-space UV scales (tiles per metre), one per scanned set: 1 m divided by
 * the scan's documented physical width. The old hand-picked scales ran grass
 * blades at half their real size and the rock face at double its real width —
 * a major reason the ground read as 'not a real surface' (owner report
 * 2026-10-17). Detail now also survives to 380 m before the macro tint takes
 * over, so mid-distance ground keeps scanned relief instead of flat colour.
 */
const GRASS_UV = 0.5; // leafy_grass: 2 m scan
const SOIL_UV = 0.77; // brown_mud_dry: 1.3 m scan
const ROCK_UV = 0.45; // rock_face_03: ~2.2 m face
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
 * Two materials share one splat graph: the plain material for every chunk but
 * the closest LOD ring, which wears the near material whose sampling position is
 * raymarched through the blended scanned displacement (POM). Per-vertex data carries the splat weights and a macro
 * tint (hundred-metre variation + curvature occlusion); the scanned CC0 sets supply the
 * detail — grass/soil/rock albedos with normal and packed AO/roughness maps, tiled
 * by world position, rock triplanar so cliffs do not stretch, all fading back to the
 * macro tint with distance so far LODs stay calm. The weights are the same numbers the
 * physics surface query mixes grip from (`terrain-surface.ts`): what a slope looks like
 * and how it drives cannot disagree.
 */
/** The first-frame ground guarantee: prepare the center and its immediate eight neighbors. */
const INITIAL_TERRAIN_READY_RING = 1;
const INITIAL_TERRAIN_READY_RING_BY_TIER: Readonly<Record<string, number>> = {
  C: 0,
  B: 1,
  A: 1,
};

export function resolveInitialTerrainReadyRing(qualityTier?: string): number {
  if (qualityTier !== undefined && qualityTier in INITIAL_TERRAIN_READY_RING_BY_TIER) {
    return INITIAL_TERRAIN_READY_RING_BY_TIER[qualityTier]!;
  }
  return INITIAL_TERRAIN_READY_RING;
}
const INITIAL_TERRAIN_PREPARATION_TIMEOUT_MS = 12_000;
const INITIAL_TERRAIN_POLL_INTERVAL_MS = 16;

/**
 * True when a decoded texture is a uniform near-white sheet — the signature of a
 * driver that reported success but returned a blank image. Sampled at 32×32 so the
 * check costs one small readback per surface set at load time, never per frame.
 */
function isBlankDecode(texture: Texture): boolean {
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (image === undefined || image === null || (image.width ?? 0) < 4 || (image.height ?? 0) < 4) {
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) return false;
    ctx.drawImage(image as CanvasImageSource, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    let sumSquares = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const luma =
        ((data[i] ?? 0) * 0.2126 + (data[i + 1] ?? 0) * 0.7152 + (data[i + 2] ?? 0) * 0.0722) / 255;
      sum += luma;
      sumSquares += luma * luma;
    }
    const mean = sum / pixels;
    const variance = sumSquares / pixels - mean * mean;
    return mean > 0.96 && variance < 0.0004;
  } catch {
    // Unreadable on this browser (tainted or bitmap-only): never punish the set for it.
    return false;
  }
}

export class TerrainWorld implements SceneContent {
  readonly kind = 'terrain';
  readonly root = new Group();

  readonly #sampler: TerrainSampler;
  readonly #config: TerrainConfig;
  readonly #generator: ChunkGenerator;
  /** Phase 11.0d: GPU base rasteriser (WebGPU backends only; null on the CPU path). */
  #rasterizer: HeightfieldRasterizer | null = null;
  /** Chunks whose GPU base is in flight: key → request time (ms). */
  #gpuPending = new Map<string, number>();
  /** Chunks whose GPU base has arrived and awaits the worker: key → base grid. */
  #gpuBase = new Map<string, Float32Array>();
  /** Chunks the GPU gave up on (read-back budget blown); the CPU path takes them. */
  #gpuGaveUp = new Set<string>();
  /** Consecutive GPU base failures (circuit breaker → the CPU path for the session). */
  #gpuFails = 0;
  /** Last frame's gpuLive, to detect the live→dead transition (it re-arms the CPU path). */
  #gpuLivePrev = false;
  #gpuEnabled: boolean;
  readonly #material: MeshStandardNodeMaterial;
  readonly #nearMaterial: MeshStandardNodeMaterial;
  readonly #enableParallaxOcclusion: boolean;
  readonly #chunks = new Map<string, LoadedChunk>();
  #pomActive = false;
  #surfaceSets: readonly MaterialTextureSet[] = [];
  #center: ChunkCoord | null = null;
  #plan: PlannedChunk[] = [];
  #desiredChunks = new Map<string, PlannedChunk>();
  #desiredCount = 0;
  #pendingBuilds = 0;
  #buildsLastFrame = 0;
  #planBuilds = 0;
  #totalBuilds = 0;
  #triangles = 0;
  #disposed = false;

  #initialReadyRing: number;

  constructor(sampler: TerrainSampler, options: TerrainWorldOptions = {}) {
    this.#sampler = sampler;
    this.#config = sampler.config;
    this.#enableParallaxOcclusion = options.enableParallaxOcclusion ?? true;
    this.#initialReadyRing = options.initialReadyRing ?? INITIAL_TERRAIN_READY_RING;
    this.#gpuEnabled = options.enableHeightfieldGpu ?? true;
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
    material.name = 'terrain-splat-far';
    this.#applyFlatNodes(material);
    material.roughnessNode = float(0.96);
    material.metalnessNode = float(0);
    this.#material = material;

    const nearMaterial = new MeshStandardNodeMaterial();
    nearMaterial.name = 'terrain-splat-near';
    this.#applyFlatNodes(nearMaterial);
    nearMaterial.roughnessNode = float(0.96);
    nearMaterial.metalnessNode = float(0);
    this.#nearMaterial = nearMaterial;
  }

  /**
   * Phase 11.0d: the GPU base rasteriser hookup, driven by the engine's backend once it is
   * known (`Application` calls this after renderer init). It engages only on a WebGPU
   * backend, with a world sampler that carries the base spec AND the carve — everything
   * else keeps the CPU path bit-for-bit. The rasteriser is an accelerator, never a
   * requirement: a failed configure leaves the CPU path in place, and repeated read-back
   * failures retire it for the session.
   */
  configureRenderer(backend: 'webgpu' | 'webgl2', renderer: unknown): void {
    this.#disposeRasterizer();
    if (this.#disposed || !this.#gpuEnabled || backend !== 'webgpu') {
      return;
    }
    const spec = this.#sampler.baseSpec;
    if (spec === undefined || this.#sampler.carveFromBase === undefined) {
      return;
    }
    const gpuRenderer = renderer as WebGPURenderer | null;
    if (gpuRenderer === null || typeof gpuRenderer.compute !== 'function') {
      return;
    }
    try {
      const rasterizer = new HeightfieldRasterizer();
      rasterizer.configure(gpuRenderer, spec);
      this.#rasterizer = rasterizer;
    } catch {
      console.warn('terrain: GPU heightfield rasteriser unavailable; using the CPU base');
    }
  }

  /**
   * Requests the GPU base grid for one chunk: the chunk's halo grid
   * (`(segments+3)²` at `chunkSize/segments` pitch from one step before the chunk origin —
   * exactly the coordinates `buildChunkGeometryData` samples). The read-back lands on a
   * LATER frame into `#gpuBase`; the worker (or the sync path) carves on top of it.
   */
  #requestGpuBase(chunk: PlannedChunk): void {
    const rasterizer = this.#rasterizer;
    if (rasterizer === null) {
      return;
    }
    const key = chunkKey(chunk.cx, chunk.cz);
    const step = this.#config.chunkSizeMeters / chunk.segments;
    this.#gpuPending.set(key, performance.now());
    rasterizer
      .request(
        chunk.cx * this.#config.chunkSizeMeters - step,
        chunk.cz * this.#config.chunkSizeMeters - step,
        step,
        chunk.segments + 3,
      )
      .then((base) => {
        this.#gpuPending.delete(key);
        if (!this.#disposed) {
          this.#gpuFails = 0;
          this.#gpuBase.set(key, base);
        }
      })
      .catch(() => {
        this.#gpuPending.delete(key);
        this.#gpuFails += 1;
        if (this.#gpuFails >= GPU_BASE_MAX_FAILURES && this.#rasterizer !== null) {
          console.warn('terrain: GPU heightfield keeps failing; falling back to the CPU base');
          this.#disposeRasterizer();
        }
      });
    // The net: a read-back that neither lands nor rejects must not hold the chunk.
    setTimeout(() => {
      if (this.#gpuPending.delete(key)) {
        this.#gpuGaveUp.add(key);
      }
    }, GPU_BASE_TIMEOUT_MS);
  }

  #disposeRasterizer(): void {
    this.#rasterizer?.dispose();
    this.#rasterizer = null;
    this.#gpuPending.clear();
    this.#gpuBase.clear();
    this.#gpuGaveUp.clear();
    this.#gpuFails = 0;
  }

  /**
   * The pre-texture material: vertex-colour splat with a two-scale procedural grain. It is
   * what renders until `loadSurfaces` resolves (and forever, if the sets fail to load —
   * a missing texture must never take the ground with it).
   */
  #applyFlatNodes(material: MeshStandardNodeMaterial): void {
    // Terrain vertices are authored in absolute world coordinates in mesh-local space. Sampling
    // those coordinates avoids visible material motion when the floating-origin root is shifted.
    const cell = positionLocal.xz.mul(1.6).floor();
    const grain = fract(sin(cell.dot(vec2(127.1, 311.7))).mul(43758.5453123));
    const swell = sin(positionLocal.x.mul(0.21)).mul(sin(positionLocal.z.mul(0.17)));
    const detail = float(0.94).add(grain.mul(0.07)).add(swell.mul(0.03));
    material.colorNode = vertexColor().mul(detail);
  }

  /**
   * Loads the three active scanned surface sets through the asset manifest and switches the
   * material to the textured splat. Called once by `Application.start` beside the HDRI
   * load; failures keep the flat material and are reported, never thrown — the game must
   * boot on a partial asset set.
   */
  async loadSurfaces(resolution: AssetResolution = '1k'): Promise<void> {
    const sets = await Promise.all(
      ACTIVE_TERRAIN_SURFACE_ASSETS.map((id) =>
        loadMaterialTextureSet(surfaceAssetIdAtResolution(id, resolution)),
      ),
    );
    if (sets.some((set) => set === null)) {
      for (const set of sets) {
        set?.dispose();
      }
      console.warn('terrain: a scanned surface set is unavailable; keeping the flat splat');
      return;
    }
    const loaded = sets as MaterialTextureSet[];
    // Device-side decode sanity: a uniformly white diffuse means the driver handed
    // back a blank image (seen on memory-pressured mobile GPUs). Rendering it would
    // paint near ground white while the far vertex-colour macro stays green, so a
    // blank decode counts as "the set never arrived" and the flat splat stays.
    for (let i = 0; i < loaded.length; i += 1) {
      const set = loaded[i];
      if (set !== undefined && isBlankDecode(set.diffuse)) {
        for (const set of loaded) {
          set.dispose();
        }
        console.warn(
          `terrain: surface "${ACTIVE_TERRAIN_SURFACE_ASSETS[i] ?? i}" decoded blank on this device; keeping the flat splat`,
        );
        return;
      }
    }
    for (const set of loaded) {
      for (const map of [set.diffuse, set.normal, set.arm, set.height]) {
        if (map !== null) {
          map.wrapS = RepeatWrapping;
          map.wrapT = RepeatWrapping;
          map.anisotropy = 8;
        }
      }
    }
    this.#surfaceSets = loaded;
    // POM is only honest with all three active displacement maps; without them the near
    // material is the same splat, just on its own instance.
    this.#pomActive = this.#enableParallaxOcclusion && loaded.every((set) => set.height !== null);
    this.#applySurfaceNodes(loaded, this.#material, false);
    this.#applySurfaceNodes(loaded, this.#nearMaterial, this.#pomActive);
  }

  /**
   * The textured splat: world-space tiling, triplanar rock, distance fade to macro tint.
   * With `pom` (near tier only, all three active displacement maps present) the sampling
   * position is first raymarched through the splat-blended scanned displacement:
   * the ray starts on the relief's top plane and steps down until it meets the
   * heightfield, with one secant refinement across the crossing layer. The
   * offset fades out by the configured distance, so beyond it the near material
   * samples exactly where the far material does and the two cannot seam.
   */
  #applySurfaceNodes(
    sets: readonly MaterialTextureSet[],
    material: MeshStandardNodeMaterial,
    pom: boolean,
  ): void {
    const [grass, soil, rock] = sets as [
      MaterialTextureSet,
      MaterialTextureSet,
      MaterialTextureSet,
    ];
    const splat = attribute('splat', 'vec4');
    const tint = attribute('tint', 'float');
    const districtTint = attribute('district', 'vec3');
    let wxz = positionLocal.xz;

    if (pom) {
      const pomConfig = this.#config.pom;
      const toCamera = cameraPosition.sub(positionWorld);
      const cameraDistance = toCamera.length();
      const viewDir = toCamera.normalize();
      const pomFade = float(1).sub(
        smoothstep(
          float(pomConfig.fadeStartMeters),
          float(pomConfig.fadeEndMeters),
          cameraDistance,
        ),
      );
      // World-planar tangent frame: X/Z is the map plane, Y is up. Grazing views
      // would stretch the march without bound, so the divisor is clamped.
      const slope = viewDir.xz.div(clamp(viewDir.y, 0.22, 1));
      const heightAt = (xz: typeof wxz) =>
        texture(grass.height!, xz.mul(GRASS_UV))
          .r.mul(splat.x)
          .add(texture(soil.height!, xz.mul(SOIL_UV)).r.mul(splat.y))
          .add(texture(rock.height!, xz.mul(0.22)).r.mul(splat.z));
      // The march is unrolled while the graph is built and the first crossing is
      // selected arithmetically (no shader loop or function boundary): texture
      // uniforms then stay in the main material program on both backends, which
      // a Fn-wrapped march did not survive on WebGL2. All steps sample, so the
      // cost is fixed — that is why this material exists only on the near ring.
      const stepDepth = 1 / pomConfig.steps;
      let found: Node<'float'> = float(0);
      let hitDepth: Node<'float'> = float(1);
      let hitHeight: Node<'float'> = float(0);
      let prevHitDepth: Node<'float'> = float(0);
      let prevHitHeight: Node<'float'> = heightAt(wxz);
      let previousHeight: Node<'float'> = prevHitHeight;
      for (let stepIndex = 1; stepIndex <= pomConfig.steps; stepIndex += 1) {
        const depth = stepIndex * stepDepth;
        const sampleXz = wxz.sub(slope.mul(depth * pomConfig.depthMeters));
        const height = heightAt(sampleXz);
        const cross = select(float(1 - depth).lessThanEqual(height), float(1), float(0));
        const firstCross = cross.mul(float(1).sub(found));
        found = found.add(firstCross);
        hitDepth = mix(hitDepth, float(depth), firstCross);
        hitHeight = mix(hitHeight, height, firstCross);
        prevHitDepth = mix(prevHitDepth, float(depth - stepDepth), firstCross);
        prevHitHeight = mix(prevHitHeight, previousHeight, firstCross);
        previousHeight = height;
      }
      // Secant refinement: interpolate the crossing between the last two layers
      // instead of snapping to a step boundary (which bands at grazing angles).
      const above = prevHitHeight.sub(float(1).sub(prevHitDepth));
      const below = hitHeight.sub(float(1).sub(hitDepth));
      const fraction = above.div(above.sub(below).max(0.00001)).clamp(0, 1);
      const refinedDepth = prevHitDepth.add(float(stepDepth).mul(fraction));
      const hitXz = wxz.sub(slope.mul(refinedDepth.mul(pomConfig.depthMeters)));
      wxz = mix(wxz, hitXz, pomFade);
    }
    const wpos = vec3(wxz.x, positionLocal.y, wxz.y);

    // Detail fades out between 90 m and 260 m: beyond that the macro tint (which every
    // LOD shares) carries the colour, so chunk resolution changes stop changing the
    // average colour of the ground and texture shimmer dies with distance.
    const detailFade = float(1).sub(
      smoothstep(float(120), float(380), positionWorld.sub(cameraPosition).length()),
    );

    // The leafy-grass scan grades straw-brown under warm sun (it is half leaf litter);
    // a saturation lift and a green-leaning tint pull it back to living grass while the
    // scan's detail — blades, twigs, soil — survives untouched.
    const grassRaw = texture(grass.diffuse, wxz.mul(GRASS_UV)).rgb;
    const grassLuma = grassRaw.dot(vec3(0.299, 0.587, 0.114));
    const grassAlbedo = mix(vec3(grassLuma), grassRaw, float(1.45)).mul(vec3(0.74, 1.12, 0.62));
    const soilAlbedo = texture(soil.diffuse, wxz.mul(SOIL_UV)).rgb;
    // Rock triplanar: three projections blended by the world normal, so a cliff face
    // samples the scan across its own plane instead of smearing the top-down tile.
    const axis = normalWorld.abs();
    const axisWeights = vec3(axis.x.pow(4), axis.y.pow(4), axis.z.pow(4));
    const axisTotal = axisWeights.x.add(axisWeights.y).add(axisWeights.z);
    const rockAlbedo = texture(rock.diffuse, wxz.mul(ROCK_UV))
      .rgb.mul(axisWeights.y)
      .add(texture(rock.diffuse, wpos.zy.mul(ROCK_UV)).rgb.mul(axisWeights.x))
      .add(texture(rock.diffuse, wpos.xy.mul(ROCK_UV)).rgb.mul(axisWeights.z))
      .div(axisTotal);

    const detailAlbedo = grassAlbedo
      .mul(splat.x)
      .add(soilAlbedo.mul(splat.y))
      .add(rockAlbedo.mul(splat.z));

    const sampleArm = (set: MaterialTextureSet, uvScale: number) =>
      set.arm !== null ? texture(set.arm, wxz.mul(uvScale)) : null;
    const grassArm = sampleArm(grass, GRASS_UV);
    const soilArm = sampleArm(soil, SOIL_UV);
    const rockArm = sampleArm(rock, ROCK_UV);
    const mixArm = (channel: 'r' | 'g' | 'b', fallback: number) => {
      if (grassArm === null || soilArm === null || rockArm === null) {
        return float(fallback);
      }
      return grassArm[channel]
        .mul(splat.x)
        .add(soilArm[channel].mul(splat.y))
        .add(rockArm[channel].mul(splat.z));
    };

    const macro = vertexColor();
    material.colorNode = mix(macro, detailAlbedo.mul(tint).mul(districtTint), detailFade);
    material.roughnessNode = mix(float(0.96), mixArm('g', 0.95), detailFade);
    material.metalnessNode = mix(float(0), mixArm('b', 0), detailFade);
    material.aoNode = mix(float(1), mixArm('r', 1), detailFade);

    // Normal detail is tangent-space data. Blend the scanned maps in tangent space, then let
    // normalMap() decode and transform through the geometry's TBN frame into view space. The
    // far field fades back to the geometric normal instead of feeding raw RGB to normalNode.
    const flatNormal = vec3(0.5, 0.5, 1);
    const detailNormal = texture(grass.normal, wxz.mul(GRASS_UV))
      .rgb.mul(splat.x)
      .add(texture(soil.normal, wxz.mul(SOIL_UV)).rgb.mul(splat.y))
      .add(texture(rock.normal, wxz.mul(ROCK_UV)).rgb.mul(splat.z));
    material.normalNode = normalMap(mix(flatNormal, detailNormal, detailFade.mul(0.85)));
  }

  updateStreaming(
    focus: { x: number; y: number; z: number },
    velocity: { x: number; z: number } = { x: 0, z: 0 },
  ): void {
    if (this.#disposed) {
      return;
    }
    // Replan only when the hysteretic window actually moves. While the car remains inside
    // that window, the desired chunk set and LODs are unchanged; sorting 121 coordinates and
    // rebuilding maps/queues every rendered frame only creates CPU and GC pressure.
    const predicted = predictPrefetchFocus(this.#config, focus, velocity);
    const nextCenter = resolveWindowCenter(this.#center, this.#config, predicted.x, predicted.z);
    const centerChanged =
      this.#center === null ||
      nextCenter.cx !== this.#center.cx ||
      nextCenter.cz !== this.#center.cz;
    if (centerChanged) {
      this.#center = nextCenter;
      this.#plan = planChunksAround(this.#config, nextCenter.cx, nextCenter.cz, focus.x, focus.z);
      this.#planBuilds += 1;
      this.#desiredChunks = new Map(
        this.#plan.map((chunk) => [chunkKey(chunk.cx, chunk.cz), chunk]),
      );
      this.#desiredCount = this.#plan.length;

      // Evict only on a window change. Disposal is cheap; repeated per-frame set checks are not.
      for (const [key, loaded] of this.#chunks) {
        if (!this.#desiredChunks.has(key)) {
          this.root.remove(loaded.mesh);
          loaded.mesh.geometry.dispose();
          this.#triangles -= loaded.triangles;
          this.#chunks.delete(key);
        }
      }
      // Evicted chunks take their GPU base state with them (a revisit re-requests fresh).
      for (const key of [...this.#gpuPending.keys(), ...this.#gpuBase.keys(), ...this.#gpuGaveUp]) {
        if (!this.#desiredChunks.has(key)) {
          this.#gpuPending.delete(key);
          this.#gpuBase.delete(key);
          this.#gpuGaveUp.delete(key);
        }
      }
    }

    const plan = this.#plan;
    const desired = this.#desiredChunks;
    // Once every planned chunk is present, there is no queue to rebuild. While builds remain,
    // recheck loaded LODs so completed worker jobs are not requested again.
    const queue =
      centerChanged || this.#pendingBuilds > 0
        ? plan.filter((chunk) => {
            const loaded = this.#chunks.get(chunkKey(chunk.cx, chunk.cz));
            return loaded === undefined || loaded.segments !== chunk.segments;
          })
        : [];
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
      // The closest LOD ring wears the POM material; every other ring the plain
      // splat. Geometry swaps re-evaluate this, so a chunk crossing rings in
      // either direction changes material with its resolution.
      const pom = this.#enableParallaxOcclusion && segments === this.#config.lodSegments[0];
      if (existing !== undefined) {
        this.#triangles -= existing.triangles;
        existing.mesh.geometry.dispose();
        existing.mesh.geometry = geometry;
        existing.mesh.material = pom ? this.#nearMaterial : this.#material;
        existing.segments = segments;
        existing.triangles = triangles;
        existing.pom = pom;
      } else {
        const mesh = new Mesh(geometry, pom ? this.#nearMaterial : this.#material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.root.add(mesh);
        this.#chunks.set(key, { mesh, segments, triangles, pom });
      }
      this.#triangles += triangles;
      this.#buildsLastFrame += 1;
      this.#totalBuilds += 1;
      // A built chunk takes its GPU base state with it (the base was consumed into the
      // job; gave-up chunks stop re-arming the per-frame worker re-sync once applied).
      this.#gpuBase.delete(key);
      this.#gpuPending.delete(key);
      this.#gpuGaveUp.delete(key);
    };

    // Phase 11.0d: the GPU rasterises the pre-carve base of every queued chunk. Poll the
    // read-backs (next-frame copies), then request the base of each queued chunk that has
    // neither a landed base nor a request in flight. The carve stays on the CPU either way.
    const rasterizer = this.#rasterizer;
    const gpuLive = rasterizer !== null && rasterizer.ready;
    const gpuLiveChanged = this.#gpuLivePrev !== gpuLive;
    this.#gpuLivePrev = gpuLive;
    if (gpuLive) {
      rasterizer.poll();
      for (const chunk of queue) {
        const key = chunkKey(chunk.cx, chunk.cz);
        if (this.#gpuGaveUp.has(key) || this.#gpuBase.has(key) || this.#gpuPending.has(key)) {
          continue;
        }
        this.#requestGpuBase(chunk);
      }
    }

    if (this.#generator.mode === 'worker') {
      // Worker jobs carry the GPU base when it has landed; a chunk still waiting on its
      // read-back is handed over on the frame it lands (its job goes out then). Without a
      // live rasteriser the jobs are baseless — the worker builds the base on the CPU,
      // exactly as before Phase 11.0d. Re-sync on a re-plan, when bases or CPU-fallback
      // chunks (gave-up) appear, and on the live→dead transition (the whole queue
      // re-arms for the CPU path at once).
      if (
        centerChanged ||
        gpuLiveChanged ||
        (gpuLive && (this.#gpuBase.size > 0 || this.#gpuGaveUp.size > 0))
      ) {
        const jobs: {
          key: string;
          cx: number;
          cz: number;
          segments: number;
          base?: Float32Array;
        }[] = [];
        for (const chunk of queue) {
          const key = chunkKey(chunk.cx, chunk.cz);
          if (gpuLive && this.#gpuGaveUp.has(key) === false) {
            const base = this.#gpuBase.get(key);
            if (base === undefined) {
              continue; // read-back in flight: the chunk is handed over when it lands
            }
            this.#gpuBase.delete(key);
            jobs.push({ key, cx: chunk.cx, cz: chunk.cz, segments: chunk.segments, base });
            continue;
          }
          jobs.push({ key, cx: chunk.cx, cz: chunk.cz, segments: chunk.segments });
        }
        this.#generator.syncQueue(jobs);
      }
      for (const result of this.#generator.takeCompleted(this.#config.maxBuildsPerFrame)) {
        const want = desired.get(chunkKey(result.chunkX, result.chunkZ));
        if (want !== undefined && want.segments === result.segments) {
          applyChunk(result.chunkX, result.chunkZ, result.segments, result.data);
        }
      }
    } else {
      // Sync fallback: build within the per-frame budget. A chunk waits for its GPU base
      // (when the rasteriser is live) instead of burning the main thread on noise; the CPU
      // path builds it as soon as the base lands, or immediately when the rasteriser is
      // retired or the GPU gave up on that chunk.
      for (const chunk of queue) {
        if (this.#buildsLastFrame >= this.#config.maxBuildsPerFrame) {
          break;
        }
        const key = chunkKey(chunk.cx, chunk.cz);
        const base = this.#gpuBase.get(key);
        if (gpuLive && this.#gpuGaveUp.has(key) === false && base === undefined) {
          continue; // read-back in flight (or not yet requested this frame)
        }
        if (base !== undefined) {
          this.#gpuBase.delete(key);
        }
        applyChunk(
          chunk.cx,
          chunk.cz,
          chunk.segments,
          buildChunkGeometryData(this.#sampler, chunk.cx, chunk.cz, chunk.segments, base),
        );
      }
    }
    if (this.#buildsLastFrame > 0) {
      this.#pendingBuilds -= this.#buildsLastFrame;
    }
  }

  /**
   * Prepares only the spawn chunk and its immediate neighbors before the first frame.
   * Terrain generation still queues the full window; farther rings stream during play instead of
   * holding the player behind dozens of chunks. The 16 ms wait avoids a busy polling loop while
   * workers generate those initial meshes.
   */
  async prepareInitial(
    focus: { x: number; y: number; z: number },
    velocity: { x: number; z: number } = { x: 0, z: 0 },
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    if (this.#disposed) {
      return;
    }
    const deadline = Date.now() + INITIAL_TERRAIN_PREPARATION_TIMEOUT_MS;
    this.updateStreaming(focus, velocity);
    const startupChunks = this.#plan.filter((chunk) => chunk.ring <= this.#initialReadyRing);
    const countStartupChunksLoaded = (): number =>
      startupChunks.reduce((count, chunk) => {
        const loaded = this.#chunks.get(chunkKey(chunk.cx, chunk.cz));
        return count + (loaded !== undefined && loaded.segments === chunk.segments ? 1 : 0);
      }, 0);
    const reportProgress = (): void => {
      const fraction =
        startupChunks.length === 0 ? 1 : countStartupChunksLoaded() / startupChunks.length;
      onProgress?.(fraction);
    };
    reportProgress();
    while (!this.#disposed) {
      const loaded = countStartupChunksLoaded();
      if (loaded === startupChunks.length) {
        onProgress?.(1);
        return;
      }
      if (Date.now() >= deadline) {
        console.warn(
          `terrain: startup-ring preparation timed out (${loaded}/${startupChunks.length} near chunks loaded; ${this.#pendingBuilds} chunks remain in the full ${this.#desiredCount}-chunk window)`,
        );
        reportProgress();
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, INITIAL_TERRAIN_POLL_INTERVAL_MS));
      if (!this.#disposed) {
        this.updateStreaming(focus, velocity);
        reportProgress();
      }
    }
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      terrainChunksLoaded: this.#chunks.size,
      terrainChunksDesired: this.#desiredCount,
      terrainBuildsPending: this.#pendingBuilds,
      terrainBuildsLastFrame: this.#buildsLastFrame,
      terrainBuildsTotal: this.#totalBuilds,
      terrainPlanBuilds: this.#planBuilds,
      terrainTriangles: this.#triangles,
      terrainSurfacesLoaded: this.#surfaceSets.length > 0 ? 1 : 0,
      terrainPomConfigured: this.#enableParallaxOcclusion ? 1 : 0,
      terrainPomActive: this.#pomActive ? 1 : 0,
      terrainPomSteps: this.#config.pom.steps,
      terrainPomChunks: [...this.#chunks.values()].filter((chunk) => chunk.pom).length,
      terrainGeneratorMode: this.#generator.mode === 'worker' ? 1 : 0,
      terrainWorkerBacklog: this.#generator.backlog,
      terrainWorkerBuilds: this.#generator.workerBuilds,
      // Phase 11.0d: the GPU base rasteriser's state (1 = live; jobs = grids it has
      // rasterised; ms = cumulative dispatch→read-back; pending = chunks awaiting it).
      terrainGpuHeightfield: this.#rasterizer !== null && this.#rasterizer.ready ? 1 : 0,
      terrainGpuHeightfieldJobs: this.#rasterizer?.rasterizedJobs ?? 0,
      terrainGpuHeightfieldMs: Math.round(this.#rasterizer?.cumulativeMs ?? 0),
      terrainGpuHeightfieldPending: this.#gpuPending.size,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#disposeRasterizer();
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
    this.#nearMaterial.dispose();
    this.root.clear();
  }
}
