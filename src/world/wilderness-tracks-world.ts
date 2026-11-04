/**
 * Phase 7.2 — the wilderness track ribbons: the streaming owner.
 *
 * The tracks themselves are pure data (wilderness-tracks.ts); this world owns the visual
 * half — a packed-earth ribbon over each centreline, streamed with the same bounded,
 * hysteretic window the vegetation uses and the same per-frame generation budget the
 * terrain builds run under. The dirt band the terrain splats (terrain-geometry.ts) and the
 * corridor the vegetation keeps clear (vegetation-placement.ts) are the same routes, so
 * the ribbon only adds the crisp packed core on top of the feathered splat.
 */
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { TierId } from '../config/tiers';
import {
  planChunksAround,
  predictPrefetchFocus,
  resolveWindowCenter,
  chunkKey,
  type ChunkCoord,
  type PlannedChunk,
} from './terrain-chunks';
import type { TerrainSampler } from './terrain-height';
import {
  wildernessTracksForChunk,
  WILDERNESS_TRACKS_CONFIG,
  type WildernessTrack,
} from './wilderness-tracks';

/** Packed-earth core lift: sits just under the asphalt line so the trail reads as ground, not road. */
const RIBBON_LIFT = 0.05;
/** Ribbon half-width: the packed core of the ~3 m splatted band. */
const RIBBON_HALF_WIDTH = 1.1;
/** Trail ends feather to a point over this many metres (chunk-edge walkouts). */
const RIBBON_TAPER_METERS = 12;
/** Ribbon centreline resample spacing (terrain between the 6 m track points is steeper). */
const RIBBON_STEP = 3;

const DIRT_COLOR = 0x5d4c38;
const GRAVEL_COLOR = 0x6f6a62;

interface RibbonBuffers {
  positions: number[];
  uvs: number[];
  indices: number[];
}

/**
 * One ribbon: two vertices per centreline sample, offset along the horizontal normal,
 * tapering to a point at both ends. Each edge drapes on the ground at its own position,
 * so even the steep scree lines hug the slope instead of sinking one side in.
 */
function buildRibbonBuffers(
  tracks: readonly WildernessTrack[],
  heightAt: (x: number, z: number) => number,
): { dirt: RibbonBuffers; gravel: RibbonBuffers } {
  const dirt: RibbonBuffers = { positions: [], uvs: [], indices: [] };
  const gravel: RibbonBuffers = { positions: [], uvs: [], indices: [] };
  const pick = (surface: 'dirt' | 'gravel'): RibbonBuffers =>
    surface === 'gravel' ? gravel : dirt;
  for (const track of tracks) {
    const points = track.points;
    if (points.length < 3) continue;
    const end = points[points.length - 1]!;
    const total = distanceOf(points);
    if (total < 4) continue;
    // Resample the centreline at RIBBON_STEP so steep sections hug the terrain.
    const samples: { x: number; z: number }[] = [];
    let carried = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const seg = Math.hypot(dx, dz);
      if (seg <= 1e-6) continue;
      let along = RIBBON_STEP - carried;
      while (along <= seg + 1e-6) {
        const t = along / seg;
        samples.push({ x: a.x + dx * t, z: a.z + dz * t });
        along += RIBBON_STEP;
      }
      carried = seg - (along - RIBBON_STEP);
    }
    samples.push(end);
    if (samples.length < 3) continue;

    const trackBuffers = pick(track.surface);
    const baseVertex = trackBuffers.positions.length / 3;
    let alongMeters = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const p = samples[i]!;
      const prev = samples[Math.max(0, i - 1)]!;
      const next = samples[Math.min(samples.length - 1, i + 1)]!;
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz);
      if (tl <= 1e-6) {
        tx = 0;
        tz = 1;
      } else {
        tx /= tl;
        tz /= tl;
      }
      // Horizontal normal of the centreline.
      const sx = tz;
      const sz = -tx;
      if (i > 0) {
        const q = samples[i - 1]!;
        alongMeters += Math.hypot(p.x - q.x, p.z - q.z);
      }
      // Feather: fade in from the trail head, out at the tail (chunk-edge walkouts).
      const taperHead = Math.min(1, alongMeters / RIBBON_TAPER_METERS);
      const taperTail = Math.min(1, (total - alongMeters) / RIBBON_TAPER_METERS);
      const widthScale = Math.min(taperHead, taperTail);
      const half = RIBBON_HALF_WIDTH * widthScale;
      const yLeft = heightAt(p.x - sx * half, p.z - sz * half) + RIBBON_LIFT;
      const yRight = heightAt(p.x + sx * half, p.z + sz * half) + RIBBON_LIFT;
      trackBuffers.positions.push(
        p.x - sx * half,
        yLeft,
        p.z - sz * half,
        p.x + sx * half,
        yRight,
        p.z + sz * half,
      );
      trackBuffers.uvs.push(0, alongMeters / 6, 1, alongMeters / 6);
    }
    for (let i = 0; i + 1 < samples.length; i += 1) {
      const a = baseVertex + i * 2;
      trackBuffers.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return { dirt, gravel };
}

function distanceOf(points: readonly { readonly x: number; readonly z: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

function toGeometry(buffers: RibbonBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(buffers.uvs), 2));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface ChunkRibbon {
  readonly group: Group;
  readonly dirtMesh: Mesh | null;
  readonly gravelMesh: Mesh | null;
  readonly trackCount: number;
}

/**
 * The streamed ribbon owner. Constructed once with the shared sampler; the window follows
 * the car with the terrain/vegetation hysteresis, and chunk generation is budgeted per
 * frame (1 on tier C, 2 on A) so a fast slide-in never hitches.
 */
export class WildernessTracksWorld {
  readonly root = new Group();

  readonly #sampler: TerrainSampler;
  readonly #tier: TierId;
  readonly #dirtMaterial: MeshStandardMaterial;
  readonly #gravelMaterial: MeshStandardMaterial;
  readonly #chunkRibbons = new Map<string, ChunkRibbon>();
  #center: ChunkCoord | null = null;
  #plannedWindow: PlannedChunk[] | null = null;
  #retainedWindow: readonly PlannedChunk[] | null = null;
  #disposed = false;

  constructor(sampler: TerrainSampler, tier: TierId) {
    this.#sampler = sampler;
    this.#tier = tier;
    this.#dirtMaterial = new MeshStandardMaterial({
      color: DIRT_COLOR,
      roughness: 1,
      metalness: 0,
    });
    this.#dirtMaterial.name = 'wilderness-track-dirt';
    this.#gravelMaterial = new MeshStandardMaterial({
      color: GRAVEL_COLOR,
      roughness: 0.96,
      metalness: 0.02,
    });
    this.#gravelMaterial.name = 'wilderness-track-gravel';
    this.root.name = 'wilderness-tracks';
  }

  /** One budgeted streaming step: advance the window, generate up to the frame budget. */
  updateStreaming(
    focus: { readonly x: number; readonly z: number },
    velocity: { readonly x: number; readonly z: number },
  ): void {
    if (this.#disposed) return;
    const config = this.#sampler.config;
    const planned = this.#planWindow(focus, velocity);
    this.#retainPlannedChunks(planned);
    const budget = this.#tier === 'A' ? 2 : 1;
    let generated = 0;
    for (const chunk of planned) {
      if (generated >= budget) break;
      const key = chunkKey(chunk.cx, chunk.cz);
      if (this.#chunkRibbons.has(key)) continue;
      const tracks = wildernessTracksForChunk(config, chunk.cx, chunk.cz);
      const { dirt, gravel } = buildRibbonBuffers(tracks, this.#sampler.heightAt);
      const hasDirt = dirt.indices.length > 0;
      const hasGravel = gravel.indices.length > 0;
      if (!hasDirt && !hasGravel) {
        this.#chunkRibbons.set(key, {
          group: new Group(),
          dirtMesh: null,
          gravelMesh: null,
          trackCount: 0,
        });
        continue;
      }
      const group = new Group();
      group.name = `wilderness-tracks-${key}`;
      let dirtMesh: Mesh | null = null;
      let gravelMesh: Mesh | null = null;
      if (hasDirt) {
        dirtMesh = new Mesh(toGeometry(dirt), this.#dirtMaterial);
        dirtMesh.name = `wilderness-track-dirt-${key}`;
        dirtMesh.receiveShadow = true;
        dirtMesh.frustumCulled = false;
        group.add(dirtMesh);
      }
      if (hasGravel) {
        gravelMesh = new Mesh(toGeometry(gravel), this.#gravelMaterial);
        gravelMesh.name = `wilderness-track-gravel-${key}`;
        gravelMesh.receiveShadow = true;
        gravelMesh.frustumCulled = false;
        group.add(gravelMesh);
      }
      this.root.add(group);
      this.#chunkRibbons.set(key, {
        group,
        dirtMesh,
        gravelMesh,
        trackCount: tracks.length,
      });
      generated += 1;
    }
  }

  #planWindow(focus: { x: number; z: number }, velocity: { x: number; z: number }): PlannedChunk[] {
    const config = this.#sampler.config;
    const predicted = predictPrefetchFocus(config, focus, velocity);
    const nextCenter = resolveWindowCenter(this.#center, config, predicted.x, predicted.z);
    const current = this.#center;
    if (
      this.#plannedWindow !== null &&
      current !== null &&
      current.cx === nextCenter.cx &&
      current.cz === nextCenter.cz
    ) {
      return this.#plannedWindow;
    }
    this.#center = nextCenter;
    // The ribbon is a detail layer over the always-present splat band: a 5×5 window is
    // plenty for the chase camera, and it keeps the per-frame work bounded.
    this.#plannedWindow = planChunksAround(
      config,
      nextCenter.cx,
      nextCenter.cz,
      focus.x,
      focus.z,
    ).filter((chunk) => chunk.ring <= 2);
    return this.#plannedWindow;
  }

  #retainPlannedChunks(planned: readonly PlannedChunk[]): void {
    if (planned === this.#retainedWindow) return;
    this.#retainedWindow = planned;
    const wanted = new Set(planned.map((chunk) => chunkKey(chunk.cx, chunk.cz)));
    for (const key of [...this.#chunkRibbons.keys()]) {
      if (!wanted.has(key)) {
        this.#disposeChunk(key);
      }
    }
  }

  #disposeChunk(key: string): void {
    const chunk = this.#chunkRibbons.get(key);
    if (chunk === undefined) return;
    this.root.remove(chunk.group);
    chunk.dirtMesh?.geometry.dispose();
    chunk.gravelMesh?.geometry.dispose();
    this.#chunkRibbons.delete(key);
  }

  getContentStats(): { wildernessTracks: number; wildernessTrackChunks: number } {
    let tracks = 0;
    let chunks = 0;
    for (const chunk of this.#chunkRibbons.values()) {
      if (chunk.trackCount > 0) {
        tracks += chunk.trackCount;
        chunks += 1;
      }
    }
    return { wildernessTracks: tracks, wildernessTrackChunks: chunks };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const key of [...this.#chunkRibbons.keys()]) {
      this.#disposeChunk(key);
    }
    this.#dirtMaterial.dispose();
    this.#gravelMaterial.dispose();
  }
}

/** Test hook for the ribbon constants. */
export const WILDERNESS_RIBBON_CONFIG = {
  halfWidthMeters: RIBBON_HALF_WIDTH,
  liftMeters: RIBBON_LIFT,
  taperMeters: RIBBON_TAPER_METERS,
  stepMeters: RIBBON_STEP,
  queryCapMeters: WILDERNESS_TRACKS_CONFIG.queryCapMeters,
} as const;
