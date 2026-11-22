import type { VehicleConfig } from '../config/vehicle';
import type { PlayerCarModel } from '../config/game-preferences';

/** Where a car comes from: owned from the start, or earned by busting a Blacklist rival. */
export type CarSource = 'starter' | 'blacklist';

/** The body archetype — a distinct handling character derived from the base vehicle config. */
export type CarBody = 'sport' | 'muscle' | 'supercar' | 'sedan' | 'suv';

/**
 * Display stats for the garage. `topSpeed` is km/h; the rest are 0–10 scales. These are the
 * player-facing numbers; the authoritative handling is in {@link CarSpec.config}.
 */
export interface CarStats {
  readonly topSpeed: number;
  readonly acceleration: number;
  readonly handling: number;
  readonly braking: number;
}

/** A single drivable car: its identity, body character, visual model, and resolved physics. */
export interface CarSpec {
  readonly id: string;
  readonly name: string;
  readonly body: CarBody;
  readonly model: PlayerCarModel;
  readonly source: CarSource;
  /** For Blacklist cars: the rival rank whose bust unlocks this car (id is `mw-car-<rank>`). */
  readonly blacklistRank?: number;
  /** Phase 16.2 — the car's paint (a hex color); distinct per car so won cars don't look identical. */
  readonly paint: number;
  readonly stats: CarStats;
  readonly config: VehicleConfig;
}
