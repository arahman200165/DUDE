import type { Db } from '../sqlite.js';

export interface SnapshotHeaderRow { kind: string; id: string; createdAt: number; header: unknown }
interface Raw { kind: string; id: string; created_at: number; header_json: string }

const KIND = /^[a-z0-9][a-z0-9.-]{0,63}$/;
function assertKind(kind: string): void {
  if (typeof kind !== 'string' || !KIND.test(kind)) throw new Error('Invalid snapshot kind.');
}
const toRow = (r: Raw): SnapshotHeaderRow => ({ kind: r.kind, id: r.id, createdAt: r.created_at, header: JSON.parse(r.header_json) });

/** `kind` is 'fs' or a SysSnapshotKind; bodies stay on disk, only the header lives here. */
export function upsertSnapshotHeader(db: Db, kind: string, id: string, createdAt: number, header: unknown): void {
  assertKind(kind);
  db.prepare(
    `INSERT INTO snapshot_headers(kind, id, created_at, header_json) VALUES(?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET created_at = excluded.created_at, header_json = excluded.header_json`,
  ).run(kind, id, createdAt, JSON.stringify(header));
}

/** Newest first. */
export function listSnapshotHeaders(db: Db, kind: string): SnapshotHeaderRow[] {
  assertKind(kind);
  const rows = db.prepare('SELECT kind, id, created_at, header_json FROM snapshot_headers WHERE kind = ? ORDER BY created_at DESC, rowid DESC').all(kind) as unknown as Raw[];
  return rows.map(toRow);
}

export function getSnapshotHeader(db: Db, kind: string, id: string): SnapshotHeaderRow | null {
  assertKind(kind);
  const r = db.prepare('SELECT kind, id, created_at, header_json FROM snapshot_headers WHERE kind = ? AND id = ?').get(kind, id) as unknown as Raw | undefined;
  return r ? toRow(r) : null;
}

export function removeSnapshotHeader(db: Db, kind: string, id: string): boolean {
  assertKind(kind);
  return Number(db.prepare('DELETE FROM snapshot_headers WHERE kind = ? AND id = ?').run(kind, id).changes) > 0;
}
