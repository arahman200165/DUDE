import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, ipcMain: { handle: vi.fn() } }));

import {
  exportSnapshot, getSnapshot, importSnapshot, listSnapshots, removeSnapshot, saveSnapshot, setSysSnapshotRootForTesting, snapshotUsage,
} from './sys-snapshots';

beforeEach(() => { setSysSnapshotRootForTesting(mkdtempSync(join(tmpdir(), 'dude-syssnap-'))); });

describe('system snapshots', () => {
  it('saves, lists newest first, gets and removes', async () => {
    const a = await saveSnapshot('env', 'first', 'HKCU\\Environment', { PATH: 'C:\\x', SECRET: 'kept as-is' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = await saveSnapshot('env', 'second', 'HKCU\\Environment', { A: '1' });
    await saveSnapshot('path', 'p', 'PATH', ['C:\\a']);
    expect((await listSnapshots('env')).map((h) => h.name)).toEqual(['second', 'first']);
    expect(await listSnapshots()).toHaveLength(3);
    expect(a.bytes).toBe(JSON.stringify({ PATH: 'C:\\x', SECRET: 'kept as-is' }).length);
    expect((await getSnapshot('env', a.id)).data).toEqual({ PATH: 'C:\\x', SECRET: 'kept as-is' });
    expect((await snapshotUsage()).count).toBe(3);
    await removeSnapshot('env', b.id);
    expect((await listSnapshots('env')).map((h) => h.name)).toEqual(['first']);
    await expect(getSnapshot('env', b.id)).rejects.toThrow(/not found/);
  });

  it('exports and imports with a fresh id', async () => {
    const saved = await saveSnapshot('registry', 'keys', 'HKCU\\Software', { k: [1, 2] });
    const json = await exportSnapshot('registry', saved.id);
    const imported = await importSnapshot(json);
    expect(imported.id).not.toBe(saved.id);
    expect(imported).toMatchObject({ kind: 'registry', name: 'keys', source: 'HKCU\\Software', createdAt: saved.createdAt });
    expect((await getSnapshot('registry', imported.id)).data).toEqual({ k: [1, 2] });
    await expect(importSnapshot('not json')).rejects.toThrow(/Not a DUDE snapshot/);
    await expect(importSnapshot(JSON.stringify({ kind: 'bogus', name: 'x', source: '', data: 1 }))).rejects.toThrow(/kind/);
    await expect(importSnapshot(JSON.stringify({ kind: 'env', name: 'x', source: '' }))).rejects.toThrow(/no data/);
  });

  it('rejects bad kinds, names, sources and ids', async () => {
    await expect(saveSnapshot('nope', 'n', 's', 1)).rejects.toThrow(/kind/);
    await expect(saveSnapshot('env', '', 's', 1)).rejects.toThrow(/name/);
    await expect(saveSnapshot('env', 'x'.repeat(201), 's', 1)).rejects.toThrow(/name/);
    await expect(saveSnapshot('env', 'n', 's'.repeat(501), 1)).rejects.toThrow(/source/);
    await expect(getSnapshot('env', '../../etc/passwd')).rejects.toThrow(/Invalid snapshot id/);
    await expect(removeSnapshot('env', '..\\..\\x')).rejects.toThrow(/Invalid snapshot id/);
    await expect(exportSnapshot('../env', '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/kind/);
  });
});
