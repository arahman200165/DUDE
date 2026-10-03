import { describe, expect, it, vi } from 'vitest';
import { SyncError } from '../sync/sync.port';
import { HubWebConnectionService } from './hub-web-connection.service';
import { HubWebSyncInfo } from './hub-web-sync-info';
import { SYNC_UNSUPPORTED, createHubWebSyncAdapter, phaseOf } from './hub-web-sync.adapter';
import { ALL_ON } from './testing/fake-hub';

function make() {
  const connection = new HubWebConnectionService();
  const info = new HubWebSyncInfo();
  const webAccessSet = vi.fn(async (id: string, enabled: boolean) => ({ access: { ...ALL_ON, [id]: enabled } }));
  const port = createHubWebSyncAdapter({ client: { webAccessSet } as never, connection, info, access: { ...ALL_ON, usage: false } });
  return { connection, info, port, webAccessSet };
}

describe('createHubWebSyncAdapter', () => {
  it('maps the connection state onto the shared phases', () => {
    expect(phaseOf('live', false)).toBe('idle');
    expect(phaseOf('live', true)).toBe('syncing');
    expect(phaseOf('reconnecting', false)).toBe('offline');
    expect(phaseOf('unreachable', false)).toBe('offline');
    expect(phaseOf('session-expired', false)).toBe('revoked');
    expect(phaseOf('incompatible', false)).toBe('hub-outdated');
  });

  it('reports cursor, head, last pull and the access flags as categories', async () => {
    const { port, info } = make();
    info.notePull(7, 9);
    const status = await port.status();
    expect(port.host).toBe('web');
    expect(status).toMatchObject({ phase: 'idle', cursor: 7, headRevision: 9, pending: 0, conflicts: 0, quarantined: 0, lastError: null });
    expect(status.lastSyncAt).not.toBeNull();
    expect(status.categories.usage).toBe(false);
    expect(status.categories.settings).toBe(true);
  });

  it('pushes status changes when the connection or the info changes, and stops after unsubscribe', () => {
    const { port, connection, info } = make();
    const seen: string[] = [];
    const off = port.onStatusChanged((s) => seen.push(s.phase));
    connection.set('unreachable');
    expect(seen).toEqual(['offline']);
    info.notePush();
    expect(seen).toEqual(['offline', 'offline']);
    off();
    connection.set('live');
    expect(seen).toHaveLength(2);
  });

  it('setCategories toggles web access on the Hub and returns the new categories', async () => {
    const { port, webAccessSet } = make();
    const status = await port.setCategories({ usage: true, settings: true });
    expect(webAccessSet).toHaveBeenCalledTimes(1);
    expect(webAccessSet).toHaveBeenCalledWith('usage', true);
    expect(status.categories.usage).toBe(true);
  });

  it('turns a refused toggle into a SyncError', async () => {
    const { port, webAccessSet } = make();
    webAccessSet.mockRejectedValueOnce(new Error('nope'));
    await expect(port.setCategories({ usage: true })).rejects.toBeInstanceOf(SyncError);
  });

  it('syncNow pulls the change feed', async () => {
    const { port, info } = make();
    info.pullNow = vi.fn(async () => { info.notePull(12, 12); });
    const status = await port.syncNow();
    expect(info.pullNow).toHaveBeenCalled();
    expect(status.cursor).toBe(12);
  });

  it('has no pause, inbox, quarantine, first sync or standalone', async () => {
    const { port } = make();
    await expect(port.setPaused(true)).rejects.toMatchObject({ code: SYNC_UNSUPPORTED });
    await expect(port.firstSyncPreview()).rejects.toMatchObject({ code: SYNC_UNSUPPORTED });
    await expect(port.standalonePreview()).rejects.toMatchObject({ code: SYNC_UNSUPPORTED });
    await expect(port.discardQuarantinedPreview('x')).rejects.toMatchObject({ code: SYNC_UNSUPPORTED });
    expect(await port.listConflicts()).toEqual([]);
    expect(await port.listQuarantined()).toEqual([]);
    expect(await port.exportQuarantined()).toEqual([]);
    expect((await port.resolveConflict(1, 'hub')).ok).toBe(false);
  });

  it('never applies changes itself: the realtime link already does', () => {
    const { port } = make();
    const callback = vi.fn();
    port.onApplied(callback)();
    expect(callback).not.toHaveBeenCalled();
  });
});
