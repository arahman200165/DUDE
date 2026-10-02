import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';
import { entityCollectionContract } from '@dude/persistence/testing';
import type { EntityCodec } from '@dude/persistence';
import type { Db } from '@dude/sqlite-store';
import { openHubDb } from './open-hub-db.js';
import {
  CanonicalRejection, canonicalCollection, changesSince, commitCanonical, currentRevision, getCanonicalRecord, listCanonicalRecords,
} from './canonical-repository.js';
import type { CanonicalCommit } from './canonical-repository.js';

const ENV = 'env-1';
const NOW = '2026-01-01T00:00:00.000Z';
const open: Array<() => void> = [];
afterEach(() => { while (open.length) open.pop()!(); });

function openReady(dir: string): { db: Db; close: () => void } {
  const result = openHubDb({ dbFile: path.join(dir, 'dude.db'), preMigrationDir: path.join(dir, 'pre') });
  if (result.status !== 'ready') throw new Error(`not ready: ${result.status}`);
  return result.hub;
}
function freshDb(): Db {
  const hub = openReady(mkdtempSync(path.join(os.tmpdir(), 'hub-canon-')));
  open.push(hub.close);
  hub.db.prepare('INSERT INTO environment(environment_id, display_name, created_at) VALUES(?, ?, ?)').run(ENV, 'Env', NOW);
  return hub.db;
}
const fav = (id: string, order = 0) => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });
const favCommit = (id: string, extra: Partial<CanonicalCommit> = {}): CanonicalCommit => ({
  environmentId: ENV, entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert', payload: fav(id), now: NOW, ...extra,
});
const count = (db: Db, table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('commitCanonical', () => {
  it('applies with monotonic global revisions and round-trips content', () => {
    const db = freshDb();
    expect(commitCanonical(db, favCommit('a', { deviceId: 'dev-1', opId: 'o1' }))).toEqual({ status: 'applied', revision: 1 });
    expect(commitCanonical(db, {
      environmentId: ENV, entityType: 'project', entityId: 'p1', op: 'upsert', now: NOW,
      payload: { id: 'p1', name: 'P', toolIds: [], createdAt: NOW, updatedAt: NOW },
    }).revision).toBe(2);
    expect(commitCanonical(db, favCommit('b')).revision).toBe(3);
    expect(currentRevision(db)).toBe(3);
    const feed = changesSince(db, ENV, 0, 10);
    expect(feed.map((c) => c.revision)).toEqual([1, 2, 3]);
    expect(feed[0]).toMatchObject({ entityType: 'favorite', entityId: 'tool:a', op: 'upsert', deviceId: 'dev-1', opId: 'o1', at: NOW });
    const rec = getCanonicalRecord(db, ENV, 'favorite', 'tool:a')!;
    expect(rec).toMatchObject({ revision: 1, deleted: false, scope: 'environment', schemaVersion: 1, updatedByDeviceId: 'dev-1', payload: fav('a') });
    expect(count(db, 'records')).toBe(3);
  });

  it('treats a duplicate opId as a no-op returning the recorded revision', () => {
    const db = freshDb();
    commitCanonical(db, favCommit('a', { opId: 'o1' }));
    commitCanonical(db, favCommit('b'));
    const dup = commitCanonical(db, favCommit('a', { opId: 'o1', payload: fav('a', 99) }));
    expect(dup).toEqual({ status: 'duplicate', revision: 1 });
    expect(count(db, 'change_feed')).toBe(2);
    expect(getCanonicalRecord(db, ENV, 'favorite', 'tool:a')!.payload).toEqual(fav('a'));
    // A duplicate delete does not tombstone either.
    expect(commitCanonical(db, { ...favCommit('a', { opId: 'o1' }), op: 'delete' }).status).toBe('duplicate');
    expect(getCanonicalRecord(db, ENV, 'favorite', 'tool:a')!.deleted).toBe(false);
  });

  const rejects = (db: Db, input: CanonicalCommit, code: string): void => {
    const before = [count(db, 'records'), count(db, 'change_feed'), count(db, 'applied_ops')];
    let error: unknown;
    try { commitCanonical(db, { ...input, opId: 'rej' }); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(CanonicalRejection);
    expect((error as CanonicalRejection).code).toBe(code);
    expect([count(db, 'records'), count(db, 'change_feed'), count(db, 'applied_ops')]).toEqual(before);
  };

  it('rejects bad commits without writing anything', () => {
    const db = freshDb();
    commitCanonical(db, favCommit('seed'));
    rejects(db, { ...favCommit('a'), entityType: 'nope' }, 'unknown-entity');
    rejects(db, { ...favCommit('a'), entityType: 'constructor' }, 'unknown-entity');
    rejects(db, { ...favCommit('a'), entityType: 'native-recents', entityId: 'x' }, 'non-canonical-scope');
    rejects(db, { ...favCommit('a'), entityType: 'history-entry', entityId: 'x' }, 'non-canonical-scope');
    rejects(db, favCommit('a', { payload: { nonsense: true } }), 'invalid-payload');
    rejects(db, favCommit('a', { entityId: 'tool:other' }), 'invalid-payload');
    rejects(db, favCommit('a', { environmentId: 'missing' }), 'unknown-environment');
    // The rejected opId stays usable.
    expect(commitCanonical(db, favCommit('a', { opId: 'rej' })).status).toBe('applied');
  });

  it('records tombstones, including for unknown entities', () => {
    const db = freshDb();
    commitCanonical(db, favCommit('a'));
    expect(commitCanonical(db, { ...favCommit('a'), op: 'delete', payload: undefined }).revision).toBe(2);
    expect(commitCanonical(db, { ...favCommit('ghost'), op: 'delete', payload: undefined }).revision).toBe(3);
    const rec = getCanonicalRecord(db, ENV, 'favorite', 'tool:a')!;
    expect(rec).toMatchObject({ deleted: true, revision: 2, payload: undefined });
    expect(db.prepare("SELECT payload_json FROM records WHERE entity_id = 'tool:a'").get()).toEqual({ payload_json: null });
    expect(getCanonicalRecord(db, ENV, 'favorite', 'tool:ghost')!.deleted).toBe(true);
    expect(listCanonicalRecords(db, ENV, 'favorite')).toEqual([]);
    expect(listCanonicalRecords(db, ENV, 'favorite', { includeDeleted: true })).toHaveLength(2);
    commitCanonical(db, favCommit('a'));
    expect(getCanonicalRecord(db, ENV, 'favorite', 'tool:a')).toMatchObject({ deleted: false, revision: 4 });
  });

  it('paginates changesSince per environment', () => {
    const db = freshDb();
    db.prepare('INSERT INTO environment(environment_id, display_name, created_at) VALUES(?, ?, ?)').run('env-2', 'Other', NOW);
    for (let i = 0; i < 5; i++) commitCanonical(db, favCommit(`i${i}`));
    commitCanonical(db, favCommit('x', { environmentId: 'env-2' }));
    const page1 = changesSince(db, ENV, 0, 2);
    expect(page1.map((c) => c.revision)).toEqual([1, 2]);
    const page2 = changesSince(db, ENV, page1[1].revision, 2);
    expect(page2.map((c) => c.revision)).toEqual([3, 4]);
    expect(changesSince(db, ENV, 4, 10).map((c) => c.revision)).toEqual([5]);
    expect(changesSince(db, 'env-2', 0, 10).map((c) => c.revision)).toEqual([6]);
    expect(changesSince(db, ENV, 5, 10)).toEqual([]);
  });

  it('is atomic: a failure after the records write leaves no partial rows', () => {
    const db = freshDb();
    commitCanonical(db, favCommit('seed'));
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON applied_ops BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(() => commitCanonical(db, favCommit('a', { opId: 'o-x' }))).toThrow(/boom/);
    expect(count(db, 'records')).toBe(1);
    expect(count(db, 'change_feed')).toBe(1);
    expect(getCanonicalRecord(db, ENV, 'favorite', 'tool:a')).toBeUndefined();
    db.exec('DROP TRIGGER boom');
    expect(commitCanonical(db, favCommit('a', { opId: 'o-x' }))).toEqual({ status: 'applied', revision: 2 });
  });
});

describe('canonicalCollection', () => {
  const testCodec: EntityCodec<{ id: string; v: number }> = {
    entityType: 'contract-item', schemaVersion: 1, scope: 'environment', sensitivity: 'non-sensitive', journaled: true,
    idOf: (x) => x.id,
    decode: (raw) => {
      const r = raw as { id?: unknown; v?: unknown } | null;
      return r && typeof r.id === 'string' && typeof r.v === 'number' ? { id: r.id, v: r.v } : null;
    },
    encode: (x) => ({ ...x }),
  };
  const factory = () => canonicalCollection<{ id: string; v: number }>(freshDb(), ENV, 'contract-item', () => new Date(NOW), {
    codecs: { 'contract-item': testCodec },
  });
  // The port's `importMany` case expects a single revision step per call; Hub revisions are per record, so that one
  // case is replaced by the dedicated test below.
  entityCollectionContract('canonicalCollection', factory, {
    describe, expect,
    it: (name, fn) => (name.startsWith('imports many') ? it.skip(name, fn) : it(name, fn)),
  });

  it('importMany commits all values in one transaction and returns the last revision', async () => {
    const repo = factory();
    await repo.upsert({ id: 'seed', v: 0 });
    const result = await repo.importMany([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'seed', v: 9 }]);
    expect(result.localRevision).toBe(4);
    expect((await repo.list()).length).toBe(3);
    expect(await repo.get('seed')).toEqual({ id: 'seed', v: 9 });
    await expect(repo.importMany([{ id: 'c', v: 1 }, { id: 'bad', v: 'x' as unknown as number }])).rejects.toBeInstanceOf(CanonicalRejection);
    expect(await repo.get('c')).toBeUndefined();
  });
});

describe('hard-kill durability', () => {
  it('keeps every reported commit, with feed and records consistent', async () => {
    const work = mkdtempSync(path.join(os.tmpdir(), 'hub-crash-'));
    const bundle = path.join(work, 'crash-writer.cjs');
    await build({
      entryPoints: [path.resolve(__dirname, '../testing/crash-writer.ts')],
      outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    });
    const dbDir = path.join(work, 'data');
    const child = spawn(process.execPath, [bundle, dbDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    const reported: number[] = [];
    let buffer = '';
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`writer too slow (${reported.length} commits). ${stderr}`)), 30_000);
      child.stdout.on('data', (d: Buffer) => {
        buffer += d.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.startsWith('commit ')) reported.push(Number(line.slice(7)));
        if (reported.length >= 50) { clearTimeout(timer); resolve(); }
      });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(`writer exited early. ${stderr}`)); });
    });
    child.kill('SIGKILL');
    await exited;

    const hub = openReady(dbDir);
    open.push(hub.close);
    const { db } = hub;
    expect(db.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    const feed = new Set((db.prepare('SELECT revision FROM change_feed').all() as Array<{ revision: number }>).map((r) => r.revision));
    for (const revision of reported) expect(feed.has(revision)).toBe(true);
    expect(reported).toEqual(reported.map((_, i) => i + 1));
    // Every feed row has its applied op; every record's revision is a feed row; every entity's latest feed row has its record.
    expect(count(db, 'applied_ops')).toBe(feed.size);
    expect(db.prepare('SELECT revision FROM records WHERE revision NOT IN (SELECT revision FROM change_feed)').all()).toEqual([]);
    expect(db.prepare(
      `SELECT f.revision FROM change_feed f WHERE f.revision = (SELECT MAX(revision) FROM change_feed g WHERE g.entity_type = f.entity_type AND g.entity_id = f.entity_id)
         AND NOT EXISTS (SELECT 1 FROM records r WHERE r.revision = f.revision)`,
    ).all()).toEqual([]);
    expect(Math.max(...feed)).toBe(feed.size);
    expect(count(db, 'records')).toBeGreaterThan(0);
  }, 60_000);
});
