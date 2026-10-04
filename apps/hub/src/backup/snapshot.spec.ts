import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMeta } from '@dude/sqlite-store';
import type { HubDb } from '../db/open-hub-db.js';
import { SECRET_MARKER, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { createScrubbedDbSnapshot } from './snapshot.js';

const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(): { hub: HubDb; root: string; work: string } {
  const root = tempRoot('snap');
  roots.push(root);
  const { hub } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  return { hub, root, work: path.join(root, 'work') };
}

function openBytes(root: string, bytes: Uint8Array): DatabaseSync {
  const file = path.join(root, `opened-${String(Math.random()).slice(2)}.db`);
  writeFileSync(file, bytes);
  return new DatabaseSync(file);
}

const count = (db: DatabaseSync, table: string): number => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);

describe('createScrubbedDbSnapshot', () => {
  it('removes transient state and keeps durable state', async () => {
    const { hub, root, work } = setup();
    const snapshot = await createScrubbedDbSnapshot(hub.db, work);
    const copy = openBytes(root, snapshot.bytes);
    try {
      for (const table of ['sessions', 'device_tokens', 'challenges', 'pairing_codes', 'setup_state']) expect(count(copy, table)).toBe(0);
      for (const key of ['csrf_key', 'alerts_seen_seq', 'hub_addresses', 'reachability_last', 'acme_last_attempt', 'revoked_attempt:token:dev-1', 'revoked-attempts:legacy']) {
        expect(getMeta(copy, key)).toBeUndefined();
      }
      expect(count(copy, 'devices')).toBe(1);
      expect(count(copy, 'owner')).toBe(1);
      expect(count(copy, 'owner_credentials')).toBe(1);
      expect(count(copy, 'audit_events')).toBe(1);
      expect(count(copy, 'throttle')).toBe(1);
      expect(count(copy, 'ip_blocks')).toBe(1);
      expect(count(copy, 'records')).toBe(1);
      expect(getMeta(copy, 'hub_instance_id')).toBe(hub.hubInstanceId);
      expect(getMeta(copy, 'authority_epoch')).toBe('3');
      expect(copy.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    } finally {
      copy.close();
    }
    expect(snapshot.counts).toEqual({ devices: 1, records: 1, audit_events: 1, change_feed: 1 });
    expect(snapshot.schemaVersion).toBeGreaterThanOrEqual(7);
    expect(snapshot.dbMinReaderVersion).toBeGreaterThanOrEqual(1);
  });

  it('leaves no secret marker anywhere in the raw snapshot bytes', async () => {
    const { hub, work } = setup();
    const snapshot = await createScrubbedDbSnapshot(hub.db, work);
    expect(Buffer.from(snapshot.bytes).includes(Buffer.from(SECRET_MARKER))).toBe(false);
  });

  it('never touches the live database', async () => {
    const { hub, work } = setup();
    await createScrubbedDbSnapshot(hub.db, work);
    const n = (table: string): number => count(hub.db, table);
    expect(n('sessions')).toBe(1);
    expect(n('device_tokens')).toBe(1);
    expect(n('challenges')).toBe(1);
    expect(n('pairing_codes')).toBe(1);
    expect(n('setup_state')).toBe(1);
    expect(getMeta(hub.db, 'csrf_key')).toBe(`${SECRET_MARKER}-csrf`);
    expect(getMeta(hub.db, 'revoked_attempt:token:dev-1')).toBe('123');
  });

  it('removes both temp files, including when the snapshot fails', async () => {
    const { hub, work } = setup();
    await createScrubbedDbSnapshot(hub.db, work);
    expect(readdirSync(work)).toEqual([]);

    // A closed handle makes the first VACUUM INTO fail.
    const closed = new DatabaseSync(':memory:');
    closed.close();
    await expect(createScrubbedDbSnapshot(closed, work)).rejects.toThrow();
    expect(readdirSync(work)).toEqual([]);
    expect(existsSync(work)).toBe(true);
  });
});
