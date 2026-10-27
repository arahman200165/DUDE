import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { hubPaths } from '../../config/data-dir.js';
import { openSaveSphereDb } from '../open.js';
import { SAVESPHERE_MIGRATIONS } from './index.js';
import { saveSphereMigration0002 } from './0002-blobs.js';

const HASH = 'a'.repeat(64);

describe('savesphere.db migration 0002 blobs', () => {
  it('is registered second and floors the reader at 2', () => {
    expect(SAVESPHERE_MIGRATIONS[1]).toBe(saveSphereMigration0002);
    expect(saveSphereMigration0002).toMatchObject({ version: 2, name: 'blobs', minReaderVersion: 2 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(saveSphereMigration0002)).toBe('9871d12d2e831c469ea915b65d033887c2cacb95a8579d76691c17d70acbf760');
  });

  it('creates blobs and blob_refs and enforces their constraints', () => {
    const opened = openSaveSphereDb(hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0002-'))), { migrations: SAVESPHERE_MIGRATIONS.slice(0, 2) });
    if (opened.status !== 'ready') throw new Error('expected ready');
    const { db } = opened.store;
    expect(getMeta(db, 'schema_version')).toBe('2');
    expect(getMeta(db, 'min_reader_version')).toBe('2');
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables).toEqual(['audit_outbox', 'blob_refs', 'blobs', 'meta', 'schema_migrations']);
    const insert = (sha: string, size = 1, state = 'ok') => db.prepare('INSERT INTO blobs(sha256, size, created_at, state) VALUES(?, ?, ?, ?)').run(sha, size, 't', state);
    expect(() => insert('../etc/passwd')).toThrow();
    expect(() => insert('A'.repeat(64))).toThrow();
    expect(() => insert(HASH, -1)).toThrow();
    expect(() => insert(HASH, 1, 'weird')).toThrow();
    insert(HASH);
    expect(() => insert(HASH)).toThrow();
    const ref = (sha: string, id = 'x') => db.prepare("INSERT INTO blob_refs(blob_sha256, owner_kind, owner_id, created_at) VALUES(?, 'attachment', ?, 't')").run(sha, id);
    expect(() => ref('b'.repeat(64))).toThrow();
    ref(HASH);
    expect(() => ref(HASH)).toThrow();
    ref(HASH, 'y');
    // A referenced blob cannot be deleted from the catalogue.
    expect(() => db.prepare('DELETE FROM blobs WHERE sha256 = ?').run(HASH)).toThrow();
    opened.store.close();
  });
});
