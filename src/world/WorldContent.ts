import type { Object3D } from 'three';
import type { RenderConfig } from '../config/render';
import type { WorldConfig } from '../config/world';
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
  /** Vegetation destruction events from the collision field (driving world). */
  applyVegetationHits?(events: readonly TreeHitEvent[]): void;
  /** Town collision (buildings/poles), evaluated beside the tree field. */
  collideTown?(car: TownCarProbe, deltaSeconds: number): readonly TownHit[];
  /** Gives content the collision field's per-plant truth for rebuilds. */
  setVegetationStateProvider?(
    provider: ((key: string) => TreeVisualState | undefined) | null,
  ): void;
  /**
   * Async surface/texture loading, resolved once at startup (the terrain's scanned sets).
   * Content renders acceptably before it resolves; failure keeps the fallback material.
   */
  loadSurfaces?(): Promise<void>;
  /** Flat numeric stats merged into scene diagnostics (chunk counts, triangles, budget). */
  getContentStats?(): Readonly<Record<string, number>>;
  /** Releases geometries, materials, and textures the content created. */
  dispose(): void;
}

export interface SceneContentContext {
  readonly config: RenderConfig;
  readonly worldConfig: WorldConfig;
  /**
   * The shared terrain sampler (Phase 4). One instance is created by `Application` and the
   * same function feeds the visual chunks and the physics heightfields; content that builds
   * terrain requires it, other content ignores it.
   */
  readonly terrainSampler?: TerrainSampler;
}

/** Builds a scene's content. Called once, by `SceneManager`, during construction. */
export type SceneContentFactory = (context: SceneContentContext) => SceneContent;
