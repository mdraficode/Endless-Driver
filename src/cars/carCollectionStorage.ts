import type { PreferenceStorage } from '../config/game-preferences';
import { initialCollection, type CarCollectionState } from './carCollection';
import { CAR_ROSTER, DEFAULT_CAR_ID, STARTER_CAR_IDS } from './carRoster';

/**
 * Phase 14.2 — persist the car collection (owned + active car) so a career's earned cars and the
 * currently-driven car survive across sessions. Mirrors the game-preferences storage pattern: a
 * single JSON blob, defensively parsed (malformed/blocked storage falls back to the starters),
 * and validated against the roster on read so a hand-edited or stale save can't break the game.
 */

export const CAR_COLLECTION_STORAGE_KEY = 'endless-driver:car-collection:v1';

function resolveStorage(storage?: PreferenceStorage): PreferenceStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const KNOWN_IDS: ReadonlySet<string> = new Set(CAR_ROSTER.map((car) => car.id));

/**
 * Rebuild a valid collection from a raw saved object: keep only known car ids (deduped), always
 * retain the starter cars, and require the active car to be owned (else fall back to the hero).
 * Pure and total — never throws.
 */
export function hydrateCarCollection(raw: unknown): CarCollectionState {
  const base = initialCollection();
  if (!isRecord(raw)) {
    return base;
  }
  const owned = new Set<string>(base.ownedIds);
  if (Array.isArray(raw.ownedIds)) {
    for (const id of raw.ownedIds) {
      if (typeof id === 'string' && KNOWN_IDS.has(id)) {
        owned.add(id);
      }
    }
  }
  // The starter cars are never lost, even by a hand-edited save.
  for (const id of STARTER_CAR_IDS) {
    owned.add(id);
  }
  const ownedIds = [...base.ownedIds, ...[...owned].filter((id) => !base.ownedIds.includes(id))];
  const activeId =
    typeof raw.activeId === 'string' && ownedIds.includes(raw.activeId)
      ? raw.activeId
      : base.activeId;
  const champion = raw.champion === true;
  return {
    ownedIds,
    activeId: ownedIds.includes(activeId) ? activeId : DEFAULT_CAR_ID,
    champion,
  };
}

/** Read + validate the persisted collection; falls back to the starters on any problem. */
export function readCarCollection(storage?: PreferenceStorage): CarCollectionState {
  const target = resolveStorage(storage);
  if (target === null) {
    return initialCollection();
  }
  try {
    const raw = target.getItem(CAR_COLLECTION_STORAGE_KEY);
    if (raw === null) {
      return initialCollection();
    }
    return hydrateCarCollection(JSON.parse(raw));
  } catch {
    return initialCollection();
  }
}

/** Persist the collection. Returns false (no-op) when storage is unavailable/blocked. */
export function saveCarCollection(state: CarCollectionState, storage?: PreferenceStorage): boolean {
  const target = resolveStorage(storage);
  if (target === null) {
    return false;
  }
  try {
    target.setItem(CAR_COLLECTION_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
