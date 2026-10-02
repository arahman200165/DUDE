import { app, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { FsResult } from "@dude/contracts/fs/fs-types";
import { diffSnapshots, parseSnapshot, type Snapshot, type SnapshotDiff, type SnapshotHeader } from "@dude/contracts/fs/snapshot-diff";

/**
 * The folder-snapshot library (Phase 29 item 16, Milestone 527): app data under
 * `userData/snapshots/`, written by the fs worker's `snapshot-take` job and listed, exported,
 * imported, compared and deleted here. Nothing in this module touches the snapshotted folders.
 */

const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

function dir(): string { return join(app.getPath('userData'), 'snapshots'); }
function isId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value); }

export async function listSnapshots(): Promise<SnapshotHeader[]> {
  const files = (await fs.readdir(dir()).catch(() => [] as string[])).filter((file) => file.endsWith('.header.json'));
  const headers = await Promise.all(files.map(async (file) => {
    try { return JSON.parse(await fs.readFile(join(dir(), file), 'utf8')) as SnapshotHeader; } catch { return null; }
  }));
  return headers.filter((header): header is SnapshotHeader => !!header).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

export async function readSnapshotFile(id: unknown): Promise<Snapshot> {
  if (!isId(id)) throw new Error('Unknown snapshot.');
  return JSON.parse(await fs.readFile(join(dir(), `${id}.json`), 'utf8')) as Snapshot;
}

export async function importSnapshot(json: unknown): Promise<SnapshotHeader> {
  if (typeof json !== 'string' || json.length > MAX_IMPORT_BYTES) throw new Error('Choose a DUDE snapshot file.');
  const parsed = parseSnapshot(JSON.parse(json));
  if (!parsed) throw new Error('That file is not a DUDE folder snapshot.');
  const { entries, directories, ...rest } = parsed;
  const header: SnapshotHeader = { ...rest, id: randomUUID(), label: `${rest.label} (imported)` };
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(join(dir(), `${header.id}.json`), JSON.stringify({ ...header, entries, directories }), 'utf8');
  await fs.writeFile(join(dir(), `${header.id}.header.json`), JSON.stringify(header), 'utf8');
  return header;
}

export async function deleteSnapshot(id: unknown): Promise<void> {
  if (!isId(id)) throw new Error('Unknown snapshot.');
  await fs.rm(join(dir(), `${id}.json`), { force: true });
  await fs.rm(join(dir(), `${id}.header.json`), { force: true });
}

export async function compareSnapshots(baseId: unknown, compareId: unknown): Promise<SnapshotDiff> {
  return diffSnapshots(await readSnapshotFile(baseId), await readSnapshotFile(compareId));
}

function wrap<T>(action: () => Promise<T>): Promise<FsResult<{ value: T }>> {
  return action().then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
}

export function registerSnapshotHandlers(): void {
  ipcMain.handle('dude:fssnap:list', () => wrap(listSnapshots));
  ipcMain.handle('dude:fssnap:export', (_event, id: unknown) => wrap(async () => fs.readFile(join(dir(), `${isId(id) ? id : 'invalid'}.json`), 'utf8')));
  ipcMain.handle('dude:fssnap:import', (_event, json: unknown) => wrap(() => importSnapshot(json)));
  ipcMain.handle('dude:fssnap:delete', (_event, id: unknown) => wrap(() => deleteSnapshot(id)));
  ipcMain.handle('dude:fssnap:compare', (_event, baseId: unknown, compareId: unknown) => wrap(() => compareSnapshots(baseId, compareId)));
}
