import { DAYLIGHT_CONFIG, type DaylightConfig } from '../config/daylight';
import { solarPosition, toDegrees, type SunPosition } from './solar';

/**
 * World clock and the daylight curves it drives.
 *
 * Two separate jobs, kept separate on purpose:
 *
 * - `EnvironmentClock` owns *time* — it wraps hours, advances them at the configured rate, and asks
 *   `solar.ts` where the sun is. It knows nothing about lighting.
 * - `resolveDaylight()` turns a sun position into every value the renderer needs — light colour and
 *   intensity, ambient, environment intensity, exposure, fog tint, atmospheric scattering, sun-disc
 *   visibility. It is a pure function, so the whole look of the sky at 06:20 is testable in Node.
 *
 * The scene never reads the clock directly: the application resolves a `DaylightState` once per
 * frame and hands it to the scene and the engine, so there is a single place where time becomes
 * light.
 */

export interface EnvironmentClockOptions {
  readonly config?: DaylightConfig;
  /** Overrides the configured start hour (used by the `?time=` debug switch). */
  readonly startHour?: number;
}

export interface DaylightState {
  /** Unit vector toward the sun, world axes. */
  readonly sunDirection: { readonly x: number; readonly y: number; readonly z: number };
  /** Sun elevation in degrees, for diagnostics. */
  readonly sunElevationDegrees: number;
  /** True once the sun is far enough below the horizon that the scene is night-lit. */
  readonly isNight: boolean;

  readonly sunColorHex: number;
  readonly sunIntensity: number;
  readonly ambientColorHex: number;
  readonly ambientIntensity: number;
  readonly environmentIntensity: number;
  readonly exposure: number;
  readonly fogColorHex: number;

  readonly turbidity: number;
  readonly rayleigh: number;
  readonly showSunDisc: boolean;

  /**
   * Linear-RGB multiplier for the time-of-day grade, resolved from the same three phases as the
   * lighting. The *strength* is not here: how much of the tint survives depends on whether the sky
   * is a captured backdrop or a procedural one, which is a property of the scene, not of the sun.
   */
  readonly gradeTint: { readonly r: number; readonly g: number; readonly b: number };
}

const HOURS_PER_DAY = 24;

/** Clamped linear interpolation. */
function mix(from: number, to: number, t: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, t));
}

/** Smooth Hermite interpolation between two edges, matching the GLSL `smoothstep`. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Per-channel interpolation between two packed RGB colours. */
function mixColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;

  const r = Math.round(mix(fromR, toR, clamped));
  const g = Math.round(mix(fromG, toG, clamped));
  const b = Math.round(mix(fromB, toB, clamped));
  return (r << 16) | (g << 8) | b;
}

/**
 * Three-phase interpolation.
 *
 * Every curve in this file is described the same way: a value at the low sun, at the horizon, and
 * with the sun high. Splitting at the horizon rather than at night is what keeps dawn and dusk from
 * looking like a dimmed noon — the warm phase is a real segment of the curve, not a blend artefact.
 */
function phased(
  night: number,
  horizon: number,
  day: number,
  dayFactor: number,
  horizonFactor: number,
): number {
  // `horizonFactor` is 1 at the horizon and falls away in both directions.
  return mix(mix(night, horizon, horizonFactor), day, dayFactor);
}

/**
 * The same three-phase blend for packed RGB colours.
 *
 * Colours must go through `mixColor`, never through `phased`: interpolating the packed integer as a
 * single number lets red's fraction carry into green and blue, which both darkens the result and
 * returns a value that is not a byte-packed colour at all.
 */
function phasedColor(
  night: number,
  horizon: number,
  day: number,
  dayFactor: number,
  horizonFactor: number,
): number {
  return mixColor(mixColor(night, horizon, horizonFactor), day, dayFactor);
}

/**
 * The time-of-day grade, as a linear-RGB multiplier.
 *
 * Colours and tints are represented differently on purpose: a colour fits in 24 bits, but a grade
 * multiplier is not a colour — it can be above 1, it is never displayed, and it is consumed as three
 * floats. So tints live as triples in the config and are blended per component.
 *
 * The phases are weighted by sun elevation rather than by `dayFactor`: a golden hour is a band of
 * sun heights, so the tint stays on until the sun is well up and cannot vanish the moment it rises.
 * The three weights always sum to one, and the phase boundaries are chosen so night and day never
 * overlap — a frame is never asked to be moonlit and golden at the same time.
 */
function resolveGradeTint(
  config: DaylightConfig,
  elevationDegrees: number,
): { r: number; g: number; b: number } {
  const night = 1 - smoothstep(config.gradeNightElevation, 0, elevationDegrees);
  const day = smoothstep(config.gradeGoldenElevation, config.gradeDayElevation, elevationDegrees);
  const golden = Math.max(0, 1 - night - day);

  const [nightR, nightG, nightB] = config.gradeNightTint;
  const [goldenR, goldenG, goldenB] = config.gradeGoldenTint;
  const [dayR, dayG, dayB] = config.gradeDayTint;

  return {
    r: day * dayR + golden * goldenR + night * nightR,
    g: day * dayG + golden * goldenG + night * nightG,
    b: day * dayB + golden * goldenB + night * nightB,
  };
}

/** Time-of-day state: wraps hours, advances them, and reports the sun's position. */
export class EnvironmentClock {
  readonly #config: DaylightConfig;
  #hour: number;

  constructor(options: EnvironmentClockOptions = {}) {
    this.#config = options.config ?? DAYLIGHT_CONFIG;
    this.#hour = wrapHour(options.startHour ?? this.#config.startHour);
  }

  get config(): DaylightConfig {
    return this.#config;
  }

  /** Current time in hours, 0–24, fractional. */
  get hour(): number {
    return this.#hour;
  }

  /** `HH:MM`, for the HUD. */
  get label(): string {
    const hours = Math.floor(this.#hour);
    const minutes = Math.floor((this.#hour - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /** Sets the time of day, wrapping into `[0, 24)`. */
  setHour(hour: number): void {
    this.#hour = wrapHour(hour);
  }

  /** Advances the clock. Does nothing unless `autoAdvance` is enabled. */
  update(deltaSeconds: number): void {
    if (!this.#config.autoAdvance || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    this.#hour = wrapHour(this.#hour + deltaSeconds / this.#config.secondsPerHour);
  }

  /** Sun position for the current time. */
  sunPosition(): SunPosition {
    return solarPosition(this.#hour, this.#config.latitudeDegrees, this.#config.dayOfYear);
  }

  /** Everything the renderer needs for the current time. */
  daylight(): DaylightState {
    return resolveDaylight(this.sunPosition(), this.#config);
  }
}

/** Wraps an hour into `[0, 24)`, so `25` becomes `1` and `-1` becomes `23`. */
export function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) {
    return 0;
  }
  return ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

/**
 * Turns a sun position into lighting values.
 *
 * Two factors drive everything:
 *
 * - `dayFactor` — 0 at night, 1 once the sun is properly up. Used for the broad day/night split.
 * - `horizonFactor` — 1 when the sun is near the horizon, 0 well above or below it. Used to give
 *   dawn and dusk their own warm, hazy phase instead of a linear fade between night and noon.
 */
export function resolveDaylight(sun: SunPosition, config: DaylightConfig): DaylightState {
  const elevationDegrees = toDegrees(sun.elevationRadians);

  const dayFactor = smoothstep(
    config.sunCutoffElevation,
    config.fullSunElevation,
    elevationDegrees,
  );
  // Peaks at the configured horizon elevation and falls off over the twilight band either side.
  const twilightWidth = Math.max(1, config.fullSunElevation - config.sunCutoffElevation);
  const horizonFactor = Math.max(
    0,
    1 - Math.min(1, Math.abs(elevationDegrees - config.horizonElevation) / twilightWidth),
  );

  // The sun light fades to nothing through twilight; below that only the ambient and environment
  // light survives, which is what makes dusk read as dusk rather than as a dimmed noon.
  const sunIntensity = dayFactor;
  const fogColorHex = mixColor(config.fogColorNight, config.ambientColorDay, dayFactor);

  return {
    sunDirection: sun.direction,
    sunElevationDegrees: elevationDegrees,
    isNight: elevationDegrees < config.nightElevation,

    sunColorHex: mixColor(config.sunColorHorizon, config.sunColorDay, dayFactor),
    sunIntensity,

    ambientColorHex: phasedColor(
      config.ambientColorNight,
      config.ambientColorHorizon,
      config.ambientColorDay,
      dayFactor,
      horizonFactor,
    ),
    ambientIntensity: mix(config.ambientIntensityNight, config.ambientIntensityDay, dayFactor),
    environmentIntensity: mix(
      config.environmentIntensityNight,
      config.environmentIntensityDay,
      dayFactor,
    ),
    exposure: mix(config.exposureNight, config.exposureDay, dayFactor),
    fogColorHex,

    turbidity: phased(
      config.turbidityNight,
      config.turbidityHorizon,
      config.turbidityDay,
      dayFactor,
      horizonFactor,
    ),
    rayleigh: phased(
      config.rayleighNight,
      config.rayleighHorizon,
      config.rayleighDay,
      dayFactor,
      horizonFactor,
    ),
    showSunDisc: elevationDegrees > config.sunDiscElevation,

    gradeTint: resolveGradeTint(config, elevationDegrees),
  };
}
