import { describe, expect, it } from 'vitest';

import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { BLACKLIST_RIVALS } from '../../src/config/most-wanted';
import {
  BLACKLIST_CARS,
  CAR_ROSTER,
  DEFAULT_CAR_ID,
  STARTER_CAR_IDS,
  bodyConfig,
  carById,
} from '../../src/cars/carRoster';
import type { CarBody } from '../../src/cars/types';

describe('Phase 14 — car roster', () => {
  it('has four starters and fifteen Blacklist cars (19 total)', () => {
    expect(STARTER_CAR_IDS).toHaveLength(4);
    expect(BLACKLIST_CARS).toHaveLength(15);
    expect(CAR_ROSTER).toHaveLength(19);
  });

  it("every Blacklist car id matches its rival's reserved pinkSlipCar (mw-car-<rank>)", () => {
    for (const car of BLACKLIST_CARS) {
      const rank = car.blacklistRank!;
      const expected = `mw-car-${String(rank).padStart(2, '0')}`;
      expect(car.id).toBe(expected);
      const rival = BLACKLIST_RIVALS.find((r) => r.rank === rank);
      expect(rival).not.toBeNull();
      // The car name references the rival who guards it.
      expect(car.name).toContain(rival!.name);
    }
  });

  it('the harder the rival, the hotter the car (rank 1 out-classes rank 15)', () => {
    const boss = BLACKLIST_CARS.find((c) => c.blacklistRank === 1)!;
    const rookie = BLACKLIST_CARS.find((c) => c.blacklistRank === 15)!;
    expect(boss.stats.topSpeed).toBeGreaterThan(rookie.stats.topSpeed);
    expect(boss.stats.acceleration).toBeGreaterThan(rookie.stats.acceleration);
  });

  it('body archetypes produce distinct, physically different configs', () => {
    const bodies: readonly CarBody[] = ['sport', 'muscle', 'supercar', 'sedan', 'suv'];
    const configs = bodies.map((b) => bodyConfig(b));
    // The mass actually varies between bodies (heavy SUV, light-ish supercar).
    const masses = configs.map((c) => c.chassis.mass);
    expect(new Set(masses).size).toBeGreaterThan(3);
    // The supercar revs higher; the SUV is four-wheel drive.
    expect(bodyConfig('supercar').drivetrain.maxRpm).toBe(8500);
    expect(bodyConfig('suv').drivetrain.drivenWheels).toBe('all');
    // Grip genuinely differs: muscle tires grip less than the sport base.
    expect(bodyConfig('muscle').tires.frictionCoefficient).toBeLessThan(
      bodyConfig('sport').tires.frictionCoefficient,
    );
  });

  it('resolving a body never mutates the base VEHICLE_CONFIG', () => {
    for (const b of ['sport', 'muscle', 'supercar', 'sedan', 'suv'] as const) {
      bodyConfig(b);
    }
    expect(VEHICLE_CONFIG.chassis.mass).toBe(1200);
    expect(VEHICLE_CONFIG.drivetrain.maxRpm).toBe(7200);
    expect(VEHICLE_CONFIG.tires.frictionCoefficient).toBe(1.25);
  });

  it('the default car is an owned starter and resolvable by id', () => {
    expect(STARTER_CAR_IDS).toContain(DEFAULT_CAR_ID);
    expect(carById(DEFAULT_CAR_ID)!.source).toBe('starter');
    expect(carById('does-not-exist')).toBeNull();
  });

  it('every roster car has a resolvable config and in-range display stats', () => {
    for (const car of CAR_ROSTER) {
      expect(car.config.chassis.mass).toBeGreaterThan(0);
      expect(car.config.tires.frictionCoefficient).toBeGreaterThan(0);
      expect(car.stats.topSpeed).toBeGreaterThanOrEqual(0);
      expect(car.stats.acceleration).toBeLessThanOrEqual(10);
      expect(car.stats.handling).toBeLessThanOrEqual(10);
      expect(car.stats.braking).toBeLessThanOrEqual(10);
    }
  });

  it('non-sport cars present their authored silhouette, not the sport-coupe GLB (Phase 16)', () => {
    for (const car of CAR_ROSTER) {
      if (car.body === 'sport') continue;
      expect(car.model).toBe('kaminari-gt-roadster');
    }
    // Every body archetype is genuinely drivable by the player.
    const seen = new Set(CAR_ROSTER.map((c) => c.body));
    for (const body of ['sport', 'muscle', 'supercar', 'sedan', 'suv'] as const) {
      expect(seen.has(body)).toBe(true);
    }
  });
});
