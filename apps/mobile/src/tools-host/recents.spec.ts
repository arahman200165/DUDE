import { describe, expect, it } from 'vitest';
import { MAX_RECENTS, RECENTS_KEY, RecentsStore, pushRecent, sanitizeRecents, type LocalStatePort } from './recents';

function memoryPort(initial?: unknown) {
  const data = new Map<string, unknown>(initial === undefined ? [] : [[RECENTS_KEY, initial]]);
  const port: LocalStatePort = { get: async key => data.get(key), set: async (key, value) => { data.set(key, value); } };
  return { port, data };
}

describe('recents', () => {
  it('orders most recent first, dedupes and caps at eight', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    let list: readonly string[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, 't' + i);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]).toBe('t11');
    expect(list.at(-1)).toBe('t4');
  });
  it('sanitizes persisted data', () => {
    expect(sanitizeRecents('nope')).toEqual([]);
    expect(sanitizeRecents(['a', 1, '', 'a', 'b', null])).toEqual(['a', 'b']);
    expect(sanitizeRecents(Array.from({ length: 20 }, (_, i) => 't' + i))).toHaveLength(MAX_RECENTS);
  });
  it('loads, records and persists through the local port', async () => {
    const { port, data } = memoryPort(['a', 'b']);
    const store = new RecentsStore();
    await store.bind(port);
    expect(store.list()).toEqual(['a', 'b']);
    store.record('b');
    store.record('c');
    await store.flush();
    expect(store.list()).toEqual(['c', 'b', 'a']);
    expect(data.get(RECENTS_KEY)).toEqual(['c', 'b', 'a']);
  });
  it('keeps entries recorded before the load finished and persists the merged order', async () => {
    const { port, data } = memoryPort(['old1', 'old2']);
    const store = new RecentsStore();
    const loading = store.bind(port);
    store.record('new');
    await loading;
    await store.flush();
    expect(store.list()).toEqual(['new', 'old1', 'old2']);
    expect(data.get(RECENTS_KEY)).toEqual(['new', 'old1', 'old2']);
  });
  it('works in memory without a port and survives failing storage', async () => {
    const store = new RecentsStore();
    store.record('a');
    expect(store.list()).toEqual(['a']);
    await store.bind({ get: async () => { throw new Error('locked'); }, set: async () => { throw new Error('read-only'); } });
    store.record('b');
    await store.flush();
    expect(store.list()).toEqual(['b', 'a']);
  });
  it('notifies subscribers only when the list changes', () => {
    const store = new RecentsStore();
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.record('a');
    store.record('a');
    expect(calls).toBe(1);
  });
});
