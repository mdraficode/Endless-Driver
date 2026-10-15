import type { OriginConfig } from '../config/origin';

/**
 * The floating origin (PROJECT_PLAN §5): one bookkeeper for the slide between the
 * eternal world space and the bounded local space physics and rendering live in.
 *
 * World space is where the deterministic sampler, chunk keys, saved bookmarks and
 * diagnostics positions live — it never changes, so the world is the same world
 * forever. Local space is `world - offset`; the car body, colliders, camera and
 * every rendered vertex live there, and the offset only ever moves by whole grid
 * steps, so the slide itself is exact in float32 (multiples of 128 m) and the two
 * spaces never drift apart. Because the shift lands the car within half a grid
 * step of the new origin, a rebase can never immediately re-trigger.
 *
 * This class decides *when* and *by how much*; performing the slide (moving the
 * body, colliders, and content root) is the application's job, once, in one frame.
 */
export class OriginManager {
  readonly #config: OriginConfig;
  #offsetX = 0;
  #offsetZ = 0;
  #rebases = 0;

  constructor(config: OriginConfig) {
    this.#config = config;
  }

  /** Current slide: local = world - offset. Always whole grid steps. */
  get offset(): { readonly x: number; readonly z: number } {
    return { x: this.#offsetX, z: this.#offsetZ };
  }

  /** How many rebases have happened (diagnostics: the slide must be invisible). */
  get rebases(): number {
    return this.#rebases;
  }

  worldFromLocalX(x: number): number {
    return x + this.#offsetX;
  }

  worldFromLocalZ(z: number): number {
    return z + this.#offsetZ;
  }

  localFromWorldX(x: number): number {
    return x - this.#offsetX;
  }

  localFromWorldZ(z: number): number {
    return z - this.#offsetZ;
  }

  /**
   * Considers a rebase for a car sitting at local (x, z). Returns the shift that was
   * applied to the offset, or `null` when the car is still comfortably inside the
   * bounded zone. The shift is the car's position rounded to the grid, so after the
   * slide the car sits within half a grid step of the origin on each axis.
   */
  update(localX: number, localZ: number): { readonly dx: number; readonly dz: number } | null {
    const threshold = this.#config.rebaseDistanceMeters;
    if (Math.abs(localX) <= threshold && Math.abs(localZ) <= threshold) {
      return null;
    }
    const grid = this.#config.gridMeters;
    const dx = Math.round(localX / grid) * grid;
    const dz = Math.round(localZ / grid) * grid;
    if (dx === 0 && dz === 0) {
      return null;
    }
    this.#offsetX += dx;
    this.#offsetZ += dz;
    this.#rebases += 1;
    return { dx, dz };
  }
}
