import type { Object3D } from 'three';
import type { RenderConfig } from '../config/render';
import type { WorldConfig } from '../config/world';

/**
 * The scene's *content* — everything that is not environment.
 *
 * `SceneManager` owns the environment: sky, sun, ambient fill, fog, cascaded shadows, the HDRI, and
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
  /** Releases geometries, materials, and textures the content created. */
  dispose(): void;
}

export interface SceneContentContext {
  readonly config: RenderConfig;
  readonly worldConfig: WorldConfig;
}

/** Builds a scene's content. Called once, by `SceneManager`, during construction. */
export type SceneContentFactory = (context: SceneContentContext) => SceneContent;
