import { describe, expect, it } from 'vitest';

import { RainField } from '../../src/environment/rain';

describe('Phase 7 precipitation field', () => {
  it('scales the live drop count with the rain intensity', () => {
    const rain = new RainField(200);
    expect(rain.activeDropCount).toBe(0);

    rain.setIntensity(0);
    expect(rain.activeDropCount).toBe(0);
    expect(rain.root.visible).toBe(false);

    rain.setIntensity(1);
    expect(rain.activeDropCount).toBe(200);
    expect(rain.root.visible).toBe(true);

    rain.setIntensity(0.5);
    expect(rain.activeDropCount).toBe(100);
    rain.setIntensity(0.5); // no-op when unchanged
    expect(rain.activeDropCount).toBe(100);

    rain.setIntensity(5); // clamps
    expect(rain.activeDropCount).toBe(200);
    rain.dispose();
  });

  it('keeps every drop inside the volume around the car, respawning fallen ones', () => {
    const rain = new RainField(120);
    rain.setIntensity(1);
    rain.update(1 / 60, 100, 10, -250);

    // 120 frames at 10.5 m/s falls far past the volume depth, so every drop has
    // respawned at least once: the field stays bounded, not accumulating off-volume.
    for (let frame = 0; frame < 120; frame += 1) {
      rain.update(1 / 60, 100 + frame * 0.5, 10, -250);
    }
    const mesh = rain.root.getObjectByName('rain-streaks');
    expect(mesh).not.toBeNull();
    const matrix = (mesh as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix;
    const carX = 100 + 119 * 0.5;
    for (let i = 0; i < rain.activeDropCount; i += 1) {
      const x = matrix.array[i * 16 + 12]!;
      const y = matrix.array[i * 16 + 13]!;
      const z = matrix.array[i * 16 + 14]!;
      // Volume: ±18 m sideways, +14 above / −9 below the car.
      expect(Math.abs(x - carX)).toBeLessThanOrEqual(18.5);
      expect(z).toBeGreaterThanOrEqual(-250 - 18.5);
      expect(z).toBeLessThanOrEqual(-250 + 18.5);
      expect(y).toBeGreaterThanOrEqual(10 - 9.5);
      expect(y).toBeLessThanOrEqual(10 + 14.5);
    }
    rain.dispose();
  });

  it('stays dormant while dry, whatever the car does', () => {
    const rain = new RainField(50);
    rain.setIntensity(0);
    rain.update(1 / 60, 0, 0, 0);
    expect(rain.root.visible).toBe(false);
    expect(rain.activeDropCount).toBe(0);
    rain.dispose();
  });
});
