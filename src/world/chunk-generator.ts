import type { RoadNetworkConfig } from '../config/roads';
import type { TerrainConfig } from '../config/terrain';
import type { TerrainSampler } from './terrain-height';
import { chunkKey } from './terrain-chunks';
import type { TerrainGenerationResult } from './terrain-generation';

/**
 * Main-thread side of the generation worker pool.
 *
 * `TerrainWorld` hands this class the planner-ordered build queue every frame;
 * the pool (two workers, one on small devices) generates raw geometry off-thread and
 * returns it zero-copy. Three safety properties matter more than throughput:
 *
 * 1. **Determinism** — workers rebuild the identical sampler from configs, so a
 *    chunk is bit-identical whichever thread builds it.
 * 2. **Fallback** — any worker failure (construction, script error) permanently
 *    degrades to `sync` mode and `TerrainWorld` builds on the main thread exactly
 *    as it did before workers existed. The game never depends on the pool.
 * 3. **Staleness** — results are only accepted if the latest desired queue still
 *    wants that chunk at that LOD; a fast car cannot be buried in stale geometry.
 */

export interface GenerationJob {
  readonly key: string;
  readonly cx: number;
  readonly cz: number;
  readonly segments: number;
}

interface WorkerSlot {
  readonly worker: Worker;
  busyId: number | null;
}

const MAX_IN_FLIGHT_MS = 20_000;

export class ChunkGenerator {
  readonly #sampler: TerrainSampler;

  #mode: 'worker' | 'sync' = 'sync';

  #slots: WorkerSlot[] = [];

  #nextId = 1;

  #desired = new Map<string, GenerationJob>();

  #inFlight = new Map<number, GenerationJob & { sinceMs: number }>();

  #queued: GenerationJob[] = [];

  #completed = new Map<string, TerrainGenerationResult>();

  #workerBuilds = 0;

  #disposed = false;

  constructor(
    sampler: TerrainSampler,
    terrainConfig: TerrainConfig,
    roadConfig: RoadNetworkConfig | null,
  ) {
    this.#sampler = sampler;
    if (typeof Worker === 'undefined') {
      return; // Tests and non-DOM hosts keep the synchronous path.
    }
    try {
      const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
      const poolSize = cores >= 4 ? 2 : 1;
      for (let index = 0; index < poolSize; index += 1) {
        const worker = new Worker(new URL('./terrain-worker.ts', import.meta.url), {
          type: 'module',
        });
        const slot: WorkerSlot = { worker, busyId: null };
        worker.onmessage = (event: MessageEvent<TerrainGenerationResult>) => {
          this.#onResult(slot, event.data);
        };
        worker.onerror = () => {
          this.#failToSync();
        };
        worker.postMessage({ type: 'init', terrain: terrainConfig, road: roadConfig });
        this.#slots.push(slot);
      }
      this.#mode = 'worker';
    } catch {
      this.#failToSync();
    }
  }

  get mode(): 'worker' | 'sync' {
    return this.#mode;
  }

  /** Sampler for the synchronous fallback path (and for hosts without workers). */
  get syncSampler(): TerrainSampler {
    return this.#sampler;
  }

  /** Jobs wanted but not yet applied: queued + in flight + completed-unclaimed. */
  get backlog(): number {
    return this.#queued.length + this.#inFlight.size + this.#completed.size;
  }

  get workerBuilds(): number {
    return this.#workerBuilds;
  }

  /**
   * Reconciles the pool with the planner's current ordered queue. Called once per
   * frame; cheap when nothing changed.
   */
  syncQueue(jobs: readonly GenerationJob[]): void {
    if (this.#mode !== 'worker' || this.#disposed) {
      return;
    }
    this.#desired = new Map(jobs.map((job) => [job.key, job]));
    // Drop completed results nobody wants anymore (LOD changed under them).
    for (const [key, result] of this.#completed) {
      const want = this.#desired.get(key);
      if (want === undefined || want.segments !== result.segments) {
        this.#completed.delete(key);
      }
    }
    // Rebuild the queue from the fresh plan (priority order preserved), excluding
    // only work already settled: completed-unclaimed or in flight.
    const settled = new Set<string>(this.#completed.keys());
    for (const job of this.#inFlight.values()) {
      settled.add(job.key);
    }
    this.#queued = jobs.filter((job) => !settled.has(job.key));
    this.#dispatch();
  }

  /** Claims up to `max` finished results, in completion order. */
  takeCompleted(max: number): TerrainGenerationResult[] {
    const taken: TerrainGenerationResult[] = [];
    for (const [key, result] of this.#completed) {
      if (taken.length >= max) {
        break;
      }
      taken.push(result);
      this.#completed.delete(key);
    }
    return taken;
  }

  dispose(): void {
    this.#disposed = true;
    for (const slot of this.#slots) {
      slot.worker.terminate();
    }
    this.#slots = [];
    this.#inFlight.clear();
    this.#completed.clear();
    this.#queued = [];
  }

  #dispatch(): void {
    const now = performance.now();
    // Watchdog: a worker that never answers must not stall world streaming forever.
    for (const job of this.#inFlight.values()) {
      if (now - job.sinceMs > MAX_IN_FLIGHT_MS) {
        this.#failToSync();
        return;
      }
    }
    for (const slot of this.#slots) {
      if (slot.busyId !== null) {
        continue;
      }
      const job = this.#queued.shift();
      if (job === undefined) {
        return;
      }
      const id = this.#nextId;
      this.#nextId += 1;
      slot.busyId = id;
      this.#inFlight.set(id, { ...job, sinceMs: now });
      slot.worker.postMessage({
        type: 'generate',
        id,
        chunkX: job.cx,
        chunkZ: job.cz,
        segments: job.segments,
      });
    }
  }

  #onResult(slot: WorkerSlot, result: TerrainGenerationResult): void {
    if (this.#disposed || result.type !== 'result') {
      return;
    }
    slot.busyId = null;
    const job = this.#inFlight.get(result.id);
    this.#inFlight.delete(result.id);
    if (job !== undefined) {
      const key = chunkKey(result.chunkX, result.chunkZ);
      const want = this.#desired.get(key);
      if (want !== undefined && want.segments === result.segments) {
        this.#completed.set(key, result);
        this.#workerBuilds += 1;
      }
    }
    this.#dispatch();
  }

  #failToSync(): void {
    if (this.#mode === 'sync') {
      return;
    }
    this.#mode = 'sync';
    for (const slot of this.#slots) {
      try {
        slot.worker.terminate();
      } catch {
        // Already gone.
      }
    }
    this.#slots = [];
    this.#inFlight.clear();
    this.#queued = [];
    this.#completed.clear();
    console.warn('terrain: generation workers unavailable; building chunks on the main thread');
  }
}
