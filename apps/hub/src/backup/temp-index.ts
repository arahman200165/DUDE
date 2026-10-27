import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { BackupV2BlobEntry } from '@dude/hub-backup';

/**
 * A throw-away SQLite file in the backup work folder, so the engine's bookkeeping grows on disk, not in memory: the dedupe index
 * of the previous manifest (blob identity to entry) and the mark set of a prune (referenced pack ids). Removed by `close()`.
 */
export class TempIndex {
  private readonly db: DatabaseSync;
  private readonly file: string;
  private closed = false;

  constructor(workDir: string) {
    mkdirSync(workDir, { recursive: true, mode: 0o700 });
    this.file = path.join(workDir, `index-${randomBytes(8).toString('hex')}.tmp`);
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    this.db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, entry TEXT NOT NULL) WITHOUT ROWID; CREATE TABLE marks (id TEXT PRIMARY KEY) WITHOUT ROWID;');
  }

  /** Runs `work` in one transaction (bulk inserts). */
  batch<T>(work: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  putBlob(entry: BackupV2BlobEntry): void {
    this.db.prepare('INSERT OR REPLACE INTO blobs(id, entry) VALUES(?, ?)').run(entry.id, JSON.stringify({ sha256: entry.sha256, size: entry.size, extents: entry.extents }));
  }

  getBlob(id: string): BackupV2BlobEntry | null {
    const row = this.db.prepare('SELECT entry FROM blobs WHERE id = ?').get(id) as { entry: string } | undefined;
    if (row === undefined) return null;
    const parsed = JSON.parse(row.entry) as { sha256: string; size: number; extents: Array<[string, number, number]> };
    return { kind: 'blob', id, sha256: parsed.sha256, size: parsed.size, extents: parsed.extents.map((e) => Object.freeze([e[0], e[1], e[2]]) as readonly [string, number, number]) };
  }

  clearBlobs(): void {
    this.db.exec('DELETE FROM blobs');
  }

  mark(id: string): void {
    this.db.prepare('INSERT OR IGNORE INTO marks(id) VALUES(?)').run(id);
  }

  isMarked(id: string): boolean {
    return this.db.prepare('SELECT 1 AS x FROM marks WHERE id = ?').get(id) !== undefined;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.db.close(); } catch { /* already closed */ }
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(this.file + suffix, { force: true });
  }
}
