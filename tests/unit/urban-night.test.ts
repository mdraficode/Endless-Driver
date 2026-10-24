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
import { ROAD_MARKING_JUNCTION_CLEARANCE_METERS } from '../../src/world/road-geometry';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import { UrbanNightWorld } from '../../src/world/urban-night';
import {
  advanceTrafficWithSignal,
  constrainTrafficFollowingTravel,
  constrainTrafficRouteSpacing,
  projectTrafficRoutePosition,
  UrbanStreetActivity,
} from '../../src/world/urban-activity';
import { generateAoharaAlleyFacadePlacements } from '../../src/world/urban-alley-frontages';
import { generateAoharaAlleyPropPlacements } from '../../src/world/urban-backstreets';
import { generateAoharaStreetFurniturePlacements } from '../../src/world/urban-furniture';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import type { RoadNetwork } from '../../src/world/road-network';
import {
  collideCarWithStaticBoxes,
  type StaticBuildingBox,
} from '../../src/world/static-building-collision';

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

function expectedFurnitureNodeClearance(
  network: RoadNetwork,
  nodeId: string,
  halfDepthMeters: number,
): { readonly minimumDistanceMeters: number; readonly markingApproachMeters: number } {
  let horizontalHalfWidth: number | null = null;
  let verticalHalfWidth: number | null = null;
  for (const edge of network.edges) {
    if (
      (edge.roadClass !== 'urban-local' && edge.roadClass !== 'urban-arterial') ||
      (edge.from !== nodeId && edge.to !== nodeId)
    ) {
      continue;
    }
    const from = network.nodeById(edge.from);
    const to = network.nodeById(edge.to);
    if (from === null || to === null) continue;
    if (Math.abs(to.x - from.x) >= Math.abs(to.z - from.z)) {
      horizontalHalfWidth = Math.max(horizontalHalfWidth ?? 0, edge.halfWidthMeters);
    } else {
      verticalHalfWidth = Math.max(verticalHalfWidth ?? 0, edge.halfWidthMeters);
    }
  }
  const isCrosswalk = horizontalHalfWidth !== null && verticalHalfWidth !== null;
  const crosswalkApproachMeters = isCrosswalk
    ? Math.max(horizontalHalfWidth ?? 0, verticalHalfWidth ?? 0) + 3.8
    : 0;
  const isAlleyMouth = nodeId.startsWith('aohara-access-');
  const markingApproachMeters = isAlleyMouth
    ? ROAD_MARKING_JUNCTION_CLEARANCE_METERS
    : Math.max(
        crosswalkApproachMeters,
        nodeId === 'aohara-center' ? URBAN_CITY_CONFIG.trafficSignal.stopLineOffsetMeters : 0,
      );
  const configuredClearance = isAlleyMouth
    ? URBAN_STREET_FURNITURE_CONFIG.alleyMouthClearanceMeters
    : URBAN_STREET_FURNITURE_CONFIG.intersectionClearanceMeters;
  return {
    minimumDistanceMeters: Math.max(
      configuredClearance,
      markingApproachMeters +
        halfDepthMeters +
        URBAN_STREET_FURNITURE_CONFIG.minimumRoadMarkingClearanceMeters,
    ),
    markingApproachMeters,
  };
}

function expectUrbanAlleyClearance(city: UrbanNightWorld, network: RoadNetwork): number {
  let probeCount = 0;
  const buildingFootprints = city.getStaticBuildingFootprints();
  const facadeFootprints = city.getBackstreetFacadeFootprints();
  const propFootprints = city.getBackstreetPropFootprints();
  const alleyEdges = network.edges.filter((edge) => edge.roadClass === 'urban-alley');
  for (const edge of alleyEdges) {
    for (let index = 0; index < edge.points.length; index += 1) {
      const point = edge.points[index]!;
      const previous = edge.points[Math.max(0, index - 1)]!;
      const next = edge.points[Math.min(edge.points.length - 1, index + 1)]!;
      const tangentLength = Math.hypot(next.x - previous.x, next.z - previous.z) || 1;
      const tangentX = (next.x - previous.x) / tangentLength;
      const tangentZ = (next.z - previous.z) / tangentLength;
      const sideX = tangentZ;
      const sideZ = -tangentX;
      const yaw = Math.atan2(-tangentX, -tangentZ);
      for (const lateralOffset of [0, -1.2, 1.2]) {
        const probe = {
          x: point.x + sideX * lateralOffset,
          z: point.z + sideZ * lateralOffset,
          yaw,
          velocityX: 0,
          velocityZ: 0,
        };
        const obstructions = city.collide(probe);
        const buildingHits =
          obstructions.length === 0
            ? []
            : buildingFootprints.flatMap((footprint, footprintIndex) =>
                collideCarWithStaticBoxes(probe, [footprint]).length === 0
                  ? []
                  : [
                      `#${footprintIndex} center(${footprint.x.toFixed(1)},${footprint.z.toFixed(1)}) ` +
                        `half(${footprint.halfWidth.toFixed(1)},${footprint.halfDepth.toFixed(1)}) ` +
                        `yaw${footprint.yaw.toFixed(2)}`,
                    ],
              );
        const firstCollisionIndex = (boxes: readonly StaticBuildingBox[]): number =>
          boxes.findIndex((box) => collideCarWithStaticBoxes(probe, [box]).length > 0);
        const facadeHit = obstructions.length === 0 ? -1 : firstCollisionIndex(facadeFootprints);
        const propHit = obstructions.length === 0 ? -1 : firstCollisionIndex(propFootprints);
        const hitBox = facadeHit < 0 ? undefined : facadeFootprints[facadeHit];
        const nearestRoad = hitBox === undefined ? null : network.sample(hitBox.x, hitBox.z);
        const facadeDescription =
          hitBox === undefined
            ? 'none'
            : `#${facadeHit} center(${hitBox.x.toFixed(2)},${hitBox.z.toFixed(2)}) ` +
              `half(${hitBox.halfWidth.toFixed(2)},${hitBox.halfDepth.toFixed(2)}) yaw${hitBox.yaw.toFixed(3)} ` +
              `nearestRoad=${nearestRoad?.edgeId ?? 'none'} distance=${nearestRoad?.distance.toFixed(2) ?? 'n/a'} ` +
              `halfWidth=${nearestRoad?.halfWidthMeters.toFixed(2) ?? 'n/a'}`;
        expect(
          obstructions,
          `${edge.id} is obstructed at ${point.alongMeters.toFixed(1)} m, lateral ${lateralOffset.toFixed(1)} m ` +
            `position (${probe.x.toFixed(1)},${probe.z.toFixed(1)}); building hits: ${buildingHits.join('; ') || 'none'}, ` +
            `facade hit: ${facadeDescription}, prop hit: ${propHit}`,
        ).toHaveLength(0);
        probeCount += 1;
      }
    }
  }
  return probeCount;
}

function expectUrbanRoadClearance(city: UrbanNightWorld, network: RoadNetwork): number {
  let probeCount = 0;
  const buildingFootprints = city.getStaticBuildingFootprints();
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
        const obstructions = city.collide(probe);
        const buildingObstructions =
          obstructions.length === 0
            ? 0
            : collideCarWithStaticBoxes(probe, buildingFootprints).length;
        expect(
          obstructions,
          `${edge.id} has an obstruction across the road/sidewalk probe at ${point.alongMeters.toFixed(1)} m, ` +
            `lateral ${lateralOffset.toFixed(1)} m (building hits: ${buildingObstructions})`,
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
      C: { passengerCars: 3, cityBuses: 3, rigidTrucks: 2, semiTrailerRigs: 2, farmTractors: 2 },
      B: { passengerCars: 5, cityBuses: 5, rigidTrucks: 5, semiTrailerRigs: 5, farmTractors: 4 },
      A: { passengerCars: 8, cityBuses: 7, rigidTrucks: 7, semiTrailerRigs: 7, farmTractors: 7 },
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
    expect(trafficVehicleCountFor('C', 'light')).toBe(6);
    expect(trafficVehicleCountFor('C', 'standard')).toBe(12);
    expect(trafficVehicleCountFor('C', 'busy')).toBe(18);
    expect(trafficVehicleCountFor('B', 'off')).toBe(0);
    expect(trafficVehicleCountFor('B', 'light')).toBe(12);
    expect(trafficVehicleCountFor('B', 'busy')).toBe(36);
    expect(trafficVehicleCountFor('A', 'light')).toBe(18);
    expect(trafficVehicleCountFor('A', 'standard')).toBe(36);
    expect(trafficVehicleCountFor('A', 'busy')).toBe(54);

    const off = new UrbanStreetActivity('B', { trafficIntensity: 'off' });
    const light = new UrbanStreetActivity('B', { trafficIntensity: 'light' });
    const busy = new UrbanStreetActivity('B', { trafficIntensity: 'busy' });
    expect(off.getContentStats()).toMatchObject({
      urbanTrafficVehicles: 0,
      urbanTrafficBatches: 0,
    });
    expect(off.getContentStats().urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians);
    expect(light.getContentStats().urbanTrafficVehicles).toBe(12);
    expect(light.getContentStats().urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians);
    expect(busy.getContentStats().urbanTrafficVehicles).toBe(36);
    expect(busy.getContentStats().urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians);
    off.dispose();
    light.dispose();
    busy.dispose();
  });

  it('keeps baseline city activity budgets bounded and increasing across C/B/A tiers', () => {
    expect(URBAN_ACTIVITY_TIER_BUDGET.C).toEqual({
      infillBuildings: 8,
      trafficVehicles: 12,
      pedestrians: 16,
      alleyProps: 64,
    });
    for (const key of [
      'infillBuildings',
      'trafficVehicles',
      'pedestrians',
      'alleyProps',
    ] as const) {
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
    expect(lowStats.highRiseNightAccentInstances).toBeGreaterThan(0);
    expect(highStats.highRiseNightAccentInstances).toBeGreaterThan(
      lowStats.highRiseNightAccentInstances ?? 0,
    );
    expect(lowStats.storefrontNightAccentInstances).toBeGreaterThan(0);
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
    expect(lowStats.streetLightBollards).toBeGreaterThan(0);
    expect(lowStats.nightMoodLightCandidates).toBeGreaterThan(0);
    expect(lowStats.activeMoodPointLights).toBeLessThanOrEqual(
      URBAN_NIGHT_TIER_BUDGET.C.architecturalPointLights,
    );
    expect(cityC.root.getObjectByName('aohara-stadium-open-bowl-shell')).toBeDefined();
    expect(cityC.root.getObjectByName('aohara-abstract-billboards-0')).toBeDefined();
    expect(cityC.root.getObjectByName('aohara-street-banner-panels-0')).toBeDefined();
    const highRiseNightAccents = cityC.root.getObjectByName(
      'aohara-highrise-night-accent-strips-0',
    );
    const storefrontNightAccents = cityC.root.getObjectByName('aohara-storefront-night-accents-0');
    const curbBollards = cityC.root.getObjectByName('aohara-sidewalk-light-bollards-0');
    for (const accents of [highRiseNightAccents, storefrontNightAccents, curbBollards]) {
      expect(accents).toBeInstanceOf(InstancedMesh);
      if (!(accents instanceof InstancedMesh)) {
        throw new Error('night decorations should use bounded instanced batches');
      }
      expect(accents.material).toBeInstanceOf(MeshBasicNodeMaterial);
      expect((accents.material as MeshBasicNodeMaterial).colorNode).not.toBeNull();
      expect((accents.material as MeshBasicNodeMaterial).toneMapped).toBe(false);
    }
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
      frontageBuildings: expect.any(Number),
      urbanTrafficVehicles: URBAN_ACTIVITY_TIER_BUDGET.B.trafficVehicles,
      urbanTrafficPassengerCars: 5,
      urbanTrafficCityBuses: 5,
      urbanTrafficRigidTrucks: 5,
      urbanTrafficSemiTrailerRigs: 5,
      urbanTrafficFarmTractors: 4,
      urbanTrafficBatches: 5,
      urbanPedestrians: URBAN_ACTIVITY_TIER_BUDGET.B.pedestrians,
      urbanActivityBatches: 7,
      stadiums: 1,
      casinos: 2,
      mansions: 4,
      houses: 4,
      townhouses: 8,
      activePointLights: URBAN_NIGHT_TIER_BUDGET.B.pointLights,
    });
    expect(URBAN_CITY_CONFIG.streetLamp.spacingMeters).toBe(40);
    expect(city.getContentStats().streetLightPoles).toBe(240);
    expect(city.getContentStats().districtBanners).toBe(60);
    expect(city.getContentStats().streetLightBollards).toBe(30);
    expect(city.getContentStats().nightMoodLightCandidates).toBe(15);
    expect(city.getContentStats().highRiseNightAccentInstances).toBe(33);
    const cityStats = city.getContentStats();
    expect(cityStats.frontageBuildings).toBeGreaterThanOrEqual(240);
    expect(cityStats.shops).toBeGreaterThan(4);
    expect(cityStats.billboards).toBe(cityStats.shops! + 14);
    expect(cityStats.storefrontNightAccentInstances).toBe((cityStats.shops! + 2) * 3);
    expect(cityStats.urbanAlleyProps).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.alleyProps);
    expect(cityStats.urbanAlleyPropsBudget).toBe(URBAN_ACTIVITY_TIER_BUDGET.B.alleyProps);
    expect(cityStats.urbanAlleyPropBatches).toBeGreaterThan(0);
    expect(
      cityStats.urbanAlleyWasteBins! +
        cityStats.urbanAlleyDumpsters! +
        cityStats.urbanAlleyCardboardStacks! +
        cityStats.urbanAlleyHandCarts! +
        cityStats.urbanAlleyCrateStacks! +
        cityStats.urbanAlleyPallets!,
    ).toBe(cityStats.urbanAlleyProps);
    expect(city.root.getObjectByName('aohara-alley-props')).not.toBeNull();
    expect(cityStats.activeMoodPointLights).toBeLessThanOrEqual(
      URBAN_NIGHT_TIER_BUDGET.B.architecturalPointLights,
    );
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
    expect(cityStats.decorativeLights).toBe(
      40 + cityStats.frontageBuildings! + cityStats.infillBuildings! + cityStats.shops!,
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
    expect(footprints).toHaveLength(
      55 + city.getContentStats().frontageBuildings! + URBAN_ACTIVITY_TIER_BUDGET.B.infillBuildings,
    );

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
    expect(expectUrbanAlleyClearance(city, network)).toBeGreaterThan(1000);
    city.dispose();
  });

  it('builds continuous low-rise frontage rows, opening only where road clearance requires it', () => {
    const network = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (network === undefined) {
      throw new Error('the shared world sampler should expose the road graph');
    }
    const placements = generateAoharaAlleyFacadePlacements(network, 'B');
    expect(placements).toEqual(generateAoharaAlleyFacadePlacements(network, 'B'));
    expect(placements.length).toBeGreaterThan(500);
    expect(generateAoharaAlleyFacadePlacements(network, 'C').length).toBeLessThan(
      placements.length,
    );
    expect(generateAoharaAlleyFacadePlacements(network, 'A').length).toBeGreaterThan(
      placements.length,
    );
    expect(new Set(placements.map((placement) => placement.id)).size).toBe(placements.length);

    const alleyEdges = network.edges.filter((edge) => edge.roadClass === 'urban-alley');
    expect(alleyEdges.length).toBeGreaterThan(40);
    let plannedFrontageMeters = 0;
    let clearFrontageMeters = 0;
    for (const edge of alleyEdges) {
      const edgeRows = placements.filter((placement) => placement.roadEdgeId === edge.id);
      const startsAtStreetMouth = edge.from.startsWith('aohara-access-');
      const endsAtStreetMouth = edge.to.startsWith('aohara-access-');
      const startInset = startsAtStreetMouth ? 16.5 : 1.25;
      const endInset = endsAtStreetMouth ? 16.5 : edge.to.endsWith('-hub') ? 14 : 1.25;
      const plannedEnd = edge.lengthMeters - endInset;
      plannedFrontageMeters += Math.max(0, plannedEnd - startInset) * 2;

      for (const side of [-1, 1] as const) {
        const row = edgeRows
          .filter((placement) => placement.side === side)
          .sort((first, second) => first.startAlongMeters - second.startAlongMeters);
        let previousEnd = startInset;
        for (const building of row) {
          expect(building.widthMeters).toBeGreaterThan(0);
          expect(building.widthMeters).toBeLessThanOrEqual(12.000001);
          expect(building.startAlongMeters).toBeGreaterThanOrEqual(previousEnd - 1e-6);
          expect(building.startAlongMeters).toBeGreaterThanOrEqual(startInset - 1e-6);
          expect(building.endAlongMeters).toBeLessThanOrEqual(plannedEnd + 1e-6);
          expect(
            Math.abs(building.wallOffsetMeters - (edge.halfWidthMeters + 3.2)),
          ).toBeLessThanOrEqual(1.000001);
          clearFrontageMeters += building.widthMeters;
          previousEnd = building.endAlongMeters;
        }
      }
    }
    expect(clearFrontageMeters).toBeLessThan(plannedFrontageMeters);
    expect(clearFrontageMeters / plannedFrontageMeters).toBeGreaterThan(0.75);

    const city = new UrbanNightWorld('B', {
      position: [AOHARA_DISTRICT_CONFIG.centerX, 0, AOHARA_DISTRICT_CONFIG.centerZ],
      roadNetwork: network,
      networkIntegrated: true,
    });
    const facadeFootprints = city.getBackstreetFacadeFootprints();
    expect(facadeFootprints.length).toBeGreaterThan(0);
    expect(facadeFootprints.length).toBeLessThanOrEqual(placements.length * 24);
    for (const footprint of facadeFootprints) {
      const nearestRoad = network.sample(footprint.x, footprint.z);
      if (nearestRoad === null) continue;
      expect(
        nearestRoad.distance - nearestRoad.halfWidthMeters - nearestRoad.shoulderMeters,
        `${nearestRoad.edgeId} is too close to an alley facade collider`,
      ).toBeGreaterThanOrEqual(2.5);
    }
    const lastPlacementByRow = new Map<string, (typeof placements)[number]>();
    let expectedWallRuns = 0;
    for (const placement of placements) {
      const rowKey = `${placement.roadEdgeId}:${placement.side}`;
      const previous = lastPlacementByRow.get(rowKey);
      if (
        previous === undefined ||
        Math.abs(previous.endAlongMeters - placement.startAlongMeters) > 1e-6
      ) {
        expectedWallRuns += 1;
      }
      lastPlacementByRow.set(rowKey, placement);
    }
    expect(city.getContentStats()).toMatchObject({
      urbanAlleyFacadeBuildings: placements.length,
      urbanAlleyFacadeWindows: expect.any(Number),
      urbanAlleyFacadeDoors: expect.any(Number),
      urbanAlleyFacadeWallRuns: expectedWallRuns,
      urbanAlleyFacadeBatches: 5,
    });
    expect(city.getContentStats().urbanAlleyFacadeWindows).toBeGreaterThan(1000);
    expect(city.getContentStats().urbanAlleyFacadeDoors).toBeGreaterThan(50);
    city.dispose();
  });

  it('dresses the winding alleys with deterministic clutter without blocking pavement or building shells', () => {
    const network = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (network === undefined) {
      throw new Error('the shared world sampler should expose the road graph');
    }
    const city = new UrbanNightWorld('B', {
      position: [AOHARA_DISTRICT_CONFIG.centerX, 0, AOHARA_DISTRICT_CONFIG.centerZ],
      roadNetwork: network,
      networkIntegrated: true,
    });
    const buildings = city.getStaticBuildingFootprints();
    const facadeFootprints = city.getBackstreetFacadeFootprints();
    const facadePropFootprints = city.getBackstreetFacadePropFootprints();
    const placements = generateAoharaAlleyPropPlacements(
      network,
      'B',
      buildings,
      facadePropFootprints,
    );
    expect(placements).toEqual(
      generateAoharaAlleyPropPlacements(network, 'B', buildings, facadePropFootprints),
    );
    expect(placements).toHaveLength(URBAN_ACTIVITY_TIER_BUDGET.B.alleyProps);
    expect(new Set(placements.map((placement) => placement.id)).size).toBe(placements.length);

    const edges = new Map(network.edges.map((edge) => [edge.id, edge]));
    const spawn = SPAWN_POINTS.find((point) => point.id === DEFAULT_SPAWN_ID);
    for (const placement of placements) {
      const edge = edges.get(placement.roadEdgeId);
      if (edge === undefined) throw new Error(`missing alley edge ${placement.roadEdgeId}`);
      expect(edge.roadClass).toBe('urban-alley');
      if (edge.lengthMeters < 20) {
        expect(placement.alongMeters).toBeCloseTo(edge.lengthMeters / 2, 6);
      } else {
        const accessDistanceMeters = edge.from.startsWith('aohara-access-')
          ? placement.alongMeters
          : edge.lengthMeters - placement.alongMeters;
        const hubDistanceMeters = edge.from.startsWith('aohara-access-')
          ? edge.lengthMeters - placement.alongMeters
          : placement.alongMeters;
        expect(accessDistanceMeters).toBeGreaterThanOrEqual(20);
        expect(hubDistanceMeters).toBeGreaterThanOrEqual(14);
      }
      const road = network.sample(placement.x, placement.z);
      if (road === null) throw new Error(`alley clutter ${placement.id} lost its road sample`);
      expect(
        road.distance - road.halfWidthMeters - road.shoulderMeters - placement.widthMeters / 2,
      ).toBeGreaterThanOrEqual(0.22);
      if (spawn !== undefined) {
        expect(Math.hypot(placement.x - spawn.x, placement.z - spawn.z)).toBeGreaterThanOrEqual(18);
      }
      const propBox: StaticBuildingBox = {
        x: placement.x,
        z: placement.z,
        yaw: -placement.yaw,
        halfWidth: placement.widthMeters / 2,
        halfDepth: placement.depthMeters / 2,
      };
      for (const building of buildings) {
        expect(footprintSeparation(propBox, building, 0.25)).toBeGreaterThan(0);
      }
      for (const facade of facadeFootprints) {
        if ((propBox.x - facade.x) ** 2 + (propBox.z - facade.z) ** 2 > 64) continue;
        expect(
          footprintSeparation(propBox, facade, 0),
          `${placement.id} box center(${propBox.x.toFixed(2)},${propBox.z.toFixed(2)}) ` +
            `half(${propBox.halfWidth.toFixed(2)},${propBox.halfDepth.toFixed(2)}) yaw${propBox.yaw.toFixed(3)} ` +
            `intersects facade center(${facade.x.toFixed(2)},${facade.z.toFixed(2)}) ` +
            `half(${facade.halfWidth.toFixed(2)},${facade.halfDepth.toFixed(2)}) yaw${facade.yaw.toFixed(3)}`,
        ).toBeGreaterThan(0);
      }
    }

    for (let first = 0; first < placements.length; first += 1) {
      const a = placements[first]!;
      const boxA: StaticBuildingBox = {
        x: a.x,
        z: a.z,
        yaw: -a.yaw,
        halfWidth: a.widthMeters / 2,
        halfDepth: a.depthMeters / 2,
      };
      for (let second = first + 1; second < placements.length; second += 1) {
        const b = placements[second]!;
        const boxB: StaticBuildingBox = {
          x: b.x,
          z: b.z,
          yaw: -b.yaw,
          halfWidth: b.widthMeters / 2,
          halfDepth: b.depthMeters / 2,
        };
        expect(footprintSeparation(boxA, boxB, 0.28)).toBeGreaterThan(0);
      }
    }
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

    for (const placement of placements) {
      const edge = edgeById.get(placement.roadEdgeId);
      if (edge === undefined) {
        throw new Error(`unknown furniture road edge ${placement.roadEdgeId}`);
      }
      for (const [nodeId, endpointDistance] of [
        [edge.from, placement.alongMeters],
        [edge.to, edge.lengthMeters - placement.alongMeters],
      ] as const) {
        const requiredClearance = expectedFurnitureNodeClearance(
          network,
          nodeId,
          placement.halfDepthMeters,
        );
        expect(endpointDistance).toBeGreaterThanOrEqual(requiredClearance.minimumDistanceMeters);
        expect(
          endpointDistance - requiredClearance.markingApproachMeters - placement.halfDepthMeters,
        ).toBeGreaterThanOrEqual(URBAN_STREET_FURNITURE_CONFIG.minimumRoadMarkingClearanceMeters);
      }
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
