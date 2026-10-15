import {
  createGenerationSampler,
  handleGenerationRequest,
  resultTransferables,
  type TerrainWorkerMessage,
} from './terrain-generation';
import type { TerrainSampler } from './terrain-height';

/**
 * Terrain generation worker entry.
 *
 * Receives an `init` (terrain + optional road config), rebuilds the identical sampler
 * the main thread uses, then answers `generate` requests with raw geometry buffers,
 * transferred zero-copy. Deliberately thin: all protocol logic lives in
 * `terrain-generation.ts` where unit tests can reach it, and this file only moves
 * messages across the boundary.
 */

const context = self as unknown as {
  onmessage: ((event: MessageEvent<TerrainWorkerMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

let sampler: TerrainSampler | null = null;

context.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') {
    sampler = createGenerationSampler(message.terrain, message.road);
    return;
  }
  if (sampler === null) {
    return; // Generate before init: drop; the main thread's fallback covers the gap.
  }
  const result = handleGenerationRequest(sampler, message);
  context.postMessage(result, resultTransferables(result));
};
