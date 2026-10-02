import { existsSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations, MigrationChecksumError } from './migration-runner.js';
import { MIGRATIONS } from './migrations/index.js';
import type { Migration } from './migrations/index.js';
import { cleanupTemp, tempDir } from '../testing/test-utils.js';

afterEach(cleanupTemp);

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
