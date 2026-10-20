import { describe, expect, it } from 'vitest';
import { DynamicResolutionController } from '../../src/core/DynamicResolution';

/**
 * The controller's job is to be *boring*: react to a machine that is genuinely missing frames, ignore
 * everything else, and never oscillate. Every test below pins one of those properties, because each of
 * them fails in a way that looks fine — a scale that breathes is read as a soft image, a scale that never
 * moves is read as "dynamic resolution is working, this machine is just fast", and a `NaN` that gets into
 * the average stops the controller silently (every comparison against `NaN` is false, so it simply never
 * adjusts again).
 */

/** Feeds `count` frames of the same duration and returns the controller, for the steady-state cases. */
function feed(
  controller: DynamicResolutionController,
  frameTimeMs: number,
  count: number,
): DynamicResolutionController {
  for (let i = 0; i < count; i += 1) {
    controller.updateFrameTime(frameTimeMs);
  }
  return controller;
}

const OPTIONS = {
  minScale: 0.5,
  maxScale: 1,
  targetFrameTimeMs: 16.6,
  tolerance: 0.15,
  step: 0.1,
  adjustmentIntervalSeconds: 0.5,
  smoothing: 0.1,
};

describe('dynamic resolution controller', () => {
  it('starts at the highest scale the configuration allows', () => {
    expect(new DynamicResolutionController(OPTIONS).scale).toBe(1);
  });

  it('clamps an initial scale into the configured range', () => {
    expect(new DynamicResolutionController(OPTIONS, 4).scale).toBe(1);
    expect(new DynamicResolutionController(OPTIONS, 0.01).scale).toBe(0.5);
  });

  it('normalises bounds given the wrong way round', () => {
    const controller = new DynamicResolutionController({ ...OPTIONS, minScale: 1, maxScale: 0.5 });
    feed(controller, 100, 60);
    expect(controller.scale).toBe(0.5);
  });

  it('does nothing when the frame time sits inside the dead band', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    // 16.6 ms is the target itself: the boundary case that makes a dead band necessary rather than nice.
    feed(controller, 16.6, 600);
    expect(controller.scale).toBe(1);

    // And just inside both edges of the band, which is where an unguarded proportional controller sings.
    expect(controller.growThresholdMs).toBeLessThan(16.6);
    expect(controller.shrinkThresholdMs).toBeGreaterThan(16.6);
    feed(controller, controller.growThresholdMs + 0.01, 600);
    expect(controller.scale).toBe(1);
    feed(controller, controller.shrinkThresholdMs - 0.01, 600);
    expect(controller.scale).toBe(1);
  });

  it('shrinks towards the floor when frames are consistently missed', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    // 33 ms is one dropped frame at 60 Hz — the point at which a miss is visible rather than theoretical.
    feed(controller, 33, 600);
    expect(controller.scale).toBe(0.5);
  });

  it('stops at the floor instead of shrinking past it', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    feed(controller, 200, 600);
    expect(controller.scale).toBe(0.5);
    expect(controller.scale).toBeGreaterThan(0);
  });

  it('moves one step at a time rather than jumping', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    // Half a second of slow frames: exactly one adjustment interval, so exactly one step.
    const decision = feed(controller, 33, 30).scale;
    expect(decision).toBeCloseTo(0.9, 5);
  });

  it('does not respond to a single slow frame', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    controller.updateFrameTime(33);
    // Nine fast frames after it are below the interval, and even if the interval had elapsed the smoothed
    // average would still be inside the dead band.
    feed(controller, 8, 9);
    expect(controller.scale).toBe(1);
  });

  it('recovers when the frames get fast again', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    feed(controller, 40, 600);
    const bottom = controller.scale;
    expect(bottom).toBe(0.5);
    feed(controller, 5, 600);
    expect(controller.scale).toBe(1);
  });

  it('ignores frame times that are not usable numbers', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    for (const sample of [Number.NaN, Number.POSITIVE_INFINITY, 0, -12]) {
      const decision = controller.updateFrameTime(sample);
      expect(decision.changed).toBe(false);
    }
    expect(controller.frameTimeMilliseconds).toBeNull();
    expect(controller.scale).toBe(1);

    // The important half: the controller still works afterwards. A poisoned average would leave it stuck.
    feed(controller, 40, 600);
    expect(controller.scale).toBe(0.5);
  });

  it('reports a change only on the frame the scale moved', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    let changes = 0;
    for (let i = 0; i < 300; i += 1) {
      if (controller.updateFrameTime(40).changed) {
        changes += 1;
      }
    }
    // 300 frames of 40 ms is 12 s, so 24 adjustment opportunities — but only the first five can move the
    // scale before it reaches the floor at 0.5 with a step of 0.1.
    expect(changes).toBe(5);
  });

  it('resets its average and its interval, keeping the scale unless told otherwise', () => {
    const controller = new DynamicResolutionController(OPTIONS);
    feed(controller, 40, 600);
    expect(controller.scale).toBe(0.5);
    controller.reset();
    expect(controller.frameTimeMilliseconds).toBeNull();
    expect(controller.scale).toBe(0.5);
    controller.reset(0.8);
    expect(controller.scale).toBe(0.8);
  });

  it('keeps its EWMA time constant equivalent across 60 Hz and 120 Hz samples', () => {
    const atSixtyHertz = new DynamicResolutionController({
      ...OPTIONS,
      targetFrameTimeMs: 16.6,
      adjustmentIntervalSeconds: 10,
    });
    const atOneTwentyHertz = new DynamicResolutionController({
      ...OPTIONS,
      targetFrameTimeMs: 8.3,
      adjustmentIntervalSeconds: 10,
    });

    atSixtyHertz.updateFrameTime(33.2);
    atOneTwentyHertz.updateFrameTime(16.6);
    feed(atSixtyHertz, 16.6, 30);
    feed(atOneTwentyHertz, 8.3, 60);

    expect((atSixtyHertz.frameTimeMilliseconds ?? 0) / 16.6).toBeCloseTo(
      (atOneTwentyHertz.frameTimeMilliseconds ?? 0) / 8.3,
      10,
    );
  });

  it('honours the smoothing window it was given', () => {
    // `smoothing` is the weight of the *newest* sample, so a small value is the long memory: after one
    // 100 ms frame followed by 40 fast ones, a 0.01 window still carries the spike while a 0.5 window has
    // forgotten it completely. Both are legitimate configurations — the point of the test is that the
    // number means what the documented direction says it means.
    const longMemory = new DynamicResolutionController({ ...OPTIONS, smoothing: 0.01 });
    const shortMemory = new DynamicResolutionController({ ...OPTIONS, smoothing: 0.5 });
    for (const controller of [longMemory, shortMemory]) {
      for (let i = 0; i < 40; i += 1) {
        controller.updateFrameTime(i === 0 ? 100 : 8);
      }
    }
    expect(longMemory.frameTimeMilliseconds ?? 0).toBeGreaterThan(longMemory.shrinkThresholdMs);
    expect(shortMemory.frameTimeMilliseconds ?? 0).toBeLessThan(shortMemory.growThresholdMs);
  });
});
