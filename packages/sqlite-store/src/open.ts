import { DatabaseSync } from 'node:sqlite';

export interface OpenSqliteOptions {
  /** Milliseconds SQLite waits on a locked database. Default 5000. */
  busyTimeoutMs?: number;
}

/** Open a database and apply the durability pragmas (WAL, synchronous=FULL, foreign keys, busy timeout). */
export function openSqliteDatabase(path: string, options: OpenSqliteOptions = {}): DatabaseSync {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`PRAGMA busy_timeout = ${Math.trunc(options.busyTimeoutMs ?? 5000)}`);
  } catch (error) {
    try { db.close(); } catch { /* ignore */ }
    throw error;
  }
  return db;
}

/** True when `PRAGMA quick_check` reports a healthy database. */
export function quickCheck(db: DatabaseSync): boolean {
  const check = db.prepare('PRAGMA quick_check').all() as Array<Record<string, unknown>>;
  return check.length === 1 && Object.values(check[0])[0] === 'ok';
}
