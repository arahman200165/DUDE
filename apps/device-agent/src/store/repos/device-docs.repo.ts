import type { Db } from '@dude/sqlite-store';

export const DOC_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
export const isDocName = (name: unknown): name is string => typeof name === 'string' && DOC_NAME.test(name);

function assertName(name: unknown): asserts name is string {
  if (!isDocName(name)) throw new Error('Invalid document name.');
}

/** Undefined when the document does not exist. */
export function getDoc(db: Db, name: string): unknown | undefined {
  assertName(name);
  const row = db.prepare('SELECT value_json FROM device_docs WHERE name = ?').get(name) as unknown as { value_json: string } | undefined;
  return row ? JSON.parse(row.value_json) : undefined;
}

export function setDoc(db: Db, name: string, value: unknown, now: () => Date = () => new Date()): void {
  assertName(name);
  db.prepare(
    `INSERT INTO device_docs(name, value_json, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(name, JSON.stringify(value === undefined ? null : value), now().toISOString());
}

export function removeDoc(db: Db, name: string): boolean {
  assertName(name);
  return Number(db.prepare('DELETE FROM device_docs WHERE name = ?').run(name).changes) > 0;
}
