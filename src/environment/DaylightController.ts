import type { EnvironmentClock, DaylightState } from './EnvironmentClock';

/**
 * The one place where a resolved time of day becomes light.
 *
 * Both composition roots — the driving scene and the studio look-dev scene — need the same three
 * steps: advance the clock, resolve the daylight state, and push it into the scene and the engine.
 * That is small enough to be duplicated by accident and important enough that a divergence would be
 * invisible: the studio would be judging materials under a slightly different sun than the world
 * they are destined for, which is exactly the mistake the studio exists to prevent.
 */
export interface DaylightTarget {
  applyDaylight(state: DaylightState): void;
  readonly skyMode: 'procedural' | 'hdri';
}

export interface DaylightEngineTarget {
  setExposure(exposure: number): void;
  setGrade(tint: { readonly r: number; readonly g: number; readonly b: number }): void;
}

/**
 * Scales the day's grade by how much the sky can colour itself.
 *
 * A captured HDRI backdrop can only be dimmed, so it takes the full tint; the procedural sky reddens
 * on its own from the same clock values, so it takes a fraction. Blending towards white rather than
 * scaling to zero is what keeps "no tint" meaning `1` in every channel.
 */
export function resolveGradeTint(
  state: DaylightState,
  skyMode: 'procedural' | 'hdri',
  strengths: { readonly backdrop: number; readonly procedural: number },
): { r: number; g: number; b: number } {
  const strength = skyMode === 'hdri' ? strengths.backdrop : strengths.procedural;
  return {
    r: 1 + (state.gradeTint.r - 1) * strength,
    g: 1 + (state.gradeTint.g - 1) * strength,
    b: 1 + (state.gradeTint.b - 1) * strength,
  };
}

export class DaylightController {
  readonly #clock: EnvironmentClock;
  #state: DaylightState;

  constructor(clock: EnvironmentClock) {
    this.#clock = clock;
    this.#state = clock.daylight();
  }

  get clock(): EnvironmentClock {
    return this.#clock;
  }

  /** The state applied to the last frame. */
  get state(): DaylightState {
    return this.#state;
  }

  /** Resolves daylight for the clock's current time and returns it, without applying it. */
  resolve(): DaylightState {
    this.#state = this.#clock.daylight();
    return this.#state;
  }

  /**
   * Advances the clock and applies the resulting light to the scene and the engine.
   *
   * The scene is given the state; the engine is given the two values that are renderer settings
   * rather than scene properties — exposure, which is a live uniform in the post graph, and the
   * grade tint, whose strength depends on which backdrop the scene is using.
   */
  update(deltaSeconds: number, scene: DaylightTarget, engine: DaylightEngineTarget): DaylightState {
    this.#clock.update(deltaSeconds);
    const state = this.resolve();
    scene.applyDaylight(state);
    engine.setExposure(state.exposure);
    const { gradeStrengthBackdrop, gradeStrengthProcedural } = this.#clock.config;
    engine.setGrade(
      resolveGradeTint(state, scene.skyMode, {
        backdrop: gradeStrengthBackdrop,
        procedural: gradeStrengthProcedural,
      }),
    );
    return state;
  }
}
