import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { hubPaths } from '../../config/data-dir.js';
import { openSaveSphereDb } from '../open.js';
import { SAVESPHERE_MIGRATIONS } from './index.js';
import { saveSphereMigration0004 } from './0004-ingest-tokens.js';

describe('savesphere.db migration 0004 ingest tokens', () => {
  it('is registered fourth and floors the reader at 4', () => {
    expect(SAVESPHERE_MIGRATIONS[3]).toBe(saveSphereMigration0004);
    expect(saveSphereMigration0004).toMatchObject({ version: 4, name: 'ingest-tokens', minReaderVersion: 4 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(saveSphereMigration0004)).toBe('d82a5ba57125ba1d2571a14a3fb51b2ebc135cdef3b117dddedbff5cce8113ed');
  });

  it('upgrades a store at version 3 without touching its other tables', () => {
    const paths = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0004-')));
    const before = openSaveSphereDb(paths, { migrations: SAVESPHERE_MIGRATIONS.slice(0, 3) });
    if (before.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(before.store.db, 'schema_version')).toBe('3');
    before.store.close();
    const after = openSaveSphereDb(paths, { migrations: SAVESPHERE_MIGRATIONS.slice(0, 4) });
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(after.store.db, 'schema_version')).toBe('4');
    expect(getMeta(after.store.db, 'min_reader_version')).toBe('4');
    after.store.close();
    // An older Hub (which supports up to version 3) refuses the upgraded database rather than guessing.
    const older = openSaveSphereDb(paths, { migrations: SAVESPHERE_MIGRATIONS.slice(0, 3) });
    expect(older.status).toBe('incompatible');
  });

  it('creates ingest_tokens with its constraints: a 64-character unique hash, a bounded label, strict types', () => {
    const opened = openSaveSphereDb(hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0004-'))));
    if (opened.status !== 'ready') throw new Error('expected ready');
    const { db } = opened.store;
    const columns = (db.prepare('PRAGMA table_info(ingest_tokens)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(['id', 'label', 'token_hash', 'prefix', 'scopes_json', 'created_at', 'last_used_at', 'expires_at', 'revoked_at', 'created_by']);
    const hash = (c: string) => c.repeat(64);
    const insert = (id: string, label: string, tokenHash: string) =>
      db.prepare('INSERT INTO ingest_tokens(id, label, token_hash, prefix, scopes_json, created_at, created_by) VALUES(?, ?, ?, ?, ?, 0, ?)').run(id, label, tokenHash, 'dit_abcdef', '["ingest:ping"]', 'owner');
    insert('a', 'ok', hash('a'));
    expect(() => insert('b', 'ok', hash('a'))).toThrow(); // unique hash
    expect(() => insert('c', 'ok', 'short')).toThrow(); // not a SHA-256 hex
    expect(() => insert('d', '', hash('d'))).toThrow(); // empty label
    expect(() => insert('e', 'x'.repeat(65), hash('e'))).toThrow(); // label too long
    expect(() => db.prepare("INSERT INTO ingest_tokens(id, label, token_hash, prefix, scopes_json, created_at, created_by) VALUES('f', 'ok', ?, 'p', '[]', 'not a number', 'owner')").run(hash('f'))).toThrow(); // STRICT
    opened.store.close();
  });
});
