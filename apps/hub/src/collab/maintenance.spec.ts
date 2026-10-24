import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { commitCanonical } from '../db/canonical-repository.js';
import { openHubDb } from '../db/open-hub-db.js';
import { JOB_LAST_META_PREFIX, createJobRegistry } from '../jobs/job-status.js';
import { COLLAB_IDLE_UNLOAD_MS, createCollabRegistry } from './doc-registry.js';
import type { CollabRegistry } from './doc-registry.js';
import { classifyCollabMaintenance, runCollabMaintenance, startCollabMaintenance } from './maintenance.js';

const ENV = 'env-1';
const T0 = new Date('2026-10-24T00:00:00.000Z');
const at = T0.toISOString();
const closers: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  while (closers.length) closers.pop()!();
  vi.useRealTimers();
});

function freshDb(): Db {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hub-collab-maint-'));
  const result = openHubDb({ dbFile: path.join(dir, 'dude.db'), preMigrationDir: path.join(dir, 'pre') });
  if (result.status !== 'ready') throw new Error('not ready');
  closers.push(result.hub.close);
  const { db } = result.hub;
  db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('${ENV}', 'Home', '${at}');
INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES ('owner-1', '${ENV}', 'Owner', '${at}');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('dev-1', '${ENV}', 'Laptop', 'win32', '1', '[]', 1, 3, '${at}');
INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at) VALUES ('key-1', 'dev-1', 'ed25519', x'aa', '${at}');
`);
  return db;
}

function makeRegistry(db: Db): CollabRegistry {
  const registry = createCollabRegistry({ db, now: () => Date.now(), emitRecordsChanged: () => undefined });
  closers.push(() => { try { registry.dispose(); } catch { /* the database may already be closed */ } });
  return registry;
}

const putMarkdown = (db: Db, id: string, body: string): number =>
  commitCanonical(db, { environmentId: ENV, entityType: 'markdown-doc', entityId: id, op: 'upsert', payload: { id, title: 'Doc', body, createdAt: at, updatedAt: at }, now: at }).revision;

function docRow(db: Db, docKey: string): void {
  const state = Y.encodeStateAsUpdate(new Y.Doc());
  db.prepare(`INSERT INTO collab_docs(doc_key, kind, entity_type, entity_id, state, bytes, created_at, updated_at, last_opened_at)
    VALUES (?, 'markdown-doc', 'markdown-doc', ?, ?, ?, ?, ?, ?)`).run(docKey, docKey.split(':')[1]!, state, state.byteLength, at, at, at);
}
const base = (db: Db, docKey: string, revision: number): void =>
  void db.prepare('INSERT INTO collab_bases(doc_key, revision, payload_json, at) VALUES (?, ?, ?, ?)').run(docKey, revision, '{}', at);
const basesOf = (db: Db): string[] =>
  (db.prepare('SELECT doc_key, revision FROM collab_bases ORDER BY doc_key, revision').all() as Array<{ doc_key: string; revision: number }>).map((r) => `${r.doc_key}@${r.revision}`);
const tailOf = (db: Db, docKey: string): number => (db.prepare('SELECT COUNT(*) AS n FROM collab_updates WHERE doc_key = ?').get(docKey) as { n: number }).n;

describe('collab maintenance: merge bases', () => {
  it('drops bases below the sync floor but always keeps each document newest, even one below the floor', () => {
    const db = freshDb();
    putMarkdown(db, 'm1', 'a');
    putMarkdown(db, 'm2', 'b');
    docRow(db, 'markdown-doc:m1');
    docRow(db, 'markdown-doc:m2');
    for (const revision of [1, 2, 3, 4, 5]) base(db, 'markdown-doc:m1', revision);
    base(db, 'markdown-doc:m2', 2);
    setMeta(db, 'sync_floor', '4');

    const result = runCollabMaintenance({ db, registry: makeRegistry(db) });
    expect(result).toEqual({ basesPruned: 3, orphanBases: 0, compacted: 0, failed: 0 });
    expect(basesOf(db)).toEqual(['markdown-doc:m1@4', 'markdown-doc:m1@5', 'markdown-doc:m2@2']);
    // A second pass finds nothing more.
    expect(runCollabMaintenance({ db, registry: makeRegistry(db) })).toEqual({ basesPruned: 0, orphanBases: 0, compacted: 0, failed: 0 });
  });

  it('keeps every base at a floor of 0', () => {
    const db = freshDb();
    putMarkdown(db, 'm1', 'a');
    docRow(db, 'markdown-doc:m1');
    base(db, 'markdown-doc:m1', 1);
    base(db, 'markdown-doc:m1', 2);
    expect(runCollabMaintenance({ db, registry: makeRegistry(db) }).basesPruned).toBe(0);
    expect(basesOf(db)).toEqual(['markdown-doc:m1@1', 'markdown-doc:m1@2']);
  });

  it('drops the bases of documents with no stored row or no live record, never those of a loaded document', () => {
    const db = freshDb();
    putMarkdown(db, 'm1', 'a');
    docRow(db, 'markdown-doc:m1');
    base(db, 'markdown-doc:m1', 1);
    // No collab_docs row at all.
    base(db, 'markdown-doc:gone', 1);
    base(db, 'markdown-doc:gone', 2);
    // A row but the record never existed.
    docRow(db, 'markdown-doc:m9');
    base(db, 'markdown-doc:m9', 1);
    // A row whose record is a tombstone (inserted directly: the real delete commit also removes the collaborative rows).
    putMarkdown(db, 'm3', 'c');
    db.prepare("UPDATE records SET deleted = 1, payload_json = NULL WHERE entity_id = 'm3'").run();
    docRow(db, 'markdown-doc:m3');
    base(db, 'markdown-doc:m3', 1);

    const registry = makeRegistry(db);
    const handle = registry.open('markdown-doc:loaded', { deviceId: 'dev-1' });
    base(db, 'markdown-doc:loaded', 7);

    const result = runCollabMaintenance({ db, registry });
    expect(result).toMatchObject({ orphanBases: 4, basesPruned: 0 });
    expect(basesOf(db)).toEqual(['markdown-doc:loaded@7', 'markdown-doc:m1@1']);
    handle.release();
  });
});

describe('collab maintenance: stored update tails', () => {
  it('compacts an unloaded document tail into its state and leaves a loaded document alone', () => {
    const db = freshDb();
    putMarkdown(db, 'm1', 'hello');
    putMarkdown(db, 'm2', 'world');
    const registry = makeRegistry(db);
    registry.open('markdown-doc:m1', { deviceId: 'dev-1' }).release();
    vi.advanceTimersByTime(COLLAB_IDLE_UNLOAD_MS + 1);
    expect(registry.loadedKeys()).toEqual([]);

    // A tail left behind for a document that is no longer loaded (for example a crash before its unload compaction).
    const stored = new Y.Doc();
    Y.applyUpdate(stored, (db.prepare("SELECT state FROM collab_docs WHERE doc_key = 'markdown-doc:m1'").get() as { state: Uint8Array }).state);
    const before = Y.encodeStateVector(stored);
    stored.getText(MARKDOWN_TEXT).insert(5, ' there');
    registry.store.appendUpdate('markdown-doc:m1', Y.encodeStateAsUpdate(stored, before));
    registry.store.flush();
    expect(tailOf(db, 'markdown-doc:m1')).toBe(1);

    // A loaded document with a tail is the registry's to compact.
    const loaded = registry.open('markdown-doc:m2', { deviceId: 'dev-1' });
    const live = new Y.Doc();
    Y.applyUpdate(live, Y.encodeStateAsUpdate(loaded.doc));
    const liveBefore = Y.encodeStateVector(live);
    live.getText(MARKDOWN_TEXT).insert(0, 'big ');
    expect(loaded.apply(Y.encodeStateAsUpdate(live, liveBefore), { deviceId: 'dev-1' })).toEqual({ ok: true });
    registry.store.flush();
    expect(tailOf(db, 'markdown-doc:m2')).toBe(1);

    const result = runCollabMaintenance({ db, registry });
    expect(result).toMatchObject({ compacted: 1, failed: 0 });
    expect(tailOf(db, 'markdown-doc:m1')).toBe(0);
    expect(tailOf(db, 'markdown-doc:m2')).toBe(1);
    expect(registry.store.loadDoc('markdown-doc:m1').getText(MARKDOWN_TEXT).toString()).toBe('hello there');
    loaded.release();
  });

  it('counts a corrupt tail as failed, leaves it in place and keeps going', () => {
    const db = freshDb();
    putMarkdown(db, 'm1', 'hello');
    docRow(db, 'markdown-doc:m1');
    db.prepare("INSERT INTO collab_updates(doc_key, update_blob, at) VALUES ('markdown-doc:m1', x'ffffffff', ?)").run(at);
    const warnings: string[] = [];
    const result = runCollabMaintenance({ db, registry: makeRegistry(db), log: { warn: (fields) => void warnings.push(String(fields['event'])) } });
    expect(result).toMatchObject({ compacted: 0, failed: 1 });
    expect(tailOf(db, 'markdown-doc:m1')).toBe(1);
    expect(warnings).toEqual(['collab.maintenance-compact-failed']);
    expect(classifyCollabMaintenance(result).outcome).toBe('failed');
  });
});

describe('collab-maintenance job', () => {
  it('runs at start and on its period, recording the outcome in the job registry', () => {
    const db = freshDb();
    putMarkdown(db, 'm1', 'a');
    docRow(db, 'markdown-doc:m1');
    base(db, 'markdown-doc:m1', 1);
    base(db, 'markdown-doc:m1', 2);
    setMeta(db, 'sync_floor', '2');
    const jobs = createJobRegistry({ db, now: () => Date.now() });
    jobs.register('collab-maintenance', 6 * 3600_000);
    const stop = startCollabMaintenance({ db, registry: makeRegistry(db), intervalMs: 6 * 3600_000, job: jobs.handle('collab-maintenance') });
    closers.push(stop);
    const status = () => jobs.list().find((j) => j.id === 'collab-maintenance')!;
    expect(status()).toMatchObject({ lastOutcome: 'success', lastSummary: 'Removed 1 merge bases and compacted 0 stored documents.', intervalMs: 6 * 3600_000, running: false });
    expect(getMeta(db, `${JOB_LAST_META_PREFIX}collab-maintenance`)).toBeDefined();

    vi.advanceTimersByTime(6 * 3600_000);
    expect(status()).toMatchObject({ lastOutcome: 'success', lastSummary: 'Nothing needed pruning or compaction.', lastFinishedAt: new Date(T0.getTime() + 6 * 3600_000).toISOString() });
  });
});
