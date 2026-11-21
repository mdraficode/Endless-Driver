import { DEFAULT_CAR_ID, STARTER_CAR_IDS, carById } from './carRoster';
import type { CarSpec } from './types';

/**
 * The player's car collection: which cars are owned and which one is currently being driven.
 * Pure state + transitions so the ownership logic (starters, Blacklist wins, active car) is
 * Node-testable and the UI is a plain render of it.
 */

export interface CarCollectionState {
  /** Ids of every owned car, in acquisition order. */
  readonly ownedIds: readonly string[];
  /** The car currently being driven (always one of `ownedIds`). */
  readonly activeId: string;
}

/** A fresh career: the starter cars owned, the hero car selected. */
export function initialCollection(): CarCollectionState {
  return { ownedIds: [...STARTER_CAR_IDS], activeId: DEFAULT_CAR_ID };
}

/** Whether the collection owns a car. */
export function owns(state: CarCollectionState, id: string): boolean {
  return state.ownedIds.includes(id);
}

/**
 * Add a car to the collection (a Blacklist win). Idempotent and ignores unknown ids, so a
 * double-resolved race or a stale id can't corrupt the state.
 */
export function unlock(state: CarCollectionState, id: string): CarCollectionState {
  if (carById(id) === null || state.ownedIds.includes(id)) {
    return state;
  }
  return { ...state, ownedIds: [...state.ownedIds, id] };
}

/**
 * Select the active car. Only an owned car can be selected; selecting the already-active car
 * is a no-op (same object returned, so callers can rely on reference identity for change-detection).
 */
export function select(state: CarCollectionState, id: string): CarCollectionState {
  if (!state.ownedIds.includes(id) || id === state.activeId) {
    return state;
  }
  return { ...state, activeId: id };
}

/** The spec of the currently-driven car, or null if the active id is somehow unknown. */
export function activeSpec(state: CarCollectionState): CarSpec | null {
  return carById(state.activeId);
}

/** The number of distinct cars in the collection (owned). */
export function ownedCount(state: CarCollectionState): number {
  return state.ownedIds.length;
}
