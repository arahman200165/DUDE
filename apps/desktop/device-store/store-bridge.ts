import { ipcMain, type BrowserWindow } from 'electron';
import type { DeviceStoreBoot, DeviceStoreDevice, EntityCommitResult, StoreHealth } from '@dude/contracts';
import { validateDisplayName } from '@dude/persistence';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';
import { validateEntityBatch, validateEntityCommit, validateKvBatch } from './store-validation';

/**
 * The renderer's whole route to the device store: `dude:store:*` and `dude:device:*`. Main is the
 * trust boundary: every handler first checks the request came from this window's own
 * `webContents`, then validates the payload, then forwards over the private agent port.
 */

const FORBIDDEN = 'forbidden';
const degradedBoot = (status: DeviceStoreBoot['status']): DeviceStoreBoot => ({ status, device: null, kv: [], records: [] });
const unavailableHealth = (status: StoreHealth['status'], message: string): StoreHealth => ({
  status, schemaVersion: 0, minReaderVersion: 0, sizeBytes: 0, outbox: { pending: 0, maxRows: 0, backpressure: false }, legacyImport: 'none', message,
});

export type CommitResult = { readonly ok: true; readonly count: number } | { readonly ok: false; readonly error: string };
type ImportResult = { ok: true; count: number; backpressure: boolean } | { ok: false; error: string };

function messageOf(error: unknown): string {
  return error instanceof DeviceStoreError ? error.message : 'The device store request failed.';
}

export function registerDeviceStoreHandlers(window: BrowserWindow, host: () => DeviceStoreHost | null = getDeviceStoreHost): void {
  const own = (sender: unknown): boolean => sender === window.webContents;

  ipcMain.handle('dude:store:hydrate', async (event): Promise<DeviceStoreBoot> => {
    if (!own(event.sender)) throw new Error(FORBIDDEN);
    const h = host();
    if (!h) return degradedBoot('unavailable');
    const status = h.status();
    if (status !== 'ready') return degradedBoot(status);
    try {
      return await h.call('store.hydrate', {});
    } catch {
      return degradedBoot('degraded');
    }
  });

  ipcMain.handle('dude:store:kv:commit', async (event, mutations: unknown): Promise<CommitResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const batch = validateKvBatch(mutations);
    if (!batch.ok) return { ok: false, error: batch.error };
    const h = host();
    if (!h) return { ok: false, error: 'unavailable' };
    try {
      const result = await h.call('kv.commit', { mutations: batch.value });
      return { ok: true, count: result.count };
    } catch (error) {
      return { ok: false, error: messageOf(error) };
    }
  });

  // One-way variant for page-hide flushes: no reply, failures are dropped.
  ipcMain.on('dude:store:kv:commitNoWait', (event, mutations: unknown) => {
    if (!own(event.sender)) return;
    const batch = validateKvBatch(mutations);
    const h = host();
    if (!batch.ok || !h) return;
    void h.call('kv.commit', { mutations: batch.value }).catch(() => undefined);
  });

  ipcMain.handle('dude:store:entity:commit', async (event, commit: unknown): Promise<EntityCommitResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const valid = validateEntityCommit(commit);
    if (!valid.ok) return { ok: false, error: valid.error };
    const h = host();
    if (!h) return { ok: false, error: 'unavailable' };
    try {
      return await h.call('entity.commit', valid.value);
    } catch (error) {
      return { ok: false, error: messageOf(error) };
    }
  });

  ipcMain.handle('dude:store:entity:importMany', async (event, commits: unknown): Promise<ImportResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const valid = validateEntityBatch(commits);
    if (!valid.ok) return { ok: false, error: valid.error };
    if (valid.value.length === 0) return { ok: true, count: 0, backpressure: false };
    const entityType = valid.value[0].entityType;
    if (valid.value.some((c) => c.entityType !== entityType || c.op !== 'upsert')) {
      return { ok: false, error: 'An import must contain upserts of a single entity type.' };
    }
    const h = host();
    if (!h) return { ok: false, error: 'unavailable' };
    try {
      return await h.call('entity.importMany', { entityType, items: valid.value.map((c) => ({ entityId: c.entityId, payload: c.payload })) });
    } catch (error) {
      return { ok: false, error: messageOf(error) };
    }
  });

  ipcMain.handle('dude:store:status', async (event): Promise<StoreHealth> => {
    if (!own(event.sender)) throw new Error(FORBIDDEN);
    const h = host();
    if (!h) return unavailableHealth('unavailable', 'The device store is not running.');
    if (h.status() === 'ready') {
      try { return await h.call('store.health', {}); } catch { /* fall through to the cached health */ }
    }
    return h.health() ?? unavailableHealth(h.status(), 'The device store is not ready.');
  });

  ipcMain.handle('dude:store:retry', async (event): Promise<StoreHealth> => {
    if (!own(event.sender)) throw new Error(FORBIDDEN);
    const h = host();
    if (!h) return unavailableHealth('unavailable', 'The device store is not running.');
    try { await h.retry(); } catch { /* report whatever state results */ }
    if (h.status() === 'ready') {
      try { return await h.call('store.health', {}); } catch { /* fall through */ }
    }
    return h.health() ?? unavailableHealth(h.status(), 'The device store is not ready.');
  });

  ipcMain.handle('dude:device:get', async (event): Promise<DeviceStoreDevice | null> => {
    if (!own(event.sender)) throw new Error(FORBIDDEN);
    const h = host();
    if (!h || h.status() !== 'ready') return null;
    try { return (await h.call('store.hydrate', {})).device; } catch { return null; }
  });

  ipcMain.handle('dude:device:rename', async (event, name: unknown): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    const valid = validateDisplayName(name);
    if (!valid.ok) return { ok: false, error: valid.error };
    const h = host();
    if (!h) return { ok: false, error: 'unavailable' };
    try {
      return await h.call('device.rename', { displayName: valid.value });
    } catch (error) {
      return { ok: false, error: messageOf(error) };
    }
  });

  // Health pushes: the host reports status changes (restart, unavailable); the renderer shows a banner.
  host()?.onHealth((health) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('dude:store:health', health);
  });
}

let flushSeq = 0;

/**
 * Asks the renderer to flush its debounced writes and waits for its `dude:store:flushed` reply
 * (or the timeout). Never rejects: quit must proceed even if the renderer is gone or hung.
 */
export function requestRendererFlush(window: BrowserWindow, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) { resolve(); return; }
    const id = ++flushSeq;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener = (event: { sender: unknown }, replyId: unknown): void => {
      if (event.sender !== window.webContents || replyId !== id) return;
      done();
    };
    const done = (): void => {
      if (timer) clearTimeout(timer);
      ipcMain.removeListener('dude:store:flushed', listener as never);
      resolve();
    };
    ipcMain.on('dude:store:flushed', listener as never);
    timer = setTimeout(done, timeoutMs);
    try { window.webContents.send('dude:store:flush', id); } catch { done(); }
  });
}
