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
  /**
   * Unit direction towards the sun in *view* space, for the screen-space contact shadows.
   *
   * The march runs in the frame the depth buffer lives in, so the light direction has to be
   * expressed there too; the scene owns both the sun and the camera, so it is the only place
   * that can produce this. Recomputed per frame — the camera moves, so last frame's direction
   * is wrong by exactly the camera's rotation.
   */
  contactSunViewDirection(): { readonly x: number; readonly y: number; readonly z: number };
}

export interface DaylightEngineTarget {
  setExposure(exposure: number): void;
  setGrade(tint: { readonly r: number; readonly g: number; readonly b: number }): void;
  setGodrays(tint: { readonly r: number; readonly g: number; readonly b: number }): void;
  /**
   * The contact-shadow light for the coming frame: view-space direction towards the sun and a
   * 0-1 daylight gate (the engine multiplies it by the configured strength). Zero at night —
   * a directional contact shadow with no directional light is just noise-shaped darkening.
   */
  setContactSun(
    direction: { readonly x: number; readonly y: number; readonly z: number },
    gate: number,
  ): void;
}

/** Packed sRGB hex to linear RGB components (the renderer's working space). */
function hexToLinear(hex: number): { r: number; g: number; b: number } {
  const channel = (byte: number): number => {
    const srgb = byte / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return {
    r: channel((hex >> 16) & 0xff),
    g: channel((hex >> 8) & 0xff),
    b: channel(hex & 0xff),
  };
}

/** Clamped linear ramp: 0 below `edge0`, 1 above `edge1`. */
function ramp(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  return Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
}

/**
 * How strongly the god-ray shafts burn at a given daylight state, as a colour ready for the
 * chain's tint uniform.
 *
 * Shafts are a low-sun phenomenon with a specific shape: nothing below the horizon, a fast
 * arrival as the sun clears it, a broad plateau through the hours when light comes in sideways,
 * and a fade to nothing by the time the sun is high enough that "shafts" would just be glare.
 * Encoding that shape here — rather than as a switch in the tier config — is what lets the
 * effect stay in the high tier's chain all day and only ever *show* when it is plausible.
 */
/**
 * How strongly directional contact shadows may bite at a given daylight state, 0-1.
 *
 * Contact shadows are the sun's shadow at centimetre scale, so they follow the sun: nothing
 * below the horizon, full once the sun is high enough to cast a defined shadow, scaled by how
 * much light there is. Without this gate the march would keep darkening contact lines at
 * midnight by exactly the noon amount, which no ambient term can excuse.
 */
export function resolveContactSunGate(state: DaylightState): number {
  return ramp(-2, 6, state.sunElevationDegrees) * Math.min(1, Math.max(0, state.sunIntensity));
}

export function resolveGodraysTint(state: DaylightState): { r: number; g: number; b: number } {
  const elevation = state.sunElevationDegrees;
  const gate =
    ramp(-2, 3, elevation) * (1 - ramp(14, 30, elevation)) * Math.min(1, state.sunIntensity * 1.4);
  const colour = hexToLinear(state.sunColorHex);
  // The march accumulates up to `maxDensity` everywhere the shadow map does not reach —
  // including the whole sky — so the tint is the only thing standing between "shafts" and
  // a white frame. Measured on the canopy dawn bookmark: 0.9 blew the frame to white and
  // 0.28 still read as a frame-wide glow (A/B MAD 20.8); 0.12 keeps the shadow streaks
  // and drops the glow to a sun-side brightening. It is a measured number, not a round one.
  const strength = gate * 0.12;
  return { r: colour.r * strength, g: colour.g * strength, b: colour.b * strength };
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
    // The god-ray tint and the contact-shadow light are driven from the same state, here,
    // because this is the one place daylight becomes engine uniforms. The god-ray call was
    // lost once (a recovered edit), leaving the effect in the chain with a permanently black
    // tint — present in every diagnostic, visible in none. It is pinned by a test now.
    engine.setGodrays(resolveGodraysTint(state));
    engine.setContactSun(scene.contactSunViewDirection(), resolveContactSunGate(state));
    return state;
  }
}
