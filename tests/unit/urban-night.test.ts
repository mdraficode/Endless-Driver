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
    expect(low.litWindowInstances).toBeLessThan(balanced.litWindowInstances);
    expect(balanced.litWindowInstances).toBeLessThan(high.litWindowInstances);
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
    expect(lowStats.streetLightPointLights).toBe(URBAN_NIGHT_TIER_BUDGET.C.pointLights);
    expect(lowStats.illuminatedWindows).toBeLessThanOrEqual(
      URBAN_NIGHT_TIER_BUDGET.C.litWindowInstances,
    );
    expect(highStats.streetLightPointLights).toBe(URBAN_NIGHT_TIER_BUDGET.A.pointLights);
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

    city.updateStreaming({
      x: AOHARA_DISTRICT_CONFIG.centerX + 250,
      y: 0,
      z: AOHARA_DISTRICT_CONFIG.centerZ + 250,
    });
    expect(pointLight.position.toArray()).not.toEqual(initialPosition);
    expect(city.getContentStats().streetLightFocusGain).toBe(1);
    expect(city.getContentStats().streetLightPointLights).toBe(4);

    city.updateStreaming({
      x: AOHARA_DISTRICT_CONFIG.centerX + 700,
      y: 0,
      z: AOHARA_DISTRICT_CONFIG.centerZ,
    });
    expect(city.getContentStats().streetLightFocusGain).toBe(0);
    expect(pointLight.intensity).toBe(0);
    expect(city.root.getObjectByName('aohara-streetlight-gaussian-flare-1')?.visible).toBe(false);
    city.dispose();
  });

  it('mounts at the shared Aohara junction and blocks the high-rise footprint', () => {
    const position = [AOHARA_DISTRICT_CONFIG.centerX, 12, AOHARA_DISTRICT_CONFIG.centerZ] as const;
    const city = new UrbanNightWorld('B', { position, networkIntegrated: true });
    expect(city.root.position.toArray()).toEqual([...position]);
    expect(city.root.getObjectByName('aohara-main-avenue')).toBeUndefined();
    expect(city.root.getObjectByName('aohara-signalized-cross-street')).toBeUndefined();
    expect(city.root.getObjectByName('aohara-ground-deck')).toBeUndefined();
    expect(city.getContentStats()).toMatchObject({ cityBlocks: 16, highRiseBuildings: 32 });

    const towerX = position[0] - 31;
    const towerZ = position[2] - 56;
    const hit = city.collide({
      x: towerX,
      z: towerZ + 15,
      yaw: 0,
      velocityX: 0,
      velocityZ: -8,
    });
    expect(hit[0]?.solid).toBe(true);
    expect(hit[0]?.absorbedSpeed).toBeCloseTo(8, 0);
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
});
