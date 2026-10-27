import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta, latestVersion } from '@dude/sqlite-store';
import { COLLAB_DOC_KINDS } from '@dude/collab-doc';
import { COLLAB_WIRE_DOC_KINDS } from '@dude/contracts/hub';
import { openHubDb } from '../open-hub-db.js';
import { HUB_MIGRATIONS } from './index.js';
import { migration0010 } from './0010-collab.js';

function dirs() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-0010-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
}

describe('migration 0010 collab', () => {
  it('is registered tenth and raises the reader floor to its own version', () => {
    expect(HUB_MIGRATIONS[9]).toBe(migration0010);
    expect(migration0010).toMatchObject({ version: 10, name: 'collab', minReaderVersion: 10 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(migration0010)).toBe('5bd003dac480a907956dc200ff9e209fadc385f36898f67ed96f95461805b4c7');
  });

  it('adds the four tables to a populated version-9 database, raises the floor and is a no-op on reopen', () => {
    const options = dirs();
    const v9 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 9) });
    if (v9.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(v9.hub.db, 'min_reader_version')).toBe('1');
    v9.hub.db.exec("INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'E', 't')");
    v9.hub.close();

    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('12');
    expect(getMeta(db, 'min_reader_version')).toBe('10');
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'collab_%'").all() as Array<{ name: string }>).map((r) => r.name).sort();
    expect(tables).toEqual(['collab_bases', 'collab_docs', 'collab_snapshots', 'collab_updates']);
    db.exec("INSERT INTO collab_docs(doc_key, kind, entity_type, entity_id, state, bytes, created_at, updated_at, last_opened_at) VALUES ('scratchpad:default', 'scratchpad', 'scratchpad', 'default', x'00', 1, 't', 't', 't')");
    expect(db.prepare('SELECT materialized_revision FROM collab_docs').all()).toEqual([{ materialized_revision: null }]);
    db.exec("INSERT INTO collab_updates(doc_key, update_blob, at) VALUES ('scratchpad:default', x'01', 't'), ('scratchpad:default', x'02', 't')");
    expect(db.prepare('SELECT seq FROM collab_updates ORDER BY seq').all()).toEqual([{ seq: 1 }, { seq: 2 }]);
    db.exec("INSERT INTO collab_bases(doc_key, revision, payload_json, at) VALUES ('scratchpad:default', 3, '{}', 't')");
    expect(() => db.exec("INSERT INTO collab_bases(doc_key, revision, payload_json, at) VALUES ('scratchpad:default', 3, '{}', 't')")).toThrow();
    db.exec("INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES ('s1', 'scratchpad:default', 't', '{}', 2)");
    upgraded.hub.close();

    const again = openHubDb(options);
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 10').get()).toEqual({ n: 1 });
    expect(again.hub.db.prepare('SELECT checksum FROM schema_migrations WHERE version = 10').get()).toEqual({ checksum: checksumOf(migration0010) });
    again.hub.close();
  });

  it('makes a Hub that predates it refuse the database', () => {
    const options = dirs();
    const current = openHubDb(options);
    if (current.status !== 'ready') throw new Error('expected ready');
    current.hub.close();
    const older = HUB_MIGRATIONS.slice(0, 9);
    expect(latestVersion(older)).toBe(9);
    const refused = openHubDb({ ...options, migrations: older });
    expect(refused).toMatchObject({ status: 'incompatible' });
  });
});

describe('collaboration wire document kinds', () => {
  it('match the portable COLLAB_DOC_KINDS', () => {
    expect([...COLLAB_WIRE_DOC_KINDS]).toEqual([...COLLAB_DOC_KINDS]);
  });
});
