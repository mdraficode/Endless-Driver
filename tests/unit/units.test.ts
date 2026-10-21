import { describe, expect, it } from 'vitest';
import {
  METERS_PER_THREE_UNIT,
  metersToThreePoint,
  metersToThreeUnits,
  threeUnitsToMeters,
} from '../../src/config/units';

describe('world-unit contract', () => {
  it('keeps one Three.js unit equal to one metre', () => {
    expect(METERS_PER_THREE_UNIT).toBe(1);
    expect(metersToThreeUnits(1)).toBe(1);
    expect(threeUnitsToMeters(1)).toBe(1);
    expect(metersToThreeUnits(25)).toBe(25);
    expect(threeUnitsToMeters(25)).toBe(25);
  });

  it('converts authored metric points at the scene boundary', () => {
    expect(metersToThreePoint([12.5, 1.7, -42])).toEqual([12.5, 1.7, -42]);
  });
});
