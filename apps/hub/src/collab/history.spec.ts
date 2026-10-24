import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import type { Db } from '@dude/sqlite-store';
import { COLLAB_HISTORY_MAX_BYTES, COLLAB_HISTORY_MAX_SNAPSHOTS, COLLAB_SNAPSHOT_IDLE_MS, COLLAB_SNAPSHOT_MIN_INTERVAL_MS } from '@dude/contracts/hub';
import { commitCanonical, getCanonicalRecord } from '../db/canonical-repository.js';
import { openHubDb } from '../db/open-hub-db.js';
import { createJobRegistry } from '../jobs/job-status.js';
import { createCollabRegistry } from './doc-registry.js';
import type { CollabDocHandle, CollabRegistry } from './doc-registry.js';
import { COLLAB_HISTORY_PRUNE_INTERVAL_MS, restoreCollabSnapshot, startCollabHistoryPruning } from './history.js';

const ENV = 'env-1';
const T0 = new Date('2026-10-24T00:00:00.000Z');
const KEY = 'markdown-doc:m1';
const IDLE = 1000;
const INTERVAL = 5000;
const UNLOAD = 500;

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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hub-collab-history-'));
  const result = openHubDb({ dbFile: path.join(dir, 'dude.db'), preMigrationDir: path.join(dir, 'pre') });
  if (result.status !== 'ready') throw new Error('not ready');
  closers.push(result.hub.close);
  const { db } = result.hub;
  const at = T0.toISOString();
  db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('${ENV}', 'Home', '${at}');
INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES ('owner-1', '${ENV}', 'Owner', '${at}');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('dev-1', '${ENV}', 'Laptop', 'win32', '1', '[]', 1, 3, '${at}'), ('dev-2', '${ENV}', 'Desktop', 'win32', '1', '[]', 1, 3, '${at}');
INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at) VALUES ('key-1', 'dev-1', 'ed25519', x'aa', '${at}'), ('key-2', 'dev-2', 'ed25519', x'bb', '${at}');
`);
  commitCanonical(db, {
    environmentId: ENV, entityType: 'markdown-doc', entityId: 'm1', op: 'upsert', now: at, deviceId: null,
    payload: { id: 'm1', title: 'Doc', body: 'start', createdAt: at, updatedAt: at },
  });
  return db;
}

function makeRegistry(db: Db, history: Parameters<typeof createCollabRegistry>[0]['history'] = { idleMs: IDLE, minIntervalMs: INTERVAL }): CollabRegistry {
  const registry = createCollabRegistry({
    db, now: () => Date.now(), emitRecordsChanged: () => undefined, idleUnloadMs: UNLOAD,
    materializer: { quietMs: 10, maxWaitMs: 50, retryMs: 50 }, store: { flushMs: 10 }, history,
  });
  closers.push(() => { try { registry.dispose(); } catch { /* the database may already be closed */ } });
  return registry;
}

/** A subscriber with its own Y.Doc, relaying through the registry handle like a socket would. */
function client(handle: CollabDocHandle, deviceId: string | null) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(handle.doc));
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') handle.apply(update, { deviceId });
  });
  handle.onUpdate((update, origin) => { if (origin !== handle) Y.applyUpdate(doc, update, 'remote'); });
  const text = doc.getText(MARKDOWN_TEXT);
  return { doc, text, set: (value: string) => doc.transact(() => { text.delete(0, text.length); text.insert(0, value); }) };
}

const bodies = (db: Db, docKey = KEY): string[] =>
  (db.prepare('SELECT payload_json FROM collab_snapshots WHERE doc_key = ? ORDER BY taken_at, rowid').all(docKey) as Array<{ payload_json: string }>)
    .map((r) => (JSON.parse(r.payload_json) as { body: string }).body);

describe('collab history snapshots (PD-105)', () => {
  it('uses the PD-105 defaults', () => {
    expect([COLLAB_SNAPSHOT_IDLE_MS, COLLAB_SNAPSHOT_MIN_INTERVAL_MS, COLLAB_HISTORY_MAX_SNAPSHOTS, COLLAB_HISTORY_MAX_BYTES]).toEqual([120_000, 600_000, 200, 8 * 1024 * 1024]);
  });

  it('snapshots a document once it has been idle after an edit, as its materialized record payload', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    c.set('first');
    vi.advanceTimersByTime(IDLE - 100);
    c.set('first edit');
    vi.advanceTimersByTime(IDLE - 100);
    // Each edit restarts the idle wait.
    expect(bodies(db)).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(bodies(db)).toEqual(['first edit']);
    const [row] = registry.history.list(KEY);
    const stored = registry.history.get(row!.id)!;
    expect(stored).toMatchObject({ docKey: KEY, takenAt: row!.takenAt, payload: { id: 'm1', title: 'Doc', body: 'first edit' } });
    expect(row!.bytes).toBe(Buffer.byteLength(JSON.stringify(stored.payload), 'utf8'));
    handle.release();
  });

  it('snapshots when the last subscriber leaves, and not when nothing was edited', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    const viewer = registry.open(KEY, { deviceId: 'dev-1' });
    viewer.release();
    expect(bodies(db)).toEqual([]);
    const a = registry.open(KEY, { deviceId: 'dev-1' });
    const b = registry.open(KEY, { deviceId: 'dev-2' });
    client(a, 'dev-1').set('released');
    a.release();
    expect(bodies(db)).toEqual([]);
    b.release();
    expect(bodies(db)).toEqual(['released']);
    vi.advanceTimersByTime(IDLE * 3);
    expect(bodies(db)).toEqual(['released']);
  });

  it('keeps snapshots at least the minimum interval apart, writing a deferred one when it is due (even after unload)', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    let handle = registry.open(KEY, { deviceId: 'dev-1' });
    let c = client(handle, 'dev-1');
    c.set('one');
    vi.advanceTimersByTime(IDLE);
    expect(bodies(db)).toEqual(['one']);
    c.set('two');
    vi.advanceTimersByTime(IDLE);
    expect(bodies(db)).toEqual(['one']);
    c.set('three');
    handle.release();
    expect(bodies(db)).toEqual(['one']);
    vi.advanceTimersByTime(UNLOAD + 10);
    expect(registry.loadedKeys()).toEqual([]);
    vi.advanceTimersByTime(INTERVAL);
    expect(bodies(db)).toEqual(['one', 'three']);
    // A later edit while open respects the interval from the deferred snapshot.
    handle = registry.open(KEY, { deviceId: 'dev-1' });
    c = client(handle, 'dev-1');
    c.set('four');
    vi.advanceTimersByTime(IDLE);
    expect(bodies(db)).toEqual(['one', 'three']);
    vi.advanceTimersByTime(INTERVAL);
    expect(bodies(db)).toEqual(['one', 'three', 'four']);
    handle.release();
  });

  it('skips a snapshot whose content equals the newest one', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    c.set('same');
    vi.advanceTimersByTime(IDLE);
    vi.advanceTimersByTime(INTERVAL);
    c.set('different');
    c.set('same');
    vi.advanceTimersByTime(IDLE);
    expect(bodies(db)).toEqual(['same']);
    handle.release();
    expect(bodies(db)).toEqual(['same']);
    // A non-collaborative field changing in the record is not a content change either.
    const record = getCanonicalRecord(db, ENV, 'markdown-doc', 'm1')!;
    expect(registry.history.take(KEY)).toEqual({ taken: false, reason: 'unchanged' });
    expect(record.revision).toBeGreaterThan(0);
  });

  it('drops the oldest snapshots beyond the count cap', () => {
    const db = freshDb();
    const registry = makeRegistry(db, { idleMs: IDLE, minIntervalMs: 0, maxSnapshots: 3 });
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    for (const body of ['a', 'b', 'c', 'd', 'e']) {
      c.set(body);
      vi.advanceTimersByTime(IDLE);
    }
    expect(bodies(db)).toEqual(['c', 'd', 'e']);
    expect(registry.history.list(KEY).length).toBe(3);
    handle.release();
  });

  it('drops the oldest snapshots beyond the byte cap, always keeping the newest', () => {
    const db = freshDb();
    const one = Buffer.byteLength(JSON.stringify({ id: 'm1', title: 'Doc', body: 'x'.repeat(100), createdAt: T0.toISOString(), updatedAt: T0.toISOString() }), 'utf8');
    const registry = makeRegistry(db, { idleMs: IDLE, minIntervalMs: 0, maxBytes: one * 2 + 10 });
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    for (const ch of ['a', 'b', 'c', 'd']) {
      c.set(ch.repeat(100));
      vi.advanceTimersByTime(IDLE);
    }
    expect(bodies(db)).toEqual(['c'.repeat(100), 'd'.repeat(100)]);
    const total = (db.prepare('SELECT SUM(bytes) AS n FROM collab_snapshots WHERE doc_key = ?').get(KEY) as { n: number }).n;
    expect(total).toBeLessThanOrEqual(one * 2 + 10);
    // A single snapshot over the cap is still kept: it is the newest.
    c.set('z'.repeat(one * 3));
    vi.advanceTimersByTime(IDLE);
    expect(bodies(db)).toEqual(['z'.repeat(one * 3)]);
    handle.release();
  });

  it('never snapshots a room and refuses room keys', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    expect(() => registry.open('room:abc', { deviceId: 'dev-1' })).toThrow(RangeError);
    registry.history.edited('room:abc');
    expect(registry.history.take('room:abc', { force: true })).toEqual({ taken: false, reason: 'missing' });
    vi.advanceTimersByTime(IDLE * 2);
    db.prepare("INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES ('r1', 'room:abc', ?, '{}', 2)").run(T0.toISOString());
    expect(registry.history.get('r1')).toBeUndefined();
    expect(restoreCollabSnapshot(registry, 'r1', { deviceId: 'dev-1' })).toEqual({ ok: false, code: 'not-found' });
  });

  it('drops pending snapshots of a deleted document', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    client(handle, 'dev-1').set('gone soon');
    commitCanonical(db, { environmentId: ENV, entityType: 'markdown-doc', entityId: 'm1', op: 'delete', now: T0.toISOString() });
    registry.evict(KEY);
    vi.advanceTimersByTime(IDLE + INTERVAL);
    expect(bodies(db)).toEqual([]);
  });
});

describe('collab history restore (PD-105)', () => {
  it('snapshots the current state, restores as a forward edit attributed to the caller, and a later concurrent edit still merges', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    c.set('old version');
    vi.advanceTimersByTime(IDLE);
    const [old] = registry.history.list(KEY);
    c.set('current version');
    // Within the minimum interval: no snapshot of the current state yet.
    vi.advanceTimersByTime(IDLE);
    expect(bodies(db)).toEqual(['old version']);
    const clientsBefore = new Set(handle.doc.store.clients.keys());
    // A copy that has not seen the restore yet (an editor mid-flight).
    const stale = new Y.Doc();
    Y.applyUpdate(stale, Y.encodeStateAsUpdate(handle.doc));

    expect(restoreCollabSnapshot(registry, old!.id, { deviceId: 'dev-2' })).toEqual({ ok: true, docKey: KEY });
    // The current state was snapshotted first, ignoring the interval.
    expect(bodies(db)).toEqual(['old version', 'current version']);
    expect(c.text.toString()).toBe('old version');
    // The record is written at once, by the restoring device.
    const record = getCanonicalRecord(db, ENV, 'markdown-doc', 'm1')!;
    expect(record.payload).toMatchObject({ body: 'old version' });
    expect(record.updatedByDeviceId).toBe('dev-2');
    // A forward edit: the history of the document is kept and grows (never rewound).
    for (const id of clientsBefore) expect(handle.doc.store.clients.has(id)).toBe(true);

    // The concurrent edit made on the stale copy still merges into the restored document...
    const before = Y.encodeStateVector(stale);
    stale.getText(MARKDOWN_TEXT).insert(stale.getText(MARKDOWN_TEXT).length, ' + stale');
    const other = registry.open(KEY, { deviceId: 'dev-1' });
    expect(other.apply(Y.encodeStateAsUpdate(stale, before), { deviceId: 'dev-1' })).toEqual({ ok: true });
    other.release();
    expect(c.text.toString()).toBe('old version + stale');
    // ...and so does a later edit.
    c.text.insert(c.text.length, ' + later');
    expect(handle.doc.getText(MARKDOWN_TEXT).toString()).toBe('old version + stale + later');
    vi.advanceTimersByTime(100);
    expect(getCanonicalRecord(db, ENV, 'markdown-doc', 'm1')!.payload).toMatchObject({ body: 'old version + stale + later' });
    handle.release();
    stale.destroy();
  });

  it('answers not-found for an unknown snapshot', () => {
    const db = freshDb();
    const registry = makeRegistry(db);
    expect(restoreCollabSnapshot(registry, 'missing', { deviceId: 'dev-1' })).toEqual({ ok: false, code: 'not-found' });
    expect(registry.loadedKeys()).toEqual([]);
  });
});

describe('collab-history-prune job', () => {
  it('removes snapshots older than 30 days at start and daily, and reports to the job registry', () => {
    const db = freshDb();
    const insert = db.prepare('INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES (?, ?, ?, ?, 2)');
    const daysAgo = (days: number): string => new Date(T0.getTime() - days * 24 * 3600_000).toISOString();
    insert.run('old', KEY, daysAgo(31), '{}');
    insert.run('edge', KEY, daysAgo(29.5), '{}');
    insert.run('new', KEY, daysAgo(1), '{}');
    const jobs = createJobRegistry({ db, now: () => Date.now() });
    jobs.register('collab-history-prune', COLLAB_HISTORY_PRUNE_INTERVAL_MS);
    const stop = startCollabHistoryPruning(db, () => Date.now(), COLLAB_HISTORY_PRUNE_INTERVAL_MS, jobs.handle('collab-history-prune'));
    closers.push(stop);
    const ids = (): string[] => (db.prepare('SELECT id FROM collab_snapshots ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id);
    expect(ids()).toEqual(['edge', 'new']);
    expect(jobs.list().find((j) => j.id === 'collab-history-prune')).toMatchObject({ lastOutcome: 'success', lastSummary: 'Removed 1 old history snapshots.', intervalMs: COLLAB_HISTORY_PRUNE_INTERVAL_MS });
    vi.advanceTimersByTime(COLLAB_HISTORY_PRUNE_INTERVAL_MS);
    expect(ids()).toEqual(['new']);
    vi.advanceTimersByTime(COLLAB_HISTORY_PRUNE_INTERVAL_MS);
    expect(jobs.list().find((j) => j.id === 'collab-history-prune')).toMatchObject({ lastOutcome: 'success', lastSummary: 'No history snapshots were past retention.' });
  });
});
