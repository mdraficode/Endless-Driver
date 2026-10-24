import { InstancedMesh, Matrix4, Mesh, PointLight } from 'three';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import {
  trafficVehicleCountFor,
  resolveTrafficSignalAspect,
  resolveUrbanNightGain,
  resolveUrbanStreetLightCoverage,
  resolveUrbanWetness,
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_CITY_CONFIG,
  URBAN_NIGHT_TIER_BUDGET,
  URBAN_STREET_FURNITURE_CONFIG,
  URBAN_STREET_FURNITURE_TIER_BUDGET,
} from '../../src/config/urban-city';
import { GROUND_COVER_CONFIG } from '../../src/config/ground-cover';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { DEFAULT_SPAWN_ID, SPAWN_POINTS } from '../../src/config/spawns';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import { UrbanNightWorld } from '../../src/world/urban-night';
import {
  advanceTrafficWithSignal,
  constrainTrafficFollowingTravel,
  constrainTrafficRouteSpacing,
  projectTrafficRoutePosition,
  UrbanStreetActivity,
} from '../../src/world/urban-activity';
import { generateAoharaStreetFurniturePlacements } from '../../src/world/urban-furniture';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import type { RoadNetwork } from '../../src/world/road-network';
import type { StaticBuildingBox } from '../../src/world/static-building-collision';

function footprintSeparation(a: StaticBuildingBox, b: StaticBuildingBox, margin: number): number {
  const aAxes = [
    [Math.cos(a.yaw), -Math.sin(a.yaw)],
    [Math.sin(a.yaw), Math.cos(a.yaw)],
  ] as const;
  const bAxes = [
    [Math.cos(b.yaw), -Math.sin(b.yaw)],
    [Math.sin(b.yaw), Math.cos(b.yaw)],
  ] as const;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const separations = [...aAxes, ...bAxes].map(([axisX, axisZ]) => {
    const centerDistance = Math.abs(dx * axisX + dz * axisZ);
    const aRadius =
      (a.halfWidth + margin) * Math.abs(aAxes[0]![0] * axisX + aAxes[0]![1] * axisZ) +
      (a.halfDepth + margin) * Math.abs(aAxes[1]![0] * axisX + aAxes[1]![1] * axisZ);
    const bRadius =
      (b.halfWidth + margin) * Math.abs(bAxes[0]![0] * axisX + bAxes[0]![1] * axisZ) +
      (b.halfDepth + margin) * Math.abs(bAxes[1]![0] * axisX + bAxes[1]![1] * axisZ);
    return centerDistance - aRadius - bRadius;
  });
  return Math.max(...separations);
}

function expectUrbanRoadClearance(city: UrbanNightWorld, network: RoadNetwork): number {
  let probeCount = 0;
  const urbanEdges = network.edges.filter(
    (edge) => edge.roadClass === 'urban-local' || edge.roadClass === 'urban-arterial',
  );
  for (const edge of urbanEdges) {
    const { points } = edge;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      const previous = points[Math.max(0, index - 1)]!;
      const next = points[Math.min(points.length - 1, index + 1)]!;
      const tangentLength = Math.hypot(next.x - previous.x, next.z - previous.z) || 1;
      const tangentX = (next.x - previous.x) / tangentLength;
      const tangentZ = (next.z - previous.z) / tangentLength;
      const sideX = tangentZ;
      const sideZ = -tangentX;
      const carYaw = Math.atan2(-tangentX, -tangentZ);
      const sidewalkOffset =
        edge.halfWidthMeters + edge.shoulderMeters + URBAN_CITY_CONFIG.sidewalk.widthMeters / 2;
      const laneEdgeOffset = Math.max(0, edge.halfWidthMeters - 1.5);
      const offsets = [
        0,
        -3.4,
        3.4,
        -laneEdgeOffset,
        laneEdgeOffset,
        -sidewalkOffset,
        sidewalkOffset,
      ];
      for (const lateralOffset of offsets) {
        const probe = {
          x: point.x + sideX * lateralOffset,
          z: point.z + sideZ * lateralOffset,
          yaw: carYaw,
          velocityX: 0,
          velocityZ: 0,
        };
        expect(
          city.collide(probe),
          `${edge.id} has a building footprint across the road/sidewalk probe at ${point.alongMeters.toFixed(1)} m`,
        ).toHaveLength(0);
        probeCount += 1;
      }
    }
  }
  return probeCount;
}

describe('Aohara city night-lighting rules', () => {
  it('fades local city lights across dusk and disables them in daylight', () => {
    expect(resolveUrbanNightGain(-12)).toBe(1);
    expect(resolveUrbanNightGain(-4)).toBe(1);
    expect(resolveUrbanNightGain(0)).toBeCloseTo(0.5);
    expect(resolveUrbanNightGain(4)).toBe(0);
    expect(resolveUrbanNightGain(30)).toBe(0);
    expect(resolveUrbanNightGain(Number.NaN)).toBe(0);
  });

  it('raises only Aohara wet-look clearcoat toward night and smoothly bounds local-light coverage', () => {
    expect(resolveUrbanWetness(4)).toBeCloseTo(URBAN_CITY_CONFIG.wetRoad.wetnessDay);
    expect(resolveUrbanWetness(0)).toBeCloseTo(
      (URBAN_CITY_CONFIG.wetRoad.wetnessDay + URBAN_CITY_CONFIG.wetRoad.wetnessNight) / 2,
    );
    expect(resolveUrbanWetness(-4)).toBeCloseTo(URBAN_CITY_CONFIG.wetRoad.wetnessNight);
    expect(resolveUrbanStreetLightCoverage(452)).toBe(1);
    expect(resolveUrbanStreetLightCoverage(500)).toBe(1);
    expect(resolveUrbanStreetLightCoverage(560)).toBeCloseTo(0.5);
    expect(resolveUrbanStreetLightCoverage(620)).toBe(0);
    expect(resolveUrbanStreetLightCoverage(Number.NaN)).toBe(0);
    expect(URBAN_CITY_CONFIG.optics.maximumOpacity).toBeLessThanOrEqual(0.4);
  });

  it('cycles the avenue signal through green, amber and red without an unsafe overlap', () => {
    expect(resolveTrafficSignalAspect(0)).toBe('green');
    expect(resolveTrafficSignalAspect(9.99)).toBe('green');
    expect(resolveTrafficSignalAspect(10)).toBe('amber');
    expect(resolveTrafficSignalAspect(11.99)).toBe('amber');
    expect(resolveTrafficSignalAspect(12)).toBe('red');
    expect(resolveTrafficSignalAspect(25.99)).toBe('red');
    expect(resolveTrafficSignalAspect(26)).toBe('green');
  });

  it('phases the cross-street signal against the avenue and repeats deterministically', () => {
    const offset = URBAN_CITY_CONFIG.trafficSignal.opposingPhaseOffsetSeconds;
    expect(resolveTrafficSignalAspect(0, offset)).toBe('red');
    expect(resolveTrafficSignalAspect(12, offset)).toBe('red');
    expect(resolveTrafficSignalAspect(13, offset)).toBe('green');
    expect(resolveTrafficSignalAspect(23, offset)).toBe('amber');
    expect(resolveTrafficSignalAspect(25, offset)).toBe('red');
    expect(resolveTrafficSignalAspect(26, offset)).toBe('red');
    expect(resolveTrafficSignalAspect(39, offset)).toBe('green');
    expect(resolveTrafficSignalAspect(-13, offset)).toBe('green');
    for (let seconds = 0; seconds < URBAN_CITY_CONFIG.trafficSignal.cycleSeconds; seconds += 0.5) {
      const avenue = resolveTrafficSignalAspect(seconds);
      const cross = resolveTrafficSignalAspect(seconds, offset);
      expect(avenue === 'red' || cross === 'red').toBe(true);
    }
  });

  it('keeps simulated traffic behind red and late-amber stop lines without crossing the queue slot', () => {
    const red = advanceTrafficWithSignal(40, 100, 50, 5, 'red');
    expect(red).toBeCloseTo(40 + (5 * 10) / URBAN_CITY_CONFIG.trafficSignal.brakingDistanceMeters);
    expect(red).toBeLessThan(50);

    let queued = 40;
    for (let step = 0; step < 30; step += 1) {
      queued = advanceTrafficWithSignal(queued, 100, 50, 5, 'red');
    }
    expect(queued).toBeLessThan(50);
    expect(advanceTrafficWithSignal(40, 100, 50, 5, 'red', 1)).toBeLessThan(
      advanceTrafficWithSignal(40, 100, 50, 5, 'red'),
    );
    expect(advanceTrafficWithSignal(40, 100, 50, 5, 'red', 0, 11)).toBe(40);

    expect(advanceTrafficWithSignal(20, 100, 50, 5, 'amber')).toBeLessThan(50);
    expect(advanceTrafficWithSignal(40, 100, 50, 5, 'amber')).toBe(45);
    expect(advanceTrafficWithSignal(40, 100, 50, 5, 'green')).toBe(45);
  });

  it('keeps mixed-class traffic at a safe headway across the route wrap', () => {
    const constrainedTravel = constrainTrafficFollowingTravel(100, 92, 9, 4.5, 7, 1.5, 12, 8);
    expect(constrainedTravel).toBeCloseTo(0.25);
    const resultingGap = 7 + 1.5 + 100 - (92 + constrainedTravel);
    expect(resultingGap).toBeCloseTo(16.25);

    expect(constrainTrafficFollowingTravel(100, 10, 9, 4.5, 35, 2, 4.5, 8)).toBe(9);
    expect(constrainTrafficFollowingTravel(100, 92, 9, 4.5, 2, 0, 12, 8)).toBe(0);
  });

  it('propagates a traffic slowdown through a mixed-size route without breaking the loop gap', () => {
    const vehicles = [
      { index: 0, lengthMeters: 4, distance: 0, proposedTravelMeters: 10 },
      { index: 1, lengthMeters: 12, distance: 20, proposedTravelMeters: 10 },
      { index: 2, lengthMeters: 4, distance: 40, proposedTravelMeters: 0 },
    ];
    const routeLength = 100;
    const bumperGap = 8;

    constrainTrafficRouteSpacing(vehicles, routeLength, bumperGap);

    expect(vehicles.map((vehicle) => vehicle.proposedTravelMeters)).toEqual([8, 4, 0]);
    for (let index = 0; index < vehicles.length; index += 1) {
      const follower = vehicles[index]!;
      const leader = vehicles[(index + 1) % vehicles.length]!;
      const resultingGap =
        (((leader.distance +
          leader.proposedTravelMeters -
          follower.distance -
          follower.proposedTravelMeters +
          routeLength) %
          routeLength) +
          routeLength) %
        routeLength;
      const minimumGap = (follower.lengthMeters + leader.lengthMeters) / 2 + bumperGap;
      expect(resultingGap).toBeGreaterThanOrEqual(minimumGap);
    }
  });

  it('projects a displaced traffic position onto the nearest route segment', () => {
    const segments = [
      { startX: 0, startZ: 0, dx: 10, dz: 0, startDistance: 0, length: 10 },
      { startX: 10, startZ: 0, dx: 0, dz: 10, startDistance: 10, length: 10 },
      { startX: 10, startZ: 10, dx: -10, dz: 0, startDistance: 20, length: 10 },
      { startX: 0, startZ: 10, dx: 0, dz: -10, startDistance: 30, length: 10 },
    ];

    expect(projectTrafficRoutePosition(segments, 8, 2)).toEqual({
      distanceMeters: 8,
      distanceSquared: 4,
    });
    expect(projectTrafficRoutePosition(segments, 11, 8)).toEqual({
      distanceMeters: 18,
      distanceSquared: 1,
    });
    expect(projectTrafficRoutePosition(segments, Number.NaN, 0)).toBeNull();
    expect(projectTrafficRoutePosition([], 0, 0)).toBeNull();
  });

  it('fills every traffic class inside the existing C/B/A vehicle and draw-call budgets', () => {
    const expectedByTier = {
      C: { passengerCars: 2, cityBuses: 2, rigidTrucks: 2, semiTrailerRigs: 1, farmTractors: 1 },
      B: { passengerCars: 4, cityBuses: 3, rigidTrucks: 3, semiTrailerRigs: 3, farmTractors: 3 },
      A: { passengerCars: 5, cityBuses: 5, rigidTrucks: 5, semiTrailerRigs: 5, farmTractors: 4 },
    } as const;

    for (const tier of ['C', 'B', 'A'] as const) {
      const activity = new UrbanStreetActivity(tier);
      const stats = activity.getContentStats();
      expect(stats).toMatchObject({
        urbanTrafficVehicles: URBAN_ACTIVITY_TIER_BUDGET[tier].trafficVehicles,
        urbanTrafficPassengerCars: expectedByTier[tier].passengerCars,
        urbanTrafficCityBuses: expectedByTier[tier].cityBuses,
        urbanTrafficRigidTrucks: expectedByTier[tier].rigidTrucks,
        urbanTrafficSemiTrailerRigs: expectedByTier[tier].semiTrailerRigs,
        urbanTrafficFarmTractors: expectedByTier[tier].farmTractors,
        urbanTrafficBatches: 5,
        urbanPedestrians: URBAN_ACTIVITY_TIER_BUDGET[tier].pedestrians,
        urbanActivityBatches: 7,
      });
      const trafficMeshes = activity.root.children.filter(
        (child) => child instanceof InstancedMesh && child.name.startsWith('aohara-traffic-'),
      );
      expect(trafficMeshes).toHaveLength(5);
      for (const mesh of trafficMeshes) {
        expect(mesh).toBeInstanceOf(InstancedMesh);
        if (!(mesh instanceof InstancedMesh)) {
          throw new Error('each vehicle class should use one instanced mesh');
        }
        expect(Array.isArray(mesh.material)).toBe(true);
        expect(mesh.geometry.groups).toHaveLength(3);
        expect(mesh.geometry.groups[0]?.materialIndex).toBe(0);
        expect(mesh.geometry.groups[1]?.materialIndex).toBe(1);
        expect(mesh.geometry.groups[2]?.materialIndex).toBe(2);
      }
      activity.update(1 / 60, 'red');
      activity.dispose();
    }
  });

  it('applies the selected traffic intensity without changing pedestrian budgets', () => {
    expect(trafficVehicleCountFor('C', 'light')).toBe(4);
    expect(trafficVehicleCountFor('C', 'standard')).toBe(8);
    expect(trafficVehicleCountFor('C', 'busy')).toBe(12);
    expect(trafficVehicleCountFor('B', 'off')).toBe(0);
    expect(trafficVehicleCountFor('B', 'light')).toBe(8);
    expect(trafficVehicleCountFor('B', 'busy')).toBe(24);
    expect(trafficVehicleCountFor('A', 'light')).toBe(12);
    expect(trafficVehicleCountFor('A', 'standard')).toBe(24);
    expect(trafficVehicleCountFor('A', 'busy')).toBe(36);

    const off = new UrbanStreetActivity('B', { trafficIntensity: 'off' });
    const light = new UrbanStreetActivity('B', { trafficIntensity: 'light' });
    const busy = new UrbanStreetActivity('B', { trafficIntensity: 'busy' });
    expect(off.getContentStats()).toMatchObject({
      urbanTrafficVehicles: 0,
      urbanTrafficBatches: 0,
    });
    expect(off.getContentStats().urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians);
    expect(light.getContentStats().urbanTrafficVehicles).toBe(8);
    expect(light.getContentStats().urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians);
    expect(busy.getContentStats().urbanTrafficVehicles).toBe(24);
    expect(busy.getContentStats().urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians);
    off.dispose();
    light.dispose();
    busy.dispose();
  });

  it('keeps baseline city activity budgets bounded and increasing across C/B/A tiers', () => {
    expect(URBAN_ACTIVITY_TIER_BUDGET.C).toEqual({
      infillBuildings: 8,
      trafficVehicles: 8,
      pedestrians: 16,
    });
    for (const key of ['infillBuildings', 'trafficVehicles', 'pedestrians'] as const) {
      expect(URBAN_ACTIVITY_TIER_BUDGET.C[key]).toBeLessThan(URBAN_ACTIVITY_TIER_BUDGET.B[key]);
      expect(URBAN_ACTIVITY_TIER_BUDGET.B[key]).toBeLessThan(URBAN_ACTIVITY_TIER_BUDGET.A[key]);
    }
    for (const key of ['benches', 'planters', 'wasteBins', 'bicycleRacks'] as const) {
      expect(URBAN_STREET_FURNITURE_TIER_BUDGET.C[key]).toBeGreaterThan(0);
      expect(URBAN_STREET_FURNITURE_TIER_BUDGET.C[key]).toBeLessThan(
        URBAN_STREET_FURNITURE_TIER_BUDGET.B[key],
      );
      expect(URBAN_STREET_FURNITURE_TIER_BUDGET.B[key]).toBeLessThan(
        URBAN_STREET_FURNITURE_TIER_BUDGET.A[key],
      );
    }
    expect(URBAN_STREET_FURNITURE_CONFIG.spawnClearanceMeters).toBeGreaterThanOrEqual(50);
    expect(URBAN_STREET_FURNITURE_CONFIG.minimumWalkwayClearanceMeters).toBeGreaterThanOrEqual(1.8);
    let previousCombinedBudget = 0;
    for (const tier of ['C', 'B', 'A'] as const) {
      const furnitureBudget = Object.values(URBAN_STREET_FURNITURE_TIER_BUDGET[tier]).reduce(
        (total, count) => total + count,
        0,
      );
      const combinedBudget = GROUND_COVER_CONFIG.instanceBudgetByTier[tier] + furnitureBudget;
      expect(combinedBudget).toBeGreaterThan(previousCombinedBudget);
      previousCombinedBudget = combinedBudget;
    }
    expect(URBAN_CITY_CONFIG.trafficSignal.stopLineOffsetMeters).toBe(19);
  });

  it('keeps city lights and diffraction budgets bounded and ordered across C/B/A tiers', () => {
    const low = URBAN_NIGHT_TIER_BUDGET.C;
    const balanced = URBAN_NIGHT_TIER_BUDGET.B;
    const high = URBAN_NIGHT_TIER_BUDGET.A;
    expect(low.pointLights).toBeLessThan(balanced.pointLights);
    expect(balanced.pointLights).toBeLessThan(high.pointLights);
    for (const tier of [low, balanced, high]) {
      expect(tier.streetPointLights + tier.architecturalPointLights).toBe(tier.pointLights);
    }
    expect(low.streetPointLights).toBeLessThan(balanced.streetPointLights);
    expect(balanced.streetPointLights).toBeLessThan(high.streetPointLights);
    expect(low.architecturalPointLights).toBeLessThanOrEqual(balanced.architecturalPointLights);
    expect(balanced.architecturalPointLights).toBeLessThan(high.architecturalPointLights);
    expect(low.litWindowInstances).toBeLessThan(balanced.litWindowInstances);
    expect(balanced.litWindowInstances).toBeLessThan(high.litWindowInstances);
    expect(low.facadeWindowInstances).toBeLessThan(balanced.facadeWindowInstances);
    expect(balanced.facadeWindowInstances).toBeLessThan(high.facadeWindowInstances);
    expect(low.facadeDetailInstances).toBeLessThan(balanced.facadeDetailInstances);
    expect(balanced.facadeDetailInstances).toBeLessThan(high.facadeDetailInstances);
    expect(low.cardinalStarburst).toBeGreaterThan(0);
    expect(low.diagonalStarburst).toBe(0);
    expect(balanced.diagonalStarburst).toBeGreaterThan(0);
    expect(high.diagonalStarburst).toBeGreaterThanOrEqual(balanced.diagonalStarburst);
  });

  it('constructs a bounded, tier-scaled city content slice without external assets', () => {
    const cityC = new UrbanNightWorld('C');
    const cityA = new UrbanNightWorld('A');
    const lowStats = cityC.getContentStats();
    const highStats = cityA.getContentStats();
    const avenue = cityC.root.getObjectByName('aohara-main-avenue');

    expect(avenue).toBeInstanceOf(Mesh);
    if (!(avenue instanceof Mesh)) {
      throw new Error('standalone night view should include its roadway');
    }
    expect(avenue.material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    const asphalt = avenue.material as MeshPhysicalNodeMaterial;
    expect(asphalt.clearcoatNode).not.toBeNull();
    expect(asphalt.clearcoatRoughnessNode).not.toBeNull();
    expect(cityC.kind).toBe('aohara-city-night');
    expect(lowStats.highRiseBuildings).toBe(8);
    expect(lowStats.infillBuildings).toBe(0);
    expect(lowStats.urbanTrafficVehicles).toBe(0);
    expect(lowStats.urbanPedestrians).toBe(0);
    expect(lowStats.streetLightPointLights).toBe(URBAN_NIGHT_TIER_BUDGET.C.streetPointLights);
    expect(lowStats.urbanStreetFurnitureBatches).toBe(4);
    expect(lowStats.urbanStreetFurnitureInstances).toBeGreaterThan(0);
    const benches = cityC.root.getObjectByName('aohara-street-benches');
    const planters = cityC.root.getObjectByName('aohara-street-planters');
    const wasteBins = cityC.root.getObjectByName('aohara-street-waste-bins');
    const bicycleRacks = cityC.root.getObjectByName('aohara-street-bicycle-racks');
    expect(benches).toBeInstanceOf(InstancedMesh);
    expect(planters).toBeInstanceOf(InstancedMesh);
    expect(wasteBins).toBeInstanceOf(InstancedMesh);
    expect(bicycleRacks).toBeInstanceOf(InstancedMesh);
    if (
      !(benches instanceof InstancedMesh) ||
      !(planters instanceof InstancedMesh) ||
      !(wasteBins instanceof InstancedMesh) ||
      !(bicycleRacks instanceof InstancedMesh)
    ) {
      throw new Error('Aohara furniture should retain one instanced pool per kind');
    }
    for (const furniture of [benches, planters]) {
      expect(furniture.geometry.getAttribute('uv')).toBeDefined();
      expect(furniture.geometry.groups).toHaveLength(2);
      expect(
        furniture.geometry.groups.map((group: { materialIndex: number }) => group.materialIndex),
      ).toEqual([0, 1]);
      expect(Array.isArray(furniture.material)).toBe(true);
    }
    const benchMaterials = benches.material as MeshStandardNodeMaterial[];
    expect(benchMaterials[0]?.name).toBe('aohara-bench-cedar-pbr');
    expect(benchMaterials[1]?.name).toBe('aohara-bench-painted-steel-pbr');
    const planterMaterials = planters.material as MeshStandardNodeMaterial[];
    expect(planterMaterials[0]?.name).toBe('aohara-planter-aggregate-concrete-pbr');
    expect(planterMaterials[1]?.name).toBe('aohara-planter-shrubs-pbr');
    expect((wasteBins.material as MeshStandardNodeMaterial[])[0]?.name).toBe(
      'aohara-waste-bin-painted-steel-pbr',
    );
    expect((bicycleRacks.material as MeshStandardNodeMaterial[])[0]?.name).toBe(
      'aohara-bicycle-rack-metal-pbr',
    );
    expect(lowStats.architecturalPointLights).toBe(
      URBAN_NIGHT_TIER_BUDGET.C.architecturalPointLights,
    );
    expect(lowStats.activePointLights).toBe(URBAN_NIGHT_TIER_BUDGET.C.pointLights);
    const cityLights = cityC.root.children.filter(
      (child): child is PointLight => child instanceof PointLight,
    );
    expect(cityLights).toHaveLength(URBAN_NIGHT_TIER_BUDGET.C.pointLights);
    expect(cityLights.every((light) => !light.castShadow)).toBe(true);
    const streetLights = cityLights.filter((light) =>
      light.name.startsWith('aohara-streetlight-point-'),
    );
    expect(new Set(streetLights.map((light) => light.color.getHex())).size).toBeGreaterThan(1);
    expect(lowStats.stadiums).toBe(1);
    expect(lowStats.casinos).toBe(1);
    expect(lowStats.mansions).toBe(1);
    expect(lowStats.houses).toBe(1);
    expect(lowStats.townhouses).toBe(1);
    expect(lowStats.shops).toBe(1);
    expect(lowStats.billboards).toBeGreaterThan(0);
    expect(lowStats.districtBanners).toBeGreaterThan(0);
    expect(cityC.root.getObjectByName('aohara-stadium-open-bowl-shell')).toBeDefined();
    expect(cityC.root.getObjectByName('aohara-abstract-billboards-0')).toBeDefined();
    expect(cityC.root.getObjectByName('aohara-street-banner-panels-0')).toBeDefined();
    expect(lowStats.illuminatedWindows).toBeLessThanOrEqual(
      URBAN_NIGHT_TIER_BUDGET.C.litWindowInstances,
    );
    expect(lowStats.facadeWindowInstances).toBeGreaterThan(0);
    expect(lowStats.facadeWindowInstances).toBeLessThanOrEqual(
      URBAN_NIGHT_TIER_BUDGET.C.facadeWindowInstances,
    );
    expect(highStats.facadeWindowInstances ?? 0).toBeGreaterThanOrEqual(
      lowStats.facadeWindowInstances ?? 0,
    );
    expect(lowStats.facadeDetailInstances).toBeGreaterThan(0);
    expect(lowStats.facadeDetailInstances).toBeLessThanOrEqual(
      URBAN_NIGHT_TIER_BUDGET.C.facadeDetailInstances,
    );
    const banner = cityC.root.getObjectByName('aohara-street-banner-panels-0');
    expect(banner).toBeInstanceOf(InstancedMesh);
    if (!(banner instanceof InstancedMesh)) {
      throw new Error('Aohara banners should use a bounded instanced pool');
    }
    expect(banner.material).toBeInstanceOf(MeshBasicNodeMaterial);
    const glazing = cityC.root.getObjectByName('aohara-facade-glazing');
    expect(glazing).toBeInstanceOf(Mesh);
    if (!(glazing instanceof Mesh)) {
      throw new Error('Aohara facades should include tier-capped tinted glazing');
    }
    expect(glazing.material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect((glazing.material as MeshPhysicalNodeMaterial).clearcoatNode).not.toBeNull();
    expect(cityC.root.getObjectByName('aohara-facade-window-frames')).toBeInstanceOf(Mesh);
    expect(highStats.streetLightPointLights).toBe(URBAN_NIGHT_TIER_BUDGET.A.streetPointLights);
    expect(highStats.architecturalPointLights).toBe(
      URBAN_NIGHT_TIER_BUDGET.A.architecturalPointLights,
    );
    expect(highStats.activePointLights).toBe(URBAN_NIGHT_TIER_BUDGET.A.pointLights);
    expect(highStats.illuminatedWindows ?? 0).toBeGreaterThanOrEqual(
      lowStats.illuminatedWindows ?? 0,
    );
    expect(highStats.trafficSignals).toBe(2);
    expect(cityA.trafficSignalAspects).toEqual(['green', 'red']);
    cityA.update(10);
    expect(cityA.trafficSignalAspects).toEqual(['amber', 'red']);
    cityA.update(3);
    expect(cityA.trafficSignalAspects).toEqual(['red', 'green']);

    cityC.dispose();
    cityA.dispose();
  });

  it('moves the tier-bounded point lights with the driver and fades them beyond Aohara', () => {
    const roadNetwork = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (roadNetwork === undefined) {
      throw new Error('the shared world sampler should expose the road graph');
    }
    const city = new UrbanNightWorld('C', {
      position: [AOHARA_DISTRICT_CONFIG.centerX, 0, AOHARA_DISTRICT_CONFIG.centerZ],
      roadNetwork,
      networkIntegrated: true,
    });
    city.setDaylight(new EnvironmentClock({ startHour: 23.5 }).daylight());
    const pointLight = city.root.getObjectByName('aohara-streetlight-point-1');
    if (!(pointLight instanceof PointLight)) {
      throw new Error('tier C should create its first active point light');
    }
    const initialPosition = pointLight.position.toArray();
    expect(city.getContentStats().streetLightPointLights).toBe(
      URBAN_NIGHT_TIER_BUDGET.C.streetPointLights,
    );
    expect(city.getContentStats().architecturalPointLights).toBe(
      URBAN_NIGHT_TIER_BUDGET.C.architecturalPointLights,
    );
    const architecturalLight = city.root.children.find(
      (child): child is PointLight =>
        child instanceof PointLight && child.name.includes('architecture-'),
    );
    if (architecturalLight === undefined) {
      throw new Error('tier C should create architectural point lights');
    }
    const initialArchitecturalPosition = architecturalLight.position.toArray();

    city.updateStreaming({
      x: AOHARA_DISTRICT_CONFIG.centerX + 250,
      y: 0,
      z: AOHARA_DISTRICT_CONFIG.centerZ + 250,
    });
    expect(pointLight.position.toArray()).not.toEqual(initialPosition);
    expect(architecturalLight.position.toArray()).not.toEqual(initialArchitecturalPosition);
    expect(city.getContentStats().streetLightFocusGain).toBe(1);
    city.updateStreaming({
      x: AOHARA_DISTRICT_CONFIG.centerX + 700,
      y: 0,
      z: AOHARA_DISTRICT_CONFIG.centerZ,
    });
    expect(city.getContentStats().streetLightFocusGain).toBe(0);
    expect(city.getContentStats().architecturalLightFocusGain).toBe(0);
    expect(pointLight.intensity).toBe(0);
    expect(architecturalLight.intensity).toBe(0);
    expect(city.root.getObjectByName('aohara-streetlight-gaussian-flare-1')?.visible).toBe(false);
    city.dispose();
  });

  it('mounts at the shared Aohara junction and blocks the high-rise footprint', () => {
    const position = [AOHARA_DISTRICT_CONFIG.centerX, 12, AOHARA_DISTRICT_CONFIG.centerZ] as const;
    const roadNetwork = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (roadNetwork === undefined) {
      throw new Error('the shared world sampler should expose the road graph');
    }
    const city = new UrbanNightWorld('B', { position, roadNetwork, networkIntegrated: true });
    expect(city.root.position.toArray()).toEqual([...position]);
    expect(city.root.getObjectByName('aohara-main-avenue')).toBeUndefined();
    expect(city.root.getObjectByName('aohara-signalized-cross-street')).toBeUndefined();
    expect(city.root.getObjectByName('aohara-ground-deck')).toBeUndefined();
    expect(city.getContentStats()).toMatchObject({
      cityBlocks: 16,
      highRiseBuildings: 32,
      infillBuildings: URBAN_ACTIVITY_TIER_BUDGET.B.infillBuildings,
      infillHippedRoofs: 4,
      infillFlatRoofs: 8,
      urbanTrafficVehicles: URBAN_ACTIVITY_TIER_BUDGET.B.trafficVehicles,
      urbanTrafficPassengerCars: 4,
      urbanTrafficCityBuses: 3,
      urbanTrafficRigidTrucks: 3,
      urbanTrafficSemiTrailerRigs: 3,
      urbanTrafficFarmTractors: 3,
      urbanTrafficBatches: 5,
      urbanPedestrians: URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians,
      urbanActivityBatches: 7,
      stadiums: 1,
      casinos: 2,
      mansions: 4,
      houses: 4,
      townhouses: 8,
      shops: 4,
      billboards: 18,
      activePointLights: URBAN_NIGHT_TIER_BUDGET.B.pointLights,
    });
    expect(URBAN_CITY_CONFIG.streetLamp.spacingMeters).toBe(40);
    expect(city.getContentStats().streetLightPoles).toBe(240);
    expect(city.getContentStats().districtBanners).toBe(48);
    expect(city.getContentStats()).toMatchObject({
      urbanStreetFurnitureBatches: 4,
      urbanStreetFurnitureInstances:
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.benches +
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.planters +
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.wasteBins +
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.bicycleRacks,
      urbanStreetBenches: URBAN_STREET_FURNITURE_TIER_BUDGET.B.benches,
      urbanStreetBenchesBudget: URBAN_STREET_FURNITURE_TIER_BUDGET.B.benches,
      urbanStreetPlanters: URBAN_STREET_FURNITURE_TIER_BUDGET.B.planters,
      urbanStreetPlantersBudget: URBAN_STREET_FURNITURE_TIER_BUDGET.B.planters,
      urbanStreetWasteBins: URBAN_STREET_FURNITURE_TIER_BUDGET.B.wasteBins,
      urbanStreetWasteBinsBudget: URBAN_STREET_FURNITURE_TIER_BUDGET.B.wasteBins,
      urbanStreetBicycleRacks: URBAN_STREET_FURNITURE_TIER_BUDGET.B.bicycleRacks,
      urbanStreetBicycleRacksBudget: URBAN_STREET_FURNITURE_TIER_BUDGET.B.bicycleRacks,
    });
    for (const name of [
      'aohara-street-benches',
      'aohara-street-planters',
      'aohara-street-waste-bins',
      'aohara-street-bicycle-racks',
    ]) {
      expect(city.root.getObjectByName(name)).toBeInstanceOf(InstancedMesh);
    }
    expect(city.getContentStats().decorativeLights).toBe(
      44 + URBAN_ACTIVITY_TIER_BUDGET.B.infillBuildings,
    );

    const trafficBodies = city.root.getObjectByName('aohara-traffic-passenger-car-instances');
    const pedestrianBodies = city.root.getObjectByName('aohara-sidewalk-pedestrian-bodies');
    if (!(trafficBodies instanceof InstancedMesh) || !(pedestrianBodies instanceof InstancedMesh)) {
      throw new Error('integrated Aohara should batch its bounded traffic and pedestrians');
    }
    const vehicleBefore = new Matrix4();
    const pedestrianBefore = new Matrix4();
    trafficBodies.getMatrixAt(0, vehicleBefore);
    pedestrianBodies.getMatrixAt(0, pedestrianBefore);
    city.update(0.1);
    const vehicleAfter = new Matrix4();
    const pedestrianAfter = new Matrix4();
    trafficBodies.getMatrixAt(0, vehicleAfter);
    pedestrianBodies.getMatrixAt(0, pedestrianAfter);
    expect(vehicleAfter.equals(vehicleBefore)).toBe(false);
    expect(pedestrianAfter.equals(pedestrianBefore)).toBe(false);

    const towerX = position[0] - 31;
    const towerZ = position[2] - 57;
    const hit = city.collide({
      x: towerX,
      z: towerZ + 15,
      yaw: 0,
      velocityX: 0,
      velocityZ: -8,
    });
    expect(hit[0]?.solid).toBe(true);
    expect(hit[0]?.absorbedSpeed).toBeCloseTo(8, 0);
    const houseHit = city.collide({
      x: position[0] + 345,
      z: position[2] + 352,
      yaw: 0,
      velocityX: 0,
      velocityZ: -5,
    });
    expect(houseHit[0]?.solid).toBe(true);
    expect(
      city.collide({
        x: position[0],
        z: position[2],
        yaw: 0,
        velocityX: 0,
        velocityZ: -8,
      }),
    ).toHaveLength(0);
    city.dispose();
  });

  it('keeps sampled urban road/sidewalk corridors clear of collision footprints and building overlap', () => {
    const network = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (network === undefined) {
      throw new Error('the shared world sampler should expose the road graph');
    }
    const city = new UrbanNightWorld('B', {
      position: [AOHARA_DISTRICT_CONFIG.centerX, 0, AOHARA_DISTRICT_CONFIG.centerZ],
      roadNetwork: network,
      networkIntegrated: true,
    });
    const footprints = city.getStaticBuildingFootprints();
    expect(footprints).toHaveLength(55 + URBAN_ACTIVITY_TIER_BUDGET.B.infillBuildings);

    for (let first = 0; first < footprints.length; first += 1) {
      for (let second = first + 1; second < footprints.length; second += 1) {
        const separation = footprintSeparation(footprints[first]!, footprints[second]!, 0.75);
        expect(
          separation,
          `building footprints ${first} and ${second} overlap or leave less than the roof-eave margin`,
        ).toBeGreaterThan(0.05);
      }
    }

    expect(expectUrbanRoadClearance(city, network)).toBeGreaterThan(1000);
    city.dispose();
  });

  it('generates deterministic furniture while preserving road, crossing, spawn, building and walkway clearances', () => {
    const network = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (network === undefined) {
      throw new Error('the shared world sampler should expose the road graph');
    }
    const city = new UrbanNightWorld('B', {
      position: [AOHARA_DISTRICT_CONFIG.centerX, 0, AOHARA_DISTRICT_CONFIG.centerZ],
      roadNetwork: network,
      networkIntegrated: true,
    });
    const footprints = city.getStaticBuildingFootprints();
    const placements = generateAoharaStreetFurniturePlacements(network, 'B', footprints);
    const repeat = generateAoharaStreetFurniturePlacements(network, 'B', footprints);
    expect(placements).toEqual(repeat);
    expect(new Set(placements.map((placement) => placement.slotId)).size).toBe(placements.length);
    expect(placements).toHaveLength(
      URBAN_STREET_FURNITURE_TIER_BUDGET.B.benches +
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.planters +
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.wasteBins +
        URBAN_STREET_FURNITURE_TIER_BUDGET.B.bicycleRacks,
    );
    const spawn = SPAWN_POINTS.find((point) => point.id === DEFAULT_SPAWN_ID);
    if (spawn === undefined) {
      throw new Error('Aohara should remain the configured default spawn');
    }
    const edgeById = new Map(network.edges.map((edge) => [edge.id, edge]));
    const largestMarkingApproach = Math.max(
      Math.max(
        AOHARA_DISTRICT_CONFIG.arterialHalfWidthMeters,
        AOHARA_DISTRICT_CONFIG.localStreetHalfWidthMeters,
      ) + 3.8,
      URBAN_CITY_CONFIG.trafficSignal.stopLineOffsetMeters,
    );

    for (const placement of placements) {
      const edge = edgeById.get(placement.roadEdgeId);
      if (edge === undefined) {
        throw new Error(`unknown furniture road edge ${placement.roadEdgeId}`);
      }
      const endpointClearance = Math.min(
        placement.alongMeters,
        edge.lengthMeters - placement.alongMeters,
      );
      expect(endpointClearance).toBeGreaterThanOrEqual(
        URBAN_STREET_FURNITURE_CONFIG.intersectionClearanceMeters,
      );
      expect(
        endpointClearance - largestMarkingApproach - placement.halfDepthMeters,
      ).toBeGreaterThanOrEqual(URBAN_STREET_FURNITURE_CONFIG.minimumRoadMarkingClearanceMeters);
      expect(Math.hypot(placement.x - spawn.x, placement.z - spawn.z)).toBeGreaterThanOrEqual(
        URBAN_STREET_FURNITURE_CONFIG.spawnClearanceMeters,
      );

      const sample = network.sample(placement.x, placement.z);
      if (sample === null) {
        throw new Error(`furniture ${placement.slotId} should remain beside its urban road`);
      }
      expect(['urban-local', 'urban-arterial']).toContain(sample.roadClass);
      const walkwayClearance =
        sample.distance -
        sample.halfWidthMeters -
        sample.shoulderMeters -
        placement.halfWidthMeters;
      const curbClearance =
        sample.halfWidthMeters +
        sample.shoulderMeters +
        URBAN_CITY_CONFIG.sidewalk.widthMeters -
        sample.distance -
        placement.halfWidthMeters;
      expect(walkwayClearance).toBeGreaterThanOrEqual(
        URBAN_STREET_FURNITURE_CONFIG.minimumWalkwayClearanceMeters,
      );
      expect(curbClearance + 1e-4).toBeGreaterThanOrEqual(
        URBAN_STREET_FURNITURE_CONFIG.outerCurbMarginMeters,
      );

      const furnitureBox: StaticBuildingBox = {
        x: placement.x,
        z: placement.z,
        yaw: placement.yaw,
        halfWidth: placement.halfWidthMeters,
        halfDepth: placement.halfDepthMeters,
      };
      for (const building of footprints) {
        expect(footprintSeparation(furnitureBox, building, 0)).toBeGreaterThan(
          URBAN_STREET_FURNITURE_CONFIG.buildingFootprintClearanceMeters,
        );
      }
    }

    for (let first = 0; first < placements.length; first += 1) {
      const a = placements[first]!;
      const boxA: StaticBuildingBox = {
        x: a.x,
        z: a.z,
        yaw: a.yaw,
        halfWidth: a.halfWidthMeters,
        halfDepth: a.halfDepthMeters,
      };
      for (let second = first + 1; second < placements.length; second += 1) {
        const b = placements[second]!;
        const boxB: StaticBuildingBox = {
          x: b.x,
          z: b.z,
          yaw: b.yaw,
          halfWidth: b.halfWidthMeters,
          halfDepth: b.halfDepthMeters,
        };
        expect(footprintSeparation(boxA, boxB, 0)).toBeGreaterThanOrEqual(
          URBAN_STREET_FURNITURE_CONFIG.minimumFurnitureSeparationMeters,
        );
      }
    }
    city.dispose();
  });
});
