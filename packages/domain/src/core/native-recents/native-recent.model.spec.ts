import { describe, expect, it } from 'vitest';
import {
  EMPTY_NATIVE_RECENTS_STORE,
  MAX_NATIVE_RECENTS,
  NativeRecentEntry,
  recordNativeRecent,
  removeNativeRecent,
} from "./native-recent.model.js";

function entry(path: string): NativeRecentEntry {
  return { path, name: path.split('/').pop()!, extension: '.txt', openedAt: new Date().toISOString() };
}

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
