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

  /**
   * Time-of-day grade: a linear-RGB multiplier for the whole frame, per phase.
   *
   * These are not lighting values — they are a creative grade, and they exist to cover a specific
   * hole. The tier-C backdrop is a captured daylight HDRI, and unlike the procedural sky it cannot
   * redden as the sun drops; it can only be dimmed. Left alone, dawn reads as a slightly dim noon
   * with a bright sky. Multiplying the frame warms the captured sky and the shadowed sides of the
   * world together, which is what a real sunrise does to a photograph of one.
   *
   * Values below 1 darken their channel, above 1 brighten it. Day is neutral: nothing is graded when
   * the sun is up, so the grade never fights the physical lighting.
   */
  readonly gradeDayTint: readonly [number, number, number];
  readonly gradeGoldenTint: readonly [number, number, number];
  readonly gradeNightTint: readonly [number, number, number];

  /**
   * Where the grade changes hands, in degrees of sun elevation.
   *
   * The grade keys on elevation directly instead of reusing the lighting's `dayFactor`, because a
   * golden hour is a band of sun *heights*, not a fraction of full daylight: hanging it off
   * `dayFactor` faded the warmth out within half an hour of sunrise, which is not how a morning
   * looks. Golden is at full strength from `gradeNightElevation` up to `gradeGoldenElevation`, then
   * fades to nothing by `gradeDayElevation`.
   */
  readonly gradeGoldenElevation: number;
  readonly gradeDayElevation: number;
  readonly gradeNightElevation: number;

  /**
   * How much of the tint survives, per sky mode. Full strength under a captured backdrop, which is
   * the case the grade exists for; a third under the procedural sky, which already colours itself
   * with the same clock values, so the grade is only asked for a little extra cohesion.
   */
  readonly gradeStrengthBackdrop: number;
  readonly gradeStrengthProcedural: number;

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

  gradeDayTint: [1, 1, 1],
  // Golden and a touch darker: warm the light, and let the frame lose a little brightness so dawn
  // still reads as an edge of the day rather than as an alternative noon.
  gradeGoldenTint: [1.06, 0.93, 0.78],
  // Moonlight is blue and dim. Kept mild: the scene must stay legible, not stylised.
  gradeNightTint: [0.88, 0.95, 1.14],
  // Full warmth up to ~08:40 in the morning and from ~16:50 in the evening at this latitude and
  // date, gone by a sun height of 30°, moonlight from civil twilight onwards.
  gradeGoldenElevation: 8,
  gradeDayElevation: 30,
  gradeNightElevation: -8,
  gradeStrengthBackdrop: 1,
  gradeStrengthProcedural: 0.35,

  turbidityNight: 1.6,
  turbidityHorizon: 4.2,
  turbidityDay: 2.6,
  rayleighNight: 0.4,
  rayleighHorizon: 2.6,
  rayleighDay: 1.6,
};
