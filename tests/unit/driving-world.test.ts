import { describe, expect, it } from 'vitest';

import { GROUND_COVER_CONFIG } from '../../src/config/ground-cover';
import { homeCityAnchor } from '../../src/world/city-content';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createWorldPlan, terrainSeedFor } from '../../src/world/world-plan';
import { terrainConfigForTier } from '../../src/config/terrain';
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
import { resolveSeasonPresentation } from '../../src/environment/seasons';
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
      // Phase 10.4 (C4): the skid-mark batch is the ninth resident mesh; Phase 10 pass 2's
      // concrete barrier/bridge batch is the tenth (the volcano pass is a real ravine).
      roadMeshes: 10,
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

describe('generated driving world (Phase 10 pass 3)', () => {
  // A full tier-C driving world is built here; on CI runners under parallel load that
  // takes longer than the 5 s default (it crossed 5 s twice), so this test carries its own
  // budget. A genuine hang still fails.
  it('has no hand-placed mountain shells: the endless world has real high ground', () => {
    // The retired fixture's ridgelines sit at fixed world positions inside the generated
    // city field. They carry no collision and are DoubleSide shells, so a car that reaches
    // them passes through and finds a hollow roof over it. Generated worlds must not mount
    // them; the fixture world (no plan) keeps them for its look.
    const plan = createWorldPlan(20261102);
    const anchor = homeCityAnchor(plan);
    const { config } = buildRoadLayout(plan);
    const terrainSampler = createWorldTerrainSampler(
      terrainConfigForTier('C', terrainSeedFor(20261102)),
      config,
      {
        x: anchor.x,
        z: anchor.z,
        flatRadiusMeters: anchor.flatRadiusMeters,
        blendRadiusMeters: anchor.blendRadiusMeters,
      },
      [],
    );
    const content = createDrivingWorld({
      config: RENDER_CONFIG,
      worldConfig: WORLD_CONFIG,
      terrainSampler,
      qualityTier: 'C',
      surfaceState: resolveSurfaceState('clear'),
      worldPlan: plan,
    });
    expect(content.root.getObjectByName('DistantMountainWorld')).toBeFalsy();
    expect(content.getContentStats?.()).not.toHaveProperty('distantMountainRanges');
    // The real generated world still carries its own high ground: the volcano and the
    // sampled terrain, not the shells.
    expect(terrainSampler.config.volcano).toBeDefined();
  }, 20000);

  // Same full-world build as above: carries its own budget for the same reason.
  it('exposes the live season switch, which re-tints the streamed vegetation in place', () => {
    const plan = createWorldPlan(20261102);
    const anchor = homeCityAnchor(plan);
    const { config } = buildRoadLayout(plan);
    const terrainSampler = createWorldTerrainSampler(
      terrainConfigForTier('C', terrainSeedFor(20261102)),
      config,
      {
        x: anchor.x,
        z: anchor.z,
        flatRadiusMeters: anchor.flatRadiusMeters,
        blendRadiusMeters: anchor.blendRadiusMeters,
      },
      [],
    );
    const content = createDrivingWorld({
      config: RENDER_CONFIG,
      worldConfig: WORLD_CONFIG,
      terrainSampler,
      qualityTier: 'C',
      surfaceState: resolveSurfaceState('clear'),
      worldPlan: plan,
      season: resolveSeasonPresentation('summer'),
    });

    expect(content.setSeason).toBeTypeOf('function');
    const leafy = content.root.getObjectByName('vegetation-broadleaf-0');
    expect(leafy).not.toBeNull();

    // Only the foliage-masked vertices are re-tinted (trunks keep their base colour).
    const readColors = (object: {
      geometry: {
        getAttribute(name: string): {
          count: number;
          getX(i: number): number;
          getY(i: number): number;
          getZ(i: number): number;
        };
      };
    }): number[] => {
      const attr = object.geometry.getAttribute('color');
      const mask = object.geometry.getAttribute('foliageMask');
      const out: number[] = [];
      for (let i = 0; i < attr.count; i += 1) {
        if (mask.getX(i) <= 0) continue;
        out.push(attr.getX(i), attr.getY(i), attr.getZ(i));
      }
      return out;
    };
    const summer = readColors(leafy as never);
    const instancesBefore = content.getContentStats?.().vegetationInstances;

    // The content hook forwards to the vegetation world's re-bake: the same shared
    // geometry rescales by the winter/summer factors (foliage red 0.6/0.8, blue 0.47/0.6).
    content.setSeason!(resolveSeasonPresentation('winter'));
    const winter = readColors(leafy as never);
    expect(winter.length).toBe(summer.length);
    for (let i = 0; i < winter.length; i += 3) {
      expect(winter[i]!).toBeCloseTo(summer[i]! * (0.6 / 0.8), 4);
      expect(winter[i + 2]!).toBeCloseTo(summer[i + 2]! * (0.47 / 0.6), 4);
    }
    expect(content.getContentStats?.().vegetationInstances).toBe(instancesBefore);
    content.dispose();
  }, 20000);
});
