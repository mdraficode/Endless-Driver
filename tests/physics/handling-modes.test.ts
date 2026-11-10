import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyCarTuning,
  DEFAULT_CAR_TUNING,
  VEHICLE_CONFIG,
  type CarTuning,
  type HandlingMode,
  type VehicleConfig,
} from '../../src/config/vehicle';
import { WORLD_CONFIG, type WorldConfig } from '../../src/config/world';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';
import { NEUTRAL_ACTIONS, type VehicleActions } from '../../src/vehicles/types';
import { Car } from '../../src/vehicles/Car';

/**
 * Phase 12.1 — handling modes and tuning, measured on a flat arena with the real
 * vehicle stack. Everything is deterministic (fixed step, no randomness): the same
 * inputs always produce the same telemetry, so the mode/tuning spread assertions
 * are stable regressions, not vibes.
 *
 * The suite measures three things:
 * - cornering: peak lateral acceleration at sustained full lock (skidpad proxy);
 * - recovery: how quickly the car settles after an induced oversteer (the
 *   stability electronics' job; arcade must recover fastest);
 * - tuning: that the sliders actually move the physics (power, grip, live swap).
 */

const FIXED_STEP = 1 / 60;
const OPEN_WORLD: WorldConfig = {
  ...WORLD_CONFIG,
  obstacles: [],
  ground: { ...WORLD_CONFIG.ground, size: 20000 },
};

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

function intent(overrides: Partial<VehicleActions> = {}): VehicleActions {
  return { ...NEUTRAL_ACTIONS, ...overrides };
}

function makeCar(config: VehicleConfig): {
  physics: PhysicsWorld;
  car: Car;
  step: (actions?: VehicleActions) => void;
  dispose: () => void;
} {
  const physics = new PhysicsWorld({ rapier, worldConfig: OPEN_WORLD });
  const car = new Car({
    rapier,
    physics,
    config,
    spawnPosition: [0, 1, 0],
    spawnYaw: 0,
  });
  const step = (actions: VehicleActions = NEUTRAL_ACTIONS): void => {
    car.setActions(actions);
    physics.update(FIXED_STEP);
  };
  return {
    physics,
    car,
    step,
    dispose: () => {
      physics.dispose();
    },
  };
}

interface SteadyState {
  /** Mean |lateral acceleration| over the final 1.5 s (the true steady turn). */
  readonly sustainedG: number;
  /** Speed when the run ends: a car holding the line keeps cornering at speed. */
  readonly endSpeedMps: number;
  /** Peak slip angle during the run (a clean turn stays near zero). */
  readonly maxSlipDeg: number;
}

/**
 * The mode-discriminating corner: full lock held from 30 m/s for 6 s. Every mode
 * saturates the tire limit in the transient, but over the sustained turn the
 * character diverges — the assisted modes' yaw damping fights the full lock and
 * bleeds speed, while the sharp mode holds a clean line at the limit.
 */
function steadyStateCorner(config: VehicleConfig, targetMps = 30): SteadyState {
  const { car, step, dispose } = makeCar(config);
  let guard = 0;
  while (car.telemetry.speedMps < targetMps && guard < 60 * 40) {
    step(intent({ throttle: 1 }));
    guard += 1;
  }
  for (let s = 0; s < 30; s += 1) step(intent({ throttle: 0, steer: 1 })); // settle
  const total = 60 * 6;
  let sum = 0;
  let n = 0;
  let maxSlipDeg = 0;
  for (let s = 0; s < total; s += 1) {
    step(intent({ throttle: 0, steer: 1 }));
    const t = (s + 1) / 60;
    if (t >= 4.5) {
      sum += Math.abs(car.telemetry.lateralAcceleration);
      n += 1;
    }
    maxSlipDeg = Math.max(maxSlipDeg, Math.abs(car.telemetry.slipAngle * (180 / Math.PI)));
  }
  const result: SteadyState = {
    sustainedG: sum / n,
    endSpeedMps: car.telemetry.speedMps,
    maxSlipDeg,
  };
  dispose();
  return result;
}

/**
 * Induces oversteer at speed (handbrake + full lock), then lets the car self-settle
 * with no input, and returns the seconds until the slip angle drops below 15° and
 * stays there for 0.5 s. Returns null if it never settles within the window.
 */
function recoverySeconds(config: VehicleConfig, launchMps = 26, windowSeconds = 12): number | null {
  const { car, step, dispose } = makeCar(config);
  let guard = 0;
  while (car.telemetry.speedMps < launchMps && guard < 60 * 40) {
    step(intent({ throttle: 1 }));
    guard += 1;
  }
  // The induction: a 0.5 s handbrake snap at full lock breaks the rear loose
  // (~12° of slip at the release point — enough to engage the yaw assist).
  for (let s = 0; s < 30; s += 1) step(intent({ throttle: 0, steer: 1, handbrake: true }));
  // Then hands off: the electronics and the driver model are out, the car settles.
  let settleFor = 0;
  const horizon = Math.round(windowSeconds * 60);
  for (let s = 0; s < horizon; s += 1) {
    step(NEUTRAL_ACTIONS);
    const slipDeg = Math.abs(car.telemetry.slipAngle * (180 / Math.PI));
    if (slipDeg < 15) {
      settleFor += 1;
      if (settleFor >= 30) {
        dispose();
        return 0.5 + (s - 30) / 60;
      }
    } else {
      settleFor = 0;
    }
  }
  dispose();
  return null;
}

function timeToSpeed(config: VehicleConfig, targetKph: number): number {
  const { car, step, dispose } = makeCar(config);
  let guard = 0;
  while (car.telemetry.speedKph < targetKph && guard < 60 * 60) {
    step(intent({ throttle: 1 }));
    guard += 1;
  }
  dispose();
  return guard / 60;
}

/**
 * Peak |lateral g| during the first 0.8 s of a full-lock corner entry (before any
 * speed fade). At entry the car saturates the tire limit, so this reads the
 * available grip directly and scales with the friction coefficient.
 */
function peakEntryG(config: VehicleConfig, targetMps = 25): number {
  const { car, step, dispose } = makeCar(config);
  let guard = 0;
  while (car.telemetry.speedMps < targetMps && guard < 60 * 40) {
    step(intent({ throttle: 1 }));
    guard += 1;
  }
  for (let s = 0; s < 15; s += 1) step(intent({ throttle: 0, steer: 1 }));
  let peak = 0;
  for (let s = 0; s < 48; s += 1) {
    step(intent({ throttle: 0, steer: 1 }));
    peak = Math.max(peak, Math.abs(car.telemetry.lateralAcceleration));
  }
  dispose();
  return peak;
}

const tuned = (mode: HandlingMode, patch: Partial<CarTuning> = {}): VehicleConfig =>
  applyCarTuning(VEHICLE_CONFIG, { ...DEFAULT_CAR_TUNING, handlingMode: mode, ...patch });

describe('handling modes (Phase 12.1)', () => {
  it('cornering at speed: sport holds the line, the assisted modes bleed out', () => {
    const arcade = steadyStateCorner(tuned('arcade'));
    const balanced = steadyStateCorner(tuned('balanced'));
    const sport = steadyStateCorner(tuned('sport'));
    // The sustained turn orders cleanly by sharpness (deterministic run, measured
    // 2026-11-10: sport 11.9, balanced 10.7, arcade 7.8 m/s² over the final 1.5 s).
    expect(sport.sustainedG).toBeGreaterThan(balanced.sustainedG * 1.05);
    expect(balanced.sustainedG).toBeGreaterThan(arcade.sustainedG * 1.15);
    // Sport keeps cornering at usable speed with a clean line (slip ≈ 0), while
    // the arcade's yaw assist fights the full lock and bleeds it to a crawl.
    expect(sport.endSpeedMps).toBeGreaterThan(10);
    expect(sport.maxSlipDeg).toBeLessThan(15);
    expect(sport.sustainedG).toBeGreaterThan(9);
  });

  it('recovery: arcade settles fastest, sport is the slowest to catch', () => {
    const arcade = recoverySeconds(tuned('arcade'));
    const balanced = recoverySeconds(tuned('balanced'));
    const sport = recoverySeconds(tuned('sport'));
    expect(arcade, 'arcade must settle').not.toBeNull();
    expect(balanced, 'balanced must settle').not.toBeNull();
    expect(sport, 'sport must settle').not.toBeNull();
    // Sport gives up the most assistance, so it takes strictly longer to catch the
    // slide (measured 2026-11-10: 0.87 s / 1.0 s / 1.6 s).
    expect(arcade!).toBeLessThan(balanced!);
    expect(balanced!).toBeLessThan(sport!);
    expect(sport!).toBeGreaterThan(arcade! * 1.5);
  });

  it('every mode stays drivable: no mode spins out of the recovery window', () => {
    for (const mode of ['arcade', 'balanced', 'sport'] as const) {
      expect(recoverySeconds(tuned(mode), 26, 15), `mode ${mode} spun out`).not.toBeNull();
    }
  });
});

describe('tuning sliders (Phase 12.1)', () => {
  it('power: a 25% power gain reaches 100 km/h faster than a 10% loss', () => {
    const stock = timeToSpeed(tuned('arcade'), 100);
    const boosted = timeToSpeed(tuned('arcade', { powerScale: 1.25 }), 100);
    const detuned = timeToSpeed(tuned('arcade', { powerScale: 0.9 }), 100);
    expect(boosted).toBeLessThan(stock);
    expect(stock).toBeLessThan(detuned);
    // The power range is a real difference, not a rounding error.
    expect(detuned - boosted).toBeGreaterThan(0.5);
  });

  it('grip: +10% tire grip raises the entry limit, -10% lowers it', () => {
    const stock = peakEntryG(tuned('arcade', { gripScale: 1 }));
    const sticky = peakEntryG(tuned('arcade', { gripScale: 1.1 }));
    const loose = peakEntryG(tuned('arcade', { gripScale: 0.9 }));
    // The entry transient saturates the friction circle, which scales with grip
    // (measured 2026-11-10: 14.04 / 12.11 / 11.02 m/s²).
    expect(sticky).toBeGreaterThan(stock * 1.05);
    expect(loose).toBeLessThan(stock * 0.97);
  });

  it('applies live mid-drive: a sport swap changes the running car from the next tick', () => {
    const { car, step, dispose } = makeCar(tuned('arcade'));
    const launchTo = (mps: number): void => {
      let guard = 0;
      while (car.telemetry.speedMps < mps && guard < 60 * 40) {
        step(intent({ throttle: 1 }));
        guard += 1;
      }
    };
    // One sustained-corner sample (6 s full lock, mean of the final 1.5 s) under
    // each setup, both entered at the same speed: the arcade bleeds the corner,
    // the sport holds it. Re-accelerating between samples keeps the entry fair.
    const sustainedSample = (): number => {
      let sum = 0;
      let n = 0;
      for (let s = 0; s < 360; s += 1) {
        step(intent({ throttle: 0, steer: 1 }));
        if (s >= 270) {
          sum += Math.abs(car.telemetry.lateralAcceleration);
          n += 1;
        }
      }
      return sum / n;
    };
    launchTo(30);
    for (let s = 0; s < 30; s += 1) step(intent({ throttle: 0, steer: 1 })); // settle
    const arcadeSustained = sustainedSample();
    // Straighten, re-accelerate to the same entry speed, then swap.
    for (let s = 0; s < 30; s += 1) step(NEUTRAL_ACTIONS);
    launchTo(30);
    car.applyTuning(tuned('sport'));
    for (let s = 0; s < 30; s += 1) step(intent({ throttle: 0, steer: 1 })); // settle
    const sportSustained = sustainedSample();
    dispose();
    expect(sportSustained).toBeGreaterThan(arcadeSustained * 1.1);
  });
});
