import { describe, expect, it } from 'vitest';

import {
  buildRoutingGrid,
  maxStepGrade,
  resamplePolyline,
  routeGradeConstrained,
} from '../../src/world/road-routing';

/**
 * Phase 11.0a — grade-constrained horizontal routing. The A* is deterministic, refuses
 * (null) rather than producing an infeasible road, and routes around terrain it cannot
 * climb at the cap.
 */

const SIZE = 1000;
const SPACING = 20;

const flatGrid = () => buildRoutingGrid(0, 0, SIZE, SIZE, SPACING, () => 5);

/** A hill blob in the centre: 80 m up, 80 m tall-z / 300 m wide-x Gaussian. */
const hillGrid = () =>
  buildRoutingGrid(0, 0, SIZE, SIZE, SPACING, (x, z) => {
    const dz = (z - 500) / 80;
    const dx = (x - 500) / 300;
    return 80 * Math.exp(-(dz * dz + dx * dx) / 2);
  });

/** Uniform 50 % slope along +x: no step is climbable at a 0.12 cap. */
const wallGrid = () => buildRoutingGrid(0, 0, SIZE, SIZE, SPACING, (x) => x * 0.5);

const CAP = 0.12;
const cornerToCorner = () => {
  const route = routeGradeConstrained(flatGrid(), 100, 100, 900, 900, CAP);
  return route!;
};

describe('routeGradeConstrained', () => {
  it('returns a near-straight, grade-zero path on flat ground', () => {
    const route = cornerToCorner();
    const chord = Math.hypot(800, 800);
    expect(route).not.toBeNull();
    expect(route!.maxGrade).toBeLessThan(1e-6);
    // 8-direction routing of a 45° chord is exact; within 2% anyway.
    expect(route!.length).toBeGreaterThanOrEqual(chord * 0.98);
    expect(route!.length).toBeLessThanOrEqual(chord * 1.02);
    expect(route!.points[0]).toEqual([100, 100]);
    expect(route!.points[route!.points.length - 1]).toEqual([900, 900]);
  });

  it('routes around a hill it cannot climb at the cap', () => {
    const route = routeGradeConstrained(hillGrid(), 100, 100, 900, 900, CAP);
    expect(route).not.toBeNull();
    // Cell steps are at-or-under the cap by construction; the 8 m bilinear resample of a
    // step sitting AT the cap can read a hair over (bilinear is not linear in arc length
    // along a diagonal). 5% covers it.
    expect(route!.maxGrade).toBeLessThanOrEqual(CAP * 1.05);
    // A detour: meaningfully longer than the straight chord, and it stays off the hill.
    expect(route!.length).toBeGreaterThan(Math.hypot(800, 800) * 1.1);
    let maxSeen = 0;
    for (const [x, z] of route!.sampled) {
      const dz = (z - 500) / 80;
      const dx = (x - 500) / 300;
      maxSeen = Math.max(maxSeen, 80 * Math.exp(-(dz * dz + dx * dx) / 2));
    }
    expect(maxSeen).toBeLessThan(80 * 0.55);
  });

  it('refuses (null) when no grade-feasible path exists — ascent or descent', () => {
    // A 50 % wall: no step is legal in EITHER direction (descent counts — braking grade
    // is grade). Both directions must refuse.
    expect(routeGradeConstrained(wallGrid(), 100, 500, 900, 500, CAP)).toBeNull();
    expect(routeGradeConstrained(wallGrid(), 900, 500, 100, 500, CAP)).toBeNull();
    // An 8 % slope is feasible both ways, even downhill.
    const gentle = buildRoutingGrid(0, 0, SIZE, SIZE, SPACING, (x) => x * 0.08);
    const downhill = routeGradeConstrained(gentle, 900, 500, 100, 500, CAP);
    expect(downhill).not.toBeNull();
    expect(downhill!.maxGrade).toBeLessThanOrEqual(CAP + 0.002);
  });

  it('is deterministic for a fixed (grid, start, goal, cap, seed)', () => {
    const a = routeGradeConstrained(hillGrid(), 100, 100, 900, 900, CAP, {
      seed: 42,
      meanderAmp: 10,
    });
    const b = routeGradeConstrained(hillGrid(), 100, 100, 900, 900, CAP, {
      seed: 42,
      meanderAmp: 10,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // On flat ground the meander always survives: a different seed must meander
    // differently (same start/goal pins, different wobble).
    const f1 = routeGradeConstrained(flatGrid(), 0, 0, 1000, 0, CAP, { seed: 42, meanderAmp: 12 });
    const f2 = routeGradeConstrained(flatGrid(), 0, 0, 1000, 0, CAP, { seed: 43, meanderAmp: 12 });
    expect(JSON.stringify(f1)).toBe(
      JSON.stringify(
        routeGradeConstrained(flatGrid(), 0, 0, 1000, 0, CAP, { seed: 42, meanderAmp: 12 }),
      ),
    );
    expect(JSON.stringify(f2)).not.toBe(JSON.stringify(f1));
  });

  it('meanders within the grade cap on flat ground', () => {
    const straight = routeGradeConstrained(flatGrid(), 0, 0, 1000, 0, CAP);
    const meandering = routeGradeConstrained(flatGrid(), 0, 0, 1000, 0, CAP, {
      seed: 7,
      meanderAmp: 12,
    });
    expect(straight).not.toBeNull();
    expect(meandering).not.toBeNull();
    expect(meandering!.maxGrade).toBeLessThanOrEqual(CAP + 1e-6);
    // A 12 m sine on a 1000 m chord adds a few percent of length.
    expect(meandering!.length).toBeGreaterThan(straight!.length * 1.01);
    // Endpoints stay pinned.
    expect(meandering!.points[0]).toEqual([0, 0]);
    expect(meandering!.points[meandering!.points.length - 1]).toEqual([1000, 0]);
    // The meander actually deviates laterally (it is not the straight line).
    expect(JSON.stringify(meandering!.points)).not.toBe(JSON.stringify(straight!.points));
  });

  it('keeps start and goal exact when they fall between cells', () => {
    const route = routeGradeConstrained(flatGrid(), 123.4, 456.7, 876.5, 543.2, CAP);
    expect(route).not.toBeNull();
    expect(route!.points[0]).toEqual([123.4, 456.7]);
    expect(route!.points[route!.points.length - 1]).toEqual([876.5, 543.2]);
  });
});

describe('chord feasibility helpers', () => {
  it('maxStepGrade on a dense resample sees the local ridge a 2-point chord hides', () => {
    // A 40 m bump at the chord midpoint: endpoints at grade 0, midpoint at +40.
    const bump = (x: number, _z: number): number =>
      40 * Math.exp(-((x - 500) ** 2) / (2 * 60 ** 2));
    const chord: [number, number][] = [
      [0, 0],
      [1000, 0],
    ];
    expect(maxStepGrade(chord, bump)).toBeLessThan(0.01); // average grade hides it
    const dense = resamplePolyline(chord, 25);
    expect(maxStepGrade(dense, bump)).toBeGreaterThan(0.15);
  });

  it('resamplePolyline keeps endpoints exact and hits the spacing budget', () => {
    const dense = resamplePolyline(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      25,
    );
    expect(dense[0]).toEqual([0, 0]);
    expect(dense[dense.length - 1]).toEqual([100, 100]);
    let maxStep = 0;
    for (let i = 1; i < dense.length; i += 1) {
      maxStep = Math.max(
        maxStep,
        Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1]),
      );
    }
    expect(maxStep).toBeLessThanOrEqual(25.001);
  });
});
