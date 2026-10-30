import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, getMeta } from '@dude/sqlite-store';
import { openHubDb } from '../open-hub-db.js';
import { HUB_MIGRATIONS } from './index.js';
import { migration0011 } from './0011-oidc.js';

function dirs() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-0011-'));
  return { dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') };
}

const AT = '2026-10-27T12:00:00.000Z';

describe('migration 0011 oidc', () => {
  it('is registered eleventh and is additive (the reader floor stays where 0010 set it)', () => {
    expect(HUB_MIGRATIONS[10]).toBe(migration0011);
    expect(migration0011).toMatchObject({ version: 11, name: 'oidc', minReaderVersion: 1 });
  });

  it('keeps its checksum (a shipped migration is never edited)', () => {
    expect(checksumOf(migration0011)).toBe('d1a81ef5bf7ae4af4988ffeffb54190b4d5d40590b1cf2b798979b20c922298d');
  });

  it('adds both tables to a populated version-10 database and is a no-op on reopen', () => {
    const options = dirs();
    const v10 = openHubDb({ ...options, migrations: HUB_MIGRATIONS.slice(0, 10) });
    if (v10.status !== 'ready') throw new Error('expected ready');
    v10.hub.db.exec("INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'E', 't')");
    v10.hub.db.exec("INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES ('o1', 'env', 'O', 't')");
    v10.hub.close();

    const upgraded = openHubDb(options);
    if (upgraded.status !== 'ready') throw new Error('expected ready');
    const { db } = upgraded.hub;
    expect(getMeta(db, 'schema_version')).toBe('13');
    expect(getMeta(db, 'min_reader_version')).toBe('10');
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('linked_identities', 'oidc_flows')").all() as Array<{ name: string }>).map((r) => r.name).sort();
    expect(tables).toEqual(['linked_identities', 'oidc_flows']);
    const strict = db.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND name IN ('linked_identities', 'oidc_flows') AND strict = 0").all();
    expect(strict).toEqual([]);
    upgraded.hub.close();

    const again = openHubDb(options);
    if (again.status !== 'ready') throw new Error('expected ready');
    expect(again.hub.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 11').get()).toEqual({ n: 1 });
    expect(again.hub.db.prepare('SELECT checksum FROM schema_migrations WHERE version = 11').get()).toEqual({ checksum: checksumOf(migration0011) });
    again.hub.close();
  });

  describe('constraints', () => {
    const open = () => {
      const opened = openHubDb(dirs());
      if (opened.status !== 'ready') throw new Error('expected ready');
      opened.hub.db.exec("INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'E', 't')");
      opened.hub.db.exec("INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES ('o1', 'env', 'O', 't')");
      return opened.hub;
    };

    it('linked_identities: one row per (provider, sub), google only, bounded sub, cascades with the owner', () => {
      const hub = open();
      const insert = (id: string, provider: string, sub: string) =>
        hub.db.prepare("INSERT INTO linked_identities(id, owner_id, provider, sub, email, issuer, linked_at) VALUES (?, 'o1', ?, ?, NULL, 'https://accounts.google.com', ?)").run(id, provider, sub, AT);
      insert('a', 'google', 'sub-1');
      expect(() => insert('b', 'google', 'sub-1')).toThrow();
      insert('c', 'google', 'sub-2');
      expect(() => insert('d', 'github', 'sub-3')).toThrow();
      expect(() => insert('e', 'google', '')).toThrow();
      expect(() => insert('f', 'google', 'x'.repeat(256))).toThrow();
      expect(() => hub.db.prepare("INSERT INTO linked_identities(id, owner_id, provider, sub, issuer, linked_at) VALUES ('g', 'nobody', 'google', 'sub-9', 'i', ?)").run(AT)).toThrow();
      hub.db.exec("DELETE FROM owner WHERE owner_id = 'o1'");
      expect(hub.db.prepare('SELECT COUNT(*) AS n FROM linked_identities').get()).toEqual({ n: 0 });
      hub.close();
    });

    it('oidc_flows: a link flow needs the owner and the session, a signin flow neither; purpose is closed', () => {
      const hub = open();
      const insert = (hash: string, purpose: string, owner: string | null, session: string | null) =>
        hub.db.prepare('INSERT INTO oidc_flows(state_hash, nonce_hash, code_verifier, purpose, owner_id, session_hash, return_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(hash, 'n', 'v', purpose, owner, session, '/', AT, AT);
      insert('s1', 'signin', null, null);
      insert('l1', 'link', 'o1', 'sess');
      expect(() => insert('s2', 'signin', 'o1', null)).toThrow();
      expect(() => insert('s3', 'signin', null, 'sess')).toThrow();
      expect(() => insert('l2', 'link', null, 'sess')).toThrow();
      expect(() => insert('l3', 'link', 'o1', null)).toThrow();
      expect(() => insert('x1', 'reauth', null, null)).toThrow();
      expect(() => insert('s1', 'signin', null, null)).toThrow(); // state hashes are unique
      hub.close();
    });
  });
});
