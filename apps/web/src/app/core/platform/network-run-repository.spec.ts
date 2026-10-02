import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { networkRunRepositoryContract } from '@dude/persistence/testing';
import { fakeElectronBridge, fakeNetwork } from './testing/fake-electron-bridge';
import { deleteLegacyDatabase, legacyDatabaseExists } from '../storage/legacy-indexeddb-import';
import {
  DeviceNetworkRunRepository, IndexedDbNetworkRunRepository, NETWORK_HISTORY_DB_NAME, NETWORK_HISTORY_IMPORT_NAMESPACE, createNetworkRunRepository, importLegacyNetworkRuns,
} from './network-run-repository';

const harness = { describe, it, expect };

networkRunRepositoryContract('IndexedDB', async (retention, clock) => {
  await new IndexedDbNetworkRunRepository().clear();
  return new IndexedDbNetworkRunRepository(retention, clock.now);
}, harness);

networkRunRepositoryContract('Device (over the bridge)', (retention, clock) => new DeviceNetworkRunRepository(fakeNetwork(retention, clock.now)), harness);

describe('network run repository selection', () => {
  it('uses the device store only when it booted ready', () => {
    const bridge = fakeElectronBridge();
    const boot = { status: 'ready' as const, device: null, kv: [], records: [] };
    expect(createNetworkRunRepository(bridge, { boot }).kind).toBe('device');
    expect(createNetworkRunRepository(bridge, { boot: null }).kind).toBe('indexeddb');
  });
});

describe('legacy network run import', () => {
  const run = (id: string, ageMs: number) => ({ id, createdAt: new Date(Date.now() - ageMs).toISOString(), request: { kind: 'ping', target: '127.0.0.1' }, result: { sent: 1 } });

  async function seedLegacy(runs: ReturnType<typeof run>[]): Promise<void> {
    await deleteLegacyDatabase(NETWORK_HISTORY_DB_NAME);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(NETWORK_HISTORY_DB_NAME, 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('runs', { keyPath: 'id' }); };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction('runs', 'readwrite');
    for (const r of runs) tx.objectStore('runs').put(r);
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  }

  beforeEach(async () => { await deleteLegacyDatabase(NETWORK_HISTORY_DB_NAME); });

  it('moves runs, sets the marker, deletes the old database, and is idempotent', async () => {
    await seedLegacy([run('new', 1000), run('old', 5000)]);
    const bridge = fakeElectronBridge();
    const repo = new DeviceNetworkRunRepository(bridge.store.network);

    await importLegacyNetworkRuns(repo, bridge, { boot: await bridge.store.hydrate() });

    expect((await repo.list()).map((r) => r.id)).toEqual(['new', 'old']);
    expect((await bridge.store.hydrate()).kv).toContainEqual({ namespace: NETWORK_HISTORY_IMPORT_NAMESPACE, key: 'done', value: true });
    expect(await legacyDatabaseExists(NETWORK_HISTORY_DB_NAME)).toBe(false);

    await importLegacyNetworkRuns(repo, bridge, { boot: await bridge.store.hydrate() });
    expect(await repo.list()).toHaveLength(2);
  });

  it('keeps the database and leaves the marker unset when the store rejects a run', async () => {
    await seedLegacy([run('a', 1000)]);
    const bridge = fakeElectronBridge();
    bridge.store.network.add = async () => ({ ok: false, error: 'unavailable' });
    await importLegacyNetworkRuns(new DeviceNetworkRunRepository(bridge.store.network), bridge, { boot: await bridge.store.hydrate() });
    expect((await bridge.store.hydrate()).kv.some((row) => row.namespace === NETWORK_HISTORY_IMPORT_NAMESPACE)).toBe(false);
    expect(await legacyDatabaseExists(NETWORK_HISTORY_DB_NAME)).toBe(true);
  });
});
