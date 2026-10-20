/**
 * Dynamic resolution: the controller that moves the render scale in response to frame time.
 *
 * Kept deliberately free of three and of the DOM. The decision — *when* the resolution should change and
 * by how much — is the part that can be wrong in ways a screenshot never shows, so it is a plain object
 * with an arithmetic core that can be driven by a test at 240 simulated frames per second. The engine
 * only applies the number it returns.
 *
 * The problem it solves is not "what resolution is best" but "what keeps the frame time stable". A render
 * scale fixed high enough for a good screenshot will, on the machines that cannot hold it, produce a frame
 * time that swings — and a frame time that swings is felt as stutter long before it is seen as softness.
 * Trading a little resolution for a flat frame time is the better half of that bargain, and the reason
 * this is a controller rather than a setting.
 *
 * Three properties are load-bearing, and each one exists because its absence is a visible bug:
 *
 * - **A dead band.** A scale that reacts to every frame of difference oscillates, and a resolution that
 *   breathes is far more distracting than a resolution that is slightly too low. Between
 *   `target x (1 - tolerance)` and `target x (1 + tolerance)` the controller does nothing at all.
 * - **Hysteresis in time.** One slow frame — a GC pause, a shader compile, a texture upload — is not
 *   evidence that the machine cannot hold the frame. The controller only *considers* a change every
 *   `adjustmentIntervalSeconds`, and moves a fraction of the way when it does.
 * - **Time-based smoothed input.** The exponential average uses the sample's elapsed time, not one fixed
 *   blend per rendered frame. Its configured `smoothing` is the weight at a 16.6 ms reference interval, so
 *   the same time constant is retained on 60 Hz and 120 Hz displays; a single spike cannot move the scale.
 *
 * What this controller cannot see is worth stating as plainly as what it can: it is driven by delivered
 * frame time, and a browser caps delivered frames at the display's refresh rate. A GPU using 95% of the
 * frame budget on a 60 Hz display delivers 16.7 ms frames exactly like an idle one, so the controller
 * cannot pre-emptively lower the scale — it reacts when frames start being *missed* (the next vsync slot,
 * ~33 ms, or a torn sequence), which is when the player can already feel it. Measuring true GPU time would
 * need timestamp queries, which this renderer does not expose; the plan in `docs/REALISM_PLAN.md` §5 lists
 * frame-budget measurement on named hardware as the owner-run half of this check for that reason.
 */

/** Tunables for `DynamicResolutionController`, mirroring `TemporalAntiAliasingConfig` where they overlap. */
export interface DynamicResolutionOptions {
  readonly minScale: number;
  readonly maxScale: number;
  readonly targetFrameTimeMs: number;
  readonly tolerance: number;
  readonly step: number;
  readonly adjustmentIntervalSeconds: number;
  /** EWMA weight at a 16.6 ms reference interval, adjusted by elapsed time per sample. */
  readonly smoothing: number;
}

/** The controller's answer for one frame: the scale to use, and whether it moved. */
export interface ResolutionDecision {
  readonly scale: number;
  /** True only on the frame an adjustment happened, so the caller can skip redundant work. */
  readonly changed: boolean;
}

const DEFAULT_OPTIONS: DynamicResolutionOptions = {
  minScale: 0.67,
  maxScale: 1,
  targetFrameTimeMs: 16.6,
  tolerance: 0.15,
  step: 0.05,
  adjustmentIntervalSeconds: 0.5,
  smoothing: 0.1,
};

/** Reference interval for the configured EWMA weight; makes smoothing independent of refresh rate. */
const SMOOTHING_REFERENCE_FRAME_TIME_MS = 16.6;

/**
 * Rounds to a hundredth, because the scale is what the render target is sized from and a scale that
 * wobbles in the fourth decimal place would resize the target for no visible reason.
 */
function quantise(scale: number): number {
  return Math.round(scale * 100) / 100;
}

export class DynamicResolutionController {
  readonly #options: DynamicResolutionOptions;
  #scale: number;
  /** Smoothed frame time in milliseconds; `null` until the first sample arrives. */
  #frameTimeMs: number | null = null;
  /** Milliseconds accumulated since the last time the controller considered adjusting. */
  #sinceAdjustmentMs = 0;

  constructor(options: Partial<DynamicResolutionOptions> = {}, initialScale?: number) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    // Bounds are normalised rather than trusted: a configuration with `minScale > maxScale` would make
    // every clamp below pick whichever end it checked last, and the resulting behaviour (a scale that
    // pins to one end) looks like a controller that "works" while doing nothing sensible.
    const minScale = Math.min(merged.minScale, merged.maxScale);
    const maxScale = Math.max(merged.minScale, merged.maxScale);
    this.#options = { ...merged, minScale, maxScale };
    this.#scale = this.#clamp(initialScale ?? maxScale);
  }

  /** The scale to render the scene pass at. */
  get scale(): number {
    return this.#scale;
  }

  /** Smoothed frame time the last decision was based on, in milliseconds; `null` before any samples. */
  get frameTimeMilliseconds(): number | null {
    return this.#frameTimeMs;
  }

  /**
   * Frame time above which the scale shrinks. Exposed because it is the number a report should quote
   * alongside "the resolution moved" — quoting a scale change without the threshold it responded to
   * makes a correct adaptation look arbitrary.
   */
  get shrinkThresholdMs(): number {
    return this.#options.targetFrameTimeMs * (1 + this.#options.tolerance);
  }

  /** Frame time below which the scale grows. */
  get growThresholdMs(): number {
    return this.#options.targetFrameTimeMs * (1 - this.#options.tolerance);
  }

  /** Resets the smoothing and the interval, e.g. after a resize or a context restore. */
  reset(scale?: number): void {
    this.#frameTimeMs = null;
    this.#sinceAdjustmentMs = 0;
    if (scale !== undefined) {
      this.#scale = this.#clamp(scale);
    }
  }

  /**
   * Feeds one frame's duration, in milliseconds, and returns the scale to use from now on.
   *
   * Non-finite and non-positive samples are ignored rather than absorbed: a `NaN` reaching the average
   * would poison every subsequent comparison (every `NaN > threshold` is false, so the controller would
   * silently stop adapting), and the place to stop that is the boundary.
   */
  updateFrameTime(frameTimeMs: number): ResolutionDecision {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) {
      return { scale: this.#scale, changed: false };
    }

    const smoothingAtReference = Math.min(1, Math.max(0, this.#options.smoothing));
    const smoothing =
      smoothingAtReference === 1
        ? 1
        : smoothingAtReference === 0
          ? 0
          : 1 - Math.pow(1 - smoothingAtReference, frameTimeMs / SMOOTHING_REFERENCE_FRAME_TIME_MS);
    // The first sample seeds the average instead of being blended towards zero, which would make the
    // controller read a page that opened slowly as a machine that cannot hold the frame. Later samples
    // use a time-scaled alpha: an 8.3 ms frame blends about half as much as a 16.6 ms frame.
    this.#frameTimeMs =
      this.#frameTimeMs === null
        ? frameTimeMs
        : this.#frameTimeMs + (frameTimeMs - this.#frameTimeMs) * smoothing;

    this.#sinceAdjustmentMs += frameTimeMs;
    if (this.#sinceAdjustmentMs < this.#options.adjustmentIntervalSeconds * 1000) {
      return { scale: this.#scale, changed: false };
    }
    this.#sinceAdjustmentMs = 0;

    const previous = this.#scale;
    if (this.#frameTimeMs > this.shrinkThresholdMs) {
      this.#scale = this.#clamp(this.#scale - this.#options.step);
    } else if (this.#frameTimeMs < this.growThresholdMs) {
      this.#scale = this.#clamp(this.#scale + this.#options.step);
    }

    return { scale: this.#scale, changed: this.#scale !== previous };
  }

  #clamp(scale: number): number {
    if (!Number.isFinite(scale)) {
      return this.#options.maxScale;
    }
    return quantise(Math.min(this.#options.maxScale, Math.max(this.#options.minScale, scale)));
  }
}
