import { mkdirSync, existsSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { DeviceCapabilities, DeviceRecord } from '@dude/persistence';
import type { StoreHealth } from '@dude/contracts';
import { OUTBOX_MAX_ROWS } from '@dude/sync';
import { MIGRATIONS } from './migrations/index.js';
import type { Migration } from './migrations/index.js';
import { runMigrations } from './migration-runner.js';
import { ensureIdentity } from './identity.js';
import type { AppInfo } from './identity.js';
import type { Db } from './sqlite.js';
import { getMeta } from './sqlite.js';
import { outboxSummary } from './repos/outbox.repo.js';

export const DB_FILE = 'dude-device.db';

export interface OpenStoreOptions {
  dir: string;
  migrations?: readonly Migration[];
  machineGuid: string | null;
  appInfo: AppInfo;
  capabilities: DeviceCapabilities;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export interface DeviceStore {
  db: Db;
  dir: string;
  device: DeviceRecord;
  health(): StoreHealth;
  close(): void;
}

export type OpenStoreResult =
  | { status: 'ready'; store: DeviceStore; health: StoreHealth }
  | { status: 'incompatible' | 'corrupt'; message: string; path: string };

export function openDeviceStore(options: OpenStoreOptions): OpenStoreResult {
  mkdirSync(options.dir, { recursive: true });
  const file = path.join(options.dir, DB_FILE);
  let db: Db | undefined;
  try {
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    const check = db.prepare('PRAGMA quick_check').all() as Array<Record<string, unknown>>;
    const ok = check.length === 1 && Object.values(check[0])[0] === 'ok';
    if (!ok) {
      db.close();
      return { status: 'corrupt', message: 'The device store failed its integrity check.', path: file };
    }
  } catch (error) {
    try { db?.close(); } catch { /* ignore */ }
    return { status: 'corrupt', message: `The device store could not be opened: ${(error as Error).message}`, path: file };
  }

  const migrated = runMigrations(db, options.migrations ?? MIGRATIONS, { backupDir: path.join(options.dir, 'backups'), now: options.now });
  if (migrated.status === 'incompatible') {
    db.close();
    return {
      status: 'incompatible',
      message: `The device store needs a newer DUDE (store requires reader ${migrated.minReaderVersion}, this build supports ${migrated.supported}).`,
      path: file,
    };
  }

  const device = ensureIdentity(db, options);
  const store: DeviceStore = {
    db,
    dir: options.dir,
    device,
    health: () => healthOf(db, file),
    close: () => { try { db.close(); } catch { /* already closed */ } },
  };
  return { status: 'ready', store, health: store.health() };
}

function healthOf(db: Db, file: string): StoreHealth {
  let sizeBytes = 0;
  try { sizeBytes = statSync(file).size; } catch { /* ignore */ }
  const summary = outboxSummary(db);
  return {
    status: 'ready',
    schemaVersion: Number(getMeta(db, 'schema_version')) || 0,
    minReaderVersion: Number(getMeta(db, 'min_reader_version')) || 0,
    sizeBytes,
    outbox: { pending: summary.pending, maxRows: summary.maxRows || OUTBOX_MAX_ROWS, backpressure: summary.backpressure },
    legacyImport: (getMeta(db, 'legacy_import') as StoreHealth['legacyImport'] | undefined) ?? 'none',
  };
}

/** Move the database and its WAL/SHM files to `<dir>/quarantine/<ts>/`. Returns the quarantine directory. */
export function quarantineStore(dir: string, now: Date): string {
  const target = path.join(dir, 'quarantine', now.toISOString().replace(/[:.]/g, '-'));
  mkdirSync(target, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const source = path.join(dir, DB_FILE + suffix);
    if (existsSync(source)) renameSync(source, path.join(target, DB_FILE + suffix));
  }
  return target;
}
