import type { RoadNetworkConfig } from '../config/roads';
import type { TerrainConfig } from '../config/terrain';
import { buildChunkGeometryData, type ChunkGeometryData } from './terrain-geometry';
import { createTerrainSampler, type TerrainSampler } from './terrain-height';
import { createWorldTerrainSampler } from './world-terrain';

/**
 * The generation protocol shared by the main thread and the worker entry.
 *
 * The one hard requirement is determinism across threads: the worker rebuilds the
 * sampler from the same configs the main thread used, so a chunk generated off-thread
 * is bit-identical to one generated on it — the seam tests extend across the boundary
 * for free, and a worker failure can fall back to synchronous generation without any
 * chunk changing by a single bit.
 */

export interface TerrainGenerationInit {
  readonly type: 'init';
  readonly terrain: TerrainConfig;
  readonly road: RoadNetworkConfig | null;
}

export interface TerrainGenerationRequest {
  readonly type: 'generate';
  readonly id: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly segments: number;
}

export interface TerrainGenerationResult {
  readonly type: 'result';
  readonly id: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly segments: number;
  readonly data: ChunkGeometryData;
}

export type TerrainWorkerMessage = TerrainGenerationInit | TerrainGenerationRequest;

/** Builds the sampler exactly as the game does (roads carved when a road config is present). */
export function createGenerationSampler(
  terrain: TerrainConfig,
  road: RoadNetworkConfig | null,
): TerrainSampler {
  return road === null ? createTerrainSampler(terrain) : createWorldTerrainSampler(terrain, road);
}

/** Handles one request against a prepared sampler. Extracted so it is unit-testable off-worker. */
export function handleGenerationRequest(
  sampler: TerrainSampler,
  request: TerrainGenerationRequest,
): TerrainGenerationResult {
  return {
    type: 'result',
    id: request.id,
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    segments: request.segments,
    data: buildChunkGeometryData(sampler, request.chunkX, request.chunkZ, request.segments),
  };
}

/** Transferable buffers of a result (zero-copy post). */
export function resultTransferables(result: TerrainGenerationResult): ArrayBuffer[] {
  const { data } = result;
  return [
    data.positions.buffer as ArrayBuffer,
    data.normals.buffer as ArrayBuffer,
    data.colors.buffer as ArrayBuffer,
    data.splats.buffer as ArrayBuffer,
    data.tints.buffer as ArrayBuffer,
    data.indices.buffer as ArrayBuffer,
  ];
}
