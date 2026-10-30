import type { Object3D } from 'three';
import type { AssetResolution } from '../assets/AssetManifest';
import type { RenderConfig } from '../config/render';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { SurfaceState } from '../environment/SurfaceState';
import type { WorldConfig } from '../config/world';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TerrainSampler } from './terrain-height';
import type { TreeHitEvent, TreeVisualState } from './tree-collision';
import type { TownCarProbe, TownHit } from './town';

/**
 * The scene's *content* — everything that is not environment.
 *
 * `SceneManager` owns the environment: sky, sun, ambient fill, cascaded shadows, the HDRI, and
 * the camera. What is *in* that environment is pluggable, because the project needs more than one
 * answer to that question:
 *
 * - the driving world (ground plane, obstacle blocks) is the game;
 * - the studio look-dev scene (`src/lab/`) is a material grid with no driveable ground at all.
 *
 * Both want identical lighting, shadows, and post-processing, so the seam is drawn here rather than
 * by giving each mode its own copy of the environment. Phase 4 replaces the driving world's content
 * with streamed terrain behind this same interface.
 */
export interface SceneContent {
  /** Root of the content's object tree; `SceneManager` adds it to the scene. */
  readonly root: Object3D;
  /** Label for diagnostics: what kind of content this is. */
  readonly kind: string;
  /** Requests the localized wet-road reflection pass for scenes that contain a wet-road mask output. */
  readonly wetRoadSurface?: boolean;
  /** Resolved clock/sun state for content-owned effects such as leaf backlighting. */
  setDaylight?(state: DaylightState): void;
  /** Optional content-owned simulation/update hook, driven with the engine's clamped frame delta. */
  update?(deltaSeconds: number): void;
  /**
   * Per-frame streaming hook (Phase 4 terrain): the focus is the vehicle position. Content
   * without streaming ignores it. Called with a scratch-free fresh object each frame by
   * `SceneManager.streamContent`, which `Application` drives beside the sun focus — the
   * ground under the car and the light that falls on it follow the same point.
   */
  updateStreaming?(
    focus: { x: number; y: number; z: number },
    velocity?: { x: number; z: number },
    deltaSeconds?: number,
  ): void;
  /**
   * Optional startup preparation. Streamed content may await its initial visible window here;
   * `Application` resolves it before starting the frame loop, so the player never sees the first
   * terrain/foliage window materialise in front of the camera. `onProgress` reports the completed
   * fraction of that preparation so long-running windows can keep the startup bar moving.
   */
  prepareInitial?(
    focus: { x: number; y: number; z: number },
    velocity?: { x: number; z: number },
    onProgress?: (fraction: number) => void,
  ): Promise<void>;
  /** Vegetation destruction events from the collision field (driving world). */
  applyVegetationHits?(events: readonly TreeHitEvent[]): void;
  /** Town collision (buildings/poles), evaluated beside the tree field. */
  collideTown?(car: TownCarProbe, deltaSeconds: number): readonly TownHit[];
  /** Gives content the collision field's per-plant truth for rebuilds. */
  setVegetationStateProvider?(
    provider: ((key: string) => TreeVisualState | undefined) | null,
  ): void;
  /**
   * Async surface/texture loading. Content renders acceptably with authored fallback materials;
   * the application starts these optional downloads after the loading overlay has cleared. The
   * pixel budget (tier C reads the 512-px sets) selects which files the loader fetches.
   */
  loadSurfaces?(resolution?: AssetResolution): Promise<void>;
  /**
   * Optional model/visual upgrades that must not block the first playable frame. The pixel budget
   * picks the model files a tier-C load should read (512-px derivations where they exist).
   */
  loadDeferredAssets?(resolution?: AssetResolution): Promise<void>;
  /**
   * Terrain height (metres) at a world XZ. The startup settle uses it to place its off-screen
   * warm-up views above the ground; content without a height authority (rural fixtures) omits
   * it and the settle falls back to the spawn altitude.
   */
  sampleHeight?(x: number, z: number): number;
  /** Flat numeric stats merged into scene diagnostics (chunk counts, triangles, budget). */
  getContentStats?(): Readonly<Record<string, number>>;
  /** Releases geometries, materials, and textures the content created. */
  dispose(): void;
}

export interface SceneContentContext {
  readonly config: RenderConfig;
  readonly worldConfig: WorldConfig;
  /** Shared Rapier world for content-owned dynamic actors, such as city traffic. */
  readonly physics?: PhysicsWorld;
  /**
   * The shared terrain sampler (Phase 4). One instance is created by `Application` and the
   * same function feeds the visual chunks and the physics heightfields; content that builds
   * terrain requires it, other content ignores it.
   */
  readonly terrainSampler?: TerrainSampler;
  /**
   * The live renderer, for content that loads compressed texture formats at runtime (the scanned
   * vegetation of Phase 5). Optional because unit fixtures and the lab scenes construct content
   * without an engine, and adoption is opportunistic: absent a renderer, the authored species
   * simply stay.
   */
  readonly renderer?: object;
  /**
   * Resolved quality tier id ('A' | 'B' | 'C'), so streamed content can scale its
   * own detail budget with the device (the jungle canopy is the worst case:
   * full density at tier C melted software rasterisers, 2026-10-18).
   */
  readonly qualityTier?: string;
  /** Current shared surface condition, forwarded to visuals without deriving physics from pixels. */
  readonly surfaceState?: SurfaceState;
  /** Player-selected Aohara traffic amount; the activity system preserves tier-specific safety caps. */
  readonly trafficIntensity?: import('../config/game-preferences').TrafficIntensity;
}

/** Builds a scene's content. Called once, by `SceneManager`, during construction. */
export type SceneContentFactory = (context: SceneContentContext) => SceneContent;
