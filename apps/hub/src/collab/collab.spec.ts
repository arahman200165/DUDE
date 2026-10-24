import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKDOWN_TEXT, addSnippet, readSnippet } from '@dude/collab-doc';
import { SYNC_LIMITS } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';
import { commitCanonical, currentRevision, getCanonicalRecord } from '../db/canonical-repository.js';
import { setWebAccess } from '../db/web-access.js';
import { openHubDb } from '../db/open-hub-db.js';
import { createCollabDocStore } from './doc-store.js';
import { createCollabRegistry } from './doc-registry.js';
import type { CollabDocHandle, CollabRegistry } from './doc-registry.js';
import { createMaterializer } from './materializer.js';

const ENV = 'env-1';
const T0 = new Date('2026-10-24T00:00:00.000Z');
const FUTURE = '2027-10-24T00:00:00.000Z';
const KEY = 'markdown-doc:m1';

const closers: Array<() => void> = [];
const warnings: Array<{ fields: Record<string, unknown>; message: string }> = [];
const log = { warn: (fields: Record<string, unknown>, message: string): void => void warnings.push({ fields, message }) };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  warnings.length = 0;
});
afterEach(() => {
  while (closers.length) closers.pop()!();
  vi.useRealTimers();
});

function freshDb(): Db {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hub-collab-'));
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
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, kind, installation_id)
  VALUES ('br-1', '${ENV}', 'Browser', 'web', '1', '[]', 0, 3, '${at}', 'browser', 'inst-1');
INSERT INTO sessions(session_hash, owner_id, kind, created_at, last_active_at, idle_expires_at, absolute_expires_at, browser_device_id)
  VALUES ('sess-1', 'owner-1', 'cookie', '${at}', '${at}', '${FUTURE}', '${FUTURE}', 'br-1');
`);
  return db;
}

const mdPayload = (body: string, title = 'Doc') => ({ id: 'm1', title, body, createdAt: T0.toISOString(), updatedAt: T0.toISOString() });
function putMarkdown(db: Db, body: string, deviceId: string | null = null): number {
  return commitCanonical(db, { environmentId: ENV, entityType: 'markdown-doc', entityId: 'm1', op: 'upsert', payload: mdPayload(body), now: T0.toISOString(), deviceId }).revision;
}
const recordOf = (db: Db, type = 'markdown-doc', id = 'm1') => getCanonicalRecord(db, ENV, type, id);
const count = (db: Db, table: string, docKey = KEY): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE doc_key = ?`).get(docKey) as { n: number }).n;
const textOf = (doc: Y.Doc): string => doc.getText(MARKDOWN_TEXT).toString();

interface Made { registry: CollabRegistry; events: Array<{ environmentId: string; revision: number; originDeviceId: string | null }> }
function makeRegistry(db: Db, extra: Partial<Parameters<typeof createCollabRegistry>[0]> = {}): Made {
  const events: Made['events'] = [];
  const registry = createCollabRegistry({
    db, now: () => Date.now(), log, emitRecordsChanged: (event) => void events.push(event), ...extra,
  });
  closers.push(() => { try { registry.dispose(); } catch { /* the database may already be closed */ } });
  return { registry, events };
}

/** A subscriber with its own Y.Doc, relaying through the registry handle like a socket would. */
function client(handle: CollabDocHandle, deviceId: string | null) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(handle.doc));
  const replies: string[] = [];
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    const result = handle.apply(update, { deviceId });
    replies.push(result.ok ? 'ok' : result.code);
  });
  handle.onUpdate((update, origin) => { if (origin !== handle) Y.applyUpdate(doc, update, 'remote'); });
  return { doc, text: doc.getText(MARKDOWN_TEXT), replies };
}

describe('collab doc store', () => {
  it('seeds from the record once; later loads replay the stored state with a fresh clientID and never reseed', () => {
    const db = freshDb();
    const revision = putMarkdown(db, 'hello');
    const store = createCollabDocStore({ db, now: () => Date.now(), log });
    closers.push(() => store.close());

    const first = store.loadDocWithMeta(KEY);
    expect(first).toMatchObject({ seeded: true, materializedRevision: revision });
    expect(textOf(first.doc)).toBe('hello');
    expect(db.prepare('SELECT kind, entity_type, entity_id FROM collab_docs').all()).toEqual([{ kind: 'markdown-doc', entity_type: 'markdown-doc', entity_id: 'm1' }]);
    // The seeded payload is the merge base of the revision it came from (PD-102).
    expect(db.prepare('SELECT revision, payload_json FROM collab_bases').all()).toEqual([{ revision, payload_json: JSON.stringify(mdPayload('hello')) }]);

    putMarkdown(db, 'changed behind the document');
    const second = store.loadDocWithMeta(KEY);
    expect(second.seeded).toBe(false);
    expect(textOf(second.doc)).toBe('hello');
    expect(second.doc.clientID).not.toBe(first.doc.clientID);
    expect(count(db, 'collab_docs')).toBe(1);
  });

  it('starts an empty document when there is no record yet (an unsynced scratchpad) and keeps materialized_revision null', () => {
    const db = freshDb();
    const store = createCollabDocStore({ db, now: () => Date.now() });
    closers.push(() => store.close());
    const loaded = store.loadDocWithMeta('scratchpad:default');
    expect(loaded).toMatchObject({ seeded: true, materializedRevision: null });
    expect(count(db, 'collab_bases', 'scratchpad:default')).toBe(0);
  });

  it('refuses room and malformed keys: rooms are never persisted', () => {
    const store = createCollabDocStore({ db: freshDb(), now: () => Date.now() });
    closers.push(() => store.close());
    expect(() => store.loadDoc('room:abc')).toThrow(RangeError);
    expect(() => store.loadDoc('nonsense')).toThrow(RangeError);
  });

  it('buffers updates (flushed after 1 s or 50 updates), replays state plus tail in order, and compacts in one step', () => {
    const db = freshDb();
    putMarkdown(db, '');
    const store = createCollabDocStore({ db, now: () => Date.now() });
    closers.push(() => store.close());
    const doc = store.loadDoc(KEY);
    const send = (text: string): void => {
      const before = Y.encodeStateVector(doc);
      doc.getText(MARKDOWN_TEXT).insert(doc.getText(MARKDOWN_TEXT).length, text);
      store.appendUpdate(KEY, Y.encodeStateAsUpdate(doc, before));
    };
    send('a');
    send('b');
    expect(count(db, 'collab_updates')).toBe(0);
    expect(store.tailLength(KEY)).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(count(db, 'collab_updates')).toBe(2);

    for (let i = 0; i < 50; i += 1) send('x');
    expect(count(db, 'collab_updates')).toBe(52);

    const replayed = store.loadDoc(KEY);
    expect(textOf(replayed)).toBe(textOf(doc));
    expect(textOf(replayed)).toBe(`ab${'x'.repeat(50)}`);

    store.compact(KEY, doc);
    expect(count(db, 'collab_updates')).toBe(0);
    expect(store.tailLength(KEY)).toBe(0);
    expect(textOf(store.loadDoc(KEY))).toBe(`ab${'x'.repeat(50)}`);
  });

  it('writes no tail for a document that was deleted while updates were buffered', () => {
    const db = freshDb();
    putMarkdown(db, 'a');
    const store = createCollabDocStore({ db, now: () => Date.now() });
    closers.push(() => store.close());
    const doc = store.loadDoc(KEY);
    doc.getText(MARKDOWN_TEXT).insert(0, 'z');
    store.appendUpdate(KEY, Y.encodeStateAsUpdate(doc));
    store.deleteDoc(KEY);
    store.appendUpdate(KEY, Y.encodeStateAsUpdate(doc));
    store.flush();
    for (const table of ['collab_docs', 'collab_updates', 'collab_snapshots', 'collab_bases']) expect([table, count(db, table)]).toEqual([table, 0]);
  });
});

describe('collab doc registry', () => {
  it('converges two subscribers editing one document and persists it across unload and reload', () => {
    const db = freshDb();
    putMarkdown(db, 'hello world');
    const { registry } = makeRegistry(db, { idleUnloadMs: 5000 });
    const h1 = registry.open(KEY, { deviceId: 'dev-1' });
    const h2 = registry.open(KEY, { deviceId: 'dev-2' });
    expect(registry.loadedKeys()).toEqual([KEY]);
    const a = client(h1, 'dev-1');
    const b = client(h2, 'dev-2');
    a.text.insert(0, 'A:');
    b.text.insert(b.text.length, ' B!');
    expect(a.replies).toEqual(['ok']);
    expect(b.replies).toEqual(['ok']);
    expect(a.text.toString()).toBe('A:hello world B!');
    expect(b.text.toString()).toBe('A:hello world B!');
    expect(textOf(h1.doc)).toBe('A:hello world B!');

    h1.release();
    expect(registry.loadedKeys()).toEqual([KEY]);
    h2.release();
    // The last release folds the tail into the state; the document stays loaded for the idle delay.
    expect(count(db, 'collab_updates')).toBe(0);
    expect(registry.loadedKeys()).toEqual([KEY]);
    vi.advanceTimersByTime(5000);
    expect(registry.loadedKeys()).toEqual([]);

    const again = registry.open(KEY, { deviceId: 'dev-1' });
    expect(textOf(again.doc)).toBe('A:hello world B!');
    again.release();
  });

  it('keeps a document loaded when it is reopened within the idle delay', () => {
    const db = freshDb();
    putMarkdown(db, 'x');
    const { registry } = makeRegistry(db, { idleUnloadMs: 5000 });
    const first = registry.open(KEY, { deviceId: 'dev-1' });
    const doc = first.doc;
    first.release();
    vi.advanceTimersByTime(4000);
    const second = registry.open(KEY, { deviceId: 'dev-1' });
    vi.advanceTimersByTime(10_000);
    expect(registry.loadedKeys()).toEqual([KEY]);
    expect(second.doc).toBe(doc);
    second.release();
  });

  it('refuses an update that would push the document over the record cap, and still allows small and shrinking edits', () => {
    const db = freshDb();
    putMarkdown(db, 'a'.repeat(100_000));
    const { registry } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    c.text.insert(0, 'b'.repeat(40_000));
    expect(c.replies).toEqual(['too-large']);
    expect(textOf(handle.doc)).toHaveLength(100_000);
    expect(textOf(handle.doc).startsWith('a')).toBe(true);

    c.replies.length = 0;
    const small = new Y.Doc();
    Y.applyUpdate(small, Y.encodeStateAsUpdate(handle.doc));
    const before = Y.encodeStateVector(small);
    small.getText(MARKDOWN_TEXT).insert(0, 'ten chars!');
    expect(handle.apply(Y.encodeStateAsUpdate(small, before), { deviceId: 'dev-1' })).toEqual({ ok: true });
    expect(textOf(handle.doc)).toHaveLength(100_010);

    const shrink = new Y.Doc();
    Y.applyUpdate(shrink, Y.encodeStateAsUpdate(handle.doc));
    const mark = Y.encodeStateVector(shrink);
    shrink.getText(MARKDOWN_TEXT).delete(0, 50_000);
    expect(handle.apply(Y.encodeStateAsUpdate(shrink, mark), { deviceId: 'dev-1' })).toEqual({ ok: true });
    expect(textOf(handle.doc)).toHaveLength(50_010);
    handle.release();
  });

  it('compacts the tail while a document stays open once it reaches the threshold', () => {
    const db = freshDb();
    putMarkdown(db, '');
    const { registry } = makeRegistry(db, { compactAfterUpdates: 5, store: { flushCount: 1 } });
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    for (let i = 0; i < 5; i += 1) c.text.insert(c.text.length, String(i));
    expect(count(db, 'collab_updates')).toBe(0);
    c.text.insert(c.text.length, '5');
    expect(count(db, 'collab_updates')).toBe(1);
    expect(textOf(registry.store.loadDoc(KEY))).toBe('012345');
    handle.release();
  });

  it('refuses a room key and rejects applies after eviction', () => {
    const db = freshDb();
    putMarkdown(db, 'x');
    const { registry } = makeRegistry(db);
    expect(() => registry.open('room:abc', { deviceId: 'dev-1' })).toThrow(RangeError);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const closedWith: string[] = [];
    handle.onClosed((reason) => closedWith.push(reason));
    registry.evict(KEY);
    expect(closedWith).toEqual(['evicted']);
    expect(registry.loadedKeys()).toEqual([]);
    for (const table of ['collab_docs', 'collab_updates', 'collab_bases']) expect([table, count(db, table)]).toEqual([table, 0]);
    expect(handle.apply(new Uint8Array([0, 0]), { deviceId: 'dev-1' })).toEqual({ ok: false, code: 'closed' });
    handle.release();
  });

  it('closeAll writes, compacts and ends every handle but leaves the registry usable', () => {
    const db = freshDb();
    putMarkdown(db, 'x');
    const { registry } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const closedWith: string[] = [];
    handle.onClosed((reason) => closedWith.push(reason));
    client(handle, 'dev-1').text.insert(1, 'y');
    registry.closeAll();
    expect(closedWith).toEqual(['shutdown']);
    expect(recordOf(db)?.payload).toMatchObject({ body: 'xy' });
    expect(count(db, 'collab_updates')).toBe(0);
    const reopened = registry.open(KEY, { deviceId: 'dev-1' });
    expect(textOf(reopened.doc)).toBe('xy');
    reopened.release();
  });
});

describe('collab materializer', () => {
  it('writes 2 s after the last edit as a revision attributed to the editor, with the base and the change nudge', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, 'hello');
    const { registry, events } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-2' });
    const c = client(handle, 'dev-2');
    c.text.insert(5, ' there');
    vi.advanceTimersByTime(1999);
    expect(currentRevision(db)).toBe(seeded);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);

    const record = recordOf(db)!;
    expect(record.revision).toBe(seeded + 1);
    expect(record.updatedByDeviceId).toBe('dev-2');
    expect(record.payload).toMatchObject({ id: 'm1', title: 'Doc', body: 'hello there', createdAt: T0.toISOString() });
    expect((record.payload as { updatedAt: string }).updatedAt).toBe(new Date(Date.now()).toISOString());
    expect(db.prepare("SELECT device_id FROM change_feed WHERE revision = ?").get(record.revision)).toEqual({ device_id: 'dev-2' });
    expect(db.prepare('SELECT payload_json FROM collab_bases WHERE revision = ?').get(record.revision)).toEqual({ payload_json: JSON.stringify(record.payload) });
    expect(db.prepare('SELECT materialized_revision FROM collab_docs WHERE doc_key = ?').get(KEY)).toEqual({ materialized_revision: record.revision });
    expect(events).toEqual([{ environmentId: ENV, revision: record.revision, originDeviceId: null }]);
    handle.release();
  });

  it('writes at most 10 s after the first edit of a continuous run', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, '');
    const { registry } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    for (let i = 0; i < 9; i += 1) {
      c.text.insert(c.text.length, '.');
      vi.advanceTimersByTime(1000);
    }
    expect(currentRevision(db)).toBe(seeded);
    c.text.insert(c.text.length, '.');
    vi.advanceTimersByTime(1000);
    expect(currentRevision(db)).toBe(seeded + 1);
    expect(recordOf(db)?.payload).toMatchObject({ body: '.'.repeat(10) });
    handle.release();
  });

  it('does not write when the edit cancelled itself out, but still records the base for the current revision', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, 'same');
    const { registry, events } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    const c = client(handle, 'dev-1');
    c.text.insert(4, '!');
    c.text.delete(4, 1);
    vi.advanceTimersByTime(2000);
    expect(currentRevision(db)).toBe(seeded);
    expect(events).toEqual([]);
    expect(count(db, 'collab_bases')).toBe(1);
    handle.release();
  });

  it('materializes on the last release without waiting for the debounce', () => {
    const db = freshDb();
    putMarkdown(db, 'a');
    const { registry } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    client(handle, 'dev-1').text.insert(1, 'b');
    expect(registry.materializer.pending(KEY)).toBe(true);
    handle.release();
    expect(registry.materializer.pending(KEY)).toBe(false);
    expect(recordOf(db)?.payload).toMatchObject({ body: 'ab' });
  });

  it('falls back to the most recent active editor, and retries when none is active', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, '');
    const { registry } = makeRegistry(db);
    const h1 = registry.open(KEY, { deviceId: 'dev-1' });
    const h2 = registry.open(KEY, { deviceId: 'dev-2' });
    const a = client(h1, 'dev-1');
    const b = client(h2, 'dev-2');
    a.text.insert(0, 'a');
    b.text.insert(1, 'b');
    db.prepare("UPDATE devices SET revoked_at = ? WHERE device_id = 'dev-2'").run(T0.toISOString());
    vi.advanceTimersByTime(2000);
    expect(recordOf(db)).toMatchObject({ revision: seeded + 1, updatedByDeviceId: 'dev-1' });

    db.prepare("UPDATE devices SET revoked_at = ? WHERE device_id = 'dev-1'").run(T0.toISOString());
    a.text.insert(2, 'c');
    vi.advanceTimersByTime(2000);
    expect(currentRevision(db)).toBe(seeded + 1);
    db.prepare("UPDATE devices SET revoked_at = NULL WHERE device_id = 'dev-1'").run();
    vi.advanceTimersByTime(10_000);
    expect(recordOf(db)).toMatchObject({ revision: seeded + 2, updatedByDeviceId: 'dev-1', payload: { body: 'abc' } });
    h1.release();
    h2.release();
  });

  it('skips a Hub web browser whose category is off, and writes as the browser once the owner turns it on', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, '');
    const { registry } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'br-1' });
    client(handle, 'br-1').text.insert(0, 'web');
    vi.advanceTimersByTime(2000);
    expect(currentRevision(db)).toBe(seeded);
    setWebAccess(db, ENV, 'collab-documents', true, T0.toISOString());
    vi.advanceTimersByTime(10_000);
    expect(recordOf(db)).toMatchObject({ revision: seeded + 1, updatedByDeviceId: 'br-1', payload: { body: 'web' } });
    handle.release();
  });

  it('does not let a signed-out browser author a revision', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, '');
    setWebAccess(db, ENV, 'collab-documents', true, T0.toISOString());
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE session_hash = 'sess-1'").run(T0.toISOString());
    const { registry } = makeRegistry(db);
    const handle = registry.open(KEY, { deviceId: 'br-1' });
    client(handle, 'br-1').text.insert(0, 'x');
    vi.advanceTimersByTime(30_000);
    expect(currentRevision(db)).toBe(seeded);
    handle.release();
  });

  it('catches up a stored document that is ahead of its record when it is next opened', () => {
    const db = freshDb();
    const seeded = putMarkdown(db, 'a');
    const { registry } = makeRegistry(db, { idleUnloadMs: 1000 });
    db.prepare("UPDATE devices SET revoked_at = ? WHERE device_id = 'dev-1'").run(T0.toISOString());
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    client(handle, 'dev-1').text.insert(1, 'b');
    handle.release();
    expect(currentRevision(db)).toBe(seeded);
    vi.advanceTimersByTime(1000);
    expect(registry.loadedKeys()).toEqual([]);

    db.prepare("UPDATE devices SET revoked_at = NULL WHERE device_id = 'dev-1'").run();
    const again = registry.open(KEY, { deviceId: 'dev-1' });
    expect(textOf(again.doc)).toBe('ab');
    vi.advanceTimersByTime(2000);
    expect(recordOf(db)).toMatchObject({ revision: seeded + 1, payload: { body: 'ab' } });
    again.release();
  });

  it('does not overwrite a record that changed behind a stored document (the three-way merge decides, PD-102)', () => {
    const db = freshDb();
    putMarkdown(db, 'a');
    const { registry } = makeRegistry(db, { idleUnloadMs: 1000 });
    const handle = registry.open(KEY, { deviceId: 'dev-1' });
    handle.release();
    vi.advanceTimersByTime(1000);
    const newer = putMarkdown(db, 'device edit');
    const again = registry.open(KEY, { deviceId: 'dev-1' });
    vi.advanceTimersByTime(30_000);
    expect(recordOf(db)).toMatchObject({ revision: newer, payload: { body: 'device edit' } });
    again.release();
  });

  it('creates the scratchpad record for a scratchpad nobody has synced, but not an empty one', () => {
    const db = freshDb();
    const { registry } = makeRegistry(db);
    const untouched = registry.open('scratchpad:default', { deviceId: 'dev-1' });
    vi.advanceTimersByTime(30_000);
    expect(recordOf(db, 'scratchpad', 'default')).toBeUndefined();

    addSnippet(untouched.doc, { id: 's1', title: 'T', body: 'B', createdAt: T0.toISOString() });
    untouched.apply(Y.encodeStateAsUpdate(untouched.doc), { deviceId: 'dev-1' });
    vi.advanceTimersByTime(2000);
    const record = recordOf(db, 'scratchpad', 'default')!;
    expect(record.payload).toMatchObject({ schemaVersion: 1, snippets: [{ id: 's1', title: 'T', body: 'B' }] });
    expect(record.updatedByDeviceId).toBe('dev-1');
    expect(readSnippet(registry.store.loadDoc('scratchpad:default'), 's1')).toMatchObject({ title: 'T' });
    untouched.release();
  });

  it('refuses a payload over the record cap with a content-free warning', () => {
    const db = freshDb();
    putMarkdown(db, 'small');
    const store = createCollabDocStore({ db, now: () => Date.now() });
    closers.push(() => store.close());
    const doc = new Y.Doc();
    doc.getText(MARKDOWN_TEXT).insert(0, 'SECRET-CONTENT'.repeat(10_000));
    expect(doc.getText(MARKDOWN_TEXT).length).toBeGreaterThan(SYNC_LIMITS.maxRecordBytes);
    const materializer = createMaterializer({
      db, now: () => Date.now(), store, log, emitRecordsChanged: () => undefined,
      resolveSource: () => ({ docKey: KEY, kind: 'markdown-doc', doc, editors: () => ['dev-1'] }),
    });
    const before = currentRevision(db);
    expect(materializer.flush(KEY)).toBe('too-large');
    expect(currentRevision(db)).toBe(before);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.fields).toMatchObject({ event: 'collab.materialize-refused', reason: 'too-large', doc: KEY });
    expect(JSON.stringify(warnings)).not.toContain('SECRET');
    materializer.close();
  });
});

describe('collab cascades', () => {
  it('a record tombstone deletes the document rows in the same commit, and only that document', () => {
    const db = freshDb();
    putMarkdown(db, 'x');
    const store = createCollabDocStore({ db, now: () => Date.now() });
    closers.push(() => store.close());
    store.loadDoc(KEY);
    store.loadDoc('scratchpad:default');
    db.prepare("INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES ('s1', ?, 't', '{}', 2)").run(KEY);
    expect(count(db, 'collab_bases')).toBe(1);

    commitCanonical(db, { environmentId: ENV, entityType: 'markdown-doc', entityId: 'm1', op: 'delete', now: T0.toISOString() });
    for (const table of ['collab_docs', 'collab_updates', 'collab_snapshots', 'collab_bases']) expect([table, count(db, table)]).toEqual([table, 0]);
    expect(count(db, 'collab_docs', 'scratchpad:default')).toBe(1);
  });
});
