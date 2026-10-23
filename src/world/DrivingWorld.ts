import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import { AOHARA_DISTRICT_CONFIG, AOHARA_JUNCTION_NODE_ID } from '../config/urban-district';
import { SurfaceTextureLibrary } from '../assets/SurfaceTextureLibrary';
import type { TierId } from '../config/tiers';
import { RoadWorld } from './RoadWorld';
import { UrbanNightWorld } from './urban-night';
import { TerrainWorld } from './TerrainWorld';
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
  const root = new Group();
  root.name = 'driving-world';
  const surfaceTextures = new SurfaceTextureLibrary();
  const terrain = new TerrainWorld(terrainSampler);
  root.add(terrain.root);
  // Road ribbons exist only when the shared sampler carries the carved network; the
  // mesh-less samplers used by unit fixtures simply stay roadless.
  const roads =
    terrainSampler.roadNetwork !== undefined
      ? new RoadWorld(terrainSampler.roadNetwork, surfaceTextures)
      : null;
  if (roads !== null) {
    root.add(roads.object);
  }
  // District vegetation (Increment 5): instanced scatter fed by the same sampler.
  // The detail scale pulls the scanned LOD rings in on modest devices: the deep
  // jungle canopy is the heaviest thing this world streams.
  const detailScale = context.qualityTier === 'C' ? 0.6 : context.qualityTier === 'B' ? 0.85 : 1;
  const vegetationTier: TierId =
    context.qualityTier === 'C' ? 'C' : context.qualityTier === 'B' ? 'B' : 'A';
  const vegetation = new VegetationWorld(terrainSampler, undefined, detailScale, vegetationTier);
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
  const tier: TierId =
    context.qualityTier === 'A' || context.qualityTier === 'C' ? context.qualityTier : 'B';
  const aohara =
    urbanNode === null
      ? null
      : new UrbanNightWorld(tier, {
          position: [
            AOHARA_DISTRICT_CONFIG.centerX,
            urbanNode.y + 0.57,
            AOHARA_DISTRICT_CONFIG.centerZ,
          ],
          ...(urbanNetwork === null ? {} : { roadNetwork: urbanNetwork }),
          ...(context.physics === undefined ? {} : { physics: context.physics }),
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
    prepareInitial: async (focus, velocity = { x: 0, z: 0 }) => {
      aohara?.updateStreaming(focus);
      await Promise.all([
        scannedAssetsReady,
        terrain.prepareInitial(focus, velocity),
        vegetation.prepareInitial(focus, velocity),
      ]);
    },
    collideTown: (car, deltaSeconds) => [
      ...town.collide(car, deltaSeconds),
      ...(aohara?.collide(car) ?? []),
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
      const roadStats = roads?.getStats() ?? {};
      const vegetationStats = vegetation.getContentStats();
      const townStats = town.getContentStats();
      const urbanStats = aohara?.getContentStats() ?? {};
      const groundCoverInstances = vegetationStats.groundCoverInstances ?? 0;
      const groundCoverBudget = vegetationStats.groundCoverInstanceBudget ?? 0;
      const streetFurnitureInstances = urbanStats.urbanStreetFurnitureInstances ?? 0;
      const streetFurnitureBudget = urbanStats.urbanStreetFurnitureInstanceBudget ?? 0;
      return {
        ...terrainStats,
        ...roadStats,
        ...vegetationStats,
        ...townStats,
        ...urbanStats,
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
