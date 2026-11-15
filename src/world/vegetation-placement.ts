import {
  VEGETATION_CONFIG,
  type VegetationConfig,
  type VegetationSpecies,
} from '../config/districts';
import { VEGETATION_SPECIES } from './districts';
import { speciesMultipliersAt, canopyScaleAt } from './plan-districts';
import { TRAIL_NETWORK_CONFIG } from '../config/trails';
import { trailAt } from './trails';
import { WILDERNESS_TRACKS_CONFIG, wildernessTrailAt } from './wilderness-tracks';
import type { TerrainSampler } from './terrain-height';

/**
 * Deterministic vegetation placement — the pure, renderer-free half of
 * vegetation.ts (which owns the instanced meshes). Same chunk in, same
 * forest out — on any thread, forever. The collision field
 * (tree-collision.ts) consumes exactly these placements, so the tree you
 * see is the tree you hit.
 *
 * **Phase 11.0c (Poisson-disk scatter).** The plant *positions* now come
 * from a Bridson Poisson-disk slot mesh (k = config.bridsonK, one disk
 * radius per 6.5 m cell) that is never allowed to form inside a no-growth
 * cell — evenly spread, no clumps, no grid-aligned rows. The plant *count*
 * and species mix stay exactly where the stratified baseline put them: the
 * keep decision is slot-level, not cell-level — the n-th slot landing in
 * cell (ix, iz) rolls the baseline's weighted draw at salt 37 + n against
 * `total / BRIDSON_SLOT_DENSITY`, so a cell may host several plants
 * whenever the disk allows it. The disk moves WHERE each plant stands, not
 * HOW MANY stand. The old algorithm is kept as
 * `generateChunkVegetationStratified` — the 11.0c acceptance baseline for
 * density band, nearest-neighbour statistics and placement-time
 * comparisons (audit-worldgen11.ts).
 */

export interface VegetationPlacement {
  readonly species: VegetationSpecies;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotationY: number;
  /** Eternal identity: the world cell that decided this plant. */
  readonly cellX: number;
  readonly cellZ: number;
  readonly key: string;
}

/** Integer hash → [0, 1), stable across platforms (same family as the terrain). */
export function hash01(ix: number, iz: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(salt, 974711)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const TREE_SPECIES: ReadonlySet<VegetationSpecies> = new Set([
  'conifer',
  'broadleaf',
  'sakura',
  'bamboo',
]);

/** Number of geometry/instanced-mesh variants registered for a species. */
export function vegetationVariantCount(species: VegetationSpecies): number {
  return TREE_SPECIES.has(species) ? 3 : 2;
}

/** Slope/altitude gate per species, before district multipliers apply. */
function speciesGate(
  species: VegetationSpecies,
  height: number,
  steepness: number,
  config: VegetationConfig,
): number {
  switch (species) {
    case 'conifer':
      if (height > config.treeLineMeters || steepness > 0.38) return 0;
      // Cedars own the mid-slopes; the lowland floor is broadleaf country.
      return height < 12 ? 0.45 : 1;
    case 'broadleaf':
      if (height > config.treeLineMeters || steepness > 0.32) return 0;
      return height > 110 ? Math.max(0, 1 - (height - 110) / 40) : 1;
    case 'sakura':
      if (height > 95 || steepness > 0.26) return 0;
      return 1;
    case 'bamboo':
      if (height > 80 || steepness > 0.3) return 0;
      return 1;
    case 'rock':
      // Rock appears where trees cannot hold, and as scree above the treeline.
      return Math.min(
        1,
        Math.max(0, (steepness - 0.18) * 2.2) + (height > config.treeLineMeters ? 0.45 : 0),
      );
  }
}

/**
 * Deterministic 32-bit PRNG (mulberry32). Bridson needs a *stream* of random
 * numbers (a ring angle and distance per attempt), not independent hashes;
 * the whole stream is a function of the seed, so a chunk's forest is
 * identical on any thread, forever.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mean Poisson-disk slots Bridson fills per growth cell (k = config.bridsonK,
 * one-cell radius, 128 m chunk squares — measured, see the 11.0c audit;
 * 0.603 per cell in the acceptance window at the current k). The
 * slot-level keep probability scales by this so the forest count matches
 * the stratified baseline (the 11.0c ±20 % density band); calibrated on the
 * current Bridson stream to land mid-band. Re-measure if `bridsonK` or the
 * disk radius changes — the slot density shifts.
 */
export const BRIDSON_SLOT_DENSITY = 0.66;

/** Chunk-constant Bridson seed from the eternal chunk coordinates. */
function chunkBridsonSeed(chunkX: number, chunkZ: number): number {
  return (
    (Math.imul(chunkX + 0x9e3779b9, 0x85ebca6b) ^
      Math.imul(chunkZ + 0xc2b2ae35, 0x27d4eb2f) ^
      0x1f123bb5) >>>
    0
  );
}

/**
 * Bridson Poisson-disk sampling over the square [origin, origin+size)² at
 * minimum distance `radius`, rejection budget `k`. A point is accepted only
 * where `cellWeight` (its eternal `cellMeters` cell) allows growth, so the
 * mesh simply never forms in no-growth cells. Output is in acceptance
 * order — deterministic for a given PRNG stream.
 */
export function bridsonSlots(
  originX: number,
  originZ: number,
  regionSize: number,
  radius: number,
  k: number,
  cellMeters: number,
  cellWeight: (ix: number, iz: number) => number,
  random: () => number,
): Array<{ readonly x: number; readonly z: number }> {
  const endX = originX + regionSize;
  const endZ = originZ + regionSize;
  const gridN = Math.ceil(regionSize / radius) + 2;
  const gridCells = gridN * gridN;
  // Allocation-light core: flat point arrays + a linked-list grid
  // (head/next) for the neighbourhood search. The hot path (one ring
  // attempt) does no allocations and one mask lookup.
  const MAX_POINTS = Math.ceil((regionSize / radius) ** 2 * 1.6) + 8;
  const px = new Float64Array(MAX_POINTS);
  const pz = new Float64Array(MAX_POINTS);
  const next = new Int32Array(MAX_POINTS);
  const head = new Int32Array(gridCells).fill(-1);
  let count = 0;

  const active: number[] = [];
  const invRadius = 1 / radius;

  const r2 = radius * radius;
  const insert = (x: number, z: number): void => {
    const index = count;
    px[index] = x;
    pz[index] = z;
    const gx = Math.min(gridN - 1, Math.max(0, ((x - originX) * invRadius) | 0));
    const gz = Math.min(gridN - 1, Math.max(0, ((z - originZ) * invRadius) | 0));
    const c = gz * gridN + gx;
    next[index] = head[c] ?? -1;
    head[c] = index;
    active.push(index);
    count += 1;
  };

  // Seed: the first point must land in a growth cell.
  let seeded = false;
  for (let attempt = 0; attempt < 128 && !seeded; attempt += 1) {
    const x = originX + random() * regionSize;
    const z = originZ + random() * regionSize;
    if (cellWeight(Math.floor(x / cellMeters), Math.floor(z / cellMeters)) > 0) {
      insert(x, z);
      seeded = true;
    }
  }
  if (!seeded) return [];

  while (active.length > 0) {
    const pos = Math.floor(random() * active.length);
    const base = active[pos]!;
    const bx = px[base]!;
    const bz = pz[base]!;
    let placed = false;
    for (let attempt = 0; attempt < k; attempt += 1) {
      const theta = random() * Math.PI * 2;
      const distance = radius * (1 + random());
      const x = bx + Math.cos(theta) * distance;
      const z = bz + Math.sin(theta) * distance;
      if (x < originX || x >= endX || z < originZ || z >= endZ) continue;
      if (cellWeight(Math.floor(x / cellMeters), Math.floor(z / cellMeters)) <= 0) continue;
      // Neighbourhood search (inlined: the hot path).
      let ok = true;
      const gx = Math.min(gridN - 1, Math.max(0, ((x - originX) * invRadius) | 0));
      const gz = Math.min(gridN - 1, Math.max(0, ((z - originZ) * invRadius) | 0));
      for (let oz = -1; ok && oz <= 1; oz += 1) {
        const cz = gz + oz;
        if (cz < 0 || cz >= gridN) continue;
        const rowBase = cz * gridN;
        for (let ox = -1; ok && ox <= 1; ox += 1) {
          const cx = gx + ox;
          if (cx < 0 || cx >= gridN) continue;
          for (let index = head[rowBase + cx] ?? -1; index !== -1; index = next[index] ?? -1) {
            const dx = px[index]! - x;
            const dz = pz[index]! - z;
            if (dx * dx + dz * dz < r2) {
              ok = false;
              break;
            }
          }
        }
      }
      if (!ok) continue;
      insert(x, z);
      placed = true;
      break;
    }
    if (!placed) {
      active[pos] = active[active.length - 1]!;
      active.pop();
    }
  }

  const out: Array<{ readonly x: number; readonly z: number }> = new Array(count);
  for (let i = 0; i < count; i += 1) out[i] = { x: px[i]!, z: pz[i]! };
  return out;
}

/** Per-cell field state for one chunk (cell-centre samples). */
interface CellEntry {
  readonly weights: number[];
  readonly total: number;
}

/** Bijective key for eternal cell coordinates (chunks span ±2 km). */
function cellKey(ix: number, iz: number): number {
  return (ix + 32768) * 65536 + (iz + 32768);
}

/**
 * The cell field every placement pass shares: per-species weights
 * (base density × district/biome multipliers × slope-altitude gate) and
 * the total they roll against, sampled at cell centres.
 */
function buildCellField(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  config: VegetationConfig,
): Map<number, CellEntry> {
  const size = sampler.config.chunkSizeMeters;
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const cell = config.cellMeters;
  const firstCellX = Math.floor(originX / cell);
  const firstCellZ = Math.floor(originZ / cell);
  const lastCellX = Math.floor((originX + size - 1e-9) / cell);
  const lastCellZ = Math.floor((originZ + size - 1e-9) / cell);
  const entries = new Map<number, CellEntry>();
  for (let iz = firstCellZ; iz <= lastCellZ; iz += 1) {
    for (let ix = firstCellX; ix <= lastCellX; ix += 1) {
      const cx = (ix + 0.5) * cell;
      const cz = (iz + 0.5) * cell;
      const height = sampler.heightAt(cx, cz);
      const normal = sampler.normalAt(cx, cz);
      const steepness = 1 - normal.y;
      const multipliers = speciesMultipliersAt(cx, cz);
      const weights: number[] = [];
      let total = 0;
      for (const species of VEGETATION_SPECIES) {
        const districtOnly =
          (species === 'sakura' || species === 'bamboo') && multipliers[species] <= 1;
        const weight =
          (districtOnly ? 0 : config.baseDensity[species]) *
          multipliers[species] *
          speciesGate(species, height, steepness, config);
        weights.push(weight);
        total += weight;
      }
      entries.set(cellKey(ix, iz), { weights, total });
    }
  }
  return entries;
}

/**
 * Clearance gates at a plant position — spawn pad, road corridor, trail and
 * wilderness corridors (the inner clear bands reject outright; the trail
 * canopy band flags tall-trees-only). Returns `null` to reject, else the
 * canopy-only flag.
 */
function clearanceAt(
  sampler: TerrainSampler,
  x: number,
  z: number,
  config: VegetationConfig,
): boolean | null {
  if (Math.hypot(x, z) < config.spawnClearanceMeters) return null;
  const road = sampler.roadAt?.(x, z) ?? null;
  if (
    road !== null &&
    road.distance <
      Math.max(config.roadClearanceMeters, road.halfWidthMeters + road.shoulderMeters + 4.8)
  ) {
    return null;
  }
  let canopyOnly = false;
  const trail = trailAt(x, z);
  if (trail !== null) {
    if (trail.distance < TRAIL_NETWORK_CONFIG.clearInnerMeters) return null;
    canopyOnly = trail.distance < TRAIL_NETWORK_CONFIG.canopyOuterMeters;
  }
  const wilderness = wildernessTrailAt(sampler.config, x, z);
  if (wilderness !== null) {
    if (wilderness.distance < WILDERNESS_TRACKS_CONFIG.clearInnerMeters) return null;
    canopyOnly = canopyOnly || wilderness.distance < 8;
  }
  return canopyOnly;
}

/** The cell field + slot mesh for one chunk (one mask pass). */
function buildChunkSlots(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  config: VegetationConfig,
): { entries: Map<number, CellEntry>; slots: Array<{ readonly x: number; readonly z: number }> } {
  const size = sampler.config.chunkSizeMeters;
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const cell = config.cellMeters;
  const entries = buildCellField(sampler, chunkX, chunkZ, config);
  // The even geometry: a Poisson-disk mesh at one-cell radius, never inside a
  // no-growth cell. (k and the seed are chunk-constant → eternal.)
  const slots = bridsonSlots(
    originX,
    originZ,
    size,
    cell,
    config.bridsonK,
    cell,
    (ix, iz) => entries.get(cellKey(ix, iz))?.total ?? 0,
    mulberry32(chunkBridsonSeed(chunkX, chunkZ)),
  );
  return { entries, slots };
}

/**
 * The Poisson-disk slot mesh for one chunk — the pure geometry half of the
 * placement (positions only, no species or keep decisions). Exported for the
 * 11.0c audit's nearest-neighbour statistics.
 */
export function slotMeshForChunk(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  config: VegetationConfig = VEGETATION_CONFIG,
): Array<{ readonly x: number; readonly z: number }> {
  return buildChunkSlots(sampler, chunkX, chunkZ, config).slots;
}

/**
 * All placements inside one terrain chunk (deterministic; no streamer
 * state). Phase 11.0c: Bridson slot mesh + the baseline's keep rolls.
 */
export function generateChunkVegetation(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  config: VegetationConfig = VEGETATION_CONFIG,
): VegetationPlacement[] {
  const { entries, slots } = buildChunkSlots(sampler, chunkX, chunkZ, config);
  const cell = config.cellMeters;

  const placements: VegetationPlacement[] = [];
  const slotOrdinals = new Map<number, number>();
  for (const slot of slots) {
    const ix = Math.floor(slot.x / cell);
    const iz = Math.floor(slot.z / cell);
    const key = cellKey(ix, iz);
    const entry = entries.get(key);
    if (entry === undefined || entry.total <= 0) continue;
    const ordinal = slotOrdinals.get(key) ?? 0;
    slotOrdinals.set(key, ordinal + 1);
    // Slot-level keep: the baseline's weighted roll, scaled by the disk's
    // slot density so the forest count stays where the stratified baseline
    // put it (the 11.0c ±20 % band). The species mix is the baseline's:
    // the same cumulative draw against the same weights.
    const roll = hash01(ix, iz, 37 + ordinal);
    if (roll >= Math.min(1, entry.total / BRIDSON_SLOT_DENSITY)) continue;
    let cumulative = 0;
    let species: VegetationSpecies = 'rock';
    for (let index = 0; index < VEGETATION_SPECIES.length; index += 1) {
      cumulative += entry.weights[index]!;
      if (roll < cumulative) {
        species = VEGETATION_SPECIES[index]!;
        break;
      }
    }
    const canopyOnly = clearanceAt(sampler, slot.x, slot.z, config);
    if (canopyOnly === null) continue;
    const isTree = TREE_SPECIES.has(species);
    const scale =
      (isTree ? 0.8 + 0.85 * hash01(ix, iz, 53) : 0.7 + 1.1 * hash01(ix, iz, 53)) *
      canopyScaleAt(slot.x, slot.z);
    if (
      canopyOnly &&
      (species === 'bamboo' || species === 'sakura' || scale < TRAIL_NETWORK_CONFIG.canopyMinScale)
    ) {
      continue;
    }
    // Ground at the plant position (the baseline gates and grounds its
    // jittered candidate the same way; the slot stands in for it).
    const y = sampler.heightAt(slot.x, slot.z) - 0.12;
    if (species !== 'rock' && y > config.treeLineMeters) continue;
    placements.push({
      species,
      variant: Math.floor(hash01(ix, iz, 41 + ordinal) * vegetationVariantCount(species)),
      x: slot.x,
      y,
      z: slot.z,
      scale,
      rotationY: hash01(ix, iz, 67 + ordinal) * Math.PI * 2,
      cellX: ix,
      cellZ: iz,
      key: ordinal === 0 ? `${ix},${iz}` : `${ix},${iz}#${ordinal}`,
    });
  }
  return placements;
}

/**
 * The pre-11.0c stratified-jitter baseline: one candidate per 6.5 m cell at
 * a hashed jitter position, gated by the shared sampler (road corridor
 * clear, spawn pad clear, trees below the treeline, only rock on steep
 * ground, districts multiplying their signature species). Kept verbatim as
 * the Phase 11.0c acceptance reference (density band, nearest-neighbour
 * distribution, placement time) — see `generateChunkVegetation`.
 */
export function generateChunkVegetationStratified(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  config: VegetationConfig = VEGETATION_CONFIG,
): VegetationPlacement[] {
  const size = sampler.config.chunkSizeMeters;
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const cell = config.cellMeters;
  const firstCellX = Math.floor(originX / cell);
  const firstCellZ = Math.floor(originZ / cell);
  const cellsPerChunk = Math.ceil(size / cell);
  const placements: VegetationPlacement[] = [];

  for (let iz = firstCellZ; iz < firstCellZ + cellsPerChunk; iz += 1) {
    for (let ix = firstCellX; ix < firstCellX + cellsPerChunk; ix += 1) {
      const x = (ix + 0.15 + 0.7 * hash01(ix, iz, 11)) * cell;
      const z = (iz + 0.15 + 0.7 * hash01(ix, iz, 23)) * cell;
      if (x < originX || x >= originX + size || z < originZ || z >= originZ + size) {
        continue;
      }
      if (Math.hypot(x, z) < config.spawnClearanceMeters) {
        continue;
      }
      const road = sampler.roadAt?.(x, z) ?? null;
      if (
        road !== null &&
        road.distance <
          Math.max(config.roadClearanceMeters, road.halfWidthMeters + road.shoulderMeters + 4.8)
      ) {
        continue;
      }
      // Trail corridor: inside the clear band nothing grows at all (the route
      // must be drivable); inside the canopy band only tall trees may stand, so
      // the trail tunnels under the crowns instead of crossing open ground.
      const trail = trailAt(x, z);
      // Phase 7.2: the wilderness corridors clear the same way, on a slightly narrower band.
      const wilderness = wildernessTrailAt(sampler.config, x, z);
      let canopyOnly = false;
      if (trail !== null) {
        if (trail.distance < TRAIL_NETWORK_CONFIG.clearInnerMeters) {
          continue;
        }
        canopyOnly = trail.distance < TRAIL_NETWORK_CONFIG.canopyOuterMeters;
      }
      if (wilderness !== null) {
        if (wilderness.distance < WILDERNESS_TRACKS_CONFIG.clearInnerMeters) {
          continue;
        }
        canopyOnly = canopyOnly || wilderness.distance < 8;
      }
      const height = sampler.heightAt(x, z);
      const normal = sampler.normalAt(x, z);
      const steepness = 1 - normal.y;
      const multipliers = speciesMultipliersAt(x, z);

      // One plant per cell at most: species compete by weighted keep-probability.
      // Sakura and bamboo are district signatures, not background flora: without a
      // district asking for them (multiplier > 1), they never win a cell.
      let total = 0;
      const weights: number[] = [];
      for (const species of VEGETATION_SPECIES) {
        const districtOnly =
          (species === 'sakura' || species === 'bamboo') && multipliers[species] <= 1;
        const weight =
          (districtOnly ? 0 : config.baseDensity[species]) *
          multipliers[species] *
          speciesGate(species, height, steepness, config);
        weights.push(weight);
        total += weight;
      }
      const roll = hash01(ix, iz, 37);
      if (roll >= total) {
        continue;
      }
      let cumulative = 0;
      let species: VegetationSpecies = 'rock';
      for (let index = 0; index < VEGETATION_SPECIES.length; index += 1) {
        cumulative += weights[index]!;
        if (roll < cumulative) {
          species = VEGETATION_SPECIES[index]!;
          break;
        }
      }
      const isTree = TREE_SPECIES.has(species);
      const scale =
        (isTree ? 0.8 + 0.85 * hash01(ix, iz, 53) : 0.7 + 1.1 * hash01(ix, iz, 53)) *
        canopyScaleAt(x, z);
      if (
        canopyOnly &&
        (species === 'bamboo' ||
          species === 'sakura' ||
          scale < TRAIL_NETWORK_CONFIG.canopyMinScale)
      ) {
        continue;
      }
      placements.push({
        species,
        variant: Math.floor(hash01(ix, iz, 41) * vegetationVariantCount(species)),
        x,
        y: height - 0.12,
        z,
        scale,
        rotationY: hash01(ix, iz, 67) * Math.PI * 2,
        cellX: ix,
        cellZ: iz,
        key: `${ix},${iz}`,
      });
    }
  }
  return placements;
}
