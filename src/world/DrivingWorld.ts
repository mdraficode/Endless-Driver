import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import { RoadWorld } from './RoadWorld';
import { TerrainWorld } from './TerrainWorld';
import { TownWorld } from './town';
import { VegetationWorld } from './vegetation';
import type { SceneContent, SceneContentContext } from './WorldContent';

/**
 * The driving world: streamed procedural terrain, roads, vegetation and the town.
 *
 * Phase 4 replaced the flat Phase 1/2 ground plane with `TerrainWorld` behind this same
 * factory — the seam held, exactly as it was drawn in Phase 3. The Phase 2 reference
 * blocks this factory used to render retired with the round-7 wash-out fix: the world
 * config still carries an obstacle list (empty in the shipped game) so physics fixtures
 * keep their seam, but nothing placeholder stands in the landscape any more.
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
  const terrain = new TerrainWorld(terrainSampler);
  root.add(terrain.root);
  // Road ribbons exist only when the shared sampler carries the carved network; the
  // mesh-less samplers used by unit fixtures simply stay roadless.
  const roads =
    terrainSampler.roadNetwork !== undefined ? new RoadWorld(terrainSampler.roadNetwork) : null;
  if (roads !== null) {
    root.add(roads.object);
  }
  // District vegetation (Increment 5): instanced scatter fed by the same sampler.
  // The detail scale pulls the scanned LOD rings in on modest devices: the deep
  // jungle canopy is the heaviest thing this world streams.
  const detailScale = context.qualityTier === 'C' ? 0.6 : context.qualityTier === 'B' ? 0.85 : 1;
  const vegetation = new VegetationWorld(terrainSampler, undefined, detailScale);
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
  // Yuhi Town + roadside poles (Increment 5b): static town, always resident.
  const town = new TownWorld(terrainSampler);
  root.add(town.root);

  return {
    root,
    kind: 'driving',
    setDaylight: (state) => vegetation.setDaylight(state),
    updateStreaming: (focus, velocity, deltaSeconds) => {
      terrain.updateStreaming(focus, velocity);
      vegetation.updateStreaming(focus, velocity, deltaSeconds ?? 0);
      town.updateStreaming(focus, deltaSeconds ?? 0);
    },
    prepareInitial: async (focus, velocity = { x: 0, z: 0 }) => {
      await Promise.all([
        scannedAssetsReady,
        terrain.prepareInitial(focus, velocity),
        vegetation.prepareInitial(focus, velocity),
      ]);
    },
    collideTown: (car, deltaSeconds) => town.collide(car, deltaSeconds),
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
      ]);
    },
    getContentStats: () => ({
      ...terrain.getContentStats(),
      ...(roads === null ? {} : roads.getStats()),
      ...vegetation.getContentStats(),
      ...town.getContentStats(),
    }),
    dispose(): void {
      terrain.dispose();
      roads?.dispose();
      vegetation.dispose();
      town.dispose();
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
      root.removeFromParent();
    },
  };
}
