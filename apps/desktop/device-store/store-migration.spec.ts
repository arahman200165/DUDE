const electron = vi.hoisted(() => ({ app: { getPath: (): string => '' }, ipcMain: { handle: vi.fn() }, shell: {} }));
vi.mock('electron', () => electron);

import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemp, openReady, tempDir } from '../../device-agent/src/testing/test-utils';
import { createRpcServer } from '../../device-agent/src/rpc/server';
import { createInProcessClient, setDeviceStoreHost, storeCall } from './store-client';
import { loadDoc, removeDoc, resetDeviceDocsForTesting, saveDoc } from './device-docs';
import { listSnapshotHeaders, reconcileSnapshotIndex, removeSnapshotHeader, upsertSnapshotHeader } from './snapshot-index';
import { clearPowerShellHistory, importLegacyPowerShellHistory, listPowerShellHistory, resetPowerShellWorkbenchForTesting } from '../powershell-workbench';

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
function installStore(): void {
  const store = openReady(tempDir(), { machineGuid: null });
  setDeviceStoreHost(createInProcessClient(createRpcServer(store, deps).handle));
}
const dirs: string[] = [];
function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'dude-mig-')); dirs.push(dir); return dir; }

beforeEach(() => { resetDeviceDocsForTesting(); vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => {
  setDeviceStoreHost(null); cleanupTemp(); resetPowerShellWorkbenchForTesting(); vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const decodeNumber = (raw: unknown): number | null => (typeof raw === 'number' ? raw : null);

describe('device docs', () => {
  it('round-trips through the store, falling back when absent or undecodable', async () => {
    installStore();
    expect(await loadDoc('some-doc', decodeNumber, 7)).toBe(7);
    await saveDoc('some-doc', 42);
    expect(await loadDoc('some-doc', decodeNumber, 7)).toBe(42);
    expect(await storeCall('docs.get', { name: 'some-doc' })).toBe(42);
    await saveDoc('some-doc', 'text');
    expect(await loadDoc('some-doc', decodeNumber, 7)).toBe(7);
    await removeDoc('some-doc');
    expect(await storeCall('docs.get', { name: 'some-doc' })).toBeNull();
  });

  it('keeps values in memory only, and warns once, while degraded', async () => {
    expect(await loadDoc('some-doc', decodeNumber, 1)).toBe(1);
    await saveDoc('some-doc', 5);
    expect(await loadDoc('some-doc', decodeNumber, 1)).toBe(5);
    expect(console.warn).toHaveBeenCalledTimes(1);
    await removeDoc('some-doc');
    expect(await loadDoc('some-doc', decodeNumber, 1)).toBe(1);
  });
});

describe('snapshot index', () => {
  const header = (id: string, takenAt: string) => ({ id, label: id.slice(0, 4), takenAt });

  it('upserts, lists newest first and removes', async () => {
    installStore();
    const [a, b] = [randomUUID(), randomUUID()];
    await upsertSnapshotHeader('fs', a, header(a, '2026-01-01T00:00:00Z'), '2026-01-01T00:00:00Z');
    await upsertSnapshotHeader('fs', b, header(b, '2026-02-01T00:00:00Z'), '2026-02-01T00:00:00Z');
    expect((await listSnapshotHeaders<{ id: string }>('fs')).map((h) => h.id)).toEqual([b, a]);
    await removeSnapshotHeader('fs', b);
    expect((await listSnapshotHeaders<{ id: string }>('fs')).map((h) => h.id)).toEqual([a]);
  });

  it('is a no-op while degraded', async () => {
    await upsertSnapshotHeader('fs', randomUUID(), {});
    await reconcileSnapshotIndex('fs', temp());
  });

  it('reconcile adds rows for files missing from the index and removes rows whose files are gone', async () => {
    installStore();
    const dir = temp();
    const [onDisk, indexedOnly, both] = [randomUUID(), randomUUID(), randomUUID()];
    writeFileSync(join(dir, `${onDisk}.header.json`), JSON.stringify(header(onDisk, '2026-03-01T00:00:00Z')));
    writeFileSync(join(dir, `${both}.header.json`), JSON.stringify(header(both, '2026-01-01T00:00:00Z')));
    writeFileSync(join(dir, `${randomUUID()}.header.json`), '{nope');
    writeFileSync(join(dir, `${onDisk}.json`), '{}');
    await upsertSnapshotHeader('fs', indexedOnly, header(indexedOnly, '2026-02-01T00:00:00Z'));
    await upsertSnapshotHeader('fs', both, header(both, '2026-01-01T00:00:00Z'));

    await reconcileSnapshotIndex('fs', dir);
    expect((await listSnapshotHeaders<{ id: string }>('fs')).map((h) => h.id)).toEqual([onDisk, both]);
    await reconcileSnapshotIndex('fs', dir);
    expect(await listSnapshotHeaders('fs')).toHaveLength(2);
  });

  it('reconciles system snapshot files through a header projection', async () => {
    installStore();
    const dir = temp();
    const id = randomUUID();
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, kind: 'env', name: 'n', createdAt: '2026-01-01T00:00:00Z', data: { big: 1 } }));
    await reconcileSnapshotIndex('env', dir, { toHeader: (p) => ({ id: p['id'], name: p['name'], createdAt: p['createdAt'] }) });
    expect(await listSnapshotHeaders('env')).toEqual([{ id, name: 'n', createdAt: '2026-01-01T00:00:00Z' }]);
  });
});

describe('PowerShell history', () => {
  const entry = (n: number) => ({
    id: randomUUID(), sha256: 'x', cwd: 'C:\\', elevated: false,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(), completedAt: new Date(Date.UTC(2026, 0, 1, 0, n, 5)).toISOString(),
    exitCode: 0, timedOut: false, cancelled: false, truncated: false,
  });

  it('imports an existing history file once, then leaves the file and does not re-import', async () => {
    const userData = temp();
    electron.app.getPath = () => userData;
    const [a, b] = [entry(1), entry(2)];
    writeFileSync(join(userData, 'powershell-history.json'), JSON.stringify([b, a]));
    expect(await importLegacyPowerShellHistory()).toBe(0);

    installStore();
    expect(await importLegacyPowerShellHistory()).toBe(2);
    expect((await listPowerShellHistory()).map((e) => e.id)).toEqual([b.id, a.id]);
    expect(await loadDoc('legacy-import-state', (r) => r as Record<string, unknown>, {})).toEqual({ powershellHistory: true });

    await clearPowerShellHistory();
    expect(await importLegacyPowerShellHistory()).toBe(0);
    expect(await listPowerShellHistory()).toEqual([]);
  });
});
