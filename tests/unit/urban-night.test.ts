import { Mesh, PointLight } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import {
  resolveTrafficSignalAspect,
  resolveUrbanNightGain,
  resolveUrbanStreetLightCoverage,
  resolveUrbanWetness,
  URBAN_CITY_CONFIG,
  URBAN_NIGHT_TIER_BUDGET,
} from '../../src/config/urban-city';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import { UrbanNightWorld } from '../../src/world/urban-night';
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
    expect(lowStats.streetLightPointLights).toBe(URBAN_NIGHT_TIER_BUDGET.C.streetPointLights);
    expect(lowStats.architecturalPointLights).toBe(
      URBAN_NIGHT_TIER_BUDGET.C.architecturalPointLights,
    );
    expect(lowStats.activePointLights).toBe(URBAN_NIGHT_TIER_BUDGET.C.pointLights);
    const cityLights = cityC.root.children.filter(
      (child): child is PointLight => child instanceof PointLight,
    );
    expect(cityLights).toHaveLength(URBAN_NIGHT_TIER_BUDGET.C.pointLights);
    expect(cityLights.every((light) => !light.castShadow)).toBe(true);
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
    expect(city.getContentStats().decorativeLights).toBe(44);

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
    expect(footprints).toHaveLength(55);

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
});
