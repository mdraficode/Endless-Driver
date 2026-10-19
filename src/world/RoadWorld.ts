import {
  BoxGeometry,
  CircleGeometry,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  RepeatWrapping,
  type BufferGeometry,
} from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { float, mix, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { loadMaterialTextureSet } from '../assets/AssetManifest';
import { createArchitecturalMaterial } from './architectural-materials';
import { resolveUrbanWetness, URBAN_CITY_CONFIG } from '../config/urban-city';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { RoadNetwork } from './road-network';
import { buildDashGeometry, buildRibbonGeometry } from './road-geometry';

export interface RoadWorldStats {
  roadLengthMeters: number;
  roadMeshes: number;
  urbanSidewalkEdges: number;
  urbanCrosswalkIntersections: number;
  roadSurfacesLoaded: 0 | 1;
  /** Current Aohara-only visual wet-look blend; not a physical surface condition. */
  urbanWetLook: number;
}

// Stand-offs above the carved profile, in metres. The terrain underneath is flattened to
// the same solved elevation, so these only need to beat depth precision — but they are
// stacked (shoulder below asphalt below paint) so every layer wins its overlap cleanly.
const SHOULDER_LIFT = 0.05;
const ASPHALT_LIFT = 0.09;
const PAINT_LIFT = 0.13;
const SIDEWALK_LIFT = 0.14;

function mergeGeometryBatch(geometries: BufferGeometry[], label: string): BufferGeometry | null {
  if (geometries.length === 0) {
    return null;
  }
  if (geometries.length === 1) {
    return geometries[0] ?? null;
  }
  const merged = mergeGeometries(geometries, false);
  if (merged === null) {
    for (const geometry of geometries) {
      geometry.dispose();
    }
    throw new Error(`road geometry batch could not be merged: ${label}`);
  }
  for (const geometry of geometries) {
    geometry.dispose();
  }
  merged.name = label;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

interface MarkingTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

function isUrbanRoad(edge: RoadNetwork['edges'][number]): boolean {
  return edge.roadClass === 'urban-local' || edge.roadClass === 'urban-arterial';
}

function createUrbanIntersectionMarkings(
  network: RoadNetwork,
  material: MeshStandardNodeMaterial,
): { readonly mesh: InstancedMesh | null; readonly intersectionCount: number } {
  const stripeWidth = 0.55;
  const stripePitch = 1.2;
  const stripeThickness = 0.035;
  const markings: MarkingTransform[] = [];
  let intersectionCount = 0;

  for (const node of network.nodes) {
    let horizontalHalfWidth: number | null = null;
    let verticalHalfWidth: number | null = null;
    for (const edge of network.edges) {
      if (!isUrbanRoad(edge) || (edge.from !== node.id && edge.to !== node.id)) {
        continue;
      }
      const from = network.nodeById(edge.from);
      const to = network.nodeById(edge.to);
      if (from === null || to === null) {
        continue;
      }
      if (Math.abs(to.x - from.x) >= Math.abs(to.z - from.z)) {
        horizontalHalfWidth = Math.max(horizontalHalfWidth ?? 0, edge.halfWidthMeters);
      } else {
        verticalHalfWidth = Math.max(verticalHalfWidth ?? 0, edge.halfWidthMeters);
      }
    }
    if (horizontalHalfWidth === null || verticalHalfWidth === null) {
      continue;
    }
    intersectionCount += 1;

    const addCrosswalk = (
      acrossWidth: number,
      center: readonly [number, number],
      acrossX: boolean,
    ): void => {
      const usableWidth = Math.max(6, acrossWidth - 2.8);
      const stripeCount = Math.max(6, Math.floor(usableWidth / stripePitch));
      const start = -((stripeCount - 1) * stripePitch) / 2;
      for (let stripe = 0; stripe < stripeCount; stripe += 1) {
        const offset = start + stripe * stripePitch;
        markings.push({
          x: node.x + center[0] + (acrossX ? 0 : offset),
          y: node.y + PAINT_LIFT,
          z: node.z + center[1] + (acrossX ? offset : 0),
          width: acrossX ? usableWidth : stripeWidth,
          depth: acrossX ? stripeWidth : usableWidth,
        });
      }
    };

    const verticalApproachOffset = horizontalHalfWidth + 3.8;
    const horizontalApproachOffset = verticalHalfWidth + 3.8;
    for (const side of [-1, 1]) {
      addCrosswalk(verticalHalfWidth * 2, [0, side * verticalApproachOffset], true);
      addCrosswalk(horizontalHalfWidth * 2, [side * horizontalApproachOffset, 0], false);
    }

    // Only the signalized central junction has stop bars; the other intersections
    // receive zebra crossings but no misleading stop-line-only controls.
    if (node.id === 'aohara-center') {
      for (const side of [-1, 1]) {
        markings.push(
          {
            x: node.x,
            y: node.y + PAINT_LIFT,
            z: node.z + side * (verticalApproachOffset + 5.2),
            width: verticalHalfWidth * 2,
            depth: 0.32,
          },
          {
            x: node.x + side * (horizontalApproachOffset + 5.2),
            y: node.y + PAINT_LIFT,
            z: node.z,
            width: 0.32,
            depth: horizontalHalfWidth * 2,
          },
        );
      }
    }
  }

  if (markings.length === 0) {
    return { mesh: null, intersectionCount };
  }

  const mesh = new InstancedMesh(new BoxGeometry(1, stripeThickness, 1), material, markings.length);
  mesh.name = 'aohara-crosswalks-and-stop-lines';
  mesh.frustumCulled = false;
  const transform = new Object3D();
  markings.forEach((marking, index) => {
    transform.position.set(marking.x, marking.y, marking.z);
    transform.scale.set(marking.width, 1, marking.depth);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, intersectionCount };
}

/**
 * Visual road network: ribbon meshes laid over the carved terrain corridor.
 *
 * Geometry comes from the same solved profile the height function carves. Per-edge road classes
 * supply their own widths, lane markings and sidewalks; one bounded instanced pass adds crossings
 * at the Aohara intersections. Material batches keep draw calls fixed as the 5×5 grid grows. Terrain,
 * physics and grip still sample the same road graph.
 */
export class RoadWorld {
  readonly object: Object3D;

  readonly #network: RoadNetwork;

  readonly #meshes: Mesh[] = [];

  readonly #asphaltMaterial: MeshStandardNodeMaterial;

  readonly #shoulderMaterial: MeshStandardNodeMaterial;

  readonly #urbanAsphaltMaterial: MeshPhysicalNodeMaterial;

  readonly #urbanWetness = uniform(URBAN_CITY_CONFIG.wetRoad.wetnessDay);

  readonly #urbanSidewalkEdges: number;

  readonly #urbanCrosswalkIntersections: number;

  #surfacesLoaded: 0 | 1 = 0;

  constructor(network: RoadNetwork) {
    this.#network = network;

    this.#asphaltMaterial = new MeshStandardNodeMaterial();
    this.#asphaltMaterial.color.set(0x35383d);
    this.#asphaltMaterial.roughness = 0.94;
    this.#asphaltMaterial.metalness = 0;

    this.#shoulderMaterial = new MeshStandardNodeMaterial();
    this.#shoulderMaterial.color.set(0x7a6c50);
    this.#shoulderMaterial.roughness = 1;
    this.#shoulderMaterial.metalness = 0;

    // Aohara's static wet-look is a bounded PBR material response: night raises clearcoat and
    // lowers roughness so the existing HDRI and nearby streetlights create local glints. It does
    // not add rain, puddles, a weather state, SSR, or a traction change.
    this.#urbanAsphaltMaterial = new MeshPhysicalNodeMaterial();
    this.#urbanAsphaltMaterial.color.set(0x222a32);
    this.#urbanAsphaltMaterial.roughness = URBAN_CITY_CONFIG.wetRoad.dryRoughness;
    this.#urbanAsphaltMaterial.metalness = 0.025;
    this.#urbanAsphaltMaterial.roughnessNode = mix(
      float(URBAN_CITY_CONFIG.wetRoad.dryRoughness),
      float(URBAN_CITY_CONFIG.wetRoad.wetRoughness),
      this.#urbanWetness,
    );
    this.#urbanAsphaltMaterial.clearcoatNode = mix(
      float(URBAN_CITY_CONFIG.wetRoad.dryClearcoat),
      float(URBAN_CITY_CONFIG.wetRoad.wetClearcoat),
      this.#urbanWetness,
    );
    this.#urbanAsphaltMaterial.clearcoatRoughnessNode = mix(
      float(URBAN_CITY_CONFIG.wetRoad.dryClearcoatRoughness),
      float(URBAN_CITY_CONFIG.wetRoad.wetClearcoatRoughness),
      this.#urbanWetness,
    );
    this.#urbanAsphaltMaterial.name = 'aohara-urban-asphalt-wet-look-clearcoat';

    const markingMaterial = new MeshStandardNodeMaterial();
    markingMaterial.color.set(0xe9e6da);
    markingMaterial.roughness = 0.55;
    markingMaterial.metalness = 0;

    const centerlineMaterial = new MeshStandardNodeMaterial();
    centerlineMaterial.color.set(0xd9b65b);
    centerlineMaterial.roughness = 0.55;
    centerlineMaterial.metalness = 0;

    const shoulderGeometries: BufferGeometry[] = [];
    const asphaltGeometries: BufferGeometry[] = [];
    const urbanAsphaltGeometries: BufferGeometry[] = [];
    const markingGeometries: BufferGeometry[] = [];
    const centerlineGeometries: BufferGeometry[] = [];
    const urbanSidewalkGeometries: BufferGeometry[] = [];
    let urbanSidewalkEdges = 0;

    for (const edge of network.edges) {
      const { halfWidthMeters, shoulderMeters } = edge;
      const urbanRoad = isUrbanRoad(edge);
      shoulderGeometries.push(
        buildRibbonGeometry(edge, (halfWidthMeters + shoulderMeters) * 2, SHOULDER_LIFT),
      );
      if (urbanRoad) {
        urbanSidewalkEdges += 1;
        const sidewalkOffset =
          halfWidthMeters + shoulderMeters + URBAN_CITY_CONFIG.sidewalk.widthMeters / 2;
        for (const side of [-1, 1] as const) {
          urbanSidewalkGeometries.push(
            buildRibbonGeometry(
              edge,
              URBAN_CITY_CONFIG.sidewalk.widthMeters,
              SIDEWALK_LIFT,
              side * sidewalkOffset,
            ),
          );
        }
      }
      const asphaltGeometry = buildRibbonGeometry(edge, halfWidthMeters * 2, ASPHALT_LIFT);
      if (edge.roadClass === 'urban-local' || edge.roadClass === 'urban-arterial') {
        urbanAsphaltGeometries.push(asphaltGeometry);
      } else {
        asphaltGeometries.push(asphaltGeometry);
      }
      for (const side of [-1, 1] as const) {
        markingGeometries.push(
          buildRibbonGeometry(edge, 0.15, PAINT_LIFT, side * (halfWidthMeters - 0.45)),
        );
      }
      if (edge.roadClass === 'urban-arterial') {
        for (const side of [-1, 1] as const) {
          centerlineGeometries.push(buildRibbonGeometry(edge, 0.11, PAINT_LIFT, side * 0.18));
        }
      }
    }

    // Junction discs cover the fan where ribbons meet. Use the widest incident street, rather
    // than the rural defaults, so the city intersection has no wedges of terrain at its corners.
    for (const node of network.nodes) {
      let halfWidthMeters = network.config.halfWidthMeters;
      let shoulderMeters = network.config.shoulderMeters;
      let urbanJunction = false;
      for (const edge of network.edges) {
        if (edge.from === node.id || edge.to === node.id) {
          halfWidthMeters = Math.max(halfWidthMeters, edge.halfWidthMeters);
          shoulderMeters = Math.max(shoulderMeters, edge.shoulderMeters);
          urbanJunction ||= edge.roadClass === 'urban-local' || edge.roadClass === 'urban-arterial';
        }
      }
      const gravel = new CircleGeometry(halfWidthMeters + shoulderMeters, 24);
      gravel.rotateX(-Math.PI / 2);
      gravel.translate(node.x, node.y + SHOULDER_LIFT, node.z);
      shoulderGeometries.push(gravel);
      const asphalt = new CircleGeometry(halfWidthMeters * 1.08, 24);
      asphalt.rotateX(-Math.PI / 2);
      asphalt.translate(node.x, node.y + ASPHALT_LIFT, node.z);
      (urbanJunction ? urbanAsphaltGeometries : asphaltGeometries).push(asphalt);
    }

    const sidewalkMaterial = createArchitecturalMaterial({
      name: 'aohara-sidewalk-pbr-aggregate',
      colorHex: 0x454d53,
      roughness: 0.88,
      metalness: 0.015,
      detailAmplitude: 0.018,
      clearcoat: 0.04,
      clearcoatRoughness: 0.48,
    });
    const urbanMarkings = createUrbanIntersectionMarkings(network, markingMaterial);
    this.#urbanSidewalkEdges = urbanSidewalkEdges;
    this.#urbanCrosswalkIntersections = urbanMarkings.intersectionCount;

    const group = new Group();
    group.name = 'road-network';
    const add = (
      geometry: BufferGeometry | null,
      material: MeshStandardNodeMaterial,
      name: string,
    ): void => {
      if (geometry === null) {
        return;
      }
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.#meshes.push(mesh);
      group.add(mesh);
    };

    add(
      mergeGeometryBatch(shoulderGeometries, 'road-shoulders-batch'),
      this.#shoulderMaterial,
      'road-shoulders',
    );
    add(
      mergeGeometryBatch(asphaltGeometries, 'road-asphalt-batch'),
      this.#asphaltMaterial,
      'road-asphalt',
    );
    add(
      mergeGeometryBatch(urbanAsphaltGeometries, 'road-urban-asphalt-batch'),
      this.#urbanAsphaltMaterial,
      'road-urban-asphalt',
    );
    add(
      mergeGeometryBatch(markingGeometries, 'road-edge-markings-batch'),
      markingMaterial,
      'road-edge-markings',
    );
    add(buildDashGeometry(network, PAINT_LIFT), markingMaterial, 'road-lane-dashes');
    add(
      mergeGeometryBatch(centerlineGeometries, 'road-urban-centerlines-batch'),
      centerlineMaterial,
      'road-urban-centerlines',
    );
    add(
      mergeGeometryBatch(urbanSidewalkGeometries, 'aohara-sidewalks-batch'),
      sidewalkMaterial,
      'aohara-sidewalks',
    );
    if (urbanMarkings.mesh !== null) {
      this.#meshes.push(urbanMarkings.mesh);
      group.add(urbanMarkings.mesh);
    }
    this.object = group;
  }

  /** Adjust the Aohara-only visual road sheen with the existing dusk/night lighting gate. */
  setDaylight(state: DaylightState): void {
    this.#urbanWetness.value = resolveUrbanWetness(state.sunElevationDegrees);
  }

  /**
   * Async CC0 surfaces: scanned asphalt and sandy gravel at 1k. Until they arrive the roads render
   * with flat colours (already correct in shape and lighting); a failure keeps that fallback.
   */
  async loadSurfaces(): Promise<void> {
    if (this.#surfacesLoaded === 1) {
      return;
    }
    try {
      const [asphalt, gravel] = await Promise.all([
        loadMaterialTextureSet('tex-asphalt-03-1k'),
        loadMaterialTextureSet('tex-sandy-gravel-1k'),
      ]);
      if (asphalt === null || gravel === null) {
        asphalt?.dispose();
        gravel?.dispose();
        return;
      }
      for (const set of [asphalt, gravel]) {
        for (const map of [set.diffuse, set.normal, set.arm]) {
          if (map !== null) {
            map.wrapS = RepeatWrapping;
            map.wrapT = RepeatWrapping;
            map.anisotropy = 8;
          }
        }
      }
      // Ribbon UVs run across [0, 1] and along in metres / 6; the across repeat stops
      // the scan stretching sideways over both rural lanes and the wider city streets.
      const roadUv = uv().mul(vec2(2, 1));
      this.#asphaltMaterial.colorNode = texture(asphalt.diffuse, roadUv);
      this.#asphaltMaterial.normalNode = texture(asphalt.normal, roadUv);
      if (asphalt.arm !== null) {
        this.#asphaltMaterial.roughnessNode = texture(asphalt.arm, roadUv).g;
        this.#asphaltMaterial.aoNode = texture(asphalt.arm, roadUv).r;
      }
      this.#asphaltMaterial.needsUpdate = true;

      // Reuse the already-loaded CC0 asphalt maps for the Aohara road mesh. The texture-backed
      // micro-roughness remains visible under clearcoat, especially in the local streetlamp glints.
      this.#urbanAsphaltMaterial.colorNode = texture(asphalt.diffuse, roadUv).mul(
        vec4(0.72, 0.77, 0.83, 1),
      );
      this.#urbanAsphaltMaterial.normalNode = texture(asphalt.normal, roadUv);
      if (asphalt.arm !== null) {
        this.#urbanAsphaltMaterial.roughnessNode = mix(
          texture(asphalt.arm, roadUv).g,
          float(URBAN_CITY_CONFIG.wetRoad.wetRoughness),
          this.#urbanWetness,
        );
        this.#urbanAsphaltMaterial.aoNode = texture(asphalt.arm, roadUv).r;
      }
      this.#urbanAsphaltMaterial.needsUpdate = true;
      this.#shoulderMaterial.colorNode = texture(gravel.diffuse, roadUv);
      this.#shoulderMaterial.normalNode = texture(gravel.normal, roadUv);
      if (gravel.arm !== null) {
        this.#shoulderMaterial.roughnessNode = texture(gravel.arm, roadUv).g;
      }
      this.#shoulderMaterial.needsUpdate = true;
      this.#surfacesLoaded = 1;
    } catch {
      // Textures are an enhancement; flat-coloured roads remain correct.
    }
  }

  getStats(): RoadWorldStats {
    return {
      roadLengthMeters: Math.round(this.#network.totalLengthMeters),
      roadMeshes: this.#meshes.length,
      urbanSidewalkEdges: this.#urbanSidewalkEdges,
      urbanCrosswalkIntersections: this.#urbanCrosswalkIntersections,
      roadSurfacesLoaded: this.#surfacesLoaded,
      urbanWetLook: Number(this.#urbanWetness.value.toFixed(3)),
    };
  }

  dispose(): void {
    const materials = new Set<MeshStandardNodeMaterial>([this.#urbanAsphaltMaterial]);
    for (const mesh of this.#meshes) {
      mesh.geometry.dispose();
      materials.add(mesh.material as MeshStandardNodeMaterial);
    }
    for (const material of materials) {
      material.dispose();
    }
    this.#meshes.length = 0;
  }
}
