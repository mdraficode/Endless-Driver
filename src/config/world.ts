/**
 * Phase 2 world configuration: the static test arena and its collision geometry.
 *
 * Ground and obstacle definitions live here for both the renderer and the physics world so
 * visuals and colliders can never drift apart. Obstacles are deliberately placed clear of the
 * spawn lane so the car has a straight run to accelerate in; they exist to give the physics layer
 * something solid to hit and to cast shadows while the world is still a placeholder. Phase 4
 * replaces this arena with streamed procedural terrain, at which point this file is superseded
 * rather than extended.
 */
export interface GroundConfig {
  /** Visual plane size in meters (square). */
  readonly size: number;
  /** Collider thickness in meters; the top face sits at y = 0. */
  readonly thickness: number;
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly grid: GridConfig;
}

export interface GridConfig {
  readonly enabled: boolean;
  /** Distance between grid lines in meters. Must divide the ground size evenly. */
  readonly spacing: number;
  /** Line thickness as a multiple of one screen-space pixel of coverage. */
  readonly lineWidth: number;
  readonly lineColor: number;
  readonly centerLineColor: number;
  /** Distance in meters at which the grid fades out, preventing distant moire. */
  readonly fadeDistance: number;
  /** Peak blend strength of the grid lines over the ground albedo. */
  readonly strength: number;
}

export interface ObstacleConfig {
  readonly id: string;
  /** Center of the box in world meters. */
  readonly position: readonly [number, number, number];
  /** Full box dimensions in meters (x, y, z). */
  readonly size: readonly [number, number, number];
  readonly color: number;
  readonly castShadow: boolean;
}

export interface WorldConfig {
  readonly ground: GroundConfig;
  readonly obstacles: readonly ObstacleConfig[];
  /** Collision groups are not used yet; kept explicit so streaming can add layers later. */
  readonly friction: number;
  readonly restitution: number;
}

export const WORLD_CONFIG: WorldConfig = {
  ground: {
    size: 800,
    thickness: 2,
    color: 0x8d97a3,
    roughness: 0.95,
    metalness: 0,
    grid: {
      enabled: true,
      spacing: 5,
      lineWidth: 1.25,
      lineColor: 0x5b6672,
      centerLineColor: 0x77828f,
      fadeDistance: 240,
      strength: 0.6,
    },
  },
  // Phase 1/2 shipped two pale reference blocks on the spawn plateau as physics
  // targets. Phase 4's terrain, vegetation and town are the world now, and the
  // blocks read as litter in it (owner report, 2026-10-17: white boxes on the
  // meadow). The list stays as the seam fixtures and tests place blocks through;
  // the shipped game starts empty.
  obstacles: [],
  friction: 0.9,
  restitution: 0.05,
};
