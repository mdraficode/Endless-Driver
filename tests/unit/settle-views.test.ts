import { describe, expect, it } from 'vitest';
import { buildSettleViews } from '../../src/core/settle-views';

/**
 * The sweep layout is pure geometry, so it is tested without a renderer: every view stands on
 * terrain, ring views look back at the spawn, and the high views bracket the district on the
 * spawn-to-centre line.
 */
const SPAWN = { x: 1250, y: 12, z: -505 };
const CENTER = { x: 1250, z: -430 };
/** Flat terrain at 12 m everywhere; the views must stand at 12 m + their eye height. */
const FLAT = (): number => 12;

describe('settle sweep views', () => {
  it('builds eight ring views and two high views', () => {
    const views = buildSettleViews({ spawn: SPAWN, districtCenter: CENTER, heightAt: FLAT });

    expect(views).toHaveLength(10);
  });

  it('stands ring views at the fixed radius on terrain, looking back at the spawn', () => {
    const views = buildSettleViews({ spawn: SPAWN, districtCenter: CENTER, heightAt: FLAT });
    const [first] = views;

    for (const view of views.slice(0, 8)) {
      const [x, y, z] = view.position;
      expect(Math.hypot(x - SPAWN.x, z - SPAWN.z)).toBeCloseTo(220, 3);
      expect(y).toBeCloseTo(12 + 18, 3);
      expect(view.lookAt).toEqual([SPAWN.x, SPAWN.y + 2, SPAWN.z]);
    }
    // The ring covers the full circle: adjacent ring views differ by 45 degrees.
    const angles = views
      .slice(0, 8)
      .map((view) => Math.atan2(view.position[0] - SPAWN.x, view.position[2] - SPAWN.z));
    for (let index = 1; index < angles.length; index += 1) {
      const delta = Math.abs(angles[index]! - angles[index - 1]!);
      expect(Math.min(delta, Math.PI * 2 - delta)).toBeCloseTo(Math.PI / 4, 5);
    }
    expect(first).toBeDefined();
  });

  it('brackets the district with high views on the spawn-to-centre line', () => {
    const views = buildSettleViews({ spawn: SPAWN, districtCenter: CENTER, heightAt: FLAT });
    const [firstHigh, secondHigh] = views.slice(8);

    // Spawn (1250, -505) is due south of the centre (1250, -430): the high views stand 260 m
    // from the centre on that line, one on each side.
    expect(
      Math.hypot(firstHigh!.position[0] - CENTER.x, firstHigh!.position[2] - CENTER.z),
    ).toBeCloseTo(260, 3);
    expect(
      Math.hypot(secondHigh!.position[0] - CENTER.x, secondHigh!.position[2] - CENTER.z),
    ).toBeCloseTo(260, 3);
    // Opposite sides of the centre.
    const sideOf = (view: (typeof views)[number]): number =>
      Math.sign(view.position[2] - CENTER.z) || 1;
    expect(sideOf(firstHigh!)).not.toBe(sideOf(secondHigh!));
    // High over the terrain, looking down at the district centre.
    expect(firstHigh!.position[1]).toBeCloseTo(12 + 380, 3);
    expect(firstHigh!.lookAt).toEqual([CENTER.x, 12 + 20, CENTER.z]);
  });

  it('respects a custom height query for the view altitude', () => {
    // The ring view at index 2 stands at 90 degrees, i.e. due +x from the spawn: (spawn.x + 220, spawn.z).
    const hilltop = (x: number, z: number): number =>
      Math.abs(x - (SPAWN.x + 220)) < 1 && Math.abs(z - SPAWN.z) < 1 ? 40 : 0;
    const views = buildSettleViews({ spawn: SPAWN, districtCenter: CENTER, heightAt: hilltop });
    expect(views[2]?.position[1]).toBeCloseTo(40 + 18, 3);
    // The other ring views stand on flat ground.
    expect(views[0]?.position[1]).toBeCloseTo(0 + 18, 3);
  });

  it('skips the high views when the spawn sits on the district centre', () => {
    const onCentre = { x: 1250, y: 12, z: -430 };
    const views = buildSettleViews({ spawn: onCentre, districtCenter: CENTER, heightAt: FLAT });
    expect(views).toHaveLength(8);
  });

  it('accepts ring configuration overrides', () => {
    const views = buildSettleViews({
      spawn: SPAWN,
      districtCenter: CENTER,
      heightAt: FLAT,
      ringViews: 4,
      ringRadiusMeters: 100,
    });
    expect(views).toHaveLength(6); // 4 ring + 2 high
    expect(
      Math.hypot(views[0]!.position[0] - SPAWN.x, views[0]!.position[2] - SPAWN.z),
    ).toBeCloseTo(100, 3);
  });
});
