import { afterEach, describe, expect, it, vi } from 'vitest';
import { wipeHubWebOrigin, type WipeIdb } from './origin-wipe.js';

describe('wipeHubWebOrigin', () => {
  afterEach(() => vi.unstubAllGlobals());

  const makeIdb = (listed: string[] | null): WipeIdb & { deleted: string[] } => {
    const deleted: string[] = [];
    return {
      deleted,
      databases: listed === null ? undefined : async () => listed.map((name) => ({ name })),
      deleteDatabase: async (name) => { deleted.push(name); },
    };
  };

  it('clears local and session storage and deletes the known and the listed databases once each', async () => {
    const local = { clear: vi.fn() };
    const session = { clear: vi.fn() };
    const idb = makeIdb(['dude:v1:history', 'something-else']);
    const result = await wipeHubWebOrigin({ local, session, idb, knownDatabases: ['dude:v1:history', 'dude:v1:network-history'] });
    expect(local.clear).toHaveBeenCalledTimes(1);
    expect(session.clear).toHaveBeenCalledTimes(1);
    expect([...idb.deleted].sort()).toEqual(['dude:v1:history', 'dude:v1:network-history', 'something-else']);
    expect(result.failures).toBe(0);
  });

  it('still deletes the known databases where indexedDB.databases() does not exist', async () => {
    const idb = makeIdb(null);
    await wipeHubWebOrigin({ local: { clear: vi.fn() }, session: { clear: vi.fn() }, idb, knownDatabases: ['a', 'b'] });
    expect(idb.deleted).toEqual(['a', 'b']);
  });

  it('survives a store that throws and counts the failure', async () => {
    const idb: WipeIdb = { deleteDatabase: async (name) => { if (name === 'b') throw new Error('boom'); } };
    const result = await wipeHubWebOrigin({
      local: { clear: () => { throw new Error('denied'); } }, session: { clear: vi.fn() }, idb, knownDatabases: ['a', 'b'],
    });
    expect(result.failures).toBe(2);
  });

  it('never touches Cache Storage (the service worker caches public assets only)', async () => {
    const caches = { delete: vi.fn(), keys: vi.fn(async () => ['ngsw:/:db:control']), open: vi.fn(), match: vi.fn(), has: vi.fn() };
    vi.stubGlobal('caches', caches);
    await wipeHubWebOrigin({ local: { clear: vi.fn() }, session: { clear: vi.fn() }, idb: makeIdb(['x']), knownDatabases: ['dude:v1:history'] });
    expect(caches.delete).not.toHaveBeenCalled();
    expect(caches.keys).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
  });
});
