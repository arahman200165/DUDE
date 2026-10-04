import { mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Migration } from '@dude/sqlite-store';
import { openHubDb } from './open-hub-db.js';
import { HUB_MIGRATIONS } from './migrations/index.js';

const EXPECTED_TABLES = [
  'meta', 'schema_migrations', 'environment', 'owner', 'owner_credentials', 'recovery_codes', 'sessions', 'devices', 'device_keys',
  'device_tokens', 'challenges', 'pairing_codes', 'setup_state', 'throttle', 'audit_events', 'tls_pins', 'tls_pin_acks', 'records',
  'change_feed', 'applied_ops', 'device_sync_state', 'tls_proxy_pins', 'tls_proxy_pin_acks', 'web_access',
];

function dirs() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-db-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
}

describe('openHubDb', () => {
  it('migrates a fresh database and keeps the instance id stable', () => {
    const options = dirs();
    const first = openHubDb(options);
    if (first.status !== 'ready') throw new Error('expected ready');
    const { db, hubInstanceId } = first.hub;
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name);
    for (const table of EXPECTED_TABLES) expect(tables).toContain(table);
    const strict = db.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND name NOT LIKE 'sqlite_%' AND strict = 0").all();
    expect(strict).toEqual([]);
    expect(Object.values(db.prepare('PRAGMA journal_mode').get() as object)[0]).toBe('wal');
    expect(Object.values(db.prepare('PRAGMA foreign_keys').get() as object)[0]).toBe(1);
    expect(hubInstanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(getMeta(db, 'created_at')).toBeTruthy();
    expect(getMeta(db, 'schema_version')).toBe('6');
    first.hub.close();
    expect(readdirSync(options.preMigrationDir.replace(/pre-migration$/, '')).includes('pre-migration')).toBe(false);

    const second = openHubDb(options);
    if (second.status !== 'ready') throw new Error('expected ready');
    expect(second.hub.hubInstanceId).toBe(hubInstanceId);
    second.hub.close();
  });

  it('applies migrations 0003 to 0005 onto an existing version-2 database', () => {
    const options = dirs();
    const v2 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 2) });
    if (v2.status !== 'ready') throw new Error('expected ready');
    expect(getMeta(v2.hub.db, 'schema_version')).toBe('2');
    v2.hub.close();
    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('6');
    expect(getMeta(db, 'min_reader_version')).toBe('1');
    expect(getMeta(db, 'sync_floor')).toBe('0');
    expect(getMeta(db, 'sync_retention_days')).toBe('90');
    expect(db.prepare("SELECT 1 AS x FROM sqlite_master WHERE name = 'records_environment_revision'").get()).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) AS n FROM device_sync_state').get()).toEqual({ n: 0 });
    upgraded.hub.close();
  });

  it('migration 0005 keeps populated devices and sessions and adds the browser columns', () => {
    const options = dirs();
    const v4 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 4) });
    if (v4.status !== 'ready') throw new Error('expected ready');
    const old = v4.hub.db;
    old.prepare("INSERT INTO environment(environment_id, display_name, created_at) VALUES('env', 'E', 't')").run();
    old.prepare("INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES('o', 'env', 'O', 't')").run();
    old.prepare(
      `INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
       VALUES('d1', 'env', 'PC', 'windows', '1', '[]', 0, 1, 't')`,
    ).run();
    old.prepare("INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at) VALUES('k1', 'd1', 'ed25519', x'00', 't')").run();
    old.prepare(
      `INSERT INTO sessions(session_hash, owner_id, kind, created_at, last_active_at, idle_expires_at, absolute_expires_at) VALUES('s1', 'o', 'cookie', 't', 't', 't', 't')`,
    ).run();
    v4.hub.close();
    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(db.prepare('SELECT device_id, kind, installation_id, last_session_at FROM devices').all()).toEqual([
      { device_id: 'd1', kind: 'desktop', installation_id: null, last_session_at: null },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM device_keys').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT session_hash, browser_device_id FROM sessions').all()).toEqual([{ session_hash: 's1', browser_device_id: null }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM web_access').get()).toEqual({ n: 0 });
    const insertBrowser = (id: string, installation: string): unknown => db.prepare(
      `INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, kind, installation_id)
       VALUES(?, 'env', 'B', 'web', '0', '[]', 0, 1, 't', 'browser', ?)`,
    ).run(id, installation);
    insertBrowser('b1', 'install-1');
    expect(() => insertBrowser('b2', 'install-1')).toThrow();
    expect(() => db.prepare("UPDATE devices SET kind = 'robot' WHERE device_id = 'd1'").run()).toThrow();
    upgraded.hub.close();
  });

  it('enforces CHECK constraints and foreign keys', () => {
    const result = openHubDb(dirs());
    if (result.status !== 'ready') throw new Error('expected ready');
    const { db } = result.hub;
    expect(() => db.prepare("INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES('o','missing','n','t')").run()).toThrow();
    expect(() => db.prepare("INSERT INTO setup_state(id, token_hash, created_at) VALUES(2,'h','t')").run()).toThrow();
    result.hub.close();
  });

  it('refuses a database written by a newer Hub', () => {
    const options = dirs();
    const first = openHubDb(options);
    if (first.status !== 'ready') throw new Error('expected ready');
    setMeta(first.hub.db, 'min_reader_version', '99');
    first.hub.close();
    const second = openHubDb(options);
    expect(second.status).toBe('incompatible');
  });

  it('takes a pre-migration copy only when upgrading an existing database', () => {
    const options = dirs();
    const first = openHubDb(options);
    if (first.status !== 'ready') throw new Error('expected ready');
    first.hub.close();
    expect(() => readdirSync(options.preMigrationDir)).toThrow();

    const v2: Migration = { version: 7, name: 'extra', minReaderVersion: 1, sql: 'CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT;' };
    const upgraded = openHubDb({ ...options, migrations: [...HUB_MIGRATIONS, v2] });
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    expect(readdirSync(options.preMigrationDir).filter((f) => /^pre-v6-.*\.db$/.test(f))).toHaveLength(1);
    upgraded.hub.close();
  });
});
