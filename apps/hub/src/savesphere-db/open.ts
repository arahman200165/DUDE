import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { getMeta, lockExtensionLoading, openSqliteDatabase, quickCheck, runMigrations, setMeta } from '@dude/sqlite-store';
import type { Db, Migration } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import { SAVESPHERE_MIGRATIONS } from './migrations/index.js';

export interface OpenSaveSphereDbOptions {
  migrations?: readonly Migration[];
  now?: () => Date;
  /**
   * Opens the connection with extension loading enabled (default false). Only the vector component asks; it loads its one
   * hash-verified library and then calls `SaveSphereDb.lockExtensions`.
   */
  allowExtension?: boolean;
}

export interface SaveSphereDb {
  db: Db;
  /** Turns extension loading off again once the one verified library is loaded. A no-op for a default connection. */
  lockExtensions(): void;
  close(): void;
}

export type OpenSaveSphereDbResult =
  | { status: 'ready'; store: SaveSphereDb }
  | { status: 'incompatible'; message: string; path: string }
  | { status: 'corrupt'; message: string; path: string };

/**
 * Opens (creating if needed) `data/savesphere.db`: WAL, synchronous=FULL, foreign keys, busy timeout, quick-check, then its own
 * numbered migrations with a pre-migration `VACUUM INTO` copy and the `minReaderVersion` fence. Pure `node:sqlite`, so it works
 * on Windows, Linux and the Docker image. This is only the open path: provisioning (Milestone 835) decides when it is called.
 */
export function openSaveSphereDb(
  paths: Pick<HubPaths, 'saveSphereDbPath' | 'saveSpherePreMigrationDir'>,
  options: OpenSaveSphereDbOptions = {},
): OpenSaveSphereDbResult {
  const now = options.now ?? (() => new Date());
  const file = paths.saveSphereDbPath;
  mkdirSync(path.dirname(file), { recursive: true });
  let db: Db | undefined;
  try {
    db = openSqliteDatabase(file, { allowExtension: options.allowExtension === true });
    if (!quickCheck(db)) {
      db.close();
      return { status: 'corrupt', message: 'The SaveSphere database failed its integrity check.', path: file };
    }
  } catch (error) {
    try { db?.close(); } catch { /* ignore */ }
    return { status: 'corrupt', message: `The SaveSphere database could not be opened: ${(error as Error).message}`, path: file };
  }

  let migrated;
  try {
    migrated = runMigrations(db, options.migrations ?? SAVESPHERE_MIGRATIONS, { backupDir: paths.saveSpherePreMigrationDir, now });
  } catch (error) {
    db.close();
    return { status: 'corrupt', message: `The SaveSphere database could not be migrated: ${(error as Error).message}`, path: file };
  }
  if (migrated.status === 'incompatible') {
    db.close();
    return {
      status: 'incompatible',
      message: `The SaveSphere database needs a newer DUDE Hub (database requires reader ${migrated.minReaderVersion}, this build supports ${migrated.supported}).`,
      path: file,
    };
  }

  if (!getMeta(db, 'created_at')) setMeta(db, 'created_at', now().toISOString());
  const open = db;
  return {
    status: 'ready',
    store: {
      db: open,
      lockExtensions: () => { if (options.allowExtension === true) lockExtensionLoading(open); },
      close: () => { try { open.close(); } catch { /* already closed */ } },
    },
  };
}
