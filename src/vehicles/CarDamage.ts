/**
 * Phase 12.3 — persistent per-part damage model for the player car.
 *
 * Pure and deterministic: the same impact sequence always yields the same part
 * states (the acceptance contract). Presentation (decals, lamp blackout, glass)
 * reads these states and updates only when a part's state changes.
 *
 * Impact frame: `sideMeters` is the signed lateral contact position in the car's
 * frame (positive = the vehicle's LEFT, matching the collision helpers'
 * `lateralOffset`); `forwardMeters` is the signed longitudinal position
 * (positive = ahead of the centre). `0, 0` means the contact position is
 * unknown and classification falls back to a frontal default.
 */

export const CAR_DAMAGE_PARTS = [
  'windshield',
  'hood',
  'frontBumper',
  'rearBumper',
  'doorLeft',
  'doorRight',
  'lampFrontLeft',
  'lampFrontRight',
  'lampRearLeft',
  'lampRearRight',
] as const;

export type CarDamagePart = (typeof CAR_DAMAGE_PARTS)[number];

/** Below this relative speed (m/s) a contact is a graze: no accumulated damage. */
export const CAR_DAMAGE_MIN_SPEED_METERS_PER_SECOND = 2;
/** Relative speed (m/s) at which a single impact delivers full per-hit gain. */
export const CAR_DAMAGE_FULL_SPEED_METERS_PER_SECOND = 16;
/** Severity added by a full-speed impact to the primary part of its class. */
export const CAR_DAMAGE_PRIMARY_GAIN = 0.45;
/** Severity (0..1) at which a part transitions cracked/dented → destroyed. */
export const CAR_DAMAGE_DESTROYED_THRESHOLD = 0.5;

export type CarDamagePartState = 'intact' | 'cracked' | 'destroyed';

export interface CarDamagePartRecord {
  /** Accumulated severity 0..1. */
  severity: number;
  state: CarDamagePartState;
}

export type CarDamageMap = Record<CarDamagePart, CarDamagePartRecord>;

export interface CarDamageImpact {
  readonly relativeSpeedMetersPerSecond: number;
  /** Signed lateral contact position (m); positive = left. */
  readonly sideMeters: number;
  /** Signed longitudinal contact position (m); positive = ahead. */
  readonly forwardMeters: number;
}

type ImpactClass = 'front' | 'rear' | 'side-left' | 'side-right';

export function createCarDamage(): CarDamageMap {
  const map = {} as CarDamageMap;
  for (const part of CAR_DAMAGE_PARTS) {
    map[part] = { severity: 0, state: 'intact' };
  }
  return map;
}

export function resetCarDamage(damage: CarDamageMap): void {
  for (const part of CAR_DAMAGE_PARTS) {
    const record = damage[part];
    record.severity = 0;
    record.state = 'intact';
  }
}

/**
 * Classifies a contact: front/rear when the longitudinal position is beyond the
 * cab, side when the lateral position is beyond the body edge; otherwise a
 * frontal default (unknown contacts are most often hits into the front end).
 */
export function classifyCarDamageImpact(impact: CarDamageImpact): ImpactClass {
  if (impact.forwardMeters >= 0.7) return 'front';
  if (impact.forwardMeters <= -0.7) return 'rear';
  if (impact.sideMeters > 0.55) return 'side-left';
  if (impact.sideMeters < -0.55) return 'side-right';
  return 'front';
}

/**
 * Accumulates one impact into the damage map.
 *
 * @returns the parts whose discrete state (intact/cracked/destroyed) changed,
 * so presentation only reacts to real transitions.
 */
export function applyCarDamage(damage: CarDamageMap, impact: CarDamageImpact): CarDamagePart[] {
  if (!Number.isFinite(impact.relativeSpeedMetersPerSecond)) return [];
  if (impact.relativeSpeedMetersPerSecond < CAR_DAMAGE_MIN_SPEED_METERS_PER_SECOND) return [];
  const speedSpan =
    CAR_DAMAGE_FULL_SPEED_METERS_PER_SECOND - CAR_DAMAGE_MIN_SPEED_METERS_PER_SECOND;
  const k =
    Math.min(
      1,
      (impact.relativeSpeedMetersPerSecond - CAR_DAMAGE_MIN_SPEED_METERS_PER_SECOND) / speedSpan,
    ) * CAR_DAMAGE_PRIMARY_GAIN;
  if (k <= 0) return [];

  const cls = classifyCarDamageImpact(impact);
  const targets: Array<[CarDamagePart, number]> =
    cls === 'front'
      ? [
          ['frontBumper', 1],
          ['hood', 0.8],
          // A glancing front hit biases the near-side lamp; a centred hit hits both.
          ['lampFrontLeft', impact.sideMeters < -0.2 ? 1 : 0.5],
          ['lampFrontRight', impact.sideMeters > 0.2 ? 1 : 0.5],
          // Only a hard, centred frontal strike shatters the glass.
          [
            'windshield',
            impact.relativeSpeedMetersPerSecond >= 10 && Math.abs(impact.sideMeters) < 0.35
              ? 0.6
              : 0,
          ],
        ]
      : cls === 'rear'
        ? [
            ['rearBumper', 1],
            ['lampRearLeft', 0.4],
            ['lampRearRight', 0.4],
          ]
        : cls === 'side-left'
          ? [
              ['doorLeft', 1],
              ['lampFrontLeft', 0.4],
              ['lampRearLeft', 0.4],
              ['windshield', Math.abs(impact.forwardMeters) < 0.7 ? 0.35 : 0],
            ]
          : [
              ['doorRight', 1],
              ['lampFrontRight', 0.4],
              ['lampRearRight', 0.4],
              ['windshield', Math.abs(impact.forwardMeters) < 0.7 ? 0.35 : 0],
            ];

  const changed: CarDamagePart[] = [];
  for (const [part, share] of targets) {
    if (share <= 0) continue;
    const record = damage[part];
    const before = record.state;
    record.severity = Math.min(1, record.severity + k * share);
    record.state =
      record.severity >= CAR_DAMAGE_DESTROYED_THRESHOLD
        ? 'destroyed'
        : record.severity > 0
          ? 'cracked'
          : 'intact';
    if (record.state !== before) changed.push(part);
  }
  return changed;
}
