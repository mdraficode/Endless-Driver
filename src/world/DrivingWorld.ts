import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { WorldConfig } from '../config/world';
import { createGroundGridColorNode, linearColor } from '../shaders/ground-grid';
import type { SceneContent, SceneContentContext } from './WorldContent';

/**
 * The driving world's static content: the ground the car drives on, and the reference obstacles.
 *
 * This is deliberately the thinnest possible thing that can be driven on. Phase 4 replaces it with
 * seeded terrain and roads, which is why it is already behind the `SceneContent` interface rather
 * than built inside `SceneManager`.
 */
export function createDrivingWorld({ worldConfig }: SceneContentContext): SceneContent {
  const root = new Group();
  root.name = 'driving-world';
  const ground = createGround(worldConfig);
  root.add(ground, ...createObstacles(worldConfig));

  return {
    root,
    kind: 'driving',
    dispose(): void {
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

function createGround(worldConfig: WorldConfig): Mesh {
  const { ground } = worldConfig;
  const material = new MeshStandardNodeMaterial({
    name: 'ground',
    roughness: ground.roughness,
    metalness: ground.metalness,
  });
  material.colorNode = ground.grid.enabled
    ? createGroundGridColorNode(ground)
    : uniform(linearColor(ground.color));

  const mesh = new Mesh(new PlaneGeometry(ground.size, ground.size), material);
  mesh.name = 'ground-plane';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
