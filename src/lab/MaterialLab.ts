import {
  Color,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  PlaneGeometry,
  SphereGeometry,
  type Material,
} from 'three/webgpu';
import { float, texture, vec2 } from 'three/tsl';
import {
  STUDIO_CONFIG,
  SURFACE_MATERIALS,
  gridCentre,
  gridSlotPosition,
  type StudioConfig,
  type SurfaceMaterialConfig,
} from '../config/studio';
import type { SceneContent, SceneContentContext } from '../world/WorldContent';
import { loadMaterialTextureSet, type MaterialTextureSet } from '../assets/AssetManifest';

/**
 * The material lab: a grid of spheres, each one a surface the world will need, standing on a neutral
 * floor against a plain wall.
 *
 * This is the scene materials are approved in (`docs/VISUAL_TARGET.md` §4). It is deliberately
 * austere — a mid-grey floor, a matte wall, no props — because every object that is not the material
 * under test is a confound. The lighting is the *world's* lighting: the same sun, the same sky, the
 * same HDRI, and the same post chain as the driving scene, driven by the same clock. A material that
 * only looks right in a bespoke studio rig has not been tested.
 *
 * A sphere is the right test object for a reason: it shows every surface normal at once, so a
 * roughness or metalness mistake cannot hide behind a flat face, and the size and tightness of its
 * specular highlight is a direct readout of both.
 */
export interface MaterialLab extends SceneContent {
  readonly kind: 'studio';
  /** Material ids in grid order; the studio panel and the tests both read this. */
  readonly materialIds: readonly string[];
  /** Centre of the grid, in world units — where the camera looks and the shadows focus. */
  readonly centre: { readonly x: number; readonly y: number; readonly z: number };
  /** Resolves the scanned texture set for the material that needs it, or leaves it flat. */
  loadScannedSurface(assetId: string): Promise<MaterialTextureSet | null>;
  /** Whether the scanned surface is currently applied. */
  readonly hasScannedSurface: boolean;
  dispose(): void;
}

export interface MaterialLabOptions {
  readonly config?: StudioConfig;
  readonly materials?: readonly SurfaceMaterialConfig[];
}

export function createMaterialLab(
  _context: SceneContentContext,
  options: MaterialLabOptions = {},
): MaterialLab {
  const config = options.config ?? STUDIO_CONFIG;
  const definitions = options.materials ?? SURFACE_MATERIALS;
  const root = new Group();
  root.name = 'material-lab';

  const geometry = new SphereGeometry(config.sphereRadius, config.segments, config.segments / 2);
  const shaders = new Map<string, MeshPhysicalNodeMaterial>();
  const spheres: Mesh[] = [];

  for (const [index, definition] of definitions.entries()) {
    const material = createSurfaceMaterial(definition);
    shaders.set(definition.id, material);
    const position = gridSlotPosition(index, config);
    const mesh = new Mesh(geometry, material);
    mesh.name = `material-${definition.id}`;
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    spheres.push(mesh);
  }

  const floor = createFloor(config);
  const centre = gridCentre(definitions.length, config);
  const backdrop = createBackdrop(config, centre);
  root.add(...spheres, floor, backdrop);

  let textures: MaterialTextureSet | null = null;

  return {
    root,
    kind: 'studio',
    materialIds: definitions.map((definition) => definition.id),
    centre,
    get hasScannedSurface(): boolean {
      return textures !== null;
    },

    /**
     * Applies the archived PBR set to the material that asked for it.
     *
     * The point of this one material is that it is *measured* rather than authored: albedo, normals,
     * and packed occlusion/roughness/metalness come from a scan of real cedar, fetched by a pinned
     * script and checked against the manifest's hashes. It is the reference the flat materials are
     * judged against — if they look right standing next to it, they are close enough to author the
     * world with, and if they do not, the difference is visible in one screenshot.
     */
    async loadScannedSurface(assetId: string): Promise<MaterialTextureSet | null> {
      const set = await loadMaterialTextureSet(assetId);
      if (set === null) {
        return null;
      }
      const target = shaders.get('cedar');
      if (target === undefined) {
        set.dispose();
        return null;
      }

      // The planks are ~2 m of scanned surface; tiling them twice keeps the grain reading at the
      // scale a sphere this size is looked at from.
      const uvScale = float(2);
      const uv = vec2(uvScale);
      target.colorNode = texture(set.diffuse, uv).rgb;
      target.normalNode = texture(set.normal, uv).rgb;
      if (set.arm !== null) {
        // Packed ORM: occlusion in red, roughness in green, metalness in blue. Reading the channels
        // separately is what keeps three maps in one texture, and it is how the terrain and props
        // will be authored in Phase 5.
        const arm = texture(set.arm, uv);
        target.aoNode = arm.r;
        target.roughnessNode = arm.g;
        target.metalnessNode = arm.b;
      }
      textures?.dispose();
      textures = set;
      return set;
    },

    dispose(): void {
      geometry.dispose();
      for (const material of shaders.values()) {
        material.dispose();
      }
      floor.geometry.dispose();
      (floor.material as Material).dispose();
      backdrop.geometry.dispose();
      (backdrop.material as Material).dispose();
      textures?.dispose();
      textures = null;
      root.removeFromParent();
    },
  };
}

/**
 * One physical material per definition.
 *
 * `MeshPhysicalNodeMaterial` for all of them, not `MeshStandardNodeMaterial` for the simple ones: it
 * is the same shader with the extra lobes compiled out when unused, so a single type means the
 * clearcoat, transmissive, and plain paths are all exercised by the grid rather than only by the
 * exotic entries.
 */
function createSurfaceMaterial(definition: SurfaceMaterialConfig): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial({
    name: definition.id,
    color: new Color(definition.color),
    metalness: definition.metalness,
    roughness: definition.roughness,
  });
  if (definition.clearcoat !== undefined) {
    material.clearcoat = definition.clearcoat;
  }
  if (definition.clearcoatRoughness !== undefined) {
    material.clearcoatRoughness = definition.clearcoatRoughness;
  }
  if (definition.transmission !== undefined) {
    material.transmission = definition.transmission;
    // A transmissive surface needs some thickness to refract like a solid rather than a soap bubble.
    material.thickness = 1.5;
  }
  if (definition.ior !== undefined) {
    material.ior = definition.ior;
  }
  return material;
}

/** Mid-grey matte floor: the exposure and shadow reference everything on the grid is judged against. */
function createFloor(config: StudioConfig): Mesh {
  const material = new MeshPhysicalNodeMaterial({
    name: 'studio-floor',
    color: new Color(config.floorColor),
    roughness: config.floorRoughness,
    metalness: 0,
  });
  const mesh = new Mesh(new PlaneGeometry(config.floorSize, config.floorSize), material);
  mesh.name = 'studio-floor';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The wall behind the grid.
 *
 * Unlit and dark, on purpose: it is a *contrast reference*, not a surface under test. Lit geometry
 * here would compete with the spheres for attention and, worse, bounce its own colour into the light
 * the materials are being judged in.
 */
function createBackdrop(
  config: StudioConfig,
  centre: { readonly x: number; readonly y: number; readonly z: number },
): Mesh {
  const material = new MeshBasicNodeMaterial({
    name: 'studio-backdrop',
    color: new Color(config.backdropColor),
  });
  const mesh = new Mesh(new PlaneGeometry(config.floorSize, config.backdropHeight), material);
  mesh.name = 'studio-backdrop';
  // Behind the grid, facing the camera, which stands on +Z looking back at the grid.
  mesh.position.set(centre.x, config.backdropHeight / 2, centre.z - config.backdropDistance);
  return mesh;
}
