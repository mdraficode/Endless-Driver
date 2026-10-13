/**
 * Lazy singleton access to the Rapier WASM module.
 *
 * `@dimforge/rapier3d-compat` embeds its WASM as base64 and requires an async `init()` before
 * any other API call. Every consumer awaits `loadRapier()` once; nothing else in the codebase
 * imports Rapier directly at module scope, which keeps physics out of the startup path until
 * it is actually needed and keeps the module boundary in `src/physics` intact.
 */
import type * as RAPIER_MODULE from '@dimforge/rapier3d-compat';

export type RapierModule = typeof RAPIER_MODULE;
export type RapierWorld = RAPIER_MODULE.World;
export type RapierRigidBody = RAPIER_MODULE.RigidBody;
export type RapierCollider = RAPIER_MODULE.Collider;
export type RapierRigidBodyDesc = RAPIER_MODULE.RigidBodyDesc;
export type RapierColliderDesc = RAPIER_MODULE.ColliderDesc;
export type RapierRay = RAPIER_MODULE.Ray;

let rapierPromise: Promise<RapierModule> | null = null;

/**
 * Loads and initializes Rapier once. Concurrent callers share the same promise, so startup,
 * tests, and tooling can all await this safely.
 */
export function loadRapier(): Promise<RapierModule> {
  if (!rapierPromise) {
    rapierPromise = import('@dimforge/rapier3d-compat').then(async (module) => {
      await module.init();
      return module;
    });
  }
  return rapierPromise;
}

/** Test hook: drops the cached module so a fresh initialization can be observed. */
export function resetRapierForTesting(): void {
  rapierPromise = null;
}
