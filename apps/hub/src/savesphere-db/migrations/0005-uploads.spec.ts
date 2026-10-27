import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { hubPaths } from '../../config/data-dir.js';
import { openSaveSphereDb } from '../open.js';
import { SAVESPHERE_MIGRATIONS } from './index.js';
import { saveSphereMigration0005 } from './0005-uploads.js';

describe('savesphere.db migration 0005 uploads', () => {
  it('is registered fifth and floors the reader at 5', () => {
    expect(SAVESPHERE_MIGRATIONS[4]).toBe(saveSphereMigration0005);
    expect(saveSphereMigration0005).toMatchObject({ version: 5, name: 'uploads', minReaderVersion: 5 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(saveSphereMigration0005)).toBe('991999d0cdafeaac1fdcb0897e0b09a67b1388ca9e5d3488f10a05847d801b8b');
  });

  it('upgrades a store at version 4 and an older Hub refuses the upgraded database', () => {
    const paths = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0005-')));
    const before = openSaveSphereDb(paths, { migrations: SAVESPHERE_MIGRATIONS.slice(0, 4) });
    if (before.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(before.store.db, 'schema_version')).toBe('4');
    before.store.close();
    const after = openSaveSphereDb(paths);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(after.store.db, 'schema_version')).toBe('5');
    expect(getMeta(after.store.db, 'min_reader_version')).toBe('5');
    after.store.close();
    expect(openSaveSphereDb(paths, { migrations: SAVESPHERE_MIGRATIONS.slice(0, 4) }).status).toBe('incompatible');
  });

  it('constrains sessions and chunks, and cascades a session delete to its chunks', () => {
    const opened = openSaveSphereDb(hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0005-'))));
    if (opened.status !== 'ready') throw new Error('expected ready');
    const { db } = opened.store;
    const insert = (id: string, state = 'open', size = 10, sha: string | null = null, chunkSize = 5, count = 2) =>
      db.prepare("INSERT INTO uploads(id, state, declared_size, declared_sha256, chunk_size, chunk_count, principal_kind, principal_id, created_at, updated_at, expires_at) VALUES(?, ?, ?, ?, ?, ?, 'owner', 'o', 0, 0, 0)").run(id, state, size, sha, chunkSize, count);
    insert('a');
    expect(() => insert('b', 'weird')).toThrow();
    expect(() => insert('c', 'open', 0)).toThrow();
    expect(() => insert('d', 'open', 10, 'ABC')).toThrow();
    expect(() => insert('e', 'open', 10, 'g'.repeat(64))).toThrow();
    expect(() => insert('f', 'open', 10, null, 0)).toThrow();
    const chunk = (id: string, idx: number, size = 5, sha = 'a'.repeat(64)) => db.prepare('INSERT INTO upload_chunks(upload_id, idx, size, sha256, received_at) VALUES(?, ?, ?, ?, 0)').run(id, idx, size, sha);
    chunk('a', 0);
    expect(() => chunk('a', 0)).toThrow(); // primary key
    expect(() => chunk('missing', 0)).toThrow(); // foreign key
    expect(() => chunk('a', -1)).toThrow();
    expect(() => chunk('a', 1, 0)).toThrow();
    db.prepare("DELETE FROM uploads WHERE id = 'a'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM upload_chunks').get()).toEqual({ n: 0 });
    opened.store.close();
  });
});
