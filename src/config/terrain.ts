/**
 * Phase 4 terrain configuration: the seeded heightfield the driving world streams.
 *
 * Everything procedural in the world derives from `seed`: the same seed must regenerate the
 * same terrain on every machine, forever, because the physics colliders, the visual chunks,
 * and (from the next increment) the road network all sample this one function. Determinism
 * is therefore a hard contract, not a nicety — the noise in `world/terrain-height.ts` is
 * integer-hash based precisely so no platform's `Math.random` or float transcendental can
 * drift it.
 */
/**
 * PBR sets used by the default gameplay terrain splat. Snow is intentionally absent;
 * winter snow is a gated Phase 7 feature, not part of the current ground material.
 */
export const ACTIVE_TERRAIN_SURFACE_ASSETS = [
  'tex-leafy-grass-1k',
  'tex-brown-mud-dry-1k',
  'tex-rock-face-03-1k',
] as const;

export interface TerrainConfig {
  /** World seed. Change it and you change the prefecture. */
  readonly seed: number;
  /** Edge length of one streamed chunk, metres. */
  readonly chunkSizeMeters: number;
  /**
   * Chunks are built at three resolutions by ring distance from the focus (the car):
   * ring 0-1 (the 3x3 around the car) at `lodSegments[0]`, the next ring out at
   * `lodSegments[1]`, everything further at `lodSegments[2]`. Segments are cells per edge.
   */
  readonly lodSegments: readonly [number, number, number];
  /** Ring index (Chebyshev distance in chunks) at which each LOD starts. */
  readonly lodRingStarts: readonly [number, number, number];
  /** Streaming radius in chunks (Chebyshev): the loaded square is (2r+1)^2 chunks. */
  readonly viewRadiusChunks: number;
  /** Physics heightfields are maintained within this Chebyshev radius, chunks. */
  readonly physicsRadiusChunks: number;
  /** Height samples per physics chunk edge (cells), independent of the visual LOD. */
  readonly physicsSegmentsPerChunk: number;
  /** Chunk builds (or LOD rebuilds) allowed per rendered frame: the upload budget. */
  readonly maxBuildsPerFrame: number;
  /**
   * Streaming hysteresis, metres: the loaded window only recentres once the focus has
   * moved this far past the current centre chunk's edge, so a car straddling a chunk
   * boundary cannot make the window (and its build queue) oscillate.
   */
  readonly hysteresisMeters: number;
  /** Visual prefetch: the plan is biased this far along the velocity, seconds ahead. */
  readonly prefetchSeconds: number;
  /** Cap on the prefetch bias, metres (the physics window is never biased). */
  readonly prefetchMaxMeters: number;
  /** How far chunk skirts drop below the border, metres: hides LOD T-junction cracks. */
  readonly skirtDepthMeters: number;
  /** Rolling-hill amplitude and base wavelength, metres (fBm in terrain-height). */
  readonly hillAmplitudeMeters: number;
  readonly hillWavelengthMeters: number;
  /** The volcano anchor (Hinode-dake): world position, peak height, base radius. */
  readonly volcano: {
    readonly position: readonly [number, number];
    readonly heightMeters: number;
    readonly radiusMeters: number;
  };
  /**
   * The spawn plateau: inside `flatRadiusMeters` the terrain is exactly y=0, blending to
   * the full heightfield at `blendRadiusMeters`. The car spawns at the origin and the
   * Phase 2 physics convention (ground top at y=0) survives the move to terrain.
   */
  readonly spawnPad: {
    readonly flatRadiusMeters: number;
    readonly blendRadiusMeters: number;
  };
  /**
   * Altitude where gameplay ground transitions from lowland grass toward exposed alpine
   * soil and rock. There is intentionally no snow layer in the current terrain renderer.
   */
  readonly alpineRocklineMeters: number;
  /**
   * Near-tier parallax occlusion (Phase 4): the closest LOD ring raymarches the
   * splat's blended scanned displacement so close ground has real depth.
   */
  readonly pom: {
    /** Raymarch steps across the relief; also the per-fragment cost ceiling. */
    readonly steps: number;
    /** World-space relief depth the 0..1 displacement spans, metres. */
    readonly depthMeters: number;
    /** Camera distance where the offset starts / finishes fading out, metres. */
    readonly fadeStartMeters: number;
    readonly fadeEndMeters: number;
  };
}

export const TERRAIN_CONFIG: TerrainConfig = {
  seed: 20261015,
  chunkSizeMeters: 128,
  lodSegments: [64, 32, 16],
  lodRingStarts: [0, 2, 4],
  viewRadiusChunks: 5,
  physicsRadiusChunks: 1,
  physicsSegmentsPerChunk: 64,
  maxBuildsPerFrame: 2,
  hysteresisMeters: 24,
  prefetchSeconds: 1.4,
  prefetchMaxMeters: 112,
  skirtDepthMeters: 1.6,
  hillAmplitudeMeters: 24,
  hillWavelengthMeters: 420,
  volcano: {
    position: [-1500, -2100],
    heightMeters: 300,
    radiusMeters: 1150,
  },
  spawnPad: {
    flatRadiusMeters: 45,
    blendRadiusMeters: 110,
  },
  alpineRocklineMeters: 190,
  pom: { steps: 12, depthMeters: 0.09, fadeStartMeters: 16, fadeEndMeters: 42 },
};
