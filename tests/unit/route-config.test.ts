import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOKMARK_ID,
  ROUTE_BOOKMARKS,
  ROUTE_CONFIG,
  ROUTE_PHASES,
  ROUTE_STATIONS,
  findRouteBookmark,
} from '../../src/config/route';
import { resolveDaylight, EnvironmentClock } from '../../src/environment/EnvironmentClock';

/**
 * The bookmark table is a contract with every future phase: the same 12 pictures, re-shot and
 * diffed. These tests pin the shape of that contract — count, coverage, and geometry — so an
 * edit that quietly moves a camera or drops a time of day fails here rather than invalidating
 * a baseline nobody can regenerate.
 */
describe('validation route bookmarks', () => {
  it('has twelve bookmarks: three stations at four times of day', () => {
    expect(ROUTE_BOOKMARKS).toHaveLength(12);
    expect(ROUTE_STATIONS).toHaveLength(3);
    for (const station of ROUTE_STATIONS) {
      const atStation = ROUTE_BOOKMARKS.filter((bookmark) => bookmark.station === station.id);
      expect(atStation.map((bookmark) => bookmark.phase)).toEqual([...ROUTE_PHASES]);
    }
  });

  it('gives every bookmark a unique, URL-safe id', () => {
    const ids = ROUTE_BOOKMARKS.map((bookmark) => bookmark.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+-(dawn|noon|dusk|night)$/);
    }
    expect(findRouteBookmark(DEFAULT_BOOKMARK_ID)?.id).toBe(DEFAULT_BOOKMARK_ID);
    expect(findRouteBookmark('canopy-dawn')?.station).toBe('canopy');
    expect(findRouteBookmark('not-a-bookmark')).toBeNull();
    expect(findRouteBookmark(undefined)).toBeNull();
  });

  it('keeps every camera and target over the route ground, above the surface', () => {
    const halfWidth = ROUTE_CONFIG.groundWidthMeters / 2;
    const zMin = -(ROUTE_CONFIG.lengthMeters + ROUTE_CONFIG.groundMarginMeters);
    for (const bookmark of ROUTE_BOOKMARKS) {
      for (const point of [bookmark.camera, bookmark.target]) {
        expect(Math.abs(point[0])).toBeLessThan(halfWidth);
        expect(point[2]).toBeGreaterThan(zMin);
        expect(point[2]).toBeLessThan(ROUTE_CONFIG.groundMarginMeters);
      }
      expect(bookmark.camera[1]).toBeGreaterThan(0.5);
      // The camera must actually look somewhere: pose and target may not coincide.
      expect(bookmark.camera).not.toEqual(bookmark.target);
    }
  });

  it('spans the route: stations are ordered and within its length', () => {
    const distances = ROUTE_STATIONS.map((station) => station.distanceMeters);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    for (const distance of distances) {
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(ROUTE_CONFIG.lengthMeters);
    }
    // The route is the 2 km the plan names; shortening it would invalidate every baseline.
    expect(ROUTE_CONFIG.lengthMeters).toBe(2000);
    expect(ROUTE_CONFIG.canopyStartMeters).toBeLessThan(ROUTE_CONFIG.canopyEndMeters);
    expect(ROUTE_CONFIG.canopyEndMeters).toBeLessThan(ROUTE_CONFIG.lengthMeters);
  });

  it('covers the day: dawn and dusk are low-sun, noon is high, night is night', () => {
    const clock = new EnvironmentClock();
    const stateAt = (hour: number) => {
      clock.setHour(hour);
      return resolveDaylight(clock.sunPosition(), clock.config);
    };
    for (const station of ROUTE_STATIONS) {
      const byPhase = new Map(
        ROUTE_BOOKMARKS.filter((b) => b.station === station.id).map((b) => [b.phase, b.hour]),
      );
      const dawn = stateAt(byPhase.get('dawn') as number);
      const noon = stateAt(byPhase.get('noon') as number);
      const dusk = stateAt(byPhase.get('dusk') as number);
      const night = stateAt(byPhase.get('night') as number);
      expect(dawn.sunElevationDegrees).toBeGreaterThan(0);
      expect(dawn.sunElevationDegrees).toBeLessThan(20);
      expect(noon.sunElevationDegrees).toBeGreaterThan(35);
      expect(dusk.sunElevationDegrees).toBeGreaterThan(-2);
      expect(dusk.sunElevationDegrees).toBeLessThan(12);
      expect(night.isNight).toBe(true);
    }
  });

  it('pins weather and season to the only values that exist today', () => {
    for (const bookmark of ROUTE_BOOKMARKS) {
      expect(bookmark.weather).toBe('clear');
      expect(bookmark.season).toBe('summer');
    }
  });
});
