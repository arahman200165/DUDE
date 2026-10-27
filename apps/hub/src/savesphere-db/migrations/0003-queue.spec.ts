import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { hubPaths } from '../../config/data-dir.js';
import { openSaveSphereDb } from '../open.js';
import { SAVESPHERE_MIGRATIONS } from './index.js';
import { saveSphereMigration0003 } from './0003-queue.js';

describe('savesphere.db migration 0003 queue', () => {
  it('is registered third and floors the reader at 3', () => {
    expect(SAVESPHERE_MIGRATIONS[2]).toBe(saveSphereMigration0003);
    expect(saveSphereMigration0003).toMatchObject({ version: 3, name: 'queue', minReaderVersion: 3 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(saveSphereMigration0003)).toBe('d4e451a16f5711e5126ae780fd25bcf78b2e0b3ee5de0d6c57163dd813a75c0f');
  });

  it('creates jobs with its constraints and a unique key among active jobs only', () => {
    const opened = openSaveSphereDb(hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-0003-'))), { migrations: SAVESPHERE_MIGRATIONS.slice(0, 3) });
    if (opened.status !== 'ready') throw new Error('expected ready');
    const { db } = opened.store;
    expect(getMeta(db, 'schema_version')).toBe('3');
    expect(getMeta(db, 'min_reader_version')).toBe('3');
    const insert = (id: string, state = 'queued', key: string | null = null, attempts = 0, max = 5) =>
      db.prepare('INSERT INTO jobs(id, kind, idempotency_key, state, attempts, max_attempts, run_after, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, 0, 0, 0)').run(id, 'noop.echo', key, state, attempts, max);
    expect(() => insert('a', 'weird')).toThrow();
    expect(() => insert('a', 'queued', null, -1)).toThrow();
    expect(() => insert('a', 'queued', null, 0, 0)).toThrow();
    insert('a', 'queued', 'k');
    expect(() => insert('b', 'running', 'k')).toThrow();
    db.prepare("UPDATE jobs SET state = 'succeeded' WHERE id = 'a'").run();
    insert('b', 'queued', 'k');
    insert('c');
    insert('d');
    opened.store.close();
  });
});
