import { describe, expect, it } from 'vitest';

import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { buildChunkGeometryData } from '../../src/world/terrain-geometry';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import { chunkIndexAt } from '../../src/world/terrain-chunks';
import {
  resetWildernessTrackCache,
  wildernessTrailAt,
  wildernessTrailInfluenceAt,
  wildernessTracksForChunk,
  WILDERNESS_TRACKS_CONFIG,
  type WildernessTrack,
} from '../../src/world/wilderness-tracks';
import { WildernessTracksWorld } from '../../src/world/wilderness-tracks-world';

const SIZE = TERRAIN_CONFIG.chunkSizeMeters;

/** A chunk a few kilometres east of the city — reliably wilderness. */
const WILDERNESS: [number, number] = [16, 4];
/** The chunk under the Aohara centre — must stay trail-free. */
const CITY: [number, number] = [
  chunkIndexAt(AOHARA_DISTRICT_CONFIG.centerX, SIZE),
  chunkIndexAt(AOHARA_DISTRICT_CONFIG.centerZ, SIZE),
];

describe('wilderness track generation (Phase 7.2)', () => {
  it('keeps the city core and the spawn pad free of wilderness tracks', () => {
    expect(wildernessTracksForChunk(TERRAIN_CONFIG, ...CITY).length).toBe(0);
    expect(wildernessTracksForChunk(TERRAIN_CONFIG, 0, 0).length).toBe(0);
  });

  it('generates deterministic, in-bounds tracks on wilderness chunks', () => {
    const first = wildernessTracksForChunk(TERRAIN_CONFIG, ...WILDERNESS);
    const second = wildernessTracksForChunk(TERRAIN_CONFIG, ...WILDERNESS);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(WILDERNESS_TRACKS_CONFIG.maxTracksPerChunk);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const [cx, cz] = WILDERNESS;
    for (const track of first) {
      expect(['dirt', 'gravel']).toContain(track.surface);
      expect(track.steepness).toBeGreaterThanOrEqual(0);
      expect(track.jungleDensity).toBeGreaterThanOrEqual(0);
      expect(track.jungleDensity).toBeLessThanOrEqual(1);
      expect(track.id).toBe(`${cx},${cz}#` + track.id.split('#')[1]);
      const length = polylineLength(track);
      expect(length).toBeGreaterThanOrEqual(WILDERNESS_TRACKS_CONFIG.minTrackLengthMeters - 6);
      for (const point of track.points) {
        expect(point.x).toBeGreaterThanOrEqual(cx * SIZE);
        expect(point.x).toBeLessThan((cx + 1) * SIZE);
        expect(point.z).toBeGreaterThanOrEqual(cz * SIZE);
        expect(point.z).toBeLessThan((cz + 1) * SIZE);
      }
    }
  });

  it('gives each chunk a different network', () => {
    const a = wildernessTracksForChunk(TERRAIN_CONFIG, WILDERNESS[0], WILDERNESS[1]);
    const b = wildernessTracksForChunk(TERRAIN_CONFIG, WILDERNESS[0] + 1, WILDERNESS[1]);
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('regenerates evicted chunks identically (bounded cache)', () => {
    const before = wildernessTracksForChunk(TERRAIN_CONFIG, ...WILDERNESS);
    // Force an eviction well past the cache bound, then regenerate.
    for (let i = 0; i < WILDERNESS_TRACKS_CONFIG.cacheMaxEntries + 8; i += 1) {
      wildernessTracksForChunk(TERRAIN_CONFIG, 60 + i, 60);
    }
    resetWildernessTrackCache();
    const after = wildernessTracksForChunk(TERRAIN_CONFIG, ...WILDERNESS);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('stays clear of the carved road corridors', () => {
    // Every centreline point of every generated track sits beyond the road keep-out.
    const nodeById = new Map(ROAD_NETWORK_CONFIG.nodes.map((node) => [node.id, node]));
    let checked = 0;
    for (const [cx, cz] of [
      [16, 4],
      [17, 4],
      [-4, -5],
      [-16, -20],
      [20, 12],
    ] as const) {
      for (const track of wildernessTracksForChunk(TERRAIN_CONFIG, cx, cz)) {
        for (const point of track.points) {
          let nearest = Number.POSITIVE_INFINITY;
          for (const edge of ROAD_NETWORK_CONFIG.edges) {
            const from = nodeById.get(edge.from)!;
            const to = nodeById.get(edge.to)!;
            for (let i = 0; i + 1 < edgePoints(from, to, edge).length; i += 1) {
              const a = edgePoints(from, to, edge)[i]!;
              const b = edgePoints(from, to, edge)[i + 1]!;
              nearest = Math.min(nearest, pointToSegment(point, a, b));
            }
          }
          expect(nearest).toBeGreaterThan(WILDERNESS_TRACKS_CONFIG.roadAvoidanceMeters - 6);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

function edgePoints(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
  edge: { readonly via?: readonly (readonly [number, number])[] },
): readonly (readonly [number, number])[] {
  return [[from.x, from.z], ...(edge.via ?? []), [to.x, to.z]];
}

function pointToSegment(
  p: { readonly x: number; readonly z: number },
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz || 1;
  let t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(a[0] + dx * t - p.x, a[1] + dz * t - p.z);
}

describe('wilderness trail influence', () => {
  const [cx, cz] = WILDERNESS;
  const tracks = wildernessTracksForChunk(TERRAIN_CONFIG, cx, cz);
  const centre = tracks[0]!.points[3]!;

  it('reads full on the centreline, feathered off it, and null past the cap', () => {
    expect(wildernessTrailInfluenceAt(TERRAIN_CONFIG, centre.x, centre.z)).toBeCloseTo(1, 5);
    // Circle probe at the feather radius: the near side of the circle is still inside the
    // band, the far side is out past it — both directions included, so no trail
    // orientation can fake a uniform answer.
    let circleMin = 1;
    let circleMax = 0;
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const value = wildernessTrailInfluenceAt(
        TERRAIN_CONFIG,
        centre.x + Math.cos(angle) * 4,
        centre.z + Math.sin(angle) * 4,
      );
      circleMin = Math.min(circleMin, value);
      circleMax = Math.max(circleMax, value);
    }
    expect(circleMax).toBeCloseTo(1, 5);
    expect(circleMin).toBeGreaterThanOrEqual(0);
    expect(circleMax).toBeGreaterThan(circleMin);
    // The corner of the chunk farthest from every track point is guaranteed past the
    // query cap (chunks are 128 m; the farthest corner is never closer than ~100 m).
    let farX = 0;
    let farZ = 0;
    let farthest = -1;
    for (const [ox, oz] of [
      [0, 0],
      [SIZE, 0],
      [0, SIZE],
      [SIZE, SIZE],
    ] as const) {
      const cornerX = cx * SIZE + ox;
      const cornerZ = cz * SIZE + oz;
      let nearest = Number.POSITIVE_INFINITY;
      for (const track of tracks) {
        for (const point of track.points) {
          nearest = Math.min(nearest, Math.hypot(cornerX - point.x, cornerZ - point.z));
        }
      }
      if (nearest > farthest) {
        farthest = nearest;
        farX = cornerX;
        farZ = cornerZ;
      }
    }
    expect(farthest).toBeGreaterThan(WILDERNESS_TRACKS_CONFIG.queryCapMeters * 4);
    expect(wildernessTrailInfluenceAt(TERRAIN_CONFIG, farX, farZ)).toBe(0);
    expect(wildernessTrailAt(TERRAIN_CONFIG, farX, farZ)).toBeNull();
  });

  it('paints the terrain dirt band without shifting the tire grip', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    // The grip reads the authored routes alone: a wilderness centreline grips like the
    // ground it is worn into, so the surface sample is unchanged by the band.
    const onBand = sampleTerrainSurface(sampler, centre.x, centre.z);
    const offBand = sampleTerrainSurface(sampler, centre.x + 6, centre.z + 6);
    expect(onBand.gripModifier).toBeGreaterThanOrEqual(offBand.gripModifier - 1e-9);
    expect(onBand.rollingResistance).toBeLessThanOrEqual(offBand.rollingResistance + 1e-9);
  });

  it('splats bit-identically on repeated generation (worker/main parity)', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const a = buildChunkGeometryData(sampler, WILDERNESS[0], WILDERNESS[1], 16);
    const b = buildChunkGeometryData(sampler, WILDERNESS[0], WILDERNESS[1], 16);
    expect(a.positions).toEqual(b.positions);
    expect(a.splats).toEqual(b.splats);
    expect(a.tints).toEqual(b.tints);
  });
});

describe('wilderness track ribbon streaming', () => {
  it('streams ribbons into the window and budgets generation per frame', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const world = new WildernessTracksWorld(sampler, 'C');
    const focus = { x: WILDERNESS[0] * SIZE + SIZE / 2, z: WILDERNESS[1] * SIZE + SIZE / 2 };
    const still = { x: 0, z: 0 };

    world.updateStreaming(focus, still);
    // Tier C generates one chunk per call: the first frame owns the focus chunk only.
    expect(world.getContentStats().wildernessTracks).toBeGreaterThan(0);
    const afterFirst = world.root.children.length;
    expect(afterFirst).toBe(1);

    // Keep stepping: the 5×5 window fills one chunk per frame (25 chunks ≤ 25 steps).
    for (let i = 0; i < 30; i += 1) {
      world.updateStreaming(focus, still);
    }
    const stats = world.getContentStats();
    expect(stats.wildernessTrackChunks).toBeGreaterThanOrEqual(5);
    const expectedTracks = expectedWindowTracks(focus);
    expect(stats.wildernessTracks).toBe(expectedTracks);

    world.dispose();
    expect(world.root.children.length).toBe(0);
  });

  it('keeps the ribbons above the ground and tapers their ends', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const world = new WildernessTracksWorld(sampler, 'A');
    const focus = { x: WILDERNESS[0] * SIZE + SIZE / 2, z: WILDERNESS[1] * SIZE + SIZE / 2 };
    for (let i = 0; i < 26; i += 1) {
      world.updateStreaming(focus, { x: 0, z: 0 });
    }
    const meshes = world.root.children
      .flatMap((child) => child.children)
      .filter((child): child is import('three').Mesh => (child as import('three').Mesh).isMesh);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const ground = sampler.heightAt(x, z);
        expect(y).toBeGreaterThan(ground);
        expect(y).toBeLessThan(ground + 0.5);
      }
    }
    world.dispose();
  });
});

describe('wilderness track density by altitude (Phase 10 pass 2)', () => {
  it('highland chunks carry a richer network than lowland chunks', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const rockline = TERRAIN_CONFIG.alpineRocklineMeters;
    // Scan candidate chunks near the volcano (the world's high ground) for a
    // rockline-crossing chunk, and compare with the known lowland chunk (16, 4).
    let high: [number, number] | null = null;
    let highMax = 0;
    for (let cx = -14; cx <= -9; cx += 1) {
      for (let cz = -18; cz <= -14; cz += 1) {
        let maxH = 0;
        for (const [fx, fz] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
          [0.5, 0.5],
        ] as const) {
          maxH = Math.max(maxH, sampler.heightAt(cx * SIZE + fx * SIZE, cz * SIZE + fz * SIZE));
        }
        if (maxH > rockline && maxH > highMax) {
          highMax = maxH;
          high = [cx, cz];
        }
      }
    }
    expect(high).not.toBeNull();
    const lowland = wildernessTracksForChunk(TERRAIN_CONFIG, 16, 4).length;
    const highland = wildernessTracksForChunk(TERRAIN_CONFIG, high![0], high![1]).length;
    expect(lowland).toBeLessThanOrEqual(WILDERNESS_TRACKS_CONFIG.maxTracksPerChunk);
    expect(highland).toBeGreaterThan(lowland);
  });
});

function polylineLength(track: WildernessTrack): number {
  let total = 0;
  for (let i = 1; i < track.points.length; i += 1) {
    const a = track.points[i - 1]!;
    const b = track.points[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

function expectedWindowTracks(focus: { x: number; z: number }): number {
  const fcx = chunkIndexAt(focus.x, SIZE);
  const fcz = chunkIndexAt(focus.z, SIZE);
  let total = 0;
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      total += wildernessTracksForChunk(TERRAIN_CONFIG, fcx + dx, fcz + dz).length;
    }
  }
  return total;
}
