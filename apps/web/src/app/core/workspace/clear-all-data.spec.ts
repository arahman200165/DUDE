import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { HISTORY_DB_NAME } from '../history/history-repository';
import { NETWORK_HISTORY_DB_NAME } from '../platform/network-run-repository';
import { provideBootSnapshot } from '../persistence/device-store/boot-snapshot';
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';
import { legacyDatabaseExists } from '../storage/legacy-indexeddb-import';
import { ClearAllDataService } from './clear-all-data';

describe('ClearAllDataService on the desktop device store', () => {
  afterEach(() => { delete (window as unknown as { dude?: unknown }).dude; });

  it('clears history and network runs through the store and deletes leftover IndexedDB databases', async () => {
    const bridge = fakeElectronBridge();
    // defineProperty, not assignment: other specs in the same worker leave `dude` configurable but not writable.
    Object.defineProperty(window, 'dude', { value: bridge, configurable: true, writable: true });
    await bridge.store.history.add({ id: 'h', toolId: 't', createdAt: Date.now(), sizeBytes: 1, payload: {} });
    await bridge.store.network.add({ id: 'n', createdAt: Date.now(), sizeBytes: 1, payload: {} });
    for (const name of [HISTORY_DB_NAME, NETWORK_HISTORY_DB_NAME]) {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onsuccess = () => { open.result.close(); resolve(); };
        open.onerror = () => reject(open.error);
      });
    }
    TestBed.configureTestingModule({ providers: [provideBootSnapshot({ boot: { ...(await bridge.store.hydrate()), kv: [
      { namespace: '__history-import__', key: 'done', value: true }, { namespace: '__network-history-import__', key: 'done', value: true },
    ] } })] });

    await TestBed.inject(ClearAllDataService).clearAll();

    expect(await bridge.store.history.list()).toEqual([]);
    expect(await bridge.store.network.list()).toEqual([]);
    expect(await legacyDatabaseExists(HISTORY_DB_NAME)).toBe(false);
    expect(await legacyDatabaseExists(NETWORK_HISTORY_DB_NAME)).toBe(false);
  });
});
