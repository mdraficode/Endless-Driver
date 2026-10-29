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
    expect(content.wetRoadSurface).toBe(true);
    expect(content.root.getObjectByName('AoharaNightLightingBlock')).not.toBeNull();
    expect(content.getContentStats?.()).toMatchObject({
      cityBlocks: 16,
      distantMountainRanges: 4,
      distantMountainVertices: 4 * 73 * 15,
      highRiseBuildings: 29,
      frontageBuildings: expect.any(Number),
      // Phase 8.4a: the re-planned (wider) grid adds street length; 8.4b's grand boulevard
      // adds four arterial approaches of its own (+34 poles, +9 banners over 8.4a).
      streetLightPoles: 286,
      districtBanners: 72,
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
      urbanAlleyFacadeBuildings: expect.any(Number),
      urbanAlleyFacadeWindows: expect.any(Number),
      urbanAlleyFacadeDoors: expect.any(Number),
      urbanAlleyFacadeWallRuns: expect.any(Number),
      urbanAlleyFacadeBatches: 5,
      // Phase 8.4a: one fewer block (the plaza) removes three sidewalk edges from the 4×4 grid;
      // 8.4b's boulevard crossings add five edges and three counted intersections.
      urbanSidewalkEdges: 104,
      urbanCrosswalkIntersections: 28,
      urbanWetLook: 0.85,
      roadMeshes: 8,
    });
    const stats = content.getContentStats?.();
    if (stats === undefined) {
      throw new Error('the driving world should expose integrated enrichment diagnostics');
    }
    // Phase 8.4a massing: 240 street-row candidates (15 blocks × 4 sides × 4 shells); the row
    // opens at the passage mouths, block corners, and where avenue towers flank narrow-block
    // rows. 8.4b trims the shells the grand boulevard's right-of-way would cut through.
    expect(stats.frontageBuildings).toBeGreaterThanOrEqual(172);
    expect(stats.frontageBuildings).toBeLessThanOrEqual(184);
    expect(stats.urbanAlleyFacadeBuildings).toBeGreaterThan(0);
    expect(stats.urbanAlleyFacadeWindows).toBeGreaterThan(0);
    expect(stats.urbanAlleyFacadeDoors).toBeGreaterThan(0);
    expect(stats.urbanAlleyFacadeWallRuns).toBeGreaterThan(0);
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
