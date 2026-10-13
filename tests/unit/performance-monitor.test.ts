import { describe, expect, it } from 'vitest';
import { PerformanceMonitor } from '../../src/core/PerformanceMonitor';

const FRAME_60 = 1 / 60;

describe('PerformanceMonitor', () => {
  it('reports zeroed statistics before any frame is recorded', () => {
    const monitor = new PerformanceMonitor(120);
    const statistics = monitor.snapshot();
    expect(statistics.sampleCount).toBe(0);
    expect(statistics.averageFramesPerSecond).toBe(0);
    expect(statistics.p95FrameTimeMilliseconds).toBe(0);
    expect(monitor.totalFrames).toBe(0);
  });

  it('derives average FPS and frame time from a steady 60 FPS stream', () => {
    const monitor = new PerformanceMonitor(120);
    for (let frame = 0; frame < 120; frame += 1) {
      monitor.record(FRAME_60);
    }

    const statistics = monitor.snapshot();
    expect(statistics.sampleCount).toBe(120);
    expect(statistics.averageFramesPerSecond).toBeCloseTo(60, 6);
    expect(statistics.averageFrameTimeMilliseconds).toBeCloseTo(16.6667, 3);
    expect(statistics.p95FrameTimeMilliseconds).toBeCloseTo(16.6667, 3);
    expect(statistics.minimumFramesPerSecond).toBeCloseTo(60, 6);
    expect(monitor.totalFrames).toBe(120);
  });

  it('surfaces hitching through the worst frame and minimum FPS', () => {
    const monitor = new PerformanceMonitor(60);
    for (let frame = 0; frame < 59; frame += 1) {
      monitor.record(FRAME_60);
    }
    monitor.record(0.05);

    const statistics = monitor.snapshot();
    expect(statistics.worstFrameTimeMilliseconds).toBeCloseTo(50, 6);
    expect(statistics.minimumFramesPerSecond).toBeCloseTo(20, 6);
    expect(statistics.p95FrameTimeMilliseconds).toBeCloseTo(16.6667, 3);
  });

  it('keeps only the most recent window of samples', () => {
    const monitor = new PerformanceMonitor(10);
    for (let frame = 0; frame < 20; frame += 1) {
      monitor.record(FRAME_60);
    }
    expect(monitor.sampleWindowSize).toBe(10);
    expect(monitor.snapshot().sampleCount).toBe(10);
    expect(monitor.totalFrames).toBe(20);
  });

  it('ignores invalid deltas and resets cleanly', () => {
    const monitor = new PerformanceMonitor(10);
    monitor.record(Number.NaN);
    monitor.record(-1);
    expect(monitor.snapshot().worstFrameTimeMilliseconds).toBe(0);

    monitor.record(FRAME_60);
    expect(monitor.snapshot().sampleCount).toBe(3);

    monitor.reset();
    expect(monitor.snapshot().sampleCount).toBe(0);
    expect(monitor.totalFrames).toBe(0);
  });

  it('treats a non-finite sample window as a single-slot window', () => {
    const monitor = new PerformanceMonitor(Number.NaN);
    expect(monitor.sampleWindowSize).toBe(1);
  });
});
