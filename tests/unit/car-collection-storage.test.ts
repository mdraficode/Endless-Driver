import { describe, expect, it } from 'vitest';

import type { PreferenceStorage } from '../../src/config/game-preferences';
import {
  hydrateCarCollection,
  readCarCollection,
  saveCarCollection,
} from '../../src/cars/carCollectionStorage';
import { initialCollection, unlock } from '../../src/cars/carCollection';
import { DEFAULT_CAR_ID, STARTER_CAR_IDS } from '../../src/cars/carRoster';

function fakeStorage(): PreferenceStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('Phase 14.2 — car collection persistence', () => {
  it('returns the starter collection when nothing is saved', () => {
    const state = readCarCollection(fakeStorage());
    expect(state.activeId).toBe(DEFAULT_CAR_ID);
    for (const id of STARTER_CAR_IDS) {
      expect(state.ownedIds).toContain(id);
    }
  });

  it('saves and reads back the owned cars and the active car (roundtrip)', () => {
    const storage = fakeStorage();
    const state = initialCollection();
    const withCar = unlock(state, 'mw-car-15');
    expect(saveCarCollection(withCar, storage)).toBe(true);

    const loaded = readCarCollection(storage);
    expect(loaded.ownedIds).toContain('mw-car-15');
    expect(loaded.activeId).toBe(withCar.activeId);
  });

  it('hydrate drops unknown ids and duplicates but keeps real wins', () => {
    const state = hydrateCarCollection({
      ownedIds: ['mw-car-01', 'mw-car-01', 'garbage-id', 42, 'mw-car-09'],
      activeId: 'mw-car-01',
    });
    expect(state.ownedIds).toContain('mw-car-01');
    expect(state.ownedIds).toContain('mw-car-09');
    expect(state.ownedIds).not.toContain('garbage-id');
    // No duplicates.
    expect(new Set(state.ownedIds).size).toBe(state.ownedIds.length);
    expect(state.activeId).toBe('mw-car-01');
  });

  it('the active car must be owned, else it falls back to the hero', () => {
    const state = hydrateCarCollection({ ownedIds: ['mw-car-01'], activeId: 'mw-car-01' });
    expect(state.activeId).toBe('mw-car-01');
    const bad = hydrateCarCollection({ ownedIds: ['mw-car-01'], activeId: 'not-owned' });
    expect(bad.activeId).toBe(DEFAULT_CAR_ID);
  });

  it('starter cars are never lost, even by a hand-edited save', () => {
    const state = hydrateCarCollection({ ownedIds: ['mw-car-01'], activeId: 'mw-car-01' });
    for (const id of STARTER_CAR_IDS) {
      expect(state.ownedIds).toContain(id);
    }
  });

  it('malformed or non-object saves fall back to the starters', () => {
    expect(hydrateCarCollection(null).activeId).toBe(DEFAULT_CAR_ID);
    expect(hydrateCarCollection('nonsense').ownedIds).toEqual(STARTER_CAR_IDS);
    expect(hydrateCarCollection(42).activeId).toBe(DEFAULT_CAR_ID);
  });

  it('reads fall back safely when storage throws', () => {
    const throwing: PreferenceStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readCarCollection(throwing).activeId).toBe(DEFAULT_CAR_ID);
    expect(saveCarCollection(initialCollection(), throwing)).toBe(false);
  });
});
