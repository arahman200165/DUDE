import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHistoryEntry } from '@dude/domain/core/history/history.model';
import { historyRepositoryContract } from '@dude/persistence/testing';
import { fakeElectronBridge, fakeHistory } from '../platform/testing/fake-electron-bridge';
import { legacyDatabaseExists } from '../storage/legacy-indexeddb-import';
import { clearAllEntries, listRecent, putEntry } from './history-db';
import { DeviceHistoryRepository, HISTORY_DB_NAME, HISTORY_IMPORT_NAMESPACE, IndexedDbHistoryRepository, createHistoryRepository, entryToRecord, importLegacyHistory } from './history-repository';

const harness = { describe, it, expect };

historyRepositoryContract('IndexedDB', async (retention, clock) => {
  await clearAllEntries();
  return new IndexedDbHistoryRepository(retention, clock.now);
}, harness);

historyRepositoryContract('Device (over the bridge)', (retention, clock) => new DeviceHistoryRepository(fakeHistory(retention, clock.now)), harness);

describe('history repository selection', () => {
  it('uses the device store only when it booted ready', () => {
    const bridge = fakeElectronBridge();
    const ready = { boot: { status: 'ready' as const, device: null, kv: [], records: [] } };
    expect(createHistoryRepository(bridge, ready).kind).toBe('device');
    expect(createHistoryRepository(bridge, { boot: ready.boot, degradedReason: 'x' }).kind).toBe('indexeddb');
    expect(createHistoryRepository(bridge, { boot: null }).kind).toBe('indexeddb');
    expect(createHistoryRepository(undefined, ready).kind).toBe('indexeddb');
  });
});

describe('legacy history import', () => {
  const entry = (summary: string, ageMs: number) => ({ ...createHistoryEntry('base64', summary, { input: summary }), createdAt: new Date(Date.now() - ageMs).toISOString() });

  async function seedLegacy(entries: ReturnType<typeof entry>[]): Promise<void> {
    await clearAllEntries();
    for (const e of entries) await putEntry(e);
  }

  beforeEach(async () => { await clearAllEntries(); });

  it('moves entries oldest first, sets the marker, deletes the old database, and is idempotent', async () => {
    await seedLegacy([entry('newer', 1000), entry('older', 5000)]);
    const bridge = fakeElectronBridge();
    const repo = new DeviceHistoryRepository(bridge.store.history);

    await importLegacyHistory(repo, bridge, { boot: await bridge.store.hydrate() });

    expect((await repo.listRecent(10)).map((r) => (r.payload as { summary: string }).summary)).toEqual(['newer', 'older']);
    expect((await bridge.store.hydrate()).kv).toContainEqual({ namespace: HISTORY_IMPORT_NAMESPACE, key: 'done', value: true });
    expect(await legacyDatabaseExists(HISTORY_DB_NAME)).toBe(false);

    await importLegacyHistory(repo, bridge, { boot: await bridge.store.hydrate() });
    expect(await repo.listRecent(10)).toHaveLength(2);
  });

  it('leaves the marker unset and the data in place when the add fails', async () => {
    await seedLegacy([entry('a', 1000)]);
    const bridge = fakeElectronBridge();
    bridge.store.history.add = async () => { throw new Error('store down'); };
    const repo = new DeviceHistoryRepository(bridge.store.history);

    await importLegacyHistory(repo, bridge, { boot: await bridge.store.hydrate() });

    expect((await bridge.store.hydrate()).kv.some((row) => row.namespace === HISTORY_IMPORT_NAMESPACE)).toBe(false);
    expect(await listRecent(10)).toHaveLength(1);
  });

  it('does nothing for the IndexedDB repository', async () => {
    await seedLegacy([entry('a', 1000)]);
    const bridge = fakeElectronBridge();
    await importLegacyHistory(new IndexedDbHistoryRepository(), bridge, { boot: await bridge.store.hydrate() });
    expect(await listRecent(10)).toHaveLength(1);
  });

  it('maps entries to records with the entry as payload', () => {
    const e = entry('x', 0);
    const record = entryToRecord(e);
    expect(record.payload).toBe(e);
    expect(record.sizeBytes).toBeGreaterThan(0);
  });
});
