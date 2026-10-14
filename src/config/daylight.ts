/**
 * Time-of-day configuration: where the world is, when it starts, and the curves that turn a sun
 * elevation into lighting values.
 *
 * Every number here is a look-development value, not physics. They live in `config/` so a lighting
 * pass can be tuned without touching systems, and so the curves can be asserted in tests.
 *
 * The region is the fictional "Hinode Prefecture" (`docs/VISUAL_TARGET.md` §5), set in rural Japan;
 * the latitude is representative of that part of the country, and the default date is late
 * September — a sun that stays below ~55° all day, which gives long, readable shadows instead of the
 * flat overhead light of midsummer.
 */
export interface DaylightConfig {
  /** Latitude used for the solar model, in degrees north. */
  readonly latitudeDegrees: number;
  /** 1–365; controls the sun's declination. Late September by default. */
  readonly dayOfYear: number;
  /** Clock hour at start-up, in local solar time. 0–24, fractional allowed. */
  readonly startHour: number;
  /** Whether the clock advances on its own. Off by default so a run is reproducible. */
  readonly autoAdvance: boolean;
  /** How fast time runs when it advances: one in-game hour per this many real seconds. */
  readonly secondsPerHour: number;

  /** Distance the sun light is placed at, in metres. Direction is what matters; distance sets the range. */
  readonly sunDistance: number;
  /** Elevation (degrees) at which the sun is at full strength and colour. */
  readonly fullSunElevation: number;
  /** Elevation (degrees) at which the sun has fully faded out (twilight end). */
  readonly sunCutoffElevation: number;
  /** Elevation (degrees) below which the scene counts as night. */
  readonly nightElevation: number;
  /** Elevation (degrees) around which the light is at its warmest. */
  readonly horizonElevation: number;

  /** Sun disc visibility cut-off: below this elevation the Preetham disc is switched off. */
  readonly sunDiscElevation: number;

  /** Light colours at the three phases. */
  readonly sunColorHorizon: number;
  readonly sunColorDay: number;
  readonly ambientColorNight: number;
  readonly ambientColorHorizon: number;
  readonly ambientColorDay: number;
  readonly fogColorNight: number;

  /** Multipliers applied to the baseline lighting config, per phase. */
  readonly ambientIntensityNight: number;
  readonly ambientIntensityDay: number;
  readonly environmentIntensityNight: number;
  readonly environmentIntensityDay: number;

  /** Exposure at the extremes; interpolated between so night remains readable. */
  readonly exposureNight: number;
  readonly exposureDay: number;

  /** Atmospheric scattering over the day. */
  readonly turbidityNight: number;
  readonly turbidityHorizon: number;
  readonly turbidityDay: number;
  readonly rayleighNight: number;
  readonly rayleighHorizon: number;
  readonly rayleighDay: number;
}

export const DAYLIGHT_CONFIG: DaylightConfig = {
  latitudeDegrees: 36,
  dayOfYear: 264,
  startHour: 9.5,
  autoAdvance: false,
  secondsPerHour: 120,

  sunDistance: 130,
  fullSunElevation: 12,
  sunCutoffElevation: -4,
  nightElevation: -6,
  horizonElevation: 1,
  sunDiscElevation: -2,

  sunColorHorizon: 0xff8a3d,
  sunColorDay: 0xfff2dd,
  ambientColorNight: 0x1c2a44,
  ambientColorHorizon: 0x8a7f8f,
  ambientColorDay: 0xa8c2de,
  fogColorNight: 0x0b1220,

  ambientIntensityNight: 0.18,
  ambientIntensityDay: 1,
  environmentIntensityNight: 0.12,
  environmentIntensityDay: 1,

  exposureNight: 1.45,
  exposureDay: 1,

  turbidityNight: 1.6,
  turbidityHorizon: 4.2,
  turbidityDay: 2.6,
  rayleighNight: 0.4,
  rayleighHorizon: 2.6,
  rayleighDay: 1.6,
};
