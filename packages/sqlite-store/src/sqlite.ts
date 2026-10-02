import type { DatabaseSync, StatementSync } from 'node:sqlite';

export type Db = DatabaseSync;
export type SqlValue = string | number | bigint | null | Uint8Array;

const depth = new WeakMap<DatabaseSync, number>();

/** Run `fn` inside BEGIN IMMEDIATE/COMMIT; rolls back on throw. Nested calls run inline in the outer transaction. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if ((depth.get(db) ?? 0) > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw error;
  } finally {
    depth.set(db, 0);
  }
}

export function getRow<T>(stmt: StatementSync, ...params: SqlValue[]): T | undefined {
  return stmt.get(...params) as T | undefined;
}

export function allRows<T>(stmt: StatementSync, ...params: SqlValue[]): T[] {
  return stmt.all(...params) as T[];
}

export function getMeta(db: DatabaseSync, key: string): string | undefined {
  return getRow<{ value: string }>(db.prepare('SELECT value FROM meta WHERE key = ?'), key)?.value;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
