import { describe, expect, it } from 'vitest';
import {
  EMPTY_NATIVE_RECENTS_STORE,
  MAX_NATIVE_RECENTS,
  NativeRecentEntry,
  migrateNativeRecentsStore,
  recordNativeRecent,
  removeNativeRecent,
} from "./native-recent.model.js";

function entry(path: string): NativeRecentEntry {
  return { path, name: path.split('/').pop()!, extension: '.txt', openedAt: new Date().toISOString() };
}

describe('migrateNativeRecentsStore', () => {
  it('returns the empty store for null/non-object/mismatched-schema/malformed input', () => {
    expect(migrateNativeRecentsStore(null)).toEqual(EMPTY_NATIVE_RECENTS_STORE);
    expect(migrateNativeRecentsStore('garbage')).toEqual(EMPTY_NATIVE_RECENTS_STORE);
    expect(migrateNativeRecentsStore({ schemaVersion: 2, entries: [] })).toEqual(EMPTY_NATIVE_RECENTS_STORE);
    expect(migrateNativeRecentsStore({ schemaVersion: 1, entries: 'nope' })).toEqual(EMPTY_NATIVE_RECENTS_STORE);
  });

  it('passes through a well-formed store unchanged', () => {
    const valid = { schemaVersion: 1 as const, entries: [entry('C:/a.txt')] };
    expect(migrateNativeRecentsStore(valid)).toEqual(valid);
  });
});

describe('recordNativeRecent', () => {
  it('adds an entry to the front', () => {
    const store = recordNativeRecent(EMPTY_NATIVE_RECENTS_STORE, entry('C:/a.txt'));
    expect(store.entries.map((e) => e.path)).toEqual(['C:/a.txt']);
  });

  it('re-opening the same path dedupes, moving it back to the front rather than duplicating', () => {
    let store = recordNativeRecent(EMPTY_NATIVE_RECENTS_STORE, entry('C:/a.txt'));
    store = recordNativeRecent(store, entry('C:/b.txt'));
    store = recordNativeRecent(store, entry('C:/a.txt'));

    expect(store.entries.map((e) => e.path)).toEqual(['C:/a.txt', 'C:/b.txt']);
  });

  it('caps at MAX_NATIVE_RECENTS', () => {
    let store = EMPTY_NATIVE_RECENTS_STORE;
    for (let i = 0; i < MAX_NATIVE_RECENTS + 5; i++) store = recordNativeRecent(store, entry(`C:/${i}.txt`));

    expect(store.entries.length).toBe(MAX_NATIVE_RECENTS);
    expect(store.entries[0].path).toBe(`C:/${MAX_NATIVE_RECENTS + 4}.txt`);
  });
});

describe('removeNativeRecent', () => {
  it('removes only the matching path', () => {
    let store = recordNativeRecent(EMPTY_NATIVE_RECENTS_STORE, entry('C:/a.txt'));
    store = recordNativeRecent(store, entry('C:/b.txt'));

    store = removeNativeRecent(store, 'C:/a.txt');

    expect(store.entries.map((e) => e.path)).toEqual(['C:/b.txt']);
  });
});
