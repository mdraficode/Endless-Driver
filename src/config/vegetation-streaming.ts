import type { TierId } from './tiers';

/**
 * Main-thread foliage generation caps. The initial window is prepared before the first rendered
 * frame in separate event-loop batches; these smaller per-frame caps only govern streaming while
 * driving, trading a little preparation lead for fewer CPU spikes on constrained tiers.
 */
export const VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME: Readonly<Record<TierId, number>> = {
  C: 1,
  B: 2,
  A: 3,
};
