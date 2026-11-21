import { VEHICLE_CONFIG, type VehicleConfig } from '../config/vehicle';
import type { PlayerCarModel } from '../config/game-preferences';
import { BLACKLIST_RIVALS } from '../config/most-wanted';
import type { CarBody, CarSpec, CarStats } from './types';

/**
 * Phase 14 — the drivable-car collection.
 *
 * Every car is a distinct {@link VehicleConfig} derived from the single tuned base
 * (`VEHICLE_CONFIG`) by a body archetype (a physically sensible set of deltas), so different cars
 * actually drive differently. The 15 Blacklist cars reuse the rival `pinkSlipCar` ids
 * (`mw-car-<rank>`), so busting a rival unlocks exactly the car their Pink Slip names.
 */

/** Section-level override shape (only the sections a body archetype would touch). */
interface BodyOverrides {
  readonly chassis?: Partial<VehicleConfig['chassis']>;
  readonly wheels?: Partial<VehicleConfig['wheels']>;
  readonly tires?: Partial<VehicleConfig['tires']>;
  readonly drivetrain?: Partial<VehicleConfig['drivetrain']>;
  readonly brakes?: Partial<VehicleConfig['brakes']>;
  readonly stability?: Partial<VehicleConfig['stability']>;
  readonly steering?: Partial<VehicleConfig['steering']>;
  readonly aero?: Partial<VehicleConfig['aero']>;
}

/** Deep-merge a section delta onto a base config (default: the stock config). Pure; never mutates the base. */
function variant(overrides: BodyOverrides, base: VehicleConfig = VEHICLE_CONFIG): VehicleConfig {
  const d = overrides.drivetrain ?? {};
  return {
    ...base,
    chassis: { ...base.chassis, ...(overrides.chassis ?? {}) },
    wheels: { ...base.wheels, ...(overrides.wheels ?? {}) },
    tires: { ...base.tires, ...(overrides.tires ?? {}) },
    drivetrain: {
      ...base.drivetrain,
      ...d,
      torqueCurve: d.torqueCurve ?? base.drivetrain.torqueCurve,
    },
    brakes: { ...base.brakes, ...(overrides.brakes ?? {}) },
    stability: { ...base.stability, ...(overrides.stability ?? {}) },
    steering: { ...base.steering, ...(overrides.steering ?? {}) },
    aero: { ...base.aero, ...(overrides.aero ?? {}) },
    spawn: { ...base.spawn },
  };
}

/**
 * The body archetypes. `sport` is the tuned base itself (the hero roadster). Each other body
 * trades the base's balance for a clear character: muscle = low-end torque + low grip, supercar =
 * top end + grip + aero, sedan = light + stable + tame, suv = heavy + planted + underpowered.
 */
const BODIES: Readonly<Record<CarBody, BodyOverrides>> = {
  sport: {},
  muscle: {
    chassis: { mass: 1480 },
    tires: { frictionCoefficient: 1.02, lateralStiffness: 7.5 },
    drivetrain: {
      torqueCurve: [
        [1000, 360],
        [1800, 470],
        [2600, 505],
        [3400, 470],
        [4500, 400],
        [5800, 300],
        [6800, 210],
        [7200, 110],
      ],
    },
    brakes: { frontForce: 3000, rearForce: 2500 },
    stability: { yawResponsePerSecond: 3.4 },
    steering: { gripBudgetFactor: 1.05 },
    aero: { downforceCoefficient: 1.6, dragCoefficient: 1.15 },
  },
  supercar: {
    chassis: { mass: 1230, centerOfMass: [0, -0.12, 0] },
    tires: { frictionCoefficient: 1.38, lateralStiffness: 10.4 },
    drivetrain: {
      maxRpm: 8500,
      shiftUpRpm: 7800,
      torqueCurve: [
        [1200, 250],
        [2400, 380],
        [3600, 470],
        [4800, 520],
        [6200, 500],
        [7400, 430],
        [8500, 260],
      ],
    },
    brakes: { frontForce: 4200, rearForce: 2700 },
    steering: { maxAngle: 0.5, gripBudgetFactor: 1.32 },
    aero: { downforceCoefficient: 3.4, dragCoefficient: 1.05 },
  },
  sedan: {
    chassis: { mass: 1320 },
    tires: { frictionCoefficient: 1.16, lateralStiffness: 8.8 },
    drivetrain: {
      torqueCurve: [
        [1000, 180],
        [2000, 260],
        [3000, 300],
        [4200, 300],
        [5200, 270],
        [6200, 210],
        [7200, 100],
      ],
    },
    stability: { yawResponsePerSecond: 5.0 },
    steering: { gripBudgetFactor: 1.15 },
    aero: { downforceCoefficient: 2.0, dragCoefficient: 1.2 },
  },
  suv: {
    chassis: { mass: 1850, centerOfMass: [0, 0.18, 0] },
    tires: { frictionCoefficient: 1.0, lateralStiffness: 7.0 },
    drivetrain: {
      drivenWheels: 'all',
      torqueCurve: [
        [900, 320],
        [1600, 430],
        [2400, 470],
        [3200, 460],
        [4200, 400],
        [5400, 310],
        [6600, 200],
        [7200, 100],
      ],
    },
    brakes: { frontForce: 3800, rearForce: 3000 },
    stability: { yawResponsePerSecond: 5.5 },
    steering: { gripBudgetFactor: 0.95, maxAngle: 0.5 },
    aero: { downforceCoefficient: 1.2, dragCoefficient: 1.4 },
  },
};

/** Resolve a body archetype to a concrete config. */
export function bodyConfig(body: CarBody): VehicleConfig {
  return variant(BODIES[body] ?? {});
}

/**
 * Phase 16 — a non-sport body must present its authored silhouette (the in-house visual),
 * never the generic sport-coupe GLB: a coupe shape on an SUV or sedan reads as the wrong car.
 * Sport cars keep their assigned model (the premium GLB where one was chosen).
 */
function modelForBody(body: CarBody, model: PlayerCarModel): PlayerCarModel {
  return body === 'sport' ? model : 'kaminari-gt-roadster';
}

/** Scale a drivetrain's torque curve by a factor (used to differentiate Blacklist cars by rank). */
function scaledTorque(
  curve: readonly (readonly [number, number])[],
  factor: number,
): readonly (readonly [number, number])[] {
  return curve.map(([rpm, torque]) => [rpm, Math.round(torque * factor)] as const);
}

/**
 * A Blacklist car for a rank: the harder the rival (lower rank), the hotter the car — more power,
 * more grip, more aero. Rank 15 (first) is a mild sport; rank 1 (the boss) is a near-supercar.
 */
function blacklistCar(rank: number, name: string, body: CarBody, model: PlayerCarModel): CarSpec {
  const f = (15 - rank) / 14; // 0 (easiest) .. 1 (boss)
  const base = bodyConfig(body);
  // Scale grip/power/aero ON TOP of the body's own config so the body's identity (driven
  // wheels, rev limit, mass, brakes) is preserved — not clobbered by the stock base.
  const config = variant(
    {
      tires: { frictionCoefficient: base.tires.frictionCoefficient * (1 + 0.12 * f) },
      drivetrain: { torqueCurve: scaledTorque(base.drivetrain.torqueCurve, 1 + 0.15 * f) },
      aero: { downforceCoefficient: base.aero.downforceCoefficient * (1 + 0.2 * f) },
    },
    base,
  );
  const stats: CarStats = {
    topSpeed: Math.round(190 + 120 * f),
    acceleration: Math.round((6 + 4 * f) * 10) / 10,
    handling: Math.round((5.5 + 4 * f) * 10) / 10,
    braking: Math.round((6 + 3 * f) * 10) / 10,
  };
  return {
    id: `mw-car-${String(rank).padStart(2, '0')}`,
    name,
    body,
    model,
    source: 'blacklist',
    blacklistRank: rank,
    stats,
    config,
  };
}

interface StarterCar {
  readonly id: string;
  readonly name: string;
  readonly body: CarBody;
  readonly model: PlayerCarModel;
  readonly stats: CarStats;
}

/** The cars you own from the start. */
const STARTERS: readonly StarterCar[] = [
  {
    id: 'kaminari-gt',
    name: 'Kaminari GT',
    body: 'sport',
    model: 'kaminari-gt-roadster',
    stats: { topSpeed: 262, acceleration: 7.5, handling: 7.5, braking: 7.5 },
  },
  {
    id: 'falcon-s',
    name: 'Aohara Falcon S',
    body: 'supercar',
    model: 'generic-sport-coupe',
    stats: { topSpeed: 305, acceleration: 8.8, handling: 8.2, braking: 8.0 },
  },
  {
    id: 'blackwood-m8',
    name: 'Blackwood M-8',
    body: 'muscle',
    model: 'generic-sport-coupe',
    stats: { topSpeed: 250, acceleration: 8.4, handling: 5.5, braking: 6.0 },
  },
  {
    id: 'meridian-4door',
    name: 'Meridian 4-Door',
    body: 'sedan',
    model: 'generic-sport-coupe',
    stats: { topSpeed: 215, acceleration: 5.5, handling: 6.5, braking: 7.0 },
  },
];

/** Which body each Blacklist rank drives, by difficulty band. */
const BLACKLIST_BODIES: ReadonlyArray<readonly [number, CarBody, PlayerCarModel]> = [
  [15, 'sedan', 'generic-sport-coupe'],
  [14, 'sport', 'generic-sport-coupe'],
  [13, 'sport', 'generic-sport-coupe'],
  [12, 'muscle', 'generic-sport-coupe'],
  [11, 'sport', 'generic-sport-coupe'],
  [10, 'muscle', 'generic-sport-coupe'],
  [9, 'supercar', 'generic-sport-coupe'],
  [8, 'sport', 'generic-sport-coupe'],
  [7, 'suv', 'generic-sport-coupe'],
  [6, 'supercar', 'generic-sport-coupe'],
  [5, 'muscle', 'generic-sport-coupe'],
  [4, 'supercar', 'generic-sport-coupe'],
  [3, 'suv', 'generic-sport-coupe'],
  [2, 'supercar', 'generic-sport-coupe'],
  [1, 'supercar', 'kaminari-gt-roadster'],
];

/** The full roster: the starter cars, then the 15 Blacklist cars (rank 15 → 1). */
export const CAR_ROSTER: readonly CarSpec[] = [
  ...STARTERS.map((s) => ({
    ...s,
    source: 'starter' as const,
    model: modelForBody(s.body, s.model),
    config: bodyConfig(s.body),
  })),
  ...BLACKLIST_BODIES.map(([rank, body, model]) => {
    const rival = BLACKLIST_RIVALS.find((r) => r.rank === rank);
    return blacklistCar(
      rank,
      `${rival?.name ?? `Rank ${rank}`} ${bodyName(body)}`,
      body,
      modelForBody(body, model),
    );
  }),
];

function bodyName(body: CarBody): string {
  switch (body) {
    case 'muscle':
      return 'M-8';
    case 'supercar':
      return 'Vanta';
    case 'sedan':
      return 'Meridian';
    case 'suv':
      return 'Terra';
    case 'sport':
    default:
      return 'GT';
  }
}

/** The car you start the career in. */
export const DEFAULT_CAR_ID = 'kaminari-gt';

/** A car's spec by id, or null. */
export function carById(id: string): CarSpec | null {
  return CAR_ROSTER.find((car) => car.id === id) ?? null;
}

/** The ids owned from the start (before any Blacklist wins). */
export const STARTER_CAR_IDS: readonly string[] = STARTERS.map((s) => s.id);

/** The roster of Blacklist cars in rank order (15 → 1). */
export const BLACKLIST_CARS: readonly CarSpec[] = CAR_ROSTER.filter(
  (car) => car.source === 'blacklist',
);
