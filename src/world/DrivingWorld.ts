import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import { AOHARA_DISTRICT_CONFIG, AOHARA_JUNCTION_NODE_ID } from '../config/urban-district';
import { SurfaceTextureLibrary } from '../assets/SurfaceTextureLibrary';
import type { TierId } from '../config/tiers';
import { RoadWorld } from './RoadWorld';
import { DistantMountainWorld } from './distant-mountains';
import { UrbanNightWorld } from './urban-night';
import { TerrainWorld } from './TerrainWorld';
import { HinodeTougeWorld } from './hinode-touge';
import { TownWorld } from './town';
import { VegetationWorld } from './vegetation';
import type { SceneContent, SceneContentContext } from './WorldContent';

/**
 * The driving world: streamed terrain/vegetation, the seeded rural road graph, Yūhi Town, and
 * Aohara Metropolis's 5×5 street/sidewalk grid and night block. Aohara shares the same terrain
 * sampler, physics heightfield, prefetch window and floating-origin contract; rural Hinode remains.
 */
export function createDrivingWorld(context: SceneContentContext): SceneContent {
  const { terrainSampler } = context;
  if (terrainSampler === undefined) {
    throw new Error(
      'createDrivingWorld requires a terrain sampler: Application creates one and shares it with physics.',
    );
  }
  const qualityTier: TierId =
    context.qualityTier === 'A' || context.qualityTier === 'B' ? context.qualityTier : 'C';
  const root = new Group();
  root.name = 'driving-world';
  const surfaceTextures = new SurfaceTextureLibrary();
  const terrain = new TerrainWorld(terrainSampler, {
    enableParallaxOcclusion: qualityTier === 'A',
  });
  root.add(terrain.root);
  const distantMountains = new DistantMountainWorld(terrainSampler);
  root.add(distantMountains.root);
  // Road ribbons exist only when the shared sampler carries the carved network; the
  // mesh-less samplers used by unit fixtures simply stay roadless.
  const roads =
    terrainSampler.roadNetwork !== undefined
      ? new RoadWorld(terrainSampler.roadNetwork, surfaceTextures)
      : null;
  roads?.setSurfaceWetness(context.surfaceState?.wetness ?? 0);
  if (roads !== null) {
    root.add(roads.object);
  }
  const hinodeTouge =
    terrainSampler.roadNetwork === undefined
      ? null
      : new HinodeTougeWorld(terrainSampler.roadNetwork, terrainSampler);
  if (hinodeTouge !== null) {
    root.add(hinodeTouge.root);
  }
  // District vegetation (Increment 5): instanced scatter fed by the same sampler.
  // The detail scale pulls the scanned LOD rings in on modest devices: the deep
  // jungle canopy is the heaviest thing this world streams.
  const detailScale = qualityTier === 'C' ? 0.6 : qualityTier === 'B' ? 0.85 : 1;
  const vegetation = new VegetationWorld(terrainSampler, undefined, detailScale, qualityTier);
  root.add(vegetation.root);
  // Scanned CC0 trees replace the authored species behind the same scatter (Phase 5). Start
  // loading immediately, then include it in first-world readiness so the forest is not swapped
  // visibly after play begins; a failed asset leaves the authored species standing.
  const scannedAssetsReady =
    context.renderer === undefined
      ? Promise.resolve()
      : vegetation.adoptScanned(context.renderer).catch((error: unknown) => {
          console.warn('scanned vegetation unavailable:', (error as Error).message);
        });
  // Yūhi Town + roadside poles (Increment 5b): static rural town, always resident.
  const town = new TownWorld(terrainSampler, surfaceTextures);
  root.add(town.root);
  vegetation.setGroundCoverBlockers(town.buildings);

  // Aohara's connected 5×5 street grid, sidewalks, crossings and night block share the graph above.
  // The compact, instanced city kit is resident; terrain and collision still use their normal
  // prepare-ahead streamers. Roadless test samplers keep the rural-only fixture behavior.
  const urbanNetwork = terrainSampler.roadNetwork ?? null;
  const urbanNode = urbanNetwork?.nodeById(AOHARA_JUNCTION_NODE_ID) ?? null;
  const aohara =
    urbanNode === null
      ? null
      : new UrbanNightWorld(qualityTier, {
          position: [
            AOHARA_DISTRICT_CONFIG.centerX,
            urbanNode.y + 0.57,
            AOHARA_DISTRICT_CONFIG.centerZ,
          ],
          ...(urbanNetwork === null ? {} : { roadNetwork: urbanNetwork }),
          ...(context.physics === undefined ? {} : { physics: context.physics }),
          ...(context.trafficIntensity === undefined
            ? {}
            : { trafficIntensity: context.trafficIntensity }),
          networkIntegrated: true,
          surfaceTextures,
        });
  if (aohara !== null) {
    root.add(aohara.root);
  }

  return {
    root,
    kind: 'driving',
    setDaylight: (state) => {
      vegetation.setDaylight(state);
      roads?.setDaylight(state);
      aohara?.setDaylight(state);
    },
    update: (deltaSeconds) => aohara?.update(deltaSeconds),
    updateStreaming: (focus, velocity, deltaSeconds) => {
      terrain.updateStreaming(focus, velocity);
      vegetation.updateStreaming(focus, velocity, deltaSeconds ?? 0);
      town.updateStreaming(focus, deltaSeconds ?? 0);
      aohara?.updateStreaming(focus);
    },
    prepareInitial: async (focus, velocity = { x: 0, z: 0 }, onProgress) => {
      aohara?.updateStreaming(focus);
      let terrainProgress = 0;
      let vegetationProgress = 0;
      let scannedAssetsProgress = 0;
      let reportedProgress = -1;
      const reportProgress = (): void => {
        const fraction =
          terrainProgress * 0.45 + vegetationProgress * 0.45 + scannedAssetsProgress * 0.1;
        if (fraction > reportedProgress) {
          reportedProgress = fraction;
          onProgress?.(fraction);
        }
      };
      const terrainPreparation = terrain.prepareInitial(focus, velocity, (fraction) => {
        terrainProgress = Math.max(0, Math.min(1, fraction));
        reportProgress();
      });
      const vegetationPreparation = vegetation.prepareInitial(focus, velocity, (fraction) => {
        vegetationProgress = Math.max(0, Math.min(1, fraction));
        reportProgress();
      });
      const scannedAssetsPreparation = scannedAssetsReady.then(() => {
        scannedAssetsProgress = 1;
        reportProgress();
      });
      reportProgress();
      await Promise.all([terrainPreparation, vegetationPreparation, scannedAssetsPreparation]);
      onProgress?.(1);
    },
    collideTown: (car, deltaSeconds) => [
      ...town.collide(car, deltaSeconds),
      ...(aohara?.collide(car) ?? []),
      ...(hinodeTouge?.collide(car) ?? []),
    ],
    applyVegetationHits: (events) => {
      vegetation.applyHits(events);
    },
    setVegetationStateProvider: (provider) => {
      vegetation.setStateProvider(provider);
    },
    loadSurfaces: async () => {
      await Promise.all([
        terrain.loadSurfaces(),
        roads === null ? Promise.resolve() : roads.loadSurfaces(),
        town.loadSurfaces(),
        aohara === null ? Promise.resolve() : aohara.loadSurfaces(),
      ]);
    },
    getContentStats: () => {
      const terrainStats = terrain.getContentStats();
      const mountainStats = distantMountains.getContentStats();
      const roadStats = roads?.getStats() ?? {};
      const vegetationStats = vegetation.getContentStats();
      const townStats = town.getContentStats();
      const urbanStats = aohara?.getContentStats() ?? {};
      const tougeStats = hinodeTouge?.getContentStats() ?? {};
      const groundCoverInstances = vegetationStats.groundCoverInstances ?? 0;
      const groundCoverBudget = vegetationStats.groundCoverInstanceBudget ?? 0;
      const streetFurnitureInstances = urbanStats.urbanStreetFurnitureInstances ?? 0;
      const streetFurnitureBudget = urbanStats.urbanStreetFurnitureInstanceBudget ?? 0;
      return {
        ...terrainStats,
        ...mountainStats,
        ...roadStats,
        ...vegetationStats,
        ...townStats,
        ...urbanStats,
        ...tougeStats,
        worldEnrichmentInstances: groundCoverInstances + streetFurnitureInstances,
        worldEnrichmentInstanceBudget: groundCoverBudget + streetFurnitureBudget,
        /** Number of static instance pools; this is not a measured draw-call count. */
        worldEnrichmentBatchPools:
          (vegetationStats.groundCoverStylePools ?? 0) +
          (urbanStats.urbanStreetFurnitureBatches ?? 0),
      };
    },
    dispose(): void {
      terrain.dispose();
      roads?.dispose();
      vegetation.dispose();
      town.dispose();
      aohara?.dispose();
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      root.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
        }
      });
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const material of materials) {
        material.dispose();
      }
      surfaceTextures.dispose();
      root.removeFromParent();
    },
  };
}
