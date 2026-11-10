import { describe, expect, it } from 'vitest';

import {
  CAR_DAMAGE_PARTS,
  type CarDamageImpact,
  type CarDamageMap,
  applyCarDamage,
  classifyCarDamageImpact,
  createCarDamage,
  resetCarDamage,
} from '../../src/vehicles/CarDamage';

const impact = (
  relativeSpeedMetersPerSecond: number,
  sideMeters: number,
  forwardMeters: number,
): CarDamageImpact => ({ relativeSpeedMetersPerSecond, sideMeters, forwardMeters });

describe('impact classification', () => {
  it('front and rear contacts are longitudinal; sides are lateral', () => {
    expect(classifyCarDamageImpact(impact(8, 0, 1.5))).toBe('front');
    expect(classifyCarDamageImpact(impact(8, 0, -1.5))).toBe('rear');
    expect(classifyCarDamageImpact(impact(8, 0.9, 0.2))).toBe('side-left');
    expect(classifyCarDamageImpact(impact(8, -0.9, 0.2))).toBe('side-right');
  });

  it('an unknown contact position defaults to a frontal hit', () => {
    expect(classifyCarDamageImpact(impact(8, 0, 0))).toBe('front');
    expect(classifyCarDamageImpact(impact(8, 0.3, 0.4))).toBe('front');
  });
});

describe('severity accumulation', () => {
  it('a graze below the speed floor damages nothing', () => {
    const damage = createCarDamage();
    expect(applyCarDamage(damage, impact(1.9, 0, 1.5))).toEqual([]);
    for (const part of CAR_DAMAGE_PARTS) {
      expect(damage[part].severity).toBe(0);
      expect(damage[part].state).toBe('intact');
    }
  });

  it('a hard frontal strike dents the front end but not the rear', () => {
    const damage = createCarDamage();
    const changed = applyCarDamage(damage, impact(14, 0, 1.5));
    expect(changed).toContain('frontBumper');
    expect(changed).toContain('hood');
    expect(damage.frontBumper.state).toBe('cracked');
    expect(damage.hood.state).toBe('cracked');
    expect(damage.rearBumper.state).toBe('intact');
    expect(damage.doorLeft.state).toBe('intact');
  });

  it('repeated hard hits escalate cracked → destroyed and stay bounded at 1', () => {
    const damage = createCarDamage();
    applyCarDamage(damage, impact(14, 0, 1.5));
    expect(damage.frontBumper.state).toBe('cracked');
    applyCarDamage(damage, impact(14, 0, 1.5));
    expect(damage.frontBumper.state).toBe('destroyed');
    for (let i = 0; i < 10; i += 1) applyCarDamage(damage, impact(14, 0, 1.5));
    expect(damage.frontBumper.severity).toBeLessThanOrEqual(1);
    expect(damage.frontBumper.severity).toBe(1);
    expect(damage.frontBumper.state).toBe('destroyed');
  });

  it('side hits damage the near-side door and lamps', () => {
    const left = createCarDamage();
    applyCarDamage(left, impact(12, 0.9, 0.2));
    expect(left.doorLeft.state).toBe('cracked');
    expect(left.doorRight.state).toBe('intact');
    expect(left.lampFrontLeft.state).toBe('cracked');
    expect(left.lampRearRight.state).toBe('intact');

    const right = createCarDamage();
    applyCarDamage(right, impact(12, -0.9, 0.2));
    expect(right.doorRight.state).toBe('cracked');
    expect(right.doorLeft.state).toBe('intact');
  });

  it('a hard centred frontal strike cracks the windshield; a soft one does not', () => {
    const hard = createCarDamage();
    applyCarDamage(hard, impact(12, 0, 1.5));
    expect(hard.windshield.state).toBe('cracked');
    const soft = createCarDamage();
    applyCarDamage(soft, impact(8, 0, 1.5));
    expect(soft.windshield.state).toBe('intact');
  });
});

describe('determinism (same impulse sequence ⇒ same states)', () => {
  const sequence: CarDamageImpact[] = [
    impact(3, 0, 1.5),
    impact(9, 0.9, 0.2),
    impact(12, -0.9, -0.4),
    impact(14, 0, 1.5),
    impact(6, 0.1, -1.2),
    impact(15, 0.3, 1.6),
    impact(2.5, 0, 0),
  ];

  it('two identical runs produce identical part states and severities', () => {
    const a = createCarDamage();
    const b = createCarDamage();
    for (const hit of sequence) {
      applyCarDamage(a, hit);
      applyCarDamage(b, hit);
    }
    expect(a).toEqual(b);
  });

  it('severity is additive (order-invariant) and states never regress', () => {
    const a = createCarDamage();
    applyCarDamage(a, impact(14, 0, 1.5));
    applyCarDamage(a, impact(3, 0, 1.5));
    const b = createCarDamage();
    applyCarDamage(b, impact(3, 0, 1.5));
    applyCarDamage(b, impact(14, 0, 1.5));
    expect(a).toEqual(b);
    // (14-2)/14*0.45 + (3-2)/14*0.45 = 0.418 — under the destroyed threshold.
    expect(a.frontBumper.severity).toBeCloseTo(0.4179, 4);
    expect(a.frontBumper.state).toBe('cracked');
  });
});

describe('reset', () => {
  it('resetCarDamage returns every part to intact', () => {
    const damage: CarDamageMap = createCarDamage();
    applyCarDamage(damage, impact(15, 0, 1.5));
    resetCarDamage(damage);
    for (const part of CAR_DAMAGE_PARTS) {
      expect(damage[part].severity).toBe(0);
      expect(damage[part].state).toBe('intact');
    }
  });
});
