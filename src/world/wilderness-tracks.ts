/**
 * Phase 7.2 — procedural wilderness tracks, far outside the settled world.
 *
 * The authored off-road routes (trails.ts) stay as they are; this module grows the dirt
 * network out past the city edge and the spawn pad, one deterministic chunk at a time.
 * It is pure — a function of the terrain config and the chunk index — so the main thread
 * and the terrain worker compute the identical tracks, and the dirt a chunk splats, the
 * corridor vegetation keeps clear and the ribbon a player sees are one and the same route.
 *
 * Biomes follow the existing altitude story: gentle rice-terrace trails in the lowlands,
 * bamboo-jungle switchbacks on the mid-slopes, straight rock-scree lines above the alpine
 * rockline. Each track carries the metadata the world reads (surface, steepness,
 * jungle density).
 *
 * The band is visual only: a trampled wilderness path grips like the ground it is worn
 * into, so the surface weights (and therefore tire grip) never shift for it. The authored
 * routes keep their packed-dirt grip shift — they are maintained off-road trails, not
 * trampled tracks.
 */
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import type { TerrainConfig } from '../config/terrain';
import { roadDistanceAt } from './road-distance';
import { chunkIndexAt, chunkKey } from './terrain-chunks';
import { createTerrainSampler } from './terrain-height';

export type WildernessSurface = 'dirt' | 'gravel';

export interface WildernessTrackPoint {
  readonly x: number;
  readonly z: number;
}

export interface WildernessTrack {
  /** Deterministic id: chunk + track index, stable across threads and launches. */
  readonly id: string;
  readonly surface: WildernessSurface;
  /** Max slope (rise/run) along the centreline. */
  readonly steepness: number;
  /** Fraction of the centreline standing in the mid-slope bamboo band, 0..1. */
  readonly jungleDensity: number;
  readonly points: readonly WildernessTrackPoint[];
}

export interface WildernessTrailSample {
  /** Metres from the nearest wilderness centreline. */
  readonly distance: number;
  readonly trackId: string;
  readonly surface: WildernessSurface;
}

export const WILDERNESS_TRACKS_CONFIG = {
  /** Keep every wilderness track at least this far from the Aohara centre. */
  cityExclusionMeters: 700,
  /** ...and this far from the flat spawn pad at the origin. */
  spawnPadExclusionMeters: 110,
  /**
   * Stay clear of the carved road corridors (shoulder + terrain blend + margin):
   * a dirt band would double-paint the road's own corridor, and the carved
   * embankments are solid ground a wilderness route does not cross.
   */
  roadAvoidanceMeters: 36,
  /** Tracks never start closer than this to a chunk border (they may walk out of it). */
  startMarginMeters: 14,
  /** Poisson-disc minimum separation between track start points, per chunk. */
  minStartSpacingMeters: 52,
  maxTracksPerChunk: 4,
  minTrackLengthMeters: 26,
  maxTrackLengthMeters: 280,
  /** Centreline sample spacing in metres. */
  stepMeters: 6,
  /** Worn band: full inside, smoothstepping to zero across the feather. */
  halfWidthMeters: 1.5,
  featherMeters: 3.0,
  /** Beyond this distance a point reports null so callers can skip the work. */
  queryCapMeters: 14,
  /** Corridor kept free of understory (drivable width), like the authored trails. */
  clearInnerMeters: 3.4,
  /** Mid-slope band: bamboo jungle, where switchbacks live. */
  midSlopeStartMeters: 22,
  midSlopeEndMeters: 150,
  /** Hairpin trigger: this much elevation change within the look-ahead. */
  switchbackGradeMeters: 6.5,
  switchbackLookaheadMeters: 18,
  /** Cache bound: the generation is deterministic, so evicted chunks regenerate identically. */
  cacheMaxEntries: 256,
} as const;

/** Deterministic per-track PRNG (mulberry32). */
function createTrackRandom(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A chunk is wilderness-eligible only when its whole rectangle stays outside the
 * exclusion circles (the city core and the spawn pad).
 */
function chunkExcluded(terrain: TerrainConfig, cx: number, cz: number): boolean {
  const size = terrain.chunkSizeMeters;
  const minX = cx * size;
  const maxX = minX + size;
  const minZ = cz * size;
  const maxZ = minZ + size;
  const distanceTo = (px: number, pz: number, limit: number): boolean => {
    const dx = Math.max(minX - px, 0, px - maxX);
    const dz = Math.max(minZ - pz, 0, pz - maxZ);
    return dx * dx + dz * dz < limit * limit;
  };
  if (
    distanceTo(
      AOHARA_DISTRICT_CONFIG.centerX,
      AOHARA_DISTRICT_CONFIG.centerZ,
      WILDERNESS_TRACKS_CONFIG.cityExclusionMeters,
    )
  ) {
    return true;
  }
  return distanceTo(0, 0, WILDERNESS_TRACKS_CONFIG.spawnPadExclusionMeters);
}

interface TrackCacheEntry {
  readonly tracks: readonly WildernessTrack[];
  readonly segments: ReadonlyArray<{
    readonly ax: number;
    readonly az: number;
    readonly bx: number;
    readonly bz: number;
    readonly dx: number;
    readonly dz: number;
    readonly lengthSq: number;
    readonly trackId: string;
    readonly surface: WildernessSurface;
  }>;
}

const TRACK_CACHE: Map<string, TrackCacheEntry> = new Map();

function buildChunkTracks(terrain: TerrainConfig, cx: number, cz: number): TrackCacheEntry {
  const size = terrain.chunkSizeMeters;
  const originX = cx * size;
  const originZ = cz * size;
  const chunkSeed =
    Math.imul((cx + 0x1b6) | 0, 0x27d4eb2d) ^
    Math.imul((cz + 0x9e3) | 0, 0x85ebca6b) ^
    (terrain.seed | 0);
  const sampler = createTerrainSampler(terrain);
  const heightAt = sampler.heightAt;
  const {
    startMarginMeters,
    minStartSpacingMeters,
    maxTracksPerChunk,
    minTrackLengthMeters,
    maxTrackLengthMeters,
    stepMeters,
    switchbackGradeMeters,
    switchbackLookaheadMeters,
    midSlopeStartMeters,
    midSlopeEndMeters,
    roadAvoidanceMeters,
  } = WILDERNESS_TRACKS_CONFIG;

  const slopeAt = (x: number, z: number): number => {
    const eps = 2.5;
    const dy =
      (heightAt(x + eps, z) -
        heightAt(x - eps, z) +
        (heightAt(x, z + eps) - heightAt(x, z - eps))) /
      (4 * eps);
    const dz =
      (heightAt(x, z + eps) -
        heightAt(x, z - eps) +
        (heightAt(x - eps, z) - heightAt(x + eps, z))) /
      (4 * eps);
    return Math.hypot(dy, dz);
  };

  // Poisson-disc starts inside the chunk interior, deterministic rejection sampling.
  const starts: { x: number; z: number }[] = [];
  const randomStarts = createTrackRandom(chunkSeed ^ 0x7a11e5);
  for (let attempt = 0; attempt < 96 && starts.length < maxTracksPerChunk; attempt += 1) {
    const x = originX + startMarginMeters + randomStarts() * (size - 2 * startMarginMeters);
    const z = originZ + startMarginMeters + randomStarts() * (size - 2 * startMarginMeters);
    let ok = true;
    for (const s of starts) {
      const ddx = s.x - x;
      const ddz = s.z - z;
      if (ddx * ddx + ddz * ddz < minStartSpacingMeters * minStartSpacingMeters) {
        ok = false;
        break;
      }
    }
    if (ok && roadDistanceAt(x, z) > roadAvoidanceMeters) {
      starts.push({ x, z });
    }
  }

  const tracks: WildernessTrack[] = [];
  const segments: {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    dx: number;
    dz: number;
    lengthSq: number;
    trackId: string;
    surface: WildernessSurface;
  }[] = [];

  starts.forEach((start, trackIndex) => {
    const random = createTrackRandom((chunkSeed ^ ((trackIndex + 1) * 0x1000193)) >>> 0);
    const trackLength =
      minTrackLengthMeters + random() * (maxTrackLengthMeters - minTrackLengthMeters);
    const maxSteps = Math.floor(trackLength / stepMeters);
    let heading = random() * Math.PI * 2;
    let turn = 0;
    let x = start.x;
    let z = start.z;
    let hairpins = 0;
    const points: WildernessTrackPoint[] = [];
    let maxSlope = 0;
    let jungleSamples = 0;
    let sampleCount = 0;

    const recordPoint = (): void => {
      const h = heightAt(x, z);
      const slope = slopeAt(x, z);
      if (slope > maxSlope) maxSlope = slope;
      if (h >= midSlopeStartMeters && h < midSlopeEndMeters && slope > 0.08) jungleSamples += 1;
      sampleCount += 1;
      points.push({ x, z });
    };

    recordPoint();
    for (let step = 1; step <= maxSteps; step += 1) {
      // Wandering: a smoothed turn keeps the trail organic instead of jittery.
      turn = (turn + (random() - 0.5) * 0.5) * 0.72;
      const h = heightAt(x, z);
      // Mid-slope bamboo band: switch back across the slope instead of climbing it.
      // After the flip the look-ahead faces downhill, so only climbs re-trigger.
      if (h >= midSlopeStartMeters && h < midSlopeEndMeters && hairpins < 3 && step % 5 === 0) {
        const ahead = heightAt(
          x + Math.sin(heading) * switchbackLookaheadMeters,
          z + Math.cos(heading) * switchbackLookaheadMeters,
        );
        if (ahead - h > switchbackGradeMeters) {
          // Hairpin: the persistent turn decays 0.72 per step, so this seeds a
          // ~180-degree swing over the next three or four steps.
          turn = (random() < 0.5 ? -1 : 1) * 0.9;
          hairpins += 1;
        }
      }
      // Above the rockline the trails straighten into scree lines; below they wander.
      const wanderScale = h >= terrain.alpineRocklineMeters ? 0.45 : 1;
      heading += turn * wanderScale;

      x += Math.sin(heading) * stepMeters;
      z += Math.cos(heading) * stepMeters;
      // The carved road corridors are solid ground: the trail ends where they begin.
      if (roadDistanceAt(x, z) < roadAvoidanceMeters) {
        break;
      }
      // A trail that walks out of the chunk ends here; the ribbon and the splat feather.
      if (x < originX || x >= originX + size || z < originZ || z >= originZ + size) {
        break;
      }
      recordPoint();
    }

    if (points.length * stepMeters < minTrackLengthMeters) return;
    // The surface follows the biome at the trail's midpoint — the place a player will
    // actually meet it, not whichever end happens to sit above the rockline.
    const mid = points[Math.floor(points.length / 2)]!;
    const surface: WildernessSurface =
      heightAt(mid.x, mid.z) >= terrain.alpineRocklineMeters ? 'gravel' : 'dirt';
    const track: WildernessTrack = {
      id: `${chunkKey(cx, cz)}#${trackIndex}`,
      surface,
      steepness: maxSlope,
      jungleDensity: sampleCount > 0 ? jungleSamples / sampleCount : 0,
      points,
    };
    tracks.push(track);
    for (let i = 0; i + 1 < points.length; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      segments.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        dx,
        dz,
        lengthSq: dx * dx + dz * dz,
        trackId: track.id,
        surface: track.surface,
      });
    }
  });

  return { tracks, segments };
}

/** All wilderness tracks inside one chunk (deterministic, cached, worker-safe). */
export function wildernessTracksForChunk(
  terrain: TerrainConfig,
  cx: number,
  cz: number,
): readonly WildernessTrack[] {
  if (chunkExcluded(terrain, cx, cz)) return [];
  const key = `${terrain.seed}:${chunkKey(cx, cz)}`;
  let entry = TRACK_CACHE.get(key);
  if (entry === undefined) {
    entry = buildChunkTracks(terrain, cx, cz);
    TRACK_CACHE.set(key, entry);
    // Bounded memory: the oldest entries regenerate identically when revisited.
    if (TRACK_CACHE.size > WILDERNESS_TRACKS_CONFIG.cacheMaxEntries) {
      const keys = TRACK_CACHE.keys();
      for (let i = 0; i < 64; i += 1) {
        const oldest = keys.next();
        if (oldest.done === true) break;
        TRACK_CACHE.delete(oldest.value);
      }
    }
  }
  return entry.tracks;
}

function entryFor(terrain: TerrainConfig, x: number, z: number): TrackCacheEntry | null {
  const cx = chunkIndexAt(x, terrain.chunkSizeMeters);
  const cz = chunkIndexAt(z, terrain.chunkSizeMeters);
  if (chunkExcluded(terrain, cx, cz)) return null;
  const key = `${terrain.seed}:${chunkKey(cx, cz)}`;
  let entry = TRACK_CACHE.get(key);
  if (entry === undefined) {
    entry = buildChunkTracks(terrain, cx, cz);
    TRACK_CACHE.set(key, entry);
    if (TRACK_CACHE.size > WILDERNESS_TRACKS_CONFIG.cacheMaxEntries) {
      const keys = TRACK_CACHE.keys();
      for (let i = 0; i < 64; i += 1) {
        const oldest = keys.next();
        if (oldest.done === true) break;
        TRACK_CACHE.delete(oldest.value);
      }
    }
  }
  return entry;
}

function nearestSegment(
  entry: TrackCacheEntry,
  x: number,
  z: number,
): { distance: number; index: number } | null {
  let best = Number.POSITIVE_INFINITY;
  let bestIndex = -1;
  for (let i = 0; i < entry.segments.length; i += 1) {
    const s = entry.segments[i]!;
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.lengthSq || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + s.dx * t - x;
    const pz = s.az + s.dz * t - z;
    const d = Math.hypot(px, pz);
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || best > WILDERNESS_TRACKS_CONFIG.queryCapMeters) return null;
  return { distance: best, index: bestIndex };
}

/** The wilderness trail at (x, z), or null beyond the query cap. */
export function wildernessTrailAt(
  terrain: TerrainConfig,
  x: number,
  z: number,
): WildernessTrailSample | null {
  const entry = entryFor(terrain, x, z);
  if (entry === null) return null;
  const nearest = nearestSegment(entry, x, z);
  if (nearest === null) return null;
  const segment = entry.segments[nearest.index]!;
  return {
    distance: nearest.distance,
    trackId: segment.trackId,
    surface: segment.surface,
  };
}

/**
 * Worn-band influence (0..1): full inside the band, smoothstepping to zero across the
 * feather. Feeds the terrain's dirt colour only — the surface weights (and grip) read
 * the authored routes alone, because a trampled path grips like the ground it is worn into.
 */
export function wildernessTrailInfluenceAt(terrain: TerrainConfig, x: number, z: number): number {
  const sample = wildernessTrailAt(terrain, x, z);
  if (sample === null) return 0;
  const { halfWidthMeters, featherMeters } = WILDERNESS_TRACKS_CONFIG;
  if (sample.distance <= halfWidthMeters) return 1;
  const t = (sample.distance - halfWidthMeters) / featherMeters;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/** Test hook: drop the chunk cache between runs. */
export function resetWildernessTrackCache(): void {
  TRACK_CACHE.clear();
}
