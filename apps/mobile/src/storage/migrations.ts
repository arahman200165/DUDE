import type { SqlDatabase } from './sql';

export const MOBILE_SCHEMA_VERSION = 1;
const MIGRATIONS = [
  `CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE contexts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('standalone','environment','archive')),
     environment_id TEXT NOT NULL, device_id TEXT NOT NULL, writable INTEGER NOT NULL, local_revision INTEGER NOT NULL DEFAULT 0,
     cursor INTEGER NOT NULL DEFAULT 0, head INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0,
     categories TEXT NOT NULL DEFAULT '{"favorites":false,"settings":false}', consent INTEGER NOT NULL DEFAULT 0);
   CREATE UNIQUE INDEX one_standalone ON contexts(kind) WHERE kind='standalone';
   CREATE UNIQUE INDEX one_environment ON contexts(kind) WHERE kind='environment';
   CREATE TABLE records (context_id TEXT NOT NULL REFERENCES contexts(id), entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
     payload TEXT, deleted INTEGER NOT NULL, local_revision INTEGER NOT NULL, hub_revision INTEGER,
     PRIMARY KEY(context_id,entity_type,entity_id));
   CREATE TABLE kv (context_id TEXT NOT NULL REFERENCES contexts(id), namespace TEXT NOT NULL, key TEXT NOT NULL,
     value TEXT NOT NULL, PRIMARY KEY(context_id,namespace,key));
   CREATE TABLE outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, context_id TEXT NOT NULL REFERENCES contexts(id),
     op_id TEXT UNIQUE NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, body TEXT NOT NULL,
     claimed INTEGER NOT NULL DEFAULT 0, rejected TEXT);
   CREATE INDEX outbox_context ON outbox(context_id,sequence);
   CREATE TABLE snapshots (id TEXT PRIMARY KEY, context_id TEXT NOT NULL REFERENCES contexts(id), categories TEXT NOT NULL,
     cursor INTEGER NOT NULL, head INTEGER NOT NULL, epoch INTEGER NOT NULL, local_revision INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE snapshot_records (snapshot_id TEXT NOT NULL REFERENCES snapshots(id), entity_type TEXT NOT NULL,
     entity_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(snapshot_id,entity_type,entity_id));
   CREATE TABLE recovery_copies (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, reason TEXT NOT NULL,
     created_at TEXT NOT NULL, body TEXT NOT NULL);`,
] as const;

export async function migrateMobileDatabase(db: SqlDatabase): Promise<void> {
  await db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000;');
  await db.exclusive(async tx => {
    const current = (await tx.first<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (current > MOBILE_SCHEMA_VERSION) throw new Error('Mobile database is newer than this app. Upgrade the app; downgrade is refused.');
    for (let index = current; index < MIGRATIONS.length; index++) {
      await tx.exec(MIGRATIONS[index]);
      await tx.exec(`PRAGMA user_version=${index + 1}`);
    }
    const integrity = await tx.first<{ quick_check: string }>('PRAGMA quick_check');
    if (integrity?.quick_check !== 'ok') throw new Error('Mobile database integrity check failed. Preserve storage and use recovery.');
  });
}
