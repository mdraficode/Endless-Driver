/**
 * Phase 2 simulation timing: the fixed-step contract from docs/ARCHITECTURE.md §4.
 *
 * Physics always advances in whole fixed steps regardless of display rate, and the catch-up
 * budget is bounded so a stalled tab cannot trigger an unbounded simulation spiral.
 */
export interface PhysicsConfig {
  /** Fixed simulation step in seconds (60 Hz). */
  readonly fixedTimestep: number;
  /** Maximum fixed steps executed for a single rendered frame. */
  readonly maxStepsPerFrame: number;
  /** Largest frame delta the accumulator will accept before discarding backlog. */
  readonly maxFrameDeltaSeconds: number;
  /** Rapier sleep behaviour; disabled so parked cars still respond to checks and resets. */
  readonly allowSleeping: boolean;
}

export const PHYSICS_CONFIG: PhysicsConfig = {
  fixedTimestep: 1 / 60,
  maxStepsPerFrame: 5,
  maxFrameDeltaSeconds: 0.25,
  allowSleeping: false,
};
