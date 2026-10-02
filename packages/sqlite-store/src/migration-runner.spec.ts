import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations, MigrationChecksumError } from './migration-runner.js';
import type { Migration } from './migrations.js';
import { checksumOf, latestVersion } from './migrations.js';
import { openSqliteDatabase, quickCheck } from './open.js';
import { allRows, getMeta, getRow, setMeta, transaction } from './sqlite.js';

const dirs: string[] = [];
const tempDir = (): string => { const d = mkdtempSync(path.join(os.tmpdir(), 'dude-sqlite-store-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const MIGRATIONS: readonly Migration[] = [{
  version: 1,
  name: 'initial',
  minReaderVersion: 1,
  sql: `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;`,
}];

const v2Ok: Migration = { version: 2, name: 'add-x', minReaderVersion: 1, sql: 'CREATE TABLE x (a INTEGER) STRICT;' };
const opts = (dir: string, i = 0) => ({ backupDir: path.join(dir, 'backups'), now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
const version = (db: DatabaseSync) => (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value;

describe('runMigrations', () => {
  it('takes a fresh store to v1 without a backup, and a rerun is a no-op', () => {
    const dir = tempDir();
    const db = new DatabaseSync(path.join(dir, 's.db'));
    expect(runMigrations(db, MIGRATIONS, opts(dir))).toEqual({ status: 'ready', from: 0, to: 1 });
    expect(version(db)).toBe('1');
    expect(existsSync(path.join(dir, 'backups'))).toBe(false);
    expect(runMigrations(db, MIGRATIONS, opts(dir))).toEqual({ status: 'ready', from: 1, to: 1 });
    db.close();
  });

  it('throws a typed error when an applied migration changed', () => {
    const dir = tempDir();
    const db = new DatabaseSync(path.join(dir, 's.db'));
    runMigrations(db, MIGRATIONS, opts(dir));
    const tampered = [{ ...MIGRATIONS[0], sql: MIGRATIONS[0].sql + '\n-- edited' }];
    expect(() => runMigrations(db, tampered, opts(dir))).toThrow(MigrationChecksumError);
    db.close();
  });

  it('backs up before an upgrade and keeps at most three backups', () => {
    const dir = tempDir();
    const db = new DatabaseSync(path.join(dir, 's.db'));
    runMigrations(db, MIGRATIONS, opts(dir));
    let chain: Migration[] = [...MIGRATIONS];
    for (let v = 2; v <= 6; v++) {
      chain = [...chain, { version: v, name: `t${v}`, minReaderVersion: 1, sql: `CREATE TABLE t${v} (a INTEGER) STRICT;` }];
      expect(runMigrations(db, chain, opts(dir, v)).status).toBe('ready');
    }
    expect(version(db)).toBe('6');
    const backups = readdirSync(path.join(dir, 'backups'));
    expect(backups.length).toBe(3);
    expect(backups.some((f) => f.startsWith('pre-v5-'))).toBe(true);
    expect(backups.some((f) => f.startsWith('pre-v1-'))).toBe(false);
    db.close();
  });

  it('leaves v1 plus a backup when a step fails, and a corrected rerun completes', () => {
    const dir = tempDir();
    const db = new DatabaseSync(path.join(dir, 's.db'));
    runMigrations(db, MIGRATIONS, opts(dir));
    const broken: Migration = { ...v2Ok, sql: 'CREATE TABLE y (a INTEGER) STRICT; INSERT INTO nope VALUES (1);' };
    expect(() => runMigrations(db, [...MIGRATIONS, broken], opts(dir, 1))).toThrow();
    expect(version(db)).toBe('1');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'y'").get()).toBeUndefined();
    expect(readdirSync(path.join(dir, 'backups')).length).toBe(1);
    expect(runMigrations(db, [...MIGRATIONS, v2Ok], opts(dir, 2))).toMatchObject({ status: 'ready', from: 1, to: 2 });
    expect(version(db)).toBe('2');
    db.close();
  });

  it('refuses a store whose minReaderVersion is newer and does not touch it', () => {
    const dir = tempDir();
    const db = new DatabaseSync(path.join(dir, 's.db'));
    runMigrations(db, MIGRATIONS, opts(dir));
    db.exec("UPDATE meta SET value = '99' WHERE key = 'min_reader_version'");
    const before = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get();
    const result = runMigrations(db, [...MIGRATIONS, v2Ok], opts(dir));
    expect(result).toEqual({ status: 'incompatible', storeVersion: 1, minReaderVersion: 99, supported: 2 });
    expect(version(db)).toBe('1');
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual(before);
    expect(existsSync(path.join(dir, 'backups'))).toBe(false);
    db.close();
  });
});

describe('sqlite helpers', () => {
  it('openSqliteDatabase applies pragmas and quickCheck passes', () => {
    const dir = tempDir();
    const db = openSqliteDatabase(path.join(dir, 's.db'));
    expect(getRow<{ journal_mode: string }>(db.prepare('PRAGMA journal_mode'))?.journal_mode).toBe('wal');
    expect(getRow<{ foreign_keys: number }>(db.prepare('PRAGMA foreign_keys'))?.foreign_keys).toBe(1);
    expect(getRow<{ timeout: number }>(db.prepare('PRAGMA busy_timeout'))?.timeout).toBe(5000);
    expect(quickCheck(db)).toBe(true);
    db.close();
  });

  it('transaction commits, rolls back on throw and nests inline', () => {
    const dir = tempDir();
    const db = openSqliteDatabase(path.join(dir, 's.db'));
    runMigrations(db, MIGRATIONS, opts(dir));
    transaction(db, () => { setMeta(db, 'a', '1'); transaction(db, () => setMeta(db, 'b', '2')); });
    expect(getMeta(db, 'b')).toBe('2');
    expect(() => transaction(db, () => { setMeta(db, 'c', '3'); throw new Error('boom'); })).toThrow('boom');
    expect(getMeta(db, 'c')).toBeUndefined();
    expect(allRows<{ key: string }>(db.prepare("SELECT key FROM meta WHERE key IN ('a','b') ORDER BY key")).map((r) => r.key)).toEqual(['a', 'b']);
    db.close();
  });

  it('checksumOf is stable and latestVersion takes the maximum', () => {
    expect(checksumOf(MIGRATIONS[0])).toBe(checksumOf({ ...MIGRATIONS[0] }));
    expect(latestVersion([])).toBe(0);
    expect(latestVersion([...MIGRATIONS, { version: 4, name: 'x', minReaderVersion: 1, sql: '' }])).toBe(4);
  });
});
