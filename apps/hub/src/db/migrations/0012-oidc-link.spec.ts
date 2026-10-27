import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { openHubDb } from '../open-hub-db.js';
import { HUB_MIGRATIONS } from './index.js';
import { migration0012 } from './0012-oidc-link.js';

const dirs = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-0012-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
};

describe('migration 0012 oidc-link', () => {
  it('is registered twelfth and is additive', () => {
    expect(HUB_MIGRATIONS[11]).toBe(migration0012);
    expect(migration0012).toMatchObject({ version: 12, name: 'oidc-link', minReaderVersion: 1 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(migration0012)).toBe('ab3b1c5366919424878fdd0c4e504a0e26531a8f96383bc321d9e24ab914bbd7');
  });

  it('adds the verified-link columns to a populated version-11 database, keeps its rows and is a no-op on reopen', () => {
    const options = dirs();
    const v11 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 11) });
    if (v11.status !== 'ready') throw new Error('expected ready');
    v11.hub.db.exec("INSERT INTO oidc_flows(state_hash, nonce_hash, code_verifier, purpose, return_to, created_at, expires_at) VALUES ('s', 'n', 'v', 'signin', '/', 't', 't')");
    v11.hub.close();

    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('12');
    const columns = (db.prepare("SELECT name FROM pragma_table_info('oidc_flows')").all() as Array<{ name: string }>).map((r) => r.name);
    for (const name of ['verified_sub', 'verified_email', 'verified_issuer', 'link_token_hash', 'link_expires_at', 'link_completed_at']) expect(columns).toContain(name);
    expect(db.prepare('SELECT COUNT(*) AS n FROM oidc_flows').get()).toEqual({ n: 1 });
    expect(() => db.prepare("UPDATE oidc_flows SET verified_sub = '' WHERE state_hash = 's'").run()).toThrow();
    upgraded.hub.close();

    const again = openHubDb(options);
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 12').get()).toEqual({ n: 1 });
    again.hub.close();
  });
});
