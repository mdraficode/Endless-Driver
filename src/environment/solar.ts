/**
 * Solar position for the world clock.
 *
 * A compact, standard model rather than a full ephemeris: Earth's axial tilt gives the declination,
 * the hour angle gives the sun's rotation about the polar axis, and the result is rotated into the
 * world's basis. It is accurate to well under a degree over a year, which is far more than lighting
 * needs — and being a pure function of (hour, latitude, day) it is fully testable.
 *
 * **World basis.** `+Y` is up, the driving forward axis at heading 0 is `-Z`, so north is `-Z` and
 * east is `+X`. The returned `direction` points *from the world toward the sun*, so it can be scaled
 * by a distance and used directly as a directional light position.
 */

export interface SunPosition {
  /** Angle above the horizon in radians; negative means the sun is below it. */
  readonly elevationRadians: number;
  /** Unit vector from the world toward the sun, in world axes. */
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Earth's axial tilt, used as the amplitude of the declination curve. */
const AXIAL_TILT_DEGREES = 23.44;

/** Days between the March equinox and the day the declination curve crosses zero with this model. */
const EQUINOX_DAY = 81;

/** Solar declination for a day of the year, in degrees. */
export function sunDeclinationDegrees(dayOfYear: number): number {
  // A sine through the equinox: +tilt at the June solstice, -tilt at December's.
  return AXIAL_TILT_DEGREES * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - EQUINOX_DAY));
}

/**
 * Position of the sun for a moment in the day.
 *
 * @param hour          Local solar time in hours; 12 is solar noon.
 * @param latitudeDeg   Observer latitude; positive is north.
 * @param dayOfYear     1–365.
 */
export function solarPosition(hour: number, latitudeDeg: number, dayOfYear: number): SunPosition {
  const latitude = latitudeDeg * DEG_TO_RAD;
  const declination = sunDeclinationDegrees(dayOfYear) * DEG_TO_RAD;
  // Hour angle: 15 degrees of rotation per hour, zero at solar noon, negative before it.
  const hourAngle = (hour - 12) * 15 * DEG_TO_RAD;

  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinDeclination = Math.sin(declination);
  const cosDeclination = Math.cos(declination);
  const sinHourAngle = Math.sin(hourAngle);
  const cosHourAngle = Math.cos(hourAngle);

  // Unit vector in east / north / up components.
  const east = -cosDeclination * sinHourAngle;
  const north = sinDeclination * cosLatitude - cosDeclination * sinLatitude * cosHourAngle;
  const up = sinDeclination * sinLatitude + cosDeclination * cosLatitude * cosHourAngle;

  // Rotate into world axes: east is +X, north is -Z, up is +Y.
  const direction = { x: east, y: up, z: -north };
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const normalized = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };

  return {
    elevationRadians: Math.asin(Math.max(-1, Math.min(1, normalized.y))),
    direction: normalized,
  };
}

/** Kepler-ish helpers exposed for callers that prefer degrees in their diagnostics. */
export function toDegrees(radians: number): number {
  return radians * RAD_TO_DEG;
}
