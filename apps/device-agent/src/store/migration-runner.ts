import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './sqlite.js';
import { transaction } from './sqlite.js';
import { checksumOf, latestVersion } from './migrations/index.js';
import type { Migration } from './migrations/index.js';

export type MigrationResult =
  | { status: 'ready'; from: number; to: number; backupPath?: string }
  | { status: 'incompatible'; storeVersion: number; minReaderVersion: number; supported: number };

export class MigrationChecksumError extends Error {
  constructor(readonly version: number, readonly expected: string, readonly actual: string) {
    super(`Migration ${version} was changed after it was applied (checksum mismatch).`);
    this.name = 'MigrationChecksumError';
  }
}

export interface MigrationOptions {
  backupDir: string;
  now: () => Date;
  keepBackups?: number;
}

const BACKUP_RE = /^pre-v\d+-.*\.db$/;

function readMeta(db: Db, key: string): number {
  // `meta` does not exist on a fresh store.
  const exists = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  if (!exists) return 0;
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}

export function runMigrations(db: Db, migrations: readonly Migration[], options: MigrationOptions): MigrationResult {
  const keep = options.keepBackups ?? 3;
  const supported = latestVersion(migrations);
  const current = readMeta(db, 'schema_version');
  const minReader = readMeta(db, 'min_reader_version');
  if (minReader > supported) return { status: 'incompatible', storeVersion: current, minReaderVersion: minReader, supported };

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  if (current > 0) {
    const rows = db.prepare('SELECT version, checksum FROM schema_migrations').all() as Array<{ version: number; checksum: string }>;
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));
    for (const m of sorted) {
      const stored = applied.get(m.version);
      if (stored !== undefined && stored !== checksumOf(m)) throw new MigrationChecksumError(m.version, stored, checksumOf(m));
    }
  }

  const pending = sorted.filter((m) => m.version > current);
  if (pending.length === 0) return { status: 'ready', from: current, to: current };

  let backupPath: string | undefined;
  if (current > 0) {
    mkdirSync(options.backupDir, { recursive: true });
    const stamp = options.now().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(options.backupDir, `pre-v${current}-${stamp}.db`);
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    pruneBackups(options.backupDir, keep);
  }

  for (const m of pending) {
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES(?, ?, ?, ?)')
        .run(m.version, m.name, checksumOf(m), options.now().toISOString());
      const upsert = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      upsert.run('schema_version', String(m.version));
      upsert.run('min_reader_version', String(Math.max(m.minReaderVersion, minReader)));
    });
  }
  return { status: 'ready', from: current, to: sorted[sorted.length - 1].version, ...(backupPath ? { backupPath } : {}) };
}

const stampOf = (name: string): string => name.replace(/^pre-v\d+-/, '');

function pruneBackups(dir: string, keep: number): void {
  const files = readdirSync(dir).filter((f) => BACKUP_RE.test(f)).sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(path.join(dir, f), { force: true });
}
