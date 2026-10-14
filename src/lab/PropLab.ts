import {
  Color,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
} from 'three/webgpu';
import {
  PROPS_CONFIG,
  lineupBackdropDistance,
  lineupSlotOffset,
  studioCoverage,
  type ModelSize,
  type PropsConfig,
} from '../config/props';
import type { SceneContent, SceneContentContext } from '../world/WorldContent';
import {
  createLoadedModel,
  loadModelAsset,
  type LoadedModel,
  type ModelAsset,
} from '../assets/ModelAsset';
import { selectLodLevel, type LodLevel } from '../assets/LodSelection';

/**
 * The prop lab: one model, shown at every level of detail it shipped with, side by side.
 *
 * The point is to see the derivation pipeline's output rather than to describe it. A manifest can say
 * a level has 10 578 triangles; only the scene can say whether the silhouette survived, whether the
 * normal map still reads at that density, and whether the seams the deeper levels merged are visible
 * as a change in shading. Those are the judgements Phase 5 depends on, and they cannot be made from
 * numbers.
 *
 * The copies are spaced in multiples of the model's measured radius, so the layout inspects a small
 * prop and a large one without new numbers, and every copy stands on the same floor under the same
 * light as the driving world.
 */
export interface PropCopy {
  /** The level this copy permanently shows. */
  readonly level: LodLevel;
  readonly model: LoadedModel;
  /** Horizontal offset in the lineup, in world units. */
  readonly offset: number;
}

export type PropLabMode = 'lineup' | 'isolated' | 'auto';

export interface PropLab extends SceneContent {
  readonly kind: 'props';
  /** The model being inspected, once it has loaded. */
  readonly asset: ModelAsset | null;
  /** One copy per level of detail, closest first. Empty until the file arrives. */
  readonly copies: readonly PropCopy[];
  /** What the layout was built from, in metres. */
  readonly size: ModelSize;
  /**
   * Keeps the floor and the backdrop filling the frame for a camera looking at a subject.
   *
   * Called every frame, because both surfaces are sized from the frame rather than from a constant:
   * the camera orbits in automatic mode, is reframed on every level change, and is rebuilt on resize,
   * and a surface that is only right for one of those is worse than none — it advertises its edge.
   *
   * The subject is an argument rather than an assumption. The obvious default — the lineup's centre —
   * is right for two of the three modes and wrong for the third, where the camera moves alongside one
   * copy and looks at it: a wall placed behind the lineup is then nearly fifty degrees off the axis,
   * out of frame, and the shot is bright sky with a rock in front of it.
   */
  followCamera(camera: PerspectiveCamera, subject: { x: number; y: number; z: number }): void;
  readonly mode: PropLabMode;
  /** Shows one level on its own, or restores the lineup with `null`. */
  setIsolatedLevel(level: number | null): void;
  /** Hands level selection to the distance rule the streamed world will use. */
  setAuto(auto: boolean): void;
  /** Advances automatic selection for a camera distance. Returns the level now showing. */
  updateAuto(distance: number): LodLevel | null;
  /** The level currently showing in automatic mode. */
  readonly autoLevel: LodLevel | null;
  dispose(): void;
}

export interface PropLabOptions {
  readonly config?: PropsConfig;
  /** Manifest id to inspect; the first model in the manifest when omitted. */
  readonly assetId?: string;
  /** Renderer handed to the KTX2 loader for format detection; required for a real load. */
  readonly renderer?: object;
  /** Pre-loaded copies, so the scene can exist without touching the network. */
  readonly copies?: readonly PropCopy[];
  /** Owned by the lab, disposed with it. The copies share its resources. */
  readonly source?: { dispose(): void } | null;
}

/**
 * Builds the lab around copies that are already loaded.
 *
 * Separate from the loading so the scene can be constructed, and captured, before or without a
 * download: the floor, the backdrop, and the framing all follow from the model's measured radius, and
 * a scene that can only exist after a network round trip is a scene that cannot be tested.
 */
export function createPropLab(
  _context: SceneContentContext,
  options: PropLabOptions = {},
): PropLab {
  const config = options.config ?? PROPS_CONFIG;
  const root = new Group();
  root.name = 'prop-lab';

  const copies = [...(options.copies ?? [])];
  const radius = copies[0]?.model.radius ?? 1;
  const size: ModelSize = copies[0]?.model ?? { radius: 1, height: 2 };
  const asset = copies[0]?.model.asset ?? null;
  let mode: PropLabMode = 'lineup';
  let isolatedLevel: number | null = null;
  let autoLevel: LodLevel | null = null;

  const lineup = new Group();
  lineup.name = 'prop-lineup';
  root.add(lineup);

  for (const copy of copies) {
    // The model rests on the floor: lifting it by the bottom of its bounding *box* puts the lowest
    // point of the geometry at y = 0 regardless of where the file put its origin, which is the one
    // thing about a downloaded asset that cannot be assumed. The bounding sphere's radius is not a
    // substitute here — the sphere is as long as the model's diagonal, so a roughly cubic rock stood
    // up by it hangs about half its own height in the air, with its shadow on the floor beneath it.
    copy.model.object.position.set(copy.offset, -copy.model.bottom, 0);
    lineup.add(copy.model.object);
  }

  const floor = createFloor(config);
  const backdrop = createBackdrop(config);
  root.add(floor, backdrop);
  const backdropDistance = lineupBackdropDistance(copies.length, radius, config);

  /** Applies the current mode to the scene graph. One place, so the modes cannot disagree. */
  const apply = (): void => {
    for (const copy of copies) {
      switch (mode) {
        case 'lineup':
          copy.model.setLevel(copy.level.level);
          copy.model.object.visible = true;
          copy.model.object.position.x = copy.offset;
          break;
        case 'isolated':
          copy.model.object.visible = copy.level.level === isolatedLevel;
          copy.model.object.position.x = copy.offset;
          if (isolatedLevel !== null) {
            copy.model.setLevel(isolatedLevel);
          }
          break;
        case 'auto':
          // Automatic mode keeps one copy — the first — and switches *it* through the chain, which is
          // what the world will do with a single instance per prop. It also moves to the middle of
          // the lineup: a demonstration of one prop at the origin must not be filmed from a camera
          // aimed at a prop that is four metres to the left, or the subject of the shot is the empty
          // floor where the other two copies used to be.
          copy.model.object.visible = copy === copies[0];
          if (copy === copies[0]) {
            copy.model.object.position.x = 0;
          }
          break;
      }
    }
  };
  apply();

  return {
    root,
    kind: 'props',
    asset,
    copies,
    size,
    followCamera(camera: PerspectiveCamera, subject: { x: number; y: number; z: number }): void {
      const coverage = studioCoverage({
        camera: [camera.position.x, camera.position.y, camera.position.z],
        target: [subject.x, subject.y, subject.z],
        backdropDistance,
        fovDegrees: camera.fov,
        aspect: camera.aspect,
        margin: config.surfaceMargin,
      });
      // The floor is centred on the camera, not on the model: what has to be impossible is seeing
      // past it, and the camera is the only place the view past it can come from.
      floor.scale.set(coverage.floorRadius * 2, coverage.floorRadius * 2, 1);
      floor.position.set(camera.position.x, 0, camera.position.z);
      backdrop.scale.set(coverage.width, coverage.height, 1);
      backdrop.position.set(...coverage.centre);
      backdrop.rotation.set(0, coverage.yaw, 0);
    },
    get mode() {
      return mode;
    },
    get autoLevel() {
      return autoLevel;
    },
    setIsolatedLevel(level: number | null): void {
      if (level === null) {
        mode = 'lineup';
        isolatedLevel = null;
      } else {
        mode = 'isolated';
        isolatedLevel = level;
        autoLevel = null;
      }
      apply();
    },
    setAuto(auto: boolean): void {
      mode = auto ? 'auto' : 'lineup';
      isolatedLevel = null;
      autoLevel = auto ? (copies[0]?.level ?? null) : null;
      apply();
    },
    updateAuto(distance: number): LodLevel | null {
      const target = copies[0];
      if (target === undefined) {
        return null;
      }
      const chosen = selectLodLevel(
        copies.map((copy) => copy.level),
        distance,
        target.model.radius,
      );
      if (chosen !== null) {
        autoLevel = chosen;
        target.model.setLevel(chosen.level);
      }
      return autoLevel;
    },
    dispose(): void {
      // The copies are views over one loaded file: it owns the geometries and textures, so it is the
      // thing that gets disposed, once — not each view of it.
      options.source?.dispose();
      floor.geometry.dispose();
      (floor.material as MeshPhysicalNodeMaterial).dispose();
      backdrop.geometry.dispose();
      (backdrop.material as MeshBasicNodeMaterial).dispose();
      root.removeFromParent();
    },
  };
}

/**
 * Loads a model and builds a lab with one copy per level of detail.
 *
 * One copy per level rather than one instance switching between levels: the switch is what the world
 * will do, and it is exactly the thing that is invisible when it works. Showing every level at once
 * turns "did the derivation degrade gracefully?" into a question one screenshot can answer.
 */
export async function createLoadedPropLab(
  context: SceneContentContext,
  options: PropLabOptions & { readonly renderer: object },
): Promise<PropLab> {
  const loaded = await loadModelAsset({
    renderer: options.renderer,
    ...(options.assetId === undefined ? {} : { assetId: options.assetId }),
  });
  if (loaded === null) {
    return createPropLab(context, options);
  }

  // Each copy is a clone that shares the loaded geometries, materials, and textures: the levels of
  // detail inside one file already share a texture set, and the copies share the file. Nothing is
  // duplicated on the GPU except the node transforms.
  //
  // The clone gets its *own* wrapper built around it, rather than reusing the original's. A wrapper
  // resolves its level nodes by name at construction, so a wrapper built for the original holds the
  // original's nodes — and setting a level on it would toggle visibility on objects that are not the
  // ones on screen, which looks exactly like a level of detail that does not work.
  const copies: PropCopy[] = loaded.asset.levels.map((level, index) => {
    const model = createLoadedModel(loaded.asset, loaded.object.clone(true));
    model.setLevel(level.level);
    return {
      level,
      model,
      offset: lineupSlotOffset(index, loaded.asset.levels.length, loaded.radius),
    };
  });

  return createPropLab(context, { ...options, copies, source: loaded });
}

/**
 * Mid-grey matte floor: the same exposure and shadow reference the material grid is judged against.
 *
 * A unit plane, scaled to the frame every frame by `followCamera`. Modelling it at the scene's scale
 * instead would mean rebuilding the geometry whenever the camera moves, and the camera moves a lot.
 */
function createFloor(config: PropsConfig): Mesh {
  const material = new MeshPhysicalNodeMaterial({
    name: 'props-floor',
    color: new Color(config.floorColor),
    roughness: config.floorRoughness,
    metalness: 0,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.name = 'props-floor';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Unlit dark wall behind the lineup, as in the studio: a contrast reference, not a surface under test.
 *
 * It stands just behind the copies rather than at the floor's far edge, because what it is for is
 * separating the model's silhouette from the sky. Half a metre of extra gap is enough, and a wall
 * twenty metres away is no longer a backdrop — it is scenery, and scenery competes for attention with
 * the thing being inspected.
 */
function createBackdrop(config: PropsConfig): Mesh {
  const material = new MeshBasicNodeMaterial({
    name: 'props-backdrop',
    color: new Color(config.backdropColor),
    // Tone mapping and the time-of-day grade are applied to everything the camera sees, which is
    // right for the world and wrong for a reference surface: at night the grade brightens the
    // backdrop and the wall stops being the fixed contrast it is chosen to be. Opting out keeps it
    // the colour it was authored as, whatever hour the clock is at.
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.name = 'props-backdrop';
  // Placed and scaled by `followCamera`, which knows where the camera is; a plane at the origin with
  // the identity scale covers nothing, and one frame is all it takes for that to be set.
  return mesh;
}
