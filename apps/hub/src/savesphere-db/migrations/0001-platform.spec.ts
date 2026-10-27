import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta, latestVersion } from '@dude/sqlite-store';
import type { Migration } from '@dude/sqlite-store';
import { hubPaths } from '../../config/data-dir.js';
import { openSaveSphereDb } from '../open.js';
import { SAVESPHERE_MIGRATIONS } from './index.js';
import { saveSphereMigration0001 } from './0001-platform.js';

function paths() {
  return hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0001-')));
}

const v2: Migration = { version: 2, name: 'later', minReaderVersion: 2, sql: 'CREATE TABLE later_content (id TEXT PRIMARY KEY) STRICT;' };

describe('savesphere.db migration 0001 platform', () => {
  it('is registered and floors the reader at its own version', () => {
    expect(SAVESPHERE_MIGRATIONS[0]).toBe(saveSphereMigration0001);
    expect(saveSphereMigration0001).toMatchObject({ version: 1, name: 'platform', minReaderVersion: 1 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(saveSphereMigration0001)).toBe('4e43a6221dc62d20014b2237ef1425916d5b85707a86eabdd18690cf0c9e652f');
  });

  it('creates only meta, schema_migrations and audit_outbox (as its own sequence) in data/savesphere.db, WAL and foreign keys on', () => {
    const p = paths();
    expect(p.saveSphereDbPath).toBe(path.join(p.dataDir, 'savesphere.db'));
    const opened = openSaveSphereDb(p, { migrations: [saveSphereMigration0001] });
    if (opened.status !== 'ready') throw new Error('expected ready');
    const { db } = opened.store;
    expect(existsSync(p.saveSphereDbPath)).toBe(true);
    expect(getMeta(db, 'schema_version')).toBe('1');
    expect(getMeta(db, 'min_reader_version')).toBe('1');
    expect(getMeta(db, 'created_at')).toBeTruthy();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables).toEqual(['audit_outbox', 'meta', 'schema_migrations']);
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(() => db.exec("INSERT INTO audit_outbox(event, outcome, actor_kind, payload_json, created_at, dedupe_key) VALUES ('a', 'success', 'system', '{}', 't', 'k'), ('a', 'success', 'system', '{}', 't', 'k')")).toThrow();
    // Extension loading is off unless the vector component asks for it.
    expect(() => (db as unknown as { loadExtension(file: string): void }).loadExtension(path.join(p.root, 'missing.dll'))).toThrow();
    opened.store.close();
  });

  it('is a no-op on reopen and takes a pre-migration copy of a populated store when upgrading', () => {
    const p = paths();
    const first = openSaveSphereDb(p, { migrations: [saveSphereMigration0001] });
    if (first.status !== 'ready') throw new Error('expected ready');
    first.store.close();

    const again = openSaveSphereDb(p, { migrations: [saveSphereMigration0001] });
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.store.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 1').get()).toEqual({ n: 1 });
    expect(existsSync(p.saveSpherePreMigrationDir)).toBe(false);
    again.store.close();

    const upgraded = openSaveSphereDb(p, { migrations: [saveSphereMigration0001, v2] });
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(upgraded.store.db, 'schema_version')).toBe('2');
    upgraded.store.close();
    // The copy sits in its own subdirectory, never beside the Hub database's pre-migration files.
    expect(readdirSync(p.saveSpherePreMigrationDir).filter((f) => /^pre-v1-.*\.db$/.test(f))).toHaveLength(1);
    expect(existsSync(p.preMigrationDir) ? readdirSync(p.preMigrationDir).filter((f) => f.endsWith('.db')) : []).toEqual([]);
  });

  it('makes a Hub that predates a raised reader floor refuse the store', () => {
    const p = paths();
    const newer = openSaveSphereDb(p, { migrations: [saveSphereMigration0001, v2] });
    if (newer.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(newer.store.db, 'min_reader_version')).toBe('2');
    newer.store.close();
    expect(latestVersion([saveSphereMigration0001])).toBe(1);
    const refused = openSaveSphereDb(p, { migrations: [saveSphereMigration0001] });
    expect(refused).toMatchObject({ status: 'incompatible', path: p.saveSphereDbPath });
  });

  it('refuses a store whose applied migration was edited (checksum mismatch)', () => {
    const p = paths();
    const first = openSaveSphereDb(p, { migrations: [saveSphereMigration0001] });
    if (first.status !== 'ready') throw new Error('expected ready');
    first.store.db.exec("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1");
    first.store.close();
    expect(openSaveSphereDb(p, { migrations: [saveSphereMigration0001] })).toMatchObject({ status: 'corrupt' });
  });
});
