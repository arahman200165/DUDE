import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { isDeviceStoreReady, storeCall } from './store-client';

/**
 * Snapshot header rows in the Device State Store. Bodies stay files; the index is rebuilt from the
 * header files on every healthy start (`reconcileSnapshotIndex`) so a degraded session never loses a row.
 * `kind` is `fs` or a system snapshot kind.
 */

export interface IndexedHeader { readonly id: string; readonly createdAt: number; readonly header: unknown }

const ID = /^[0-9a-f-]{36}$/;

function stamp(value: unknown): number {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? Date.now() : ms;
}

/** Best effort: callers have already written the file, which reconcile will pick up if this fails. */
export async function upsertSnapshotHeader(kind: string, id: string, header: unknown, createdAt?: string): Promise<void> {
  if (!isDeviceStoreReady()) return;
  const fields = (header ?? {}) as { createdAt?: string; takenAt?: string };
  try { await storeCall('snapshots.upsert', { kind, id, createdAt: stamp(createdAt ?? fields.createdAt ?? fields.takenAt), header }); } catch { /* reconciled later */ }
}

export async function listSnapshotHeaders<H>(kind: string): Promise<H[]> {
  const rows = await storeCall('snapshots.list', { kind });
  return rows.map((row) => row.header as H);
}

export async function removeSnapshotHeader(kind: string, id: string): Promise<void> {
  if (!isDeviceStoreReady()) return;
  try { await storeCall('snapshots.remove', { kind, id }); } catch { /* reconciled later */ }
}

/**
 * Adds rows for header files on disk that the index lacks and removes rows whose files are gone.
 * `scanDir` holds the headers: `<id>.header.json` files for `fs` (header in the file), or the full
 * `<id>.json` snapshot files for system kinds (`toHeader` projects the stored snapshot).
 */
export async function reconcileSnapshotIndex(kind: string, scanDir: string, options: { headerSuffix?: string; toHeader?: (parsed: Record<string, unknown>) => unknown } = {}): Promise<void> {
  if (!isDeviceStoreReady()) return;
  const suffix = options.headerSuffix ?? (kind === 'fs' ? '.header.json' : '.json');
  const ids = new Map<string, string>();
  for (const file of await fs.readdir(scanDir).catch(() => [] as string[])) {
    if (!file.endsWith(suffix)) continue;
    const id = file.slice(0, -suffix.length);
    if (ID.test(id)) ids.set(id, file);
  }
  const rows = await storeCall('snapshots.list', { kind });
  const indexed = new Set(rows.map((row) => row.id));
  for (const row of rows) if (!ids.has(row.id)) await storeCall('snapshots.remove', { kind, id: row.id });
  for (const [id, file] of ids) {
    if (indexed.has(id)) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(join(scanDir, file), 'utf8')) as Record<string, unknown>;
      await upsertSnapshotHeader(kind, id, options.toHeader ? options.toHeader(parsed) : parsed);
    } catch { /* unreadable: skip */ }
  }
}
