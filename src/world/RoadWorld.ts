import {
  BoxGeometry,
  CircleGeometry,
  DataTexture,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  type BufferGeometry,
} from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import { float, mix, mrt, positionLocal, sin, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { configureTiledSurface, SurfaceTextureLibrary } from '../assets/SurfaceTextureLibrary';
import type { AssetResolution } from '../assets/AssetManifest';
import { surfaceAssetIdAtResolution } from '../config/asset-resolution';
import { createArchitecturalMaterial } from './architectural-materials';
import { bindScannedPbrMaps } from './scanned-pbr';
import { createRoadWetPatchMaskTexture, createRoadWetnessNode } from './road-wet-patches';
import { resolveUrbanWetness, URBAN_CITY_CONFIG } from '../config/urban-city';
import { clamp } from '../shared/math';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { RoadNetwork } from './road-network';
import {
  buildDashGeometry,
  buildRibbonGeometry,
  markingTrimsForEdge,
  trimRoadEdge,
} from './road-geometry';

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
  /** Yaw for crossings on angled roads (the grand boulevard); 0 keeps the classic layout. */
  readonly yaw?: number;
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

  /** One travel axis at a node: the grand boulevard counts as its own diagonal axis. */
  const collectRoadAxes = (nodeId: string) => {
    const axes: {
      x: number;
      z: number;
      halfWidthMeters: number;
    }[] = [];
    for (const edge of network.edges) {
      if (!isUrbanRoad(edge) || (edge.from !== nodeId && edge.to !== nodeId)) {
        continue;
      }
      const from = network.nodeById(edge.from);
      const to = network.nodeById(edge.to);
      if (from === null || to === null) {
        continue;
      }
      const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      const x = (to.x - from.x) / length;
      const z = (to.z - from.z) / length;
      const match = axes.find((axis) => Math.abs(axis.x * x + axis.z * z) > 0.985);
      if (match === undefined) {
        axes.push({ x, z, halfWidthMeters: edge.halfWidthMeters });
      } else {
        match.halfWidthMeters = Math.max(match.halfWidthMeters, edge.halfWidthMeters);
      }
    }
    return axes;
  };

  for (const node of network.nodes) {
    const axes = collectRoadAxes(node.id);
    if (axes.length < 2) {
      continue;
    }
    intersectionCount += 1;

    let horizontalHalfWidth: number | null = null;
    let verticalHalfWidth: number | null = null;
    for (const axis of axes) {
      if (Math.abs(axis.x) >= Math.abs(axis.z)) {
        horizontalHalfWidth = Math.max(horizontalHalfWidth ?? 0, axis.halfWidthMeters);
      } else {
        verticalHalfWidth = Math.max(verticalHalfWidth ?? 0, axis.halfWidthMeters);
      }
    }

    for (const axis of axes) {
      const usableWidth = Math.max(6, axis.halfWidthMeters * 2 - 2.8);
      const normalX = axis.z;
      const normalZ = -axis.x;
      // The zebra's inner rows meet the crossing road's corner the way the classic
      // orthogonal layout does (2.3 m of the zone on the crossing asphalt): the approach
      // distance is the crossing road's asphalt width projected onto this axis. Where the
      // grand boulevard crosses at an angle that projection is longer, so the crossing
      // moves out with it instead of landing on the avenue's asphalt.
      let approachMeters = 0;
      for (const other of axes) {
        if (other === axis) {
          continue;
        }
        const cross = Math.abs(axis.x * other.z - axis.z * other.x);
        if (cross < 0.15) {
          continue;
        }
        approachMeters = Math.max(approachMeters, other.halfWidthMeters / cross);
      }
      const offsetMeters = approachMeters + usableWidth / 2 - 2.3;
      const stripeCount = Math.max(6, Math.floor(usableWidth / stripePitch));
      const start = -((stripeCount - 1) * stripePitch) / 2;
      const yaw = Math.atan2(-normalZ, normalX);
      for (const side of [-1, 1] as const) {
        for (let stripe = 0; stripe < stripeCount; stripe += 1) {
          const along = side * offsetMeters + start + stripe * stripePitch;
          markings.push({
            x: node.x + axis.x * along,
            y: node.y + PAINT_LIFT,
            z: node.z + axis.z * along,
            width: usableWidth,
            depth: stripeWidth,
            yaw,
          });
        }
      }
    }

    // Only the signalized central junction has stop bars; the other intersections
    // receive zebra crossings but no misleading stop-line-only controls.
    if (node.id === 'aohara-center' && horizontalHalfWidth !== null && verticalHalfWidth !== null) {
      const verticalApproachOffset = horizontalHalfWidth + 3.8;
      const horizontalApproachOffset = verticalHalfWidth + 3.8;
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
    transform.rotation.set(0, marking.yaw ?? 0, 0);
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

  readonly #sidewalkMaterial: MeshPhysicalNodeMaterial;

  readonly #surfaceTextures: SurfaceTextureLibrary;

  readonly #ownsSurfaceTextures: boolean;

  readonly #wetPatchMaskTexture: DataTexture;

  readonly #urbanWetness = uniform(URBAN_CITY_CONFIG.wetRoad.wetnessDay);

  readonly #urbanWetPatchMask: Node<'float'>;

  #baseUrbanWetness: number = URBAN_CITY_CONFIG.wetRoad.wetnessDay;

  #surfaceWetness = 0;

  readonly #urbanSidewalkEdges: number;

  readonly #urbanCrosswalkIntersections: number;

  #surfacesLoaded: 0 | 1 = 0;

  #sidewalkSurfaceBound = false;

  #disposed = false;

  constructor(
    network: RoadNetwork,
    surfaceTextures?: SurfaceTextureLibrary,
    wetRoadMaskOutput = true,
  ) {
    this.#network = network;
    this.#surfaceTextures = surfaceTextures ?? new SurfaceTextureLibrary();
    this.#ownsSurfaceTextures = surfaceTextures === undefined;
    this.#wetPatchMaskTexture = createRoadWetPatchMaskTexture();
    this.#urbanWetPatchMask = createRoadWetnessNode(this.#wetPatchMaskTexture, this.#urbanWetness);

    this.#asphaltMaterial = new MeshStandardNodeMaterial();
    this.#asphaltMaterial.color.set(0x35383d);
    this.#asphaltMaterial.roughness = 0.94;
    this.#asphaltMaterial.metalness = 0;

    this.#shoulderMaterial = new MeshStandardNodeMaterial();
    this.#shoulderMaterial.color.set(0x7a6c50);
    this.#shoulderMaterial.roughness = 1;
    this.#shoulderMaterial.metalness = 0;

    // Aohara's scanned asphalt stays neutral and rough between deterministically distributed
    // rain patches. Each puddle mask alone darkens the albedo, lowers roughness, and contributes
    // a wet-road MRT channel for the tier-bounded, mask-gated SSR pass.
    this.#urbanAsphaltMaterial = new MeshPhysicalNodeMaterial();
    this.#urbanAsphaltMaterial.color.set(0x34383b);
    this.#urbanAsphaltMaterial.roughness = URBAN_CITY_CONFIG.wetRoad.dryRoughness;
    this.#urbanAsphaltMaterial.metalness = 0.025;
    this.#urbanAsphaltMaterial.roughnessNode = mix(
      float(URBAN_CITY_CONFIG.wetRoad.dryRoughness),
      float(URBAN_CITY_CONFIG.wetRoad.wetRoughness),
      this.#urbanWetPatchMask,
    );
    this.#urbanAsphaltMaterial.clearcoatNode = mix(
      float(URBAN_CITY_CONFIG.wetRoad.dryClearcoat),
      float(URBAN_CITY_CONFIG.wetRoad.wetClearcoat),
      this.#urbanWetPatchMask,
    );
    this.#urbanAsphaltMaterial.clearcoatRoughnessNode = mix(
      float(URBAN_CITY_CONFIG.wetRoad.dryClearcoatRoughness),
      float(URBAN_CITY_CONFIG.wetRoad.wetClearcoatRoughness),
      this.#urbanWetPatchMask,
    );
    this.#urbanAsphaltMaterial.colorNode = vec4(
      this.#urbanAsphaltMaterial.color.r,
      this.#urbanAsphaltMaterial.color.g,
      this.#urbanAsphaltMaterial.color.b,
      1,
    ).mul(
      mix(float(1), float(URBAN_CITY_CONFIG.wetRoad.wetAlbedoMultiplier), this.#urbanWetPatchMask),
    );
    this.#urbanAsphaltMaterial.mrtNode = wetRoadMaskOutput
      ? mrt({ wetRoadMask: this.#urbanWetPatchMask })
      : null;
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
      if (
        edge.roadClass === 'urban-local' ||
        edge.roadClass === 'urban-arterial' ||
        edge.roadClass === 'urban-alley'
      ) {
        urbanAsphaltGeometries.push(asphaltGeometry);
      } else {
        asphaltGeometries.push(asphaltGeometry);
      }
      const markingEdge =
        edge.roadClass === 'urban-alley'
          ? null
          : (() => {
              // Phase 8.4b: the avenue crossing corners need a wider paint gap than the flat
              // clearance; everything else keeps the established 14 m.
              const { startMeters, endMeters } = markingTrimsForEdge(
                network,
                edge,
                halfWidthMeters - 0.45,
              );
              return trimRoadEdge(edge, startMeters, endMeters);
            })();
      if (markingEdge !== null) {
        for (const side of [-1, 1] as const) {
          markingGeometries.push(
            buildRibbonGeometry(markingEdge, 0.15, PAINT_LIFT, side * (halfWidthMeters - 0.45)),
          );
        }
      }
      if (edge.roadClass === 'urban-arterial' && markingEdge !== null) {
        for (const side of [-1, 1] as const) {
          centerlineGeometries.push(
            buildRibbonGeometry(markingEdge, 0.11, PAINT_LIFT, side * 0.18),
          );
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
          urbanJunction ||=
            edge.roadClass === 'urban-local' ||
            edge.roadClass === 'urban-arterial' ||
            edge.roadClass === 'urban-alley';
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

    this.#sidewalkMaterial = createArchitecturalMaterial({
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
      this.#sidewalkMaterial,
      'aohara-sidewalks',
    );
    if (urbanMarkings.mesh !== null) {
      this.#meshes.push(urbanMarkings.mesh);
      group.add(urbanMarkings.mesh);
    }
    this.object = group;
  }

  /** Adjust the Aohara-only art-directed road sheen with the existing dusk/night lighting gate. */
  setDaylight(state: DaylightState): void {
    this.#baseUrbanWetness = resolveUrbanWetness(state.sunElevationDegrees);
    this.#updateUrbanWetness();
  }

  /** Apply the shared weather/surface wetness to the existing Aohara asphalt material. */
  setSurfaceWetness(wetness: number): void {
    this.#surfaceWetness = clamp(Number.isFinite(wetness) ? wetness : 0, 0, 1);
    this.#updateUrbanWetness();
  }

  #updateUrbanWetness(): void {
    // Preserve the established day/night look in clear weather; rain raises the sheen to at least
    // the sampled surface wetness. The uniform is shared by the same bounded urban road batch.
    this.#urbanWetness.value = Math.max(this.#baseUrbanWetness, this.#surfaceWetness);
  }

  /**
   * Async CC0 surfaces: scanned asphalt, sandy gravel and aggregate concrete at 1k. Until they
   * arrive the roads render with their authored fallback materials; failures are non-fatal.
   */
  async loadSurfaces(resolution: AssetResolution = '1k'): Promise<void> {
    if (this.#disposed || (this.#surfacesLoaded === 1 && this.#sidewalkSurfaceBound)) {
      return;
    }

    const [asphalt, gravel, concrete] = await Promise.all([
      this.#surfaceTextures.load(surfaceAssetIdAtResolution('tex-asphalt-03-1k', resolution)),
      this.#surfaceTextures.load(surfaceAssetIdAtResolution('tex-sandy-gravel-1k', resolution)),
      this.#surfaceTextures.load(
        surfaceAssetIdAtResolution('tex-gravel-concrete-03-1k', resolution),
      ),
    ]);
    if (this.#disposed) {
      return;
    }

    if (concrete !== null && !this.#sidewalkSurfaceBound) {
      configureTiledSurface(concrete);
      const authoredColor =
        (this.#sidewalkMaterial.colorNode as Node<'vec4'> | null) ??
        vec4(
          this.#sidewalkMaterial.color.r,
          this.#sidewalkMaterial.color.g,
          this.#sidewalkMaterial.color.b,
          1,
        );
      const authoredRoughness = this.#sidewalkMaterial.roughnessNode as Node<'float'> | null;
      bindScannedPbrMaps(this.#sidewalkMaterial, concrete, uv().mul(vec2(3, 3)), {
        albedoTint: authoredColor,
        normalStrength: 0.55,
        aoStrength: 0.72,
        metalnessScale: 0,
        ...(authoredRoughness === null
          ? {}
          : {
              roughnessAdjustment: authoredRoughness.sub(float(this.#sidewalkMaterial.roughness)),
            }),
      });
      this.#sidewalkSurfaceBound = true;
    }

    // Ribbon UVs run across [0, 1] and along in metres / 6; the across repeat stops
    // the scan stretching sideways over both rural lanes and the wider city streets.
    const roadUv = uv().mul(vec2(2, 1));
    // The batches keep authored world-space vertices in mesh-local coordinates. Sample them
    // before the floating-origin root shift so the subtle macro variation cannot jump on rebase.
    // The CC0 albedo/normal/ARM maps still carry all physical micro-detail.
    const roadMacro = float(1)
      .add(sin(positionLocal.x.mul(0.013).add(positionLocal.z.mul(0.009))).mul(0.025))
      .add(sin(positionLocal.x.mul(0.071).sub(positionLocal.z.mul(0.053))).mul(0.006));
    const macroTint = vec4(roadMacro, roadMacro, roadMacro, 1);

    if (asphalt !== null) {
      configureTiledSurface(asphalt);
      bindScannedPbrMaps(this.#asphaltMaterial, asphalt, roadUv, {
        albedoTint: macroTint,
        normalStrength: 0.72,
      });

      // The same CC0 maps carry hard-asphalt microdetail across both dry and wet parts. Only the
      // irregular patch mask darkens the albedo or blends the packed roughness toward standing water.
      bindScannedPbrMaps(this.#urbanAsphaltMaterial, asphalt, roadUv, {
        albedoTint: vec4(...URBAN_CITY_CONFIG.wetRoad.dryAlbedoTint, 1).mul(macroTint),
        normalStrength: 0.65,
      });
      const scannedAlbedo = this.#urbanAsphaltMaterial.colorNode as Node<'vec4'> | null;
      if (scannedAlbedo !== null) {
        this.#urbanAsphaltMaterial.colorNode = scannedAlbedo.mul(
          mix(
            float(1),
            float(URBAN_CITY_CONFIG.wetRoad.wetAlbedoMultiplier),
            this.#urbanWetPatchMask,
          ),
        );
      }
      if (asphalt.arm !== null) {
        this.#urbanAsphaltMaterial.roughnessNode = mix(
          texture(asphalt.arm, roadUv).g,
          float(URBAN_CITY_CONFIG.wetRoad.wetRoughness),
          this.#urbanWetPatchMask,
        );
      }
      this.#urbanAsphaltMaterial.needsUpdate = true;
    }

    if (gravel !== null) {
      configureTiledSurface(gravel);
      bindScannedPbrMaps(this.#shoulderMaterial, gravel, roadUv, {
        normalStrength: 0.78,
      });
    }
    if (asphalt !== null && gravel !== null) {
      this.#surfacesLoaded = 1;
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
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const materials = new Set<MeshStandardNodeMaterial>([
      this.#asphaltMaterial,
      this.#shoulderMaterial,
      this.#urbanAsphaltMaterial,
      this.#sidewalkMaterial,
    ]);
    for (const mesh of this.#meshes) {
      mesh.geometry.dispose();
      materials.add(mesh.material as MeshStandardNodeMaterial);
    }
    for (const material of materials) {
      material.dispose();
    }
    this.#wetPatchMaskTexture.dispose();
    if (this.#ownsSurfaceTextures) {
      this.#surfaceTextures.dispose();
    }
    this.#meshes.length = 0;
  }
}
