import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { openHubDb } from '../open-hub-db.js';
import { HUB_MIGRATIONS } from './index.js';
import { migration0008 } from './0008-device-repair.js';

function dirs() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-0008-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
}

describe('migration 0008 device-repair', () => {
  it('is registered last, additive and readable by older readers', () => {
    expect(HUB_MIGRATIONS[HUB_MIGRATIONS.length - 1]).toBe(migration0008);
    expect(migration0008).toMatchObject({ version: 8, name: 'device-repair', minReaderVersion: 1 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(migration0008)).toBe('89c8dfeb3dc31236bdf5a075101f727497e0de24edadc3096cb1e0f9cfa7b039');
  });

  it('adds the columns with safe defaults to a populated version-7 database and is a no-op on reopen', () => {
    const options = dirs();
    const v7 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 7) });
    if (v7.status !== 'ready') throw new Error('expected ready');
    v7.hub.db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'E', 't');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('d1', 'env', 'PC', 'windows', '1', '[]', 0, 1, 't');
INSERT INTO pairing_codes(code_hash, created_by_session_hash, created_at, expires_at) VALUES ('c1', 's', 't', 't');
`);
    v7.hub.close();

    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('8');
    expect(getMeta(db, 'min_reader_version')).toBe('1');
    expect(db.prepare('SELECT needs_re_pair FROM devices').all()).toEqual([{ needs_re_pair: 0 }]);
    expect(db.prepare('SELECT reattach_device_id FROM pairing_codes').all()).toEqual([{ reattach_device_id: null }]);
    expect(() => db.exec("UPDATE devices SET needs_re_pair = 2")).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 8').get()).toEqual({ n: 1 });
    upgraded.hub.close();

    const again = openHubDb(options);
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 8').get()).toEqual({ n: 1 });
    expect(again.hub.db.prepare('SELECT checksum FROM schema_migrations WHERE version = 8').get()).toEqual({ checksum: checksumOf(migration0008) });
    again.hub.close();
  });
});
