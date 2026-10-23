import { describe, expect, it } from 'vitest';
import { TRAFFIC_VEHICLE_CLASSES } from '../../src/config/traffic-vehicles';
import {
  createTrafficVehicleModel,
  getTrafficVehicleSpec,
} from '../../src/world/traffic-vehicle-models';

describe('procedural Aohara traffic vehicle models', () => {
  it('builds five distinct, unbadged silhouettes with three compact PBR material groups', () => {
    const colors = new Set<number>();

    for (const type of TRAFFIC_VEHICLE_CLASSES) {
      const model = createTrafficVehicleModel(type);
      const position = model.geometry.getAttribute('position');
      const triangleCount = (model.geometry.index?.count ?? position.count) / 3;
      const bounds = model.geometry.boundingBox;

      expect(model.geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2]);
      expect(position.count).toBeGreaterThan(0);
      expect(triangleCount).toBeGreaterThan(100);
      expect(triangleCount).toBeLessThan(8_000);
      expect(bounds).not.toBeNull();
      if (bounds === null) {
        throw new Error(`traffic model ${type} should have bounded geometry`);
      }
      expect(bounds.max.z - bounds.min.z).toBeLessThan(model.lengthMeters + 0.35);
      expect(bounds.max.x - bounds.min.x).toBeLessThan(model.widthMeters + 0.25);
      expect(bounds.max.y).toBeLessThan(model.heightMeters + 0.75);
      expect(model.massKg).toBeGreaterThan(1000);
      expect(model.minimumSpeedMetersPerSecond).toBeGreaterThan(0);
      expect(model.maximumSpeedMetersPerSecond).toBeGreaterThan(model.minimumSpeedMetersPerSecond);
      expect(model.bodyColor).toBe(getTrafficVehicleSpec(type).bodyColor);
      colors.add(model.bodyColor);
      model.geometry.dispose();
    }

    expect(colors.size).toBe(TRAFFIC_VEHICLE_CLASSES.length);
  });
});
