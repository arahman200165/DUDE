import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { openHubDb } from '../open-hub-db.js';
import { HUB_MIGRATIONS } from './index.js';
import { migration0009 } from './0009-notifications.js';

function dirs() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-0009-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
}

describe('migration 0009 notifications', () => {
  it('is registered, additive and readable by older readers', () => {
    expect(HUB_MIGRATIONS[8]).toBe(migration0009);
    expect(migration0009).toMatchObject({ version: 9, name: 'notifications', minReaderVersion: 1 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(migration0009)).toBe('83f64fcac717f3acb4ea2dc1a3d1f516e71da0b7f6f20462d19bb9b22748a2a4');
  });

  it('adds the table and the grant column to a populated version-8 database and is a no-op on reopen', () => {
    const options = dirs();
    const v8 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 8) });
    if (v8.status !== 'ready') throw new Error('expected ready');
    v8.hub.db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'E', 't');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('d1', 'env', 'PC', 'windows', '1', '[]', 0, 1, 't');
`);
    v8.hub.close();

    const upgraded = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 9) });
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('9');
    expect(getMeta(db, 'min_reader_version')).toBe('1');
    expect(db.prepare('SELECT notifications_access FROM devices').all()).toEqual([{ notifications_access: 0 }]);
    expect(() => db.exec("UPDATE devices SET notifications_access = 2")).toThrow();
    db.exec("INSERT INTO notifications(id, created_at, source_key, kind, severity, title, body) VALUES ('n1', 't', 'k1', 'backup-failed', 'error', 'T', 'B')");
    expect(db.prepare('SELECT read_at, dismissed_at FROM notifications').all()).toEqual([{ read_at: null, dismissed_at: null }]);
    expect(() => db.exec("INSERT INTO notifications(id, created_at, source_key, kind, severity, title, body) VALUES ('n2', 't', 'k1', 'backup-failed', 'error', 'T', 'B')")).toThrow();
    expect(() => db.exec("INSERT INTO notifications(id, created_at, source_key, kind, severity, title, body) VALUES ('n3', 't', 'k3', 'backup-failed', 'fatal', 'T', 'B')")).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 9').get()).toEqual({ n: 1 });
    upgraded.hub.close();

    const again = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 9) });
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 9').get()).toEqual({ n: 1 });
    expect(again.hub.db.prepare('SELECT checksum FROM schema_migrations WHERE version = 9').get()).toEqual({ checksum: checksumOf(migration0009) });
    again.hub.close();
  });
});
