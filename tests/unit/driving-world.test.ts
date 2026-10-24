import { describe, expect, it } from 'vitest';

import { GROUND_COVER_CONFIG } from '../../src/config/ground-cover';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import {
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_STREET_FURNITURE_TIER_BUDGET,
} from '../../src/config/urban-city';
import { RENDER_CONFIG } from '../../src/config/render';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { WORLD_CONFIG } from '../../src/config/world';
import type { DaylightState } from '../../src/environment/EnvironmentClock';
import { resolveSurfaceState } from '../../src/environment/SurfaceState';
import { createDrivingWorld } from '../../src/world/DrivingWorld';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

describe('Aohara driving-world integration', () => {
  it('mounts the tiered night block in the streamed road world and disposes it with content', () => {
    const terrainSampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const content = createDrivingWorld({
      config: RENDER_CONFIG,
      worldConfig: WORLD_CONFIG,
      terrainSampler,
      qualityTier: 'C',
      surfaceState: resolveSurfaceState('rain'),
    });

    expect(content.kind).toBe('driving');
    expect(content.root.getObjectByName('AoharaNightLightingBlock')).not.toBeNull();
    expect(content.getContentStats?.()).toMatchObject({
      cityBlocks: 16,
      distantMountainRanges: 4,
      distantMountainVertices: 4 * 73 * 15,
      highRiseBuildings: 32,
      frontageBuildings: expect.any(Number),
      streetLightPoles: 240,
      districtBanners: 60,
      stadiums: 1,
      casinos: 2,
      mansions: 4,
      houses: 4,
      townhouses: 8,
      trafficSignals: 2,
      streetLightPointLights: 4,
      architecturalPointLights: 2,
      activePointLights: 6,
      urbanTrafficVehicles: 12,
      urbanAlleyProps: URBAN_ACTIVITY_TIER_BUDGET.C.alleyProps,
      urbanAlleyPropsBudget: URBAN_ACTIVITY_TIER_BUDGET.C.alleyProps,
      urbanSidewalkEdges: 102,
      urbanCrosswalkIntersections: 25,
      urbanWetLook: 0.85,
      roadMeshes: 8,
    });
    const stats = content.getContentStats?.();
    if (stats === undefined) {
      throw new Error('the driving world should expose integrated enrichment diagnostics');
    }
    expect(stats.frontageBuildings).toBeGreaterThanOrEqual(240);
    expect(stats.shops).toBeGreaterThan(4);
    expect(stats.billboards).toBe(stats.shops! + 14);
    expect(stats.urbanAlleyPropBatches).toBeGreaterThan(0);
    const cityFurnitureBudget = Object.values(URBAN_STREET_FURNITURE_TIER_BUDGET.C).reduce(
      (total, count) => total + count,
      0,
    );
    expect(stats.groundCoverStylePools).toBe(4);
    expect(stats.urbanStreetFurnitureBatches).toBe(4);
    expect(stats.urbanStreetFurnitureInstances).toBe(cityFurnitureBudget);
    expect(stats.worldEnrichmentBatchPools).toBe(8);
    expect(stats.worldEnrichmentInstanceBudget).toBe(
      GROUND_COVER_CONFIG.instanceBudgetByTier.C + cityFurnitureBudget,
    );
    expect(stats.worldEnrichmentInstances).toBe(
      stats.groundCoverInstances! + stats.urbanStreetFurnitureInstances!,
    );
    expect(content.root.getObjectByName('aohara-ground-deck')).toBeUndefined();

    const night: DaylightState = {
      sunDirection: { x: 0, y: -1, z: 0 },
      sunElevationDegrees: -30,
      isNight: true,
      sunColorHex: 0x20283a,
      sunIntensity: 0,
      ambientColorHex: 0x172033,
      ambientIntensity: 0.1,
      environmentIntensity: 0.1,
      exposure: 1,
      horizonColorHex: 0x142037,
      turbidity: 2,
      rayleigh: 1,
      showSunDisc: false,
      gradeTint: { r: 1, g: 1, b: 1 },
    };
    content.setDaylight?.(night);
    expect(content.getContentStats?.().urbanWetLook).toBeCloseTo(0.9);
    content.update?.(1);
    content.dispose();
    expect(content.root.getObjectByName('aohara-street-furniture')).toBeUndefined();
  });
});
