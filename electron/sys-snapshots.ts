import { app, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { SYS_SNAPSHOT_KINDS, type SysMutResult, type SysSnapshot, type SysSnapshotHeader, type SysSnapshotKind } from '../src/shared-logic/system/sys-mutation-types';

/**
 * Snapshot library for Phase 31's env/PATH/registry/process-environment diffs, at
 * `userData/system-snapshots/<kind>/<id>.json`. Values are stored as-is (explicit product decision: no redaction).
 */

const ID_PATTERN = /^[0-9a-f-]{36}$/;
const MAX_BYTES = 64 * 1024 * 1024;

let rootOverride: string | null = null;
export function setSysSnapshotRootForTesting(dir: string | null): void { rootOverride = dir; }
function root(): string { return rootOverride ?? join(app.getPath('userData'), 'system-snapshots'); }

function checkKind(kind: unknown): SysSnapshotKind {
  if (typeof kind !== 'string' || !(SYS_SNAPSHOT_KINDS as readonly string[]).includes(kind)) throw new Error('Unknown snapshot kind.');
  return kind as SysSnapshotKind;
}
function checkId(id: unknown): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Invalid snapshot id.');
  return id;
}
function fileOf(kind: SysSnapshotKind, id: string): string { return join(root(), kind, `${id}.json`); }

function header(snapshot: SysSnapshot): SysSnapshotHeader {
  const { id, kind, name, source, createdAt, bytes } = snapshot;
  return { id, kind, name, source, createdAt, bytes };
}

async function write(snapshot: SysSnapshot): Promise<SysSnapshotHeader> {
  const serialized = JSON.stringify(snapshot.data ?? null);
  if (serialized === undefined) throw new Error('Snapshot data is not serializable.');
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_BYTES) throw new Error('Snapshot is larger than 64 MB.');
  const full: SysSnapshot = { ...snapshot, bytes };
  const target = fileOf(full.kind, full.id);
  await fs.mkdir(join(root(), full.kind), { recursive: true });
  await fs.writeFile(`${target}.tmp`, JSON.stringify(full), 'utf8');
  await fs.rename(`${target}.tmp`, target);
  return header(full);
}

export async function saveSnapshot(kind: unknown, name: unknown, source: unknown, data: unknown): Promise<SysSnapshotHeader> {
  const checked = checkKind(kind);
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('Snapshot name must be 1-200 characters.');
  if (typeof source !== 'string' || source.length > 500) throw new Error('Snapshot source must be at most 500 characters.');
  return write({ id: randomUUID(), kind: checked, name, source, createdAt: new Date().toISOString(), bytes: 0, data });
}

export async function getSnapshot(kind: unknown, id: unknown): Promise<SysSnapshot> {
  const checked = checkKind(kind);
  const safe = checkId(id);
  try { return JSON.parse(await fs.readFile(fileOf(checked, safe), 'utf8')) as SysSnapshot; } catch { throw new Error('Snapshot not found.'); }
}

export async function listSnapshots(kind?: unknown): Promise<SysSnapshotHeader[]> {
  const kinds = kind === undefined ? [...SYS_SNAPSHOT_KINDS] : [checkKind(kind)];
  const headers: SysSnapshotHeader[] = [];
  for (const k of kinds) {
    for (const file of await fs.readdir(join(root(), k)).catch(() => [] as string[])) {
      if (!file.endsWith('.json') || !ID_PATTERN.test(file.slice(0, -5))) continue;
      try { headers.push(header(await getSnapshot(k, file.slice(0, -5)))); } catch { /* skip unreadable */ }
    }
  }
  return headers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function removeSnapshot(kind: unknown, id: unknown): Promise<void> {
  await fs.rm(fileOf(checkKind(kind), checkId(id)), { force: true });
}

export async function exportSnapshot(kind: unknown, id: unknown): Promise<string> {
  return JSON.stringify(await getSnapshot(kind, id), null, 2);
}

export async function importSnapshot(json: unknown): Promise<SysSnapshotHeader> {
  if (typeof json !== 'string' || json.length > MAX_BYTES + 4096) throw new Error('Not a DUDE snapshot file.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Not a DUDE snapshot file.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not a DUDE snapshot file.');
  const value = parsed as Record<string, unknown>;
  const kind = checkKind(value['kind']);
  if (typeof value['name'] !== 'string' || !value['name'].trim() || value['name'].length > 200) throw new Error('Snapshot name must be 1-200 characters.');
  if (typeof value['source'] !== 'string' || value['source'].length > 500) throw new Error('Snapshot source must be at most 500 characters.');
  const createdAt = typeof value['createdAt'] === 'string' && !Number.isNaN(Date.parse(value['createdAt'])) ? value['createdAt'] : new Date().toISOString();
  if (!('data' in value)) throw new Error('Snapshot has no data.');
  return write({ id: randomUUID(), kind, name: value['name'], source: value['source'], createdAt, bytes: 0, data: value['data'] });
}

export async function snapshotUsage(): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  for (const kind of SYS_SNAPSHOT_KINDS) {
    for (const file of await fs.readdir(join(root(), kind)).catch(() => [] as string[])) {
      if (!file.endsWith('.json')) continue;
      count++;
      bytes += (await fs.stat(join(root(), kind, file)).catch(() => ({ size: 0 }))).size;
    }
  }
  return { count, bytes };
}

function wrap<T>(action: () => Promise<T>): Promise<SysMutResult<T>> {
  return action().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
}

export function registerSysSnapshotHandlers(): void {
  ipcMain.handle('dude:syssnap:list', (_e, kind: unknown) => wrap(() => listSnapshots(kind === undefined || kind === null ? undefined : kind)));
  ipcMain.handle('dude:syssnap:get', (_e, kind: unknown, id: unknown) => wrap(() => getSnapshot(kind, id)));
  ipcMain.handle('dude:syssnap:save', (_e, kind: unknown, name: unknown, source: unknown, data: unknown) => wrap(() => saveSnapshot(kind, name, source, data)));
  ipcMain.handle('dude:syssnap:remove', (_e, kind: unknown, id: unknown) => wrap(() => removeSnapshot(kind, id)));
  ipcMain.handle('dude:syssnap:export', (_e, kind: unknown, id: unknown) => wrap(() => exportSnapshot(kind, id)));
  ipcMain.handle('dude:syssnap:import', (_e, json: unknown) => wrap(() => importSnapshot(json)));
  ipcMain.handle('dude:syssnap:usage', () => wrap(() => snapshotUsage()));
}
