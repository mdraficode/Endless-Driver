import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import { AOHARA_DISTRICT_CONFIG, AOHARA_JUNCTION_NODE_ID } from '../config/urban-district';
import { SurfaceTextureLibrary } from '../assets/SurfaceTextureLibrary';
import type { TierId } from '../config/tiers';
import { RoadWorld } from './RoadWorld';
import { DistantMountainWorld } from './distant-mountains';
import { UrbanNightWorld } from './urban-night';
import { CityStreamer } from './city-streamer';
import { homeCityAnchor } from './city-content';
import { TerrainWorld } from './TerrainWorld';
import { HinodeTougeWorld } from './hinode-touge';
import { TownWorld, setTownDistrict } from './town';
import { VegetationWorld } from './vegetation';
import { WildernessTracksWorld } from './wilderness-tracks-world';
import { FaunaField } from './fauna';
import { FaunaWorld } from './fauna-world';
import { nearestSmallTownDistrict, setPlanDistricts } from './plan-districts';
import { ROAD_WINDOW_CELLS } from './road-layout';
import { ParkedTrafficWorld } from './parked-traffic';
import { HideoutWorld } from './hideout-world';
import { GpuTrafficWorld } from './gpu-traffic';
import { WorldEventManager } from './world-events';
import { resolveUrbanNightGain } from '../config/urban-city';
import { computeHomePedestrians, PedestrianWorld } from './pedestrians';
import type { AssetResolution } from '../assets/AssetManifest';
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
  const wetRoadMaskOutput =
    context.config.postProcessing.enabled && context.config.postProcessing.ssr.enabled;
  const root = new Group();
  root.name = 'driving-world';
  const surfaceTextures = new SurfaceTextureLibrary();
  const terrainInitialRing = qualityTier === 'C' ? 0 : 1;
  // Phase 10: when a plan is present, the hand-placed Hinode data is retired — districts,
  // the town and the home city all follow the generated world.
  const plan = context.worldPlan ?? null;
  const anchor = plan === null ? null : homeCityAnchor(plan);
  if (plan !== null) {
    setPlanDistricts(plan);
    const smallTown = nearestSmallTownDistrict(plan, ROAD_WINDOW_CELLS);
    setTownDistrict(
      smallTown === null
        ? null
        : {
            id: 'generated-small-town',
            label: 'Generated Small Town',
            centerX: smallTown.x,
            centerZ: smallTown.z,
            radiusMeters: Math.min(smallTown.radius, 900),
            speciesDensity: {},
            groundTint: [1, 1, 1],
          },
    );
  }
  const terrain = new TerrainWorld(terrainSampler, {
    enableParallaxOcclusion: qualityTier === 'A',
    initialReadyRing: terrainInitialRing,
  });
  root.add(terrain.root);
  const distantMountains = new DistantMountainWorld(terrainSampler);
  root.add(distantMountains.root);
  // Road ribbons exist only when the shared sampler carries the carved network; the
  // mesh-less samplers used by unit fixtures simply stay roadless.
  const roads =
    terrainSampler.roadNetwork !== undefined
      ? new RoadWorld(terrainSampler.roadNetwork, surfaceTextures, wetRoadMaskOutput)
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
  // Phase 7.2: the wilderness track ribbons — the packed-earth cores of the dirt bands the
  // terrain splats out past the city edge (wilderness-tracks.ts owns the pure routes).
  const wildernessTracks = new WildernessTracksWorld(terrainSampler, qualityTier);
  root.add(wildernessTracks.root);
  // Phase 7.3: the fauna charges — the pure state machine (fauna.ts) is advanced pre-physics
  // by Application via `collideFauna`; this world mirrors the active charge one frame behind.
  const faunaField = new FaunaField({
    terrainSeed: terrainSampler.config.seed,
    chunkSizeMeters: terrainSampler.config.chunkSizeMeters,
    qualityTier,
  });
  const faunaWorld = new FaunaWorld(terrainSampler);
  root.add(faunaWorld.root);
  /** Toasts armed by the field this frame, drained into the next event-message consume. */
  const faunaToasts: { text: string; tone: 'info' | 'error' }[] = [];
  // Scanned CC0 trees are optional visual upgrades. Keep the authored species for the first
  // playable frame; the composition root starts GLB download/decode after the loading overlay hides.
  let scannedAssetsStarted = false;
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
            anchor?.x ?? AOHARA_DISTRICT_CONFIG.centerX,
            urbanNode.y + 0.57,
            anchor?.z ?? AOHARA_DISTRICT_CONFIG.centerZ,
          ],
          ...(urbanNetwork === null ? {} : { roadNetwork: urbanNetwork }),
          ...(context.physics === undefined ? {} : { physics: context.physics }),
          ...(context.trafficIntensity === undefined
            ? {}
            : { trafficIntensity: context.trafficIntensity }),
          networkIntegrated: true,
          surfaceTextures,
          wetRoadMaskOutput,
        });
  if (aohara !== null) {
    root.add(aohara.root);
  }

  // Phase 10.3: the NPC ecosystem — instanced pedestrians on the sidewalks of the home
  // district and of every streamed massing city (activity nodes stream in with the cities).
  const pedestrianWorld =
    urbanNetwork === null
      ? null
      : new PedestrianWorld({
          tier: qualityTier,
          network: urbanNetwork,
          home: computeHomePedestrians(
            {
              x: anchor?.x ?? AOHARA_DISTRICT_CONFIG.centerX,
              z: anchor?.z ?? AOHARA_DISTRICT_CONFIG.centerZ,
            },
            urbanNetwork,
            plan?.seed ?? 20261103,
          ),
        });
  if (pedestrianWorld !== null) {
    root.add(pedestrianWorld.root);
  }

  // The vast city beyond the home city: streamed on approach (Phase 10).
  const cityStreamer =
    plan === null || pedestrianWorld === null
      ? plan === null
        ? null
        : new CityStreamer(plan, qualityTier, terrainSampler, {
            attach: (city) => root.add(city.root),
            detach: (city) => root.remove(city.root),
          })
      : new CityStreamer(plan, qualityTier, terrainSampler, {
          attach: (city) => root.add(city.root),
          detach: (city) => root.remove(city.root),
          pedestrians: pedestrianWorld,
        });

  // Phase 10.1: parked cars lining the residential streets and commercial curbs (static,
  // placed on the solved conforming profiles). Generated worlds only — the retired
  // hand-placed fixture keeps its classic look.
  const parkedTraffic =
    plan === null || urbanNetwork === null
      ? null
      : new ParkedTrafficWorld(urbanNetwork, { tier: qualityTier, worldSeed: plan.seed });
  if (parkedTraffic !== null) {
    root.add(parkedTraffic.root);
  }

  // Phase 10.2: the world's hideouts (garage/warehouse/junkyard), streamed in and out like
  // the massing cities. Generated worlds only.
  const hideoutWorld =
    plan === null || context.hideouts === undefined || context.hideouts.length === 0
      ? null
      : new HideoutWorld(context.hideouts, terrainSampler);
  if (hideoutWorld !== null) {
    root.add(hideoutWorld.root);
  }

  // Phase 10.5 (C5): the streamed cities' AI traffic — WebGPU compute on every tier with a
  // hidden CPU fallback, plus the player's region's emergent events (speed traps, drift
  // zones, smashable boards and the off-road jump).
  const gpuTraffic =
    plan === null || urbanNetwork === null
      ? null
      : new GpuTrafficWorld(urbanNetwork, plan, qualityTier);
  if (gpuTraffic !== null) {
    root.add(gpuTraffic.root);
  }
  const eventManager =
    plan === null || urbanNetwork === null
      ? null
      : new WorldEventManager(urbanNetwork, plan, (x, z) => terrainSampler.heightAt(x, z));
  if (eventManager !== null) {
    root.add(eventManager.root);
  }

  return {
    root,
    kind: 'driving',
    wetRoadSurface: roads !== null,
    setDaylight: (state) => {
      vegetation.setDaylight(state);
      roads?.setDaylight(state);
      aohara?.setDaylight(state);
      cityStreamer?.setDaylight(state);
      hideoutWorld?.setDaylight(state);
      pedestrianWorld?.setDaylight(state);
      gpuTraffic?.setNightGain(resolveUrbanNightGain(state.sunElevationDegrees));
    },
    update: (deltaSeconds) => aohara?.update(deltaSeconds),
    updateStreaming: (focus, velocity, deltaSeconds, player) => {
      terrain.updateStreaming(focus, velocity);
      vegetation.updateStreaming(focus, velocity, deltaSeconds ?? 0);
      wildernessTracks.updateStreaming(
        focus,
        velocity === undefined ? { x: 0, z: 0 } : { x: velocity.x, z: velocity.z },
      );
      town.updateStreaming(focus, deltaSeconds ?? 0);
      aohara?.updateStreaming(focus);
      cityStreamer?.update(focus);
      hideoutWorld?.update(focus);
      pedestrianWorld?.update(deltaSeconds ?? 0);
      gpuTraffic?.update(
        deltaSeconds ?? 0,
        { x: focus.x, z: focus.z },
        velocity === undefined ? undefined : { x: velocity.x, z: velocity.z },
      );
      eventManager?.update(
        deltaSeconds ?? 0,
        { x: focus.x, z: focus.z },
        player ?? {
          x: focus.x,
          y: focus.y,
          z: focus.z,
          yaw: 0,
          speedMps: 0,
          forwardSpeed: 0,
          drifting: false,
        },
      );
      faunaWorld.update(faunaField, deltaSeconds ?? 0);
    },
    configureRenderer: (backend, renderer) => {
      gpuTraffic?.configureBackend(backend, renderer as never);
    },
    consumeImpulses: () => {
      const out = gpuTraffic === null ? [] : gpuTraffic.consumeImpulses();
      const jump = eventManager?.consumeImpulse() ?? null;
      if (jump === null) return out;
      return [...out, jump];
    },
    zoneGripModifier: (x, z) => eventManager?.zoneGripModifier(x, z) ?? 1,
    consumeBoostDelta: () => eventManager?.consumeBoostDelta() ?? 0,
    consumeEventMessages: () => {
      const fauna = faunaToasts.splice(0);
      return [...(eventManager?.consumeMessages() ?? []), ...fauna];
    },
    prepareInitial: async (focus, velocity = { x: 0, z: 0 }, onProgress) => {
      aohara?.updateStreaming(focus);
      let terrainProgress = 0;
      let vegetationProgress = 0;
      let reportedProgress = -1;
      const reportProgress = (): void => {
        const fraction = terrainProgress * 0.5 + vegetationProgress * 0.5;
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
      reportProgress();
      await Promise.all([terrainPreparation, vegetationPreparation]);
      onProgress?.(1);
    },
    collideTown: (car, deltaSeconds) => [
      ...town.collide(car, deltaSeconds),
      ...(aohara?.collide(car) ?? []),
      ...(hinodeTouge?.collide(car) ?? []),
      ...(cityStreamer?.collideTown(car) ?? []),
      ...(hideoutWorld?.collideTown(car) ?? []),
    ],
    collideFauna: (car, deltaSeconds) => {
      const frame = faunaField.advanceAndCollide(car, deltaSeconds);
      for (const spawned of frame.spawned) {
        faunaToasts.push({ text: spawned.toast, tone: 'info' });
        faunaWorld.rustleAt(spawned.charge.x, spawned.charge.z);
      }
      if (frame.leaves.length > 0) {
        faunaWorld.queueLeaves(frame.leaves);
      }
      return frame.hits;
    },
    applyVegetationHits: (events) => {
      vegetation.applyHits(events);
    },
    setVegetationStateProvider: (provider) => {
      vegetation.setStateProvider(provider);
    },
    loadSurfaces: async (resolution?: AssetResolution) => {
      await Promise.all([
        terrain.loadSurfaces(resolution),
        roads === null ? Promise.resolve() : roads.loadSurfaces(resolution),
        town.loadSurfaces(resolution),
        aohara === null ? Promise.resolve() : aohara.loadSurfaces(resolution),
      ]);
    },
    loadDeferredAssets: async (resolution?: AssetResolution) => {
      if (scannedAssetsStarted || context.renderer === undefined) {
        return;
      }
      scannedAssetsStarted = true;
      try {
        await vegetation.adoptScanned(context.renderer, resolution);
      } catch (error) {
        console.warn('scanned vegetation unavailable:', (error as Error).message);
      }
    },
    sampleHeight: (x, z) => terrainSampler.heightAt(x, z),
    getContentStats: () => {
      const terrainStats = terrain.getContentStats();
      const mountainStats = distantMountains.getContentStats();
      const roadStats = roads?.getStats() ?? {};
      const vegetationStats = vegetation.getContentStats();
      const wildernessStats = wildernessTracks.getContentStats();
      const faunaStats = faunaWorld.getContentStats();
      const townStats = town.getContentStats();
      const urbanStats = aohara?.getContentStats() ?? {};
      const tougeStats = hinodeTouge?.getContentStats() ?? {};
      const cityStreamerStats = cityStreamer?.getContentStats() ?? {};
      const hideoutStats = hideoutWorld?.getContentStats() ?? {};
      const pedestrianStats = pedestrianWorld?.getContentStats() ?? {};
      const parkedStats = parkedTraffic === null ? {} : { parkedTrafficCars: parkedTraffic.count };
      const trafficStats = gpuTraffic?.getContentStats() ?? {};
      const eventStats = eventManager?.getContentStats() ?? {};
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
        ...cityStreamerStats,
        ...hideoutStats,
        ...pedestrianStats,
        ...parkedStats,
        ...trafficStats,
        ...eventStats,
        ...faunaStats,
        ...wildernessStats,
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
      wildernessTracks.dispose();
      faunaWorld.dispose();
      town.dispose();
      aohara?.dispose();
      cityStreamer?.dispose();
      parkedTraffic?.dispose();
      hideoutWorld?.dispose();
      pedestrianWorld?.dispose();
      gpuTraffic?.dispose();
      eventManager?.dispose();
      setPlanDistricts(null);
      setTownDistrict(null);
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
