import type { Db } from '@dude/sqlite-store';

export interface KvSyncState {
  hubRevision: number | null;
  /** The last Hub value (the merge base); null when unknown or when the Hub value is a tombstone. */
  base: unknown | null;
}

/** Hub revision/base bookkeeping for a synced kv key (kv keys have no `records` row). */
export function getKvSync(db: Db, namespace: string, key: string): KvSyncState | undefined {
  const r = db.prepare('SELECT hub_revision, base_json FROM kv_sync WHERE namespace = ? AND key = ?').get(namespace, key) as unknown as
    { hub_revision: number | null; base_json: string | null } | undefined;
  if (!r) return undefined;
  return { hubRevision: r.hub_revision === null ? null : Number(r.hub_revision), base: r.base_json === null ? null : JSON.parse(r.base_json) };
}

export function setKvSync(db: Db, namespace: string, key: string, hubRevision: number | null, base: unknown | null): void {
  db.prepare(
    `INSERT INTO kv_sync(namespace, key, hub_revision, base_json) VALUES(?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET hub_revision = excluded.hub_revision, base_json = excluded.base_json`,
  ).run(namespace, key, hubRevision, base === null || base === undefined ? null : JSON.stringify(base));
}

export function clearKvSync(db: Db, namespace: string, key: string): void {
  db.prepare('DELETE FROM kv_sync WHERE namespace = ? AND key = ?').run(namespace, key);
}
