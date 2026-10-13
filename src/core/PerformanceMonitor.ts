import { secondsToMilliseconds } from '../shared/math';

export interface FrameStatistics {
  /** Number of retained frame samples. */
  readonly sampleCount: number;
  readonly averageFramesPerSecond: number;
  /** FPS implied by the slowest retained frame. */
  readonly minimumFramesPerSecond: number;
  readonly averageFrameTimeMilliseconds: number;
  /** 95th-percentile frame time; a cheap stand-in for "1% low" style hitching. */
  readonly p95FrameTimeMilliseconds: number;
  readonly worstFrameTimeMilliseconds: number;
}

const EMPTY_STATISTICS: FrameStatistics = {
  sampleCount: 0,
  averageFramesPerSecond: 0,
  minimumFramesPerSecond: 0,
  averageFrameTimeMilliseconds: 0,
  p95FrameTimeMilliseconds: 0,
  worstFrameTimeMilliseconds: 0,
};

/**
 * Retains a fixed-size window of recent frame deltas and derives FPS/frame-time
 * statistics from it. Allocation happens once in the constructor so recording a frame
 * does not create garbage.
 */
export class PerformanceMonitor {
  readonly #samples: Float64Array;
  #count = 0;
  #cursor = 0;
  #totalFrames = 0;

  constructor(sampleWindow = 120) {
    const size = Number.isFinite(sampleWindow) ? Math.max(1, Math.floor(sampleWindow)) : 1;
    this.#samples = new Float64Array(size);
  }

  get totalFrames(): number {
    return this.#totalFrames;
  }

  get sampleWindowSize(): number {
    return this.#samples.length;
  }

  record(deltaSeconds: number): void {
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.#samples[this.#cursor] = delta;
    this.#cursor = (this.#cursor + 1) % this.#samples.length;
    this.#count = Math.min(this.#count + 1, this.#samples.length);
    this.#totalFrames += 1;
  }

  reset(): void {
    this.#samples.fill(0);
    this.#count = 0;
    this.#cursor = 0;
    this.#totalFrames = 0;
  }

  snapshot(): FrameStatistics {
    if (this.#count === 0) {
      return EMPTY_STATISTICS;
    }

    const deltas = Array.from(this.#samples.subarray(0, this.#count)).sort((a, b) => a - b);
    let total = 0;
    for (const delta of deltas) {
      total += delta;
    }

    const mean = total / deltas.length;
    const worst = deltas[deltas.length - 1] ?? 0;
    const p95Index = Math.min(deltas.length - 1, Math.floor(0.95 * (deltas.length - 1)));
    const p95 = deltas[p95Index] ?? worst;

    return {
      sampleCount: deltas.length,
      averageFramesPerSecond: mean > 0 ? 1 / mean : 0,
      minimumFramesPerSecond: worst > 0 ? 1 / worst : 0,
      averageFrameTimeMilliseconds: secondsToMilliseconds(mean),
      p95FrameTimeMilliseconds: secondsToMilliseconds(p95),
      worstFrameTimeMilliseconds: secondsToMilliseconds(worst),
    };
  }
}
