import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { getMeta, openSqliteDatabase, quickCheck, runMigrations, setMeta } from '@dude/sqlite-store';
import type { Db, Migration } from '@dude/sqlite-store';
import { newId } from '../util/ids.js';
import { HUB_MIGRATIONS } from './migrations/index.js';

export interface OpenHubDbOptions {
  dbFile: string;
  /** Pre-upgrade VACUUM INTO copies go here (`data/pre-migration`). */
  preMigrationDir: string;
  migrations?: readonly Migration[];
  now?: () => Date;
}

export interface HubDb {
  db: Db;
  hubInstanceId: string;
  close(): void;
}

export type OpenHubDbResult =
  | { status: 'ready'; hub: HubDb }
  | { status: 'incompatible'; message: string; path: string }
  | { status: 'corrupt'; message: string; path: string };

export function openHubDb(options: OpenHubDbOptions): OpenHubDbResult {
  const now = options.now ?? (() => new Date());
  mkdirSync(path.dirname(options.dbFile), { recursive: true });
  let db: Db | undefined;
  try {
    db = openSqliteDatabase(options.dbFile);
    if (!quickCheck(db)) {
      db.close();
      return { status: 'corrupt', message: 'The Hub database failed its integrity check.', path: options.dbFile };
    }
  } catch (error) {
    try { db?.close(); } catch { /* ignore */ }
    return { status: 'corrupt', message: `The Hub database could not be opened: ${(error as Error).message}`, path: options.dbFile };
  }

  let migrated;
  try {
    migrated = runMigrations(db, options.migrations ?? HUB_MIGRATIONS, { backupDir: options.preMigrationDir, now });
  } catch (error) {
    db.close();
    return { status: 'corrupt', message: `The Hub database could not be migrated: ${(error as Error).message}`, path: options.dbFile };
  }
  if (migrated.status === 'incompatible') {
    db.close();
    return {
      status: 'incompatible',
      message: `The Hub database needs a newer DUDE Hub (database requires reader ${migrated.minReaderVersion}, this build supports ${migrated.supported}).`,
      path: options.dbFile,
    };
  }

  let hubInstanceId = getMeta(db, 'hub_instance_id');
  if (!hubInstanceId) {
    hubInstanceId = newId();
    setMeta(db, 'hub_instance_id', hubInstanceId);
  }
  if (!getMeta(db, 'created_at')) setMeta(db, 'created_at', now().toISOString());
  const open = db;
  return { status: 'ready', hub: { db: open, hubInstanceId, close: () => { try { open.close(); } catch { /* already closed */ } } } };
}
