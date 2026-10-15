import { CircleGeometry, Group, Mesh, RepeatWrapping, type Object3D } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, uv, vec2 } from 'three/tsl';

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

/**
 * Visual road network: ribbon meshes laid over the carved terrain corridor.
 *
 * Geometry comes from the same solved profile the height function carves, so the
 * pavement can never float above or sink into the ground it replaces. Roads are authored
 * sparse (kilometres of ribbon, ~15k triangles), so unlike terrain they are built once
 * for the whole network rather than streamed per chunk.
 */
export class RoadWorld {
  readonly object: Object3D;

  readonly #network: RoadNetwork;

  readonly #meshes: Mesh[] = [];

  readonly #asphaltMaterial: MeshStandardNodeMaterial;

  readonly #shoulderMaterial: MeshStandardNodeMaterial;

  #surfacesLoaded: 0 | 1 = 0;

  constructor(network: RoadNetwork) {
    this.#network = network;
    const { halfWidthMeters, shoulderMeters } = network.config;

    this.#asphaltMaterial = new MeshStandardNodeMaterial();
    this.#asphaltMaterial.color.set(0x35383d);
    this.#asphaltMaterial.roughness = 0.94;
    this.#asphaltMaterial.metalness = 0;

    this.#shoulderMaterial = new MeshStandardNodeMaterial();
    this.#shoulderMaterial.color.set(0x8a7f6a);
    this.#shoulderMaterial.roughness = 1;
    this.#shoulderMaterial.metalness = 0;

    const markingMaterial = new MeshStandardNodeMaterial();
    markingMaterial.color.set(0xe9e6da);
    markingMaterial.roughness = 0.55;
    markingMaterial.metalness = 0;

    const add = (geometry: Mesh['geometry'], material: MeshStandardNodeMaterial): void => {
      const mesh = new Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.#meshes.push(mesh);
    };

    for (const edge of network.edges) {
      add(
        buildRibbonGeometry(edge, (halfWidthMeters + shoulderMeters) * 2, SHOULDER_LIFT),
        this.#shoulderMaterial,
      );
      add(buildRibbonGeometry(edge, halfWidthMeters * 2, ASPHALT_LIFT), this.#asphaltMaterial);
      for (const side of [-1, 1] as const) {
        add(
          buildRibbonGeometry(edge, 0.15, PAINT_LIFT, side * (halfWidthMeters - 0.45)),
          markingMaterial,
        );
      }
    }
    add(buildDashGeometry(network, PAINT_LIFT), markingMaterial);

    // Junction discs cover the fan where ribbons meet: gravel out to the shoulder line,
    // asphalt just past the pavement edges so corners never show grass wedges.
    for (const node of network.nodes) {
      const gravel = new CircleGeometry(halfWidthMeters + shoulderMeters, 24);
      gravel.rotateX(-Math.PI / 2);
      gravel.translate(node.x, node.y + SHOULDER_LIFT, node.z);
      add(gravel, this.#shoulderMaterial);
      const asphalt = new CircleGeometry(halfWidthMeters * 1.08, 24);
      asphalt.rotateX(-Math.PI / 2);
      asphalt.translate(node.x, node.y + ASPHALT_LIFT, node.z);
      add(asphalt, this.#asphaltMaterial);
    }

    const group = new Group();
    group.name = 'road-network';
    for (const mesh of this.#meshes) {
      group.add(mesh);
    }
    this.object = group;
  }

  /**
   * Async CC0 surfaces: scanned asphalt and sandy gravel at 1k. Until they arrive the
   * roads render with flat colours (already correct in shape and lighting); a failure
   * keeps that fallback permanently.
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
      // the scan stretching sideways over an 11 m pavement.
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
    const materials = new Set<MeshStandardNodeMaterial>();
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
