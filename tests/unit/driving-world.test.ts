import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { RENDER_CONFIG } from '../../src/config/render';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { WORLD_CONFIG } from '../../src/config/world';
import type { DaylightState } from '../../src/environment/EnvironmentClock';
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
    });

    expect(content.kind).toBe('driving');
    expect(content.root.getObjectByName('AoharaNightLightingBlock')).not.toBeNull();
    expect(content.getContentStats?.()).toMatchObject({
      highRiseBuildings: 8,
      trafficSignals: 2,
      streetLightPointLights: 4,
      roadMeshes: 6,
    });

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
    content.update?.(1);
    content.dispose();
  });
});
