import {
  CircleGeometry,
  Group,
  Mesh,
  RepeatWrapping,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, uv, vec2 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { loadMaterialTextureSet } from '../assets/AssetManifest';
import type { RoadNetwork } from './road-network';
import { buildDashGeometry, buildRibbonGeometry } from './road-geometry';

export interface RoadWorldStats {
  roadLengthMeters: number;
  roadMeshes: number;
  roadSurfacesLoaded: 0 | 1;
}

// Stand-offs above the carved profile, in metres. The terrain underneath is flattened to
// the same solved elevation, so these only need to beat depth precision — but they are
// stacked (shoulder below asphalt below paint) so every layer wins its overlap cleanly.
const SHOULDER_LIFT = 0.05;
const ASPHALT_LIFT = 0.09;
const PAINT_LIFT = 0.13;

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

/**
 * Visual road network: ribbon meshes laid over the carved terrain corridor.
 *
 * Geometry comes from the same solved profile the height function carves. Per-edge road classes
 * supply their own widths and markings, while the resulting ribbons are batched by material so
 * adding the bounded Aohara grid does not multiply draw calls. Terrain, physics and grip still
 * sample the same road graph.
 */
export class RoadWorld {
  readonly object: Object3D;

  readonly #network: RoadNetwork;

  readonly #meshes: Mesh[] = [];

  readonly #asphaltMaterial: MeshStandardNodeMaterial;

  readonly #shoulderMaterial: MeshStandardNodeMaterial;

  readonly #urbanAsphaltMaterial: MeshStandardNodeMaterial;

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

    // Urban pavement keeps a restrained, local specular response under its streetlamps; this is
    // ordinary PBR lighting, not SSR or a weather/wetness simulation.
    this.#urbanAsphaltMaterial = new MeshStandardNodeMaterial();
    this.#urbanAsphaltMaterial.color.set(0x222a32);
    this.#urbanAsphaltMaterial.roughness = 0.42;
    this.#urbanAsphaltMaterial.metalness = 0.035;
    this.#urbanAsphaltMaterial.name = 'aohara-urban-asphalt-local-sheen';

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

    for (const edge of network.edges) {
      const { halfWidthMeters, shoulderMeters } = edge;
      shoulderGeometries.push(
        buildRibbonGeometry(edge, (halfWidthMeters + shoulderMeters) * 2, SHOULDER_LIFT),
      );
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
    this.object = group;
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
      roadSurfacesLoaded: this.#surfacesLoaded,
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
