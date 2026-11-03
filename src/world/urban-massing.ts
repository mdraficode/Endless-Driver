/**
 * Phase 10 — the massing city renderer.
 *
 * Draws the "vast city" beyond the home city: instanced tower blocks with set-back crowns,
 * lit window quads, low infill, street lamps and a few point lights — for one generated
 * urban region (see `city-content.ts`). It reuses the same material/program families as
 * Aohara (`createArchitecturalMaterial`, the window/night-emissive MeshBasicNodeMaterial
 * pattern, shared collision helpers), so a streamed massing city adds no new shader stages
 * (the 281-stage floor holds). Cities are built on approach and disposed on departure by
 * `CityStreamer`.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { uniform, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial, type UniformNode } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArchitecturalMaterial } from './architectural-materials';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import type { TierId } from '../config/tiers';
import type { TownCarProbe, TownHit } from './town';
import type { MassingCitySpec, MassingPlot } from './city-content';

/** The city's ground lift above the solved road datum (Aohara's WORLD_BASE_Y convention). */
const WORLD_BASE_Y = -0.55;
const STREET_LAMP_COLOR = 0xffe0b0;
/** Per-tier point-light count for a streamed city (Aohara tier C carries 6 for one city). */
const CITY_POINT_LIGHTS: Readonly<Record<TierId, number>> = { A: 4, B: 3, C: 2 };
/** Hard cap on lit window instances per city (one instanced draw each). */
const MAX_WINDOW_INSTANCES = 15000;

/** A window quad transform in city-local space. */
interface WindowQuad {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Yaw so the unit plane faces outward from the tower face. */
  readonly yaw: number;
}

interface FencePanel {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** 1.5 m fence panels ringing a lot (two posts + two rails per panel, merged). */
function buildFencePanelGeometry(): BufferGeometry {
  const post = new BoxGeometry(0.07, 1.5, 0.07);
  post.translate(-0.72, 0, 0);
  const post2 = new BoxGeometry(0.07, 1.5, 0.07);
  post2.translate(0.72, 0, 0);
  const rail = new BoxGeometry(1.5, 0.05, 0.04);
  rail.translate(0, 0.55, 0);
  const rail2 = new BoxGeometry(1.5, 0.05, 0.04);
  rail2.translate(0, 1.1, 0);
  const merged = mergeGeometries([post, post2, rail, rail2], false);
  post.dispose();
  post2.dispose();
  rail.dispose();
  rail2.dispose();
  if (merged === null) {
    throw new Error('fence panel merge failed');
  }
  return merged;
}

/** The fence ring panels for one lot, centred on the building (local frame before the yaw). */
function fenceRingsForLot(plot: MassingPlot): readonly FencePanel[] {
  const panels: FencePanel[] = [];
  const w = plot.widthMeters + 2;
  const d = plot.depthMeters + 2;
  const cos = Math.cos(plot.yaw);
  const sin = Math.sin(plot.yaw);
  const push = (lx: number, lz: number, yaw: number): void => {
    // The panel geometry runs along local X; rotate by the lot yaw plus the side's turn.
    panels.push({ x: lx * cos - lz * sin, z: lx * sin + lz * cos, yaw: plot.yaw + yaw });
  };
  const halfW = w / 2;
  const halfD = d / 2;
  // The street front is the local -Z side; a driveway gap is left in its middle.
  const gapHalf = plot.widthMeters / 2 + 1.2;
  for (let x = -halfW; x < halfW; x += 1.5) {
    if (Math.abs(x) <= gapHalf) {
      // Skip the front (street-side) panel; keep the back one.
      push(x, halfD, 0);
      continue;
    }
    push(x, -halfD, 0);
    push(x, halfD, 0);
  }
  for (let z = -halfD; z < halfD; z += 1.5) {
    push(-halfW, z, Math.PI / 2);
    push(halfW, z, Math.PI / 2);
  }
  return panels;
}

/** Infallible hash in [0, 1) for window/lamp selection. */
function cellHash(a: number, b: number, c: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 1274126177 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0x100000000;
}

/** The window-light material: identical node graph to Aohara's (same program family). */
function createMassingWindowMaterial(
  color: readonly [number, number, number],
  nightGain: UniformNode<'float', number>,
  name: string,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.toneMapped = false;
  const colorU = uniform(new Vector3(color[0], color[1], color[2]), 'vec3');
  material.colorNode = vec4(colorU.mul(nightGain), 1);
  return material;
}

/** A warm night-emissive material for lamp heads (Aohara's pattern). */
function createMassingEmissiveMaterial(
  colorHex: number,
  nightGain: UniformNode<'float', number>,
  name: string,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  const color = new Color(colorHex);
  const colorU = uniform(new Vector3(color.r, color.g, color.b), 'vec3');
  material.name = name;
  material.toneMapped = false;
  material.colorNode = vec4(colorU.mul(nightGain).mul(1.12), 1);
  return material;
}

export class MassingCityWorld {
  readonly root = new Group();
  readonly kind = 'massing-city';
  readonly #spec: MassingCitySpec;
  readonly #tier: TierId;
  #geometries: BufferGeometry[] = [];
  #materials: Material[] = [];
  #pointLights: PointLight[] = [];
  #collisionBoxes: StaticBuildingBox[] = [];
  #disposed = false;

  constructor(
    spec: MassingCitySpec,
    tier: TierId,
    options: {
      readonly nightGain: UniformNode<'float', number>;
      /** Ground elevation under the city centre (the shared terrain sampler). */
      readonly baseY: number;
    },
  ) {
    this.#spec = spec;
    this.#tier = tier;
    this.root.name = `massing-city-${spec.regionId}`;
    this.root.position.set(spec.x, options.baseY + 0.57, spec.z);
    this.#build(options.nightGain);
  }

  /** Static building collision, in world space (same contract as town/Aohara hits). */
  collideTown(car: TownCarProbe): readonly TownHit[] {
    if (this.#disposed) return [];
    return collideCarWithStaticBoxes(car, this.#collisionBoxes);
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      massingCityTowers: this.#spec.towers.length,
      massingCityInfill: this.#spec.infill.length,
      massingCityPointLights: this.#pointLights.length,
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const light of this.#pointLights) {
      light.removeFromParent();
    }
    for (const geometry of this.#geometries) {
      geometry.dispose();
    }
    for (const material of this.#materials) {
      material.dispose();
    }
    this.root.removeFromParent();
  }

  #track<T>(value: T, list: T[]): T {
    list.push(value);
    return value;
  }

  #build(nightGain: UniformNode<'float', number>): void {
    const spec = this.#spec;
    const unitBox = this.#track(new BoxGeometry(1, 1, 1), this.#geometries);
    const transform = new Object3D();

    // --- Towers: one instanced batch per facade colour (Aohara's grouping). ---
    const groups = new Map<number, number[]>();
    spec.towers.forEach((tower, index) => {
      const group = groups.get(tower.color) ?? [];
      group.push(index);
      groups.set(tower.color, group);
    });
    let paletteIndex = 0;
    for (const [colorHex, indices] of groups) {
      const wall = this.#track(
        createArchitecturalMaterial({
          name: `massing-facade-${spec.regionId}-${paletteIndex}`,
          colorHex,
          roughness: 0.72,
          metalness: 0.16,
          detailAmplitude: 0.028,
          clearcoat: 0.16,
          clearcoatRoughness: 0.32,
        }),
        this.#materials,
      );
      const crownCount = indices.filter((i) => (spec.towers[i]?.crown ?? null) !== null).length;
      const mesh = new InstancedMesh(unitBox, wall, Math.max(1, indices.length + crownCount));
      mesh.name = `massing-facades-${spec.regionId}-${paletteIndex}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      let instanceIndex = 0;
      for (const i of indices) {
        const tower = spec.towers[i]!;
        const bodyHeight = tower.crown ? tower.height - tower.crown.height : tower.height;
        transform.position.set(tower.x, WORLD_BASE_Y + bodyHeight / 2, tower.z);
        transform.scale.set(tower.width, bodyHeight, tower.depth);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        mesh.setMatrixAt(instanceIndex++, transform.matrix);
        if (tower.crown) {
          transform.position.set(
            tower.x + (tower.crown.offsetX ?? 0),
            WORLD_BASE_Y + tower.height - tower.crown.height / 2,
            tower.z + (tower.crown.offsetZ ?? 0),
          );
          transform.scale.set(tower.crown.width, tower.crown.height, tower.crown.depth);
          transform.updateMatrix();
          mesh.setMatrixAt(instanceIndex++, transform.matrix);
        }
        this.#collisionBoxes.push({
          x: spec.x + tower.x,
          z: spec.z + tower.z,
          yaw: 0,
          halfWidth: tower.width / 2,
          halfDepth: tower.depth / 2,
        });
      }
      mesh.count = instanceIndex;
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
      paletteIndex += 1;
    }

    // --- Rooftop caps. ---
    const roofMaterial = this.#track(
      createArchitecturalMaterial({
        name: `massing-roofs-${spec.regionId}`,
        colorHex: 0x10161e,
        roughness: 0.86,
        metalness: 0.08,
        detailAmplitude: 0.018,
        clearcoat: 0.08,
        clearcoatRoughness: 0.42,
      }),
      this.#materials,
    );
    const capCount = spec.towers.reduce((total, tower) => total + (tower.crown ? 2 : 1), 0);
    const roofs = new InstancedMesh(unitBox, roofMaterial, Math.max(1, capCount));
    roofs.name = `massing-roof-caps-${spec.regionId}`;
    roofs.frustumCulled = false;
    let capIndex = 0;
    for (const tower of spec.towers) {
      if (tower.crown) {
        transform.position.set(
          tower.x,
          WORLD_BASE_Y + tower.height - tower.crown.height + 0.2,
          tower.z,
        );
        transform.scale.set(tower.width + 0.5, 0.4, tower.depth + 0.5);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        roofs.setMatrixAt(capIndex++, transform.matrix);
        transform.position.set(
          tower.x + (tower.crown.offsetX ?? 0),
          WORLD_BASE_Y + tower.height + 0.35,
          tower.z + (tower.crown.offsetZ ?? 0),
        );
        transform.scale.set(tower.crown.width + 0.5, 0.7, tower.crown.depth + 0.5);
        transform.updateMatrix();
        roofs.setMatrixAt(capIndex++, transform.matrix);
      } else {
        transform.position.set(tower.x, WORLD_BASE_Y + tower.height + 0.35, tower.z);
        transform.scale.set(tower.width + 0.5, 0.7, tower.depth + 0.5);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        roofs.setMatrixAt(capIndex++, transform.matrix);
      }
    }
    roofs.count = capIndex;
    roofs.instanceMatrix.needsUpdate = true;
    this.root.add(roofs);

    // --- Lit windows: sparse quads on tower faces, two tone families. ---
    const warm: WindowQuad[] = [];
    const cool: WindowQuad[] = [];
    const litChance = this.#spec.streetSpacing > 250 ? 0.16 : 0.12;
    for (
      let i = 0;
      i < spec.towers.length && warm.length + cool.length < MAX_WINDOW_INSTANCES;
      i += 1
    ) {
      const tower = spec.towers[i]!;
      const faces: Array<{ normal: 0 | 1; faceWidth: number; fixed: number; sign: 1 | -1 }> = [
        { normal: 0, faceWidth: tower.width, fixed: tower.z - tower.depth / 2 - 0.06, sign: -1 },
        { normal: 0, faceWidth: tower.width, fixed: tower.z + tower.depth / 2 + 0.06, sign: 1 },
        { normal: 1, faceWidth: tower.depth, fixed: tower.x - tower.width / 2 - 0.06, sign: -1 },
        { normal: 1, faceWidth: tower.depth, fixed: tower.x + tower.width / 2 + 0.06, sign: 1 },
      ];
      for (const face of faces) {
        const rows = Math.max(2, Math.floor((tower.height - 8) / 6));
        const cols = Math.max(2, Math.floor(face.faceWidth / 7));
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const h = cellHash(i, r * 31 + c, face.normal * 7 + (face.sign === 1 ? 3 : 1), 0x5f37);
            if (h > litChance) continue;
            const y = 6 + r * 6;
            if (y > tower.height - 4) continue;
            const along = -((cols - 1) / 2) * 7 + c * 7;
            const quad: WindowQuad =
              face.normal === 0
                ? { x: tower.x + along, y, z: face.fixed, yaw: 0 }
                : { x: face.fixed, y, z: tower.z + along, yaw: Math.PI / 2 };
            (cellHash(i, r, c, 0xa11) < 0.8 ? warm : cool).push(quad);
          }
        }
      }
    }
    const windowGeometry = this.#track(new PlaneGeometry(2.0, 2.6), this.#geometries);
    const warmMaterial = this.#track(
      createMassingWindowMaterial(
        [1.0, 0.56, 0.25],
        nightGain,
        `massing-warm-windows-${spec.regionId}`,
      ),
      this.#materials,
    );
    const coolMaterial = this.#track(
      createMassingWindowMaterial(
        [0.62, 0.78, 1.0],
        nightGain,
        `massing-cool-windows-${spec.regionId}`,
      ),
      this.#materials,
    );
    const addWindowInstances = (
      material: Material,
      quads: readonly WindowQuad[],
      name: string,
    ): void => {
      if (quads.length === 0) return;
      const mesh = new InstancedMesh(windowGeometry, material, quads.length);
      mesh.name = name;
      mesh.frustumCulled = false;
      quads.forEach((quad, index) => {
        transform.position.set(quad.x, quad.y, quad.z);
        transform.rotation.set(0, quad.yaw, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    };
    addWindowInstances(warmMaterial, warm, `massing-windows-warm-${spec.regionId}`);
    addWindowInstances(coolMaterial, cool, `massing-windows-cool-${spec.regionId}`);

    // --- Infill: one dark instanced batch. ---
    if (spec.infill.length > 0) {
      const infillMaterial = this.#track(
        createArchitecturalMaterial({
          name: `massing-infill-${spec.regionId}`,
          colorHex: 0x232830,
          roughness: 0.9,
          metalness: 0.05,
          detailAmplitude: 0.02,
          clearcoat: 0.05,
          clearcoatRoughness: 0.5,
        }),
        this.#materials,
      );
      const mesh = new InstancedMesh(unitBox, infillMaterial, spec.infill.length);
      mesh.name = `massing-infill-${spec.regionId}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      spec.infill.forEach((box, index) => {
        transform.position.set(box.x, WORLD_BASE_Y + box.height / 2, box.z);
        transform.scale.set(box.width, box.height, box.depth);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        this.#collisionBoxes.push({
          x: spec.x + box.x,
          z: spec.z + box.z,
          yaw: 0,
          halfWidth: box.width / 2,
          halfDepth: box.depth / 2,
        });
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }

    // --- Phase 10.2 plot dressing: lot-front buildings, lot fences and front pathways. ---
    if (spec.plots.length > 0) {
      const plotFacade = this.#track(
        createArchitecturalMaterial({
          name: `massing-plot-facades-${spec.regionId}`,
          colorHex: 0x39424e,
          roughness: 0.78,
          metalness: 0.1,
          detailAmplitude: 0.02,
          clearcoat: 0.1,
          clearcoatRoughness: 0.4,
        }),
        this.#materials,
      );
      const plotRoof = this.#track(
        createArchitecturalMaterial({
          name: `massing-plot-roofs-${spec.regionId}`,
          colorHex: 0x20262e,
          roughness: 0.85,
          metalness: 0.08,
          detailAmplitude: 0.016,
          clearcoat: 0.06,
          clearcoatRoughness: 0.5,
        }),
        this.#materials,
      );
      const heights: Record<MassingPlot['kind'], number> = { garage: 5, house: 6.5, shop: 4.5 };
      const facades = new InstancedMesh(unitBox, plotFacade, spec.plots.length);
      const roofs = new InstancedMesh(unitBox, plotRoof, spec.plots.length);
      facades.name = `massing-plot-facades-${spec.regionId}`;
      roofs.name = `massing-plot-roofs-${spec.regionId}`;
      facades.castShadow = true;
      facades.receiveShadow = true;
      facades.frustumCulled = false;
      roofs.frustumCulled = false;
      spec.plots.forEach((plot, index) => {
        const height = heights[plot.kind];
        // The plot spot marks the building FRONT (set back from the curb); the box centre
        // sits half a depth further into the lot (the back direction is (sin yaw, cos yaw)).
        const backX = Math.sin(plot.yaw) * (plot.depthMeters / 2);
        const backZ = Math.cos(plot.yaw) * (plot.depthMeters / 2);
        const cx = plot.x + backX;
        const cz = plot.z + backZ;
        transform.position.set(cx, WORLD_BASE_Y + height / 2, cz);
        transform.scale.set(plot.widthMeters, height, plot.depthMeters);
        transform.rotation.set(0, plot.yaw, 0);
        transform.updateMatrix();
        facades.setMatrixAt(index, transform.matrix);
        transform.position.set(cx, WORLD_BASE_Y + height + 0.25, cz);
        transform.scale.set(plot.widthMeters + 0.4, 0.5, plot.depthMeters + 0.4);
        transform.updateMatrix();
        roofs.setMatrixAt(index, transform.matrix);
        this.#collisionBoxes.push({
          x: spec.x + cx,
          z: spec.z + cz,
          yaw: plot.yaw,
          halfWidth: plot.widthMeters / 2,
          halfDepth: plot.depthMeters / 2,
        });
      });
      facades.instanceMatrix.needsUpdate = true;
      roofs.instanceMatrix.needsUpdate = true;
      this.root.add(facades);
      this.root.add(roofs);
      // Lot fences: a ring of 1.5 m panels around each lot.
      const fenceMaterial = this.#track(
        createArchitecturalMaterial({
          name: `massing-plot-fences-${spec.regionId}`,
          colorHex: 0x2c333b,
          roughness: 0.5,
          metalness: 0.55,
          detailAmplitude: 0.008,
          clearcoat: 0.2,
          clearcoatRoughness: 0.35,
        }),
        this.#materials,
      );
      const fenceGeometry = this.#track(buildFencePanelGeometry(), this.#geometries);
      let fenceCount = 0;
      for (const plot of spec.plots) {
        fenceCount += fenceRingsForLot(plot).length;
      }
      const fences = new InstancedMesh(fenceGeometry, fenceMaterial, Math.max(1, fenceCount));
      fences.name = `massing-plot-fences-${spec.regionId}`;
      fences.frustumCulled = false;
      let fenceIndex = 0;
      for (const plot of spec.plots) {
        const backX = Math.sin(plot.yaw) * (plot.depthMeters / 2);
        const backZ = Math.cos(plot.yaw) * (plot.depthMeters / 2);
        const cx = plot.x + backX;
        const cz = plot.z + backZ;
        for (const panel of fenceRingsForLot(plot)) {
          transform.position.set(cx + panel.x, WORLD_BASE_Y + 0.75, cz + panel.z);
          transform.scale.set(1, 1, 1);
          transform.rotation.set(0, panel.yaw, 0);
          transform.updateMatrix();
          fences.setMatrixAt(fenceIndex++, transform.matrix);
        }
      }
      fences.count = fenceIndex;
      fences.instanceMatrix.needsUpdate = true;
      this.root.add(fences);
      // Front pathways: a concrete strip from the lot front toward the sidewalk.
      const pathMaterial = this.#track(
        createArchitecturalMaterial({
          name: `massing-plot-paths-${spec.regionId}`,
          colorHex: 0x62686e,
          roughness: 0.9,
          metalness: 0.02,
          detailAmplitude: 0.02,
          clearcoat: 0.03,
          clearcoatRoughness: 0.6,
        }),
        this.#materials,
      );
      const paths = new InstancedMesh(unitBox, pathMaterial, spec.plots.length);
      paths.name = `massing-plot-paths-${spec.regionId}`;
      paths.frustumCulled = false;
      spec.plots.forEach((plot, index) => {
        // The front normal is (-sin yaw, -cos yaw): the path runs from the building front
        // line out to the pavement edge. Rotating by yaw + PI aims the strip's local +Z
        // along that normal.
        const fx = -Math.sin(plot.yaw);
        const fz = -Math.cos(plot.yaw);
        transform.position.set(
          plot.x + fx * (plot.depthMeters / 2 + 2.25),
          WORLD_BASE_Y + 0.06,
          plot.z + fz * (plot.depthMeters / 2 + 2.25),
        );
        transform.scale.set(1.2, 0.1, 4.5);
        transform.rotation.set(0, plot.yaw + Math.PI, 0);
        transform.updateMatrix();
        paths.setMatrixAt(index, transform.matrix);
      });
      paths.instanceMatrix.needsUpdate = true;
      this.root.add(paths);
    }

    // --- Street lamps: half the grid nodes get poles; a tier-budgeted few carry lights. ---
    const lampSeed = spec.regionId
      .split('')
      .reduce((total, ch) => total + ch.charCodeAt(0) * 31, 0);
    const lampPositions = spec.lamps.filter((_, index) => cellHash(index, 0, 0, lampSeed) < 0.5);
    if (lampPositions.length > 0) {
      const poleGeometry = this.#track(new BoxGeometry(0.14, 7.5, 0.14), this.#geometries);
      const headGeometry = this.#track(new BoxGeometry(0.55, 0.3, 0.55), this.#geometries);
      const poleMaterial = this.#track(
        createArchitecturalMaterial({
          name: `massing-lamp-poles-${spec.regionId}`,
          colorHex: 0x1a1f26,
          roughness: 0.6,
          metalness: 0.4,
          detailAmplitude: 0.01,
          clearcoat: 0.2,
          clearcoatRoughness: 0.4,
        }),
        this.#materials,
      );
      const headMaterial = this.#track(
        createMassingEmissiveMaterial(
          STREET_LAMP_COLOR,
          nightGain,
          `massing-lamp-heads-${spec.regionId}`,
        ),
        this.#materials,
      );
      const poles = new InstancedMesh(poleGeometry, poleMaterial, lampPositions.length);
      poles.name = `massing-lamp-poles-${spec.regionId}`;
      poles.frustumCulled = false;
      const heads = new InstancedMesh(headGeometry, headMaterial, lampPositions.length);
      heads.name = `massing-lamp-heads-${spec.regionId}`;
      heads.frustumCulled = false;
      lampPositions.forEach((lamp, index) => {
        transform.position.set(lamp.x, WORLD_BASE_Y + 3.75, lamp.z);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        poles.setMatrixAt(index, transform.matrix);
        transform.position.set(lamp.x, WORLD_BASE_Y + 7.5, lamp.z);
        transform.updateMatrix();
        heads.setMatrixAt(index, transform.matrix);
      });
      poles.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      this.root.add(poles);
      this.root.add(heads);

      const lightCount = Math.min(CITY_POINT_LIGHTS[this.#tier] ?? 2, lampPositions.length);
      const ordered = lampPositions
        .map((lamp, index) => ({ index, distance: lamp.x * lamp.x + lamp.z * lamp.z }))
        .sort((a, b) => a.distance - b.distance);
      for (let i = 0; i < lightCount; i += 1) {
        const lamp = ordered[i] ? lampPositions[ordered[i]!.index] : undefined;
        if (lamp === undefined) continue;
        const light = new PointLight(STREET_LAMP_COLOR, 55, 160, 2);
        light.position.set(lamp.x, WORLD_BASE_Y + 7.6, lamp.z);
        this.root.add(light);
        this.#pointLights.push(light);
      }
    }
  }
}
