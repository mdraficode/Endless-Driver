import type { TerrainConfig } from '../config/terrain';
import {
  planChunksAround,
  predictPrefetchFocus,
  resolveWindowCenter,
  type ChunkCoord,
  type PlannedChunk,
} from './terrain-chunks';

export interface VegetationWindowPlan {
  readonly center: ChunkCoord;
  readonly chunks: PlannedChunk[];
}

/**
 * Deterministic foliage window with the same bounded velocity lead as terrain. It deliberately
 * retains the true focus as the planner's distance reference and only biases the hysteretic window
 * centre, leaving the player surrounded while adding a prepared buffer along the direction of travel.
 */
export function planVegetationWindow(
  terrain: TerrainConfig,
  radiusChunks: number,
  currentCenter: ChunkCoord | null,
  focus: { readonly x: number; readonly z: number },
  velocity: { readonly x: number; readonly z: number },
): VegetationWindowPlan {
  const predicted = predictPrefetchFocus(terrain, focus, velocity);
  const center = resolveWindowCenter(currentCenter, terrain, predicted.x, predicted.z);
  const chunks = planChunksAround(terrain, center.cx, center.cz, focus.x, focus.z).filter(
    (chunk) => chunk.ring <= radiusChunks,
  );
  return { center, chunks };
}
