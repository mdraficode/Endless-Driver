import { BoxGeometry, Color, Group, Mesh, type BufferGeometry, type Material } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { WorldConfig } from '../config/world';
import { RoadWorld } from './RoadWorld';
import { TerrainWorld } from './TerrainWorld';
import { VegetationWorld } from './vegetation';
import type { SceneContent, SceneContentContext } from './WorldContent';

/**
 * The driving world: streamed procedural terrain plus the reference obstacles.
 *
 * Phase 4 replaced the flat Phase 1/2 ground plane with `TerrainWorld` behind this same
 * factory — the seam held, exactly as it was drawn in Phase 3. The obstacles remain the
 * Phase 2 physics reference blocks for now (their colliders come from the same config, so
 * visuals and physics cannot drift); they stand on the spawn plateau, where the terrain is
 * exactly y=0, so their placement did not move a millimetre in the swap.
 */
export function createDrivingWorld({
  worldConfig,
  terrainSampler,
}: SceneContentContext): SceneContent {
  if (terrainSampler === undefined) {
    throw new Error(
      'createDrivingWorld requires a terrain sampler: Application creates one and shares it with physics.',
    );
  }
  const root = new Group();
  root.name = 'driving-world';
  const terrain = new TerrainWorld(terrainSampler);
  root.add(terrain.root, ...createObstacles(worldConfig));
  // Road ribbons exist only when the shared sampler carries the carved network; the
  // mesh-less samplers used by unit fixtures simply stay roadless.
  const roads =
    terrainSampler.roadNetwork !== undefined ? new RoadWorld(terrainSampler.roadNetwork) : null;
  if (roads !== null) {
    root.add(roads.object);
  }
  // District vegetation (Increment 5): instanced scatter fed by the same sampler.
  const vegetation = new VegetationWorld(terrainSampler);
  root.add(vegetation.root);

  return {
    root,
    kind: 'driving',
    updateStreaming: (focus, velocity) => {
      terrain.updateStreaming(focus, velocity);
      vegetation.updateStreaming(focus);
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
    }),
    dispose(): void {
      terrain.dispose();
      roads?.dispose();
      vegetation.dispose();
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

/**
 * Static obstacle meshes. These are still the Phase 1 reference blocks used as physics test targets;
 * the collider for each one is built by `PhysicsWorld` from the same definitions, so visuals and
 * colliders cannot drift apart. Phases 4-5 replace them with authored props.
 */
function createObstacles(worldConfig: WorldConfig): Mesh[] {
  return worldConfig.obstacles.map((obstacle) => {
    const material = new MeshStandardNodeMaterial({
      color: new Color(obstacle.color),
      roughness: 0.8,
      metalness: 0,
    });
    const mesh = new Mesh(new BoxGeometry(...obstacle.size), material);
    mesh.name = `obstacle-${obstacle.id}`;
    mesh.position.set(...obstacle.position);
    mesh.castShadow = obstacle.castShadow;
    mesh.receiveShadow = true;
    return mesh;
  });
}
