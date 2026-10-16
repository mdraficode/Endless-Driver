import {
  BoxGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldConfig } from '../config/world';
import { ROUTE_CONFIG, type RouteConfig } from '../config/route';
import { createGroundGridColorNode, linearColor } from '../shaders/ground-grid';
import type { SceneContent, SceneContentContext } from './WorldContent';

/**
 * The validation route's content: 2 km of flat, authored strip.
 *
 * Everything here is built from literals in `config/route.ts` and simple loops over them — no
 * noise, no seed, no randomness — because a baseline picture is only a baseline if the scene
 * cannot drift between runs. The composition is deliberate and each part is a test subject:
 *
 * - the road ribbon with edge lines gives every bookmark a near-field surface to judge;
 * - marker posts every 100 m on both edges give repeated geometry at known distances, which is
 *   what temporal stability and LOD popping are measured against;
 * - the slatted canopy at 600–720 m exists so god rays have shadow casters arranged for them;
 * - the volcano cone closing the view at the far end exists so aerial perspective has a subject
 *   whose correct appearance is a readable grey silhouette against the sky;
 * - the red reference block at the start line is car-sized (1.8 m), the scale and contact-shadow
 *   reference every station is framed against.
 *
 * Phase 4 replaces this content with streamed terrain and roads. The bookmarks in
 * `config/route.ts` are the contract that carries over; this builder is disposable by design.
 */
export function createRouteWorld({ worldConfig }: SceneContentContext): SceneContent {
  const route = ROUTE_CONFIG;
  const root = new Group();
  root.name = 'validation-route';

  root.add(
    createGround(worldConfig, route),
    createRoad(route),
    createMarkers(route),
    createCanopy(route),
    createBarriers(route),
    createLandmarks(route),
    createReferenceBlock(),
  );

  return {
    root,
    kind: 'route',
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

/** Flat ground carrying the same reference grid as the driving arena, so scale reads at a glance. */
function createGround(worldConfig: WorldConfig, route: RouteConfig): Mesh {
  const { ground } = worldConfig;
  const material = new MeshStandardNodeMaterial({
    name: 'route-ground',
    roughness: ground.roughness,
    metalness: ground.metalness,
  });
  material.colorNode = ground.grid.enabled
    ? createGroundGridColorNode(ground)
    : uniform(linearColor(ground.color));

  const length = route.lengthMeters + route.groundMarginMeters * 2;
  const mesh = new Mesh(new PlaneGeometry(route.groundWidthMeters, length), material);
  mesh.name = 'route-ground';
  mesh.rotation.x = -Math.PI / 2;
  // The route runs from the origin towards −Z, so the ground is centred half-way down it.
  mesh.position.z = -route.lengthMeters / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/** The road itself: one dark ribbon, two edge lines, one centre line. Markings are geometry, so
 * they receive the same light and shadow as the surface they are painted on. */
function createRoad(route: RouteConfig): Group {
  const group = new Group();
  group.name = 'route-road';
  const surface = new MeshStandardNodeMaterial({
    color: new Color(0x3b4046),
    roughness: 0.94,
    metalness: 0,
  });
  const paint = new MeshStandardNodeMaterial({
    color: new Color(0xd8d5c8),
    roughness: 0.6,
    metalness: 0,
  });

  const road = new Mesh(new PlaneGeometry(route.roadWidthMeters, route.lengthMeters), surface);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, -route.lengthMeters / 2);
  road.receiveShadow = true;
  group.add(road);

  const edgeOffset = route.roadWidthMeters / 2 - 0.45;
  for (const side of [-1, 1]) {
    const line = new Mesh(new PlaneGeometry(0.16, route.lengthMeters), paint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(side * edgeOffset, 0.035, -route.lengthMeters / 2);
    line.receiveShadow = true;
    group.add(line);
  }
  const centre = new Mesh(new PlaneGeometry(0.14, route.lengthMeters), paint);
  centre.rotation.x = -Math.PI / 2;
  centre.position.set(0, 0.035, -route.lengthMeters / 2);
  centre.receiveShadow = true;
  group.add(centre);
  return group;
}

/**
 * Marker posts every `markerSpacingMeters` on both edges, merged into one mesh per side.
 *
 * Forty-two loose meshes would be forty-two draw calls spent on the least interesting objects in
 * the scene; merged, they are one. Every post is identical, which is the point: a repeated object
 * at known distances is how shimmer and LOD behaviour announce themselves.
 */
function createMarkers(route: RouteConfig): Mesh {
  const material = new MeshStandardNodeMaterial({
    color: new Color(0xe8e4da),
    roughness: 0.5,
    metalness: 0,
  });
  const parts: BufferGeometry[] = [];
  const edgeOffset = route.roadWidthMeters / 2 + 0.8;
  const count = Math.floor(route.lengthMeters / route.markerSpacingMeters);
  for (let index = 0; index <= count; index += 1) {
    const z = -index * route.markerSpacingMeters;
    for (const side of [-1, 1]) {
      const post = new BoxGeometry(0.18, 1.1, 0.18);
      post.translate(side * edgeOffset, 0.55, z);
      parts.push(post);
    }
  }
  const mesh = new Mesh(mergeGeometries(parts), material);
  for (const part of parts) {
    part.dispose();
  }
  mesh.name = 'route-markers';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The canopy: post pairs carrying thin slats across the road for `canopyEnd − canopyStart` metres.
 *
 * It exists for one effect. God rays are shadow-map raymarching, so they need casters between the
 * sun and the road with gaps for the light to fall through; a row of slats at a known height over
 * a known stretch of road is the controlled version of "trees over a lane", and the `canopy`
 * bookmarks are framed on it.
 */
function createCanopy(route: RouteConfig): Mesh {
  const material = new MeshStandardNodeMaterial({
    color: new Color(0x6b4f35),
    roughness: 0.85,
    metalness: 0,
  });
  const parts: BufferGeometry[] = [];
  const postOffset = route.roadWidthMeters / 2 + 1.2;
  const start = route.canopyStartMeters;
  const end = route.canopyEndMeters;

  for (let distance = start; distance <= end; distance += 12) {
    for (const side of [-1, 1]) {
      const post = new BoxGeometry(0.28, route.canopyHeightMeters, 0.28);
      post.translate(side * postOffset, route.canopyHeightMeters / 2, -distance);
      parts.push(post);
    }
  }
  for (let distance = start; distance <= end; distance += 3) {
    const slat = new BoxGeometry(postOffset * 2 + 0.6, 0.09, 1.1);
    slat.translate(0, route.canopyHeightMeters, -distance);
    parts.push(slat);
  }

  const mesh = new Mesh(mergeGeometries(parts), material);
  for (const part of parts) {
    part.dispose();
  }
  mesh.name = 'route-canopy';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Barrier blocks in alternating sections: repeated hard-edged casters for shadow and AO checks. */
function createBarriers(route: RouteConfig): Mesh {
  const material = new MeshStandardNodeMaterial({
    color: new Color(0x9aa3ad),
    roughness: 0.8,
    metalness: 0,
  });
  const parts: BufferGeometry[] = [];
  const offset = route.roadWidthMeters / 2 + 2.6;
  for (let section = 0; section < 8; section += 1) {
    const side = section % 2 === 0 ? -1 : 1;
    const zStart = 240 + section * 220;
    for (let index = 0; index < 5; index += 1) {
      const block = new BoxGeometry(0.5, 0.8, 3.6);
      block.translate(side * offset, 0.4, -(zStart + index * 4.4));
      parts.push(block);
    }
  }
  const mesh = new Mesh(mergeGeometries(parts), material);
  for (const part of parts) {
    part.dispose();
  }
  mesh.name = 'route-barriers';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Distance silhouettes: the volcano that closes the start-line view, and two nearer hills.
 *
 * Distance readability is judged on these. Fog was removed, so at 2.3 km the cone must stay a
 * readable grey silhouette against the sky; if it vanishes, the sky/exposure - not a fog
 * term - is the failure, and it is obvious from the `start` bookmarks.
 */
function createLandmarks(route: RouteConfig): Group {
  const group = new Group();
  group.name = 'route-landmarks';
  const material = new MeshStandardNodeMaterial({
    color: new Color(0x707a72),
    roughness: 1,
    metalness: 0,
  });

  const volcano = new Mesh(new ConeGeometry(300, 210, 5), material);
  volcano.name = 'route-landmark-volcano';
  // Just inside the camera far plane (2 000 m): a landmark past it would be clipped, and the
  // start bookmarks would be judging the sky where the mountain should be.
  volcano.position.set(-30, 105, -(route.lengthMeters - 100));
  group.add(volcano);

  const hillNear = new Mesh(new ConeGeometry(150, 70, 5), material);
  hillNear.name = 'route-landmark-hill-near';
  hillNear.position.set(210, 35, -1250);
  group.add(hillNear);

  const hillFar = new Mesh(new ConeGeometry(190, 95, 5), material);
  hillFar.name = 'route-landmark-hill-far';
  hillFar.position.set(-250, 47.5, -1750);
  group.add(hillFar);
  return group;
}

/** Car-sized red block at the start line: the scale, shadow, and focus reference. */
function createReferenceBlock(): Mesh {
  const material = new MeshStandardNodeMaterial({
    color: new Color(0xb3221f),
    roughness: 0.35,
    metalness: 0,
  });
  const mesh = new Mesh(new BoxGeometry(1.8, 1.8, 4.2), material);
  mesh.name = 'route-reference-block';
  mesh.position.set(0, 0.9, 6);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
