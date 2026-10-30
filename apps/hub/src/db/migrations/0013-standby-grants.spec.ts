import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { openHubDb } from '../open-hub-db.js';
import { HUB_MIGRATIONS } from './index.js';
import { migration0013 } from './0013-standby-grants.js';

const dirs = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-0013-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
};

describe('migration 0013 standby-grants', () => {
  it('is registered thirteenth and is additive', () => {
    expect(HUB_MIGRATIONS[12]).toBe(migration0013);
    expect(migration0013).toMatchObject({ version: 13, name: 'standby-grants', minReaderVersion: 1 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(migration0013)).toBe('138b4c4059cc599b71d64b8e71b666071d3a62abeff1d836f5287d21cc24e077');
  });

  it('adds the grant table to a populated version-12 database, keeps its rows, enforces the device reference and is a no-op on reopen', () => {
    const options = dirs();
    const v12 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 12) });
    if (v12.status !== 'ready') throw new Error('expected ready');
    v12.hub.db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'E', 't');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('d1', 'env', 'PC', 'windows', '1', '[]', 0, 1, '2026-10-01T00:00:00.000Z');
`);
    v12.hub.close();

    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('13');
    expect(db.prepare('SELECT COUNT(*) AS n FROM devices').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM standby_grants').get()).toEqual({ n: 0 });
    db.exec("INSERT INTO standby_grants(device_id, device_registered_at, granted_at) VALUES ('d1', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z')");
    // One grant per device, and only for a device that exists (foreign keys are on).
    expect(() => db.exec("INSERT INTO standby_grants(device_id, device_registered_at, granted_at) VALUES ('d1', 'x', 'y')")).toThrow();
    expect(() => db.exec("INSERT INTO standby_grants(device_id, device_registered_at, granted_at) VALUES ('nobody', 'x', 'y')")).toThrow();
    expect(() => db.exec("INSERT INTO standby_grants(device_id, granted_at) VALUES ('d1', 'y')")).toThrow();
    upgraded.hub.close();

    const again = openHubDb(options);
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 13').get()).toEqual({ n: 1 });
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM standby_grants').get()).toEqual({ n: 1 });
    again.hub.close();
  });
});
