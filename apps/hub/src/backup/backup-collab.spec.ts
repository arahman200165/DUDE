import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import { openBackup } from '@dude/hub-backup';
import type { Db } from '@dude/sqlite-store';
import { hubPaths } from '../config/data-dir.js';
import { commitCanonical, getCanonicalRecord } from '../db/canonical-repository.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { createCollabRegistry } from '../collab/doc-registry.js';
import type { CollabRegistry } from '../collab/doc-registry.js';
import { createCollabRooms } from '../collab/rooms.js';
import type { CollabRooms } from '../collab/rooms.js';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { createBackupFile } from './create-backup.js';
import { applyRestore, previewRestore } from './restore.js';

/**
 * Collaborative documents in a backup (PD-105): a backup taken while a document is loaded holds its current content once the
 * running Hub flushes the collaboration registry before the `VACUUM INTO` copy, a restored Hub loads the same document with a
 * matching record, history snapshots survive, notifications are scrubbed and in-memory rooms are never part of a backup.
 */
const PASSPHRASE = 'collab backup passphrase';
const ENV = 'env-1';
const KEY = 'markdown-doc:m1';
const ROOM_MARKER = 'ROOM-ONLY-TEXT-5c1e';
const START = Date.parse('2026-10-04T12:00:00Z');
// Nothing flushes or materializes on its own during a spec: only an explicit flush gets in-memory state into the database.
const SLOW = { store: { flushMs: 600_000, flushCount: 10_000 }, materializer: { quietMs: 600_000, maxWaitMs: 600_000 } };

const roots: string[] = [];
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) {
    try { cleanups.pop()!(); } catch { /* already closed */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const root = (label: string): string => {
  const dir = tempRoot(label);
  roots.push(dir);
  return dir;
};

function registryOn(db: Db): CollabRegistry {
  const registry = createCollabRegistry({ db, now: () => Date.now(), emitRecordsChanged: () => undefined, ...SLOW });
  cleanups.push(() => registry.dispose());
  return registry;
}

function rooms(): CollabRooms {
  const made = createCollabRooms({ now: () => Date.now() });
  cleanups.push(() => made.dispose());
  return made;
}

/** Applies an edit through a handle the way a socket subscriber would. */
function edit(handle: ReturnType<CollabRegistry['open']>, change: (text: Y.Text) => void): void {
  const local = new Y.Doc();
  Y.applyUpdate(local, Y.encodeStateAsUpdate(handle.doc));
  const before = Y.encodeStateVector(local);
  change(local.getText(MARKDOWN_TEXT));
  expect(handle.apply(Y.encodeStateAsUpdate(local, before), { deviceId: 'dev-1' })).toEqual({ ok: true });
}

interface Source { hub: HubDb; base: string; registry: CollabRegistry; handle: ReturnType<CollabRegistry['open']> }

/** A seeded Hub with one collaborative Markdown document loaded and edited in memory (buffered update, pending materialization). */
function liveSource(): Source {
  const base = root('collab-src');
  const { hub } = openFixtureHub(base);
  cleanups.push(() => hub.close());
  seedHubDb(hub.db);
  const at = '2026-10-04T10:00:00.000Z';
  commitCanonical(hub.db, { environmentId: ENV, entityType: 'markdown-doc', entityId: 'm1', op: 'upsert', payload: { id: 'm1', title: 'Doc', body: 'hello', createdAt: at, updatedAt: at }, now: at });
  hub.db.prepare("INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES ('snap-m1', ?, ?, ?, 2)").run(KEY, at, '{"body":"old"}');
  const registry = registryOn(hub.db);
  const handle = registry.open(KEY, { deviceId: 'dev-1' });
  edit(handle, (text) => text.insert(5, ' there'));
  return { hub, base, registry, handle };
}

async function backup(source: Source, folder: string, beforeSnapshot?: () => void): Promise<string> {
  const paths = hubPaths(source.base);
  const created = await createBackupFile({
    db: source.hub.db, paths, hubVersion: '1.2.3', hubInstanceId: source.hub.hubInstanceId, authorityEpoch: 3, forTransfer: false,
    targetDir: path.join(source.base, folder), credential: { passphrase: PASSPHRASE }, deps: cheapDeps(), workDir: path.join(paths.backupsDir, '.tmp'),
    ...(beforeSnapshot ? { beforeSnapshot } : {}),
  });
  return created.file;
}

async function restoreInto(file: string): Promise<HubDb> {
  const target = root('collab-dst');
  const deps = cheapDeps(() => new Date(START));
  const preview = await previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps, now: () => START, newToken: () => 'tok-1' });
  await applyRestore({ file, passphrase: PASSPHRASE, dataRoot: target, confirmToken: preview.confirmToken, deps, now: () => START, newId: () => 'restored-hub', oldHubGoneConfirmed: true });
  const paths = hubPaths(target);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error(opened.message);
  cleanups.push(() => opened.hub.close());
  return opened.hub;
}

const bodyOf = (db: Db): unknown => (getCanonicalRecord(db, ENV, 'markdown-doc', 'm1')?.payload as { body?: unknown } | undefined)?.body;
const count = (db: Db, sql: string): number => Number((db.prepare(sql).get() as { n: number }).n);

describe('backup of collaborative documents', () => {
  it('would miss buffered edits without the pre-snapshot flush (why the running Hub passes collab.flushAll)', async () => {
    const source = liveSource();
    expect(count(source.hub.db, `SELECT COUNT(*) AS n FROM collab_updates WHERE doc_key = '${KEY}'`)).toBe(0);
    expect(bodyOf(source.hub.db)).toBe('hello');
    const file = await backup(source, 'unflushed');
    const restored = await restoreInto(file);
    expect(registryOn(restored.db).open(KEY, { deviceId: null }).doc.getText(MARKDOWN_TEXT).toString()).toBe('hello');
    source.handle.release();
  });

  it('includes the flushed state of a loaded document; the restored Hub loads identical content with a matching record', async () => {
    const source = liveSource();
    const file = await backup(source, 'flushed', () => source.registry.flushAll());
    // The flush wrote the buffered update and the pending materialization into the live database too.
    expect(bodyOf(source.hub.db)).toBe('hello there');
    expect(source.registry.loadedKeys()).toEqual([KEY]);
    const liveText = source.handle.doc.getText(MARKDOWN_TEXT).toString();
    expect(liveText).toBe('hello there');

    const restored = await restoreInto(file);
    const db = restored.db;
    expect(bodyOf(db)).toBe(liveText);
    const doc = registryOn(db).open(KEY, { deviceId: null }).doc;
    expect(doc.getText(MARKDOWN_TEXT).toString()).toBe(liveText);
    // Same CRDT content, not just the same string: the restored state equals the live document state.
    const live = new Y.Doc();
    Y.applyUpdate(live, Y.encodeStateAsUpdate(source.handle.doc));
    Y.applyUpdate(live, Y.encodeStateAsUpdate(doc));
    expect(live.getText(MARKDOWN_TEXT).toString()).toBe(liveText);
    const materialized = (db.prepare('SELECT materialized_revision AS r FROM collab_docs WHERE doc_key = ?').get(KEY) as { r: number }).r;
    expect(materialized).toBe(getCanonicalRecord(db, ENV, 'markdown-doc', 'm1')!.revision);
    expect(db.prepare('SELECT payload_json FROM collab_bases WHERE doc_key = ? AND revision = ?').get(KEY, materialized)).toBeDefined();

    // History snapshots survive; notifications are scrubbed.
    expect(db.prepare('SELECT id, payload_json FROM collab_snapshots WHERE doc_key = ?').all(KEY)).toEqual([{ id: 'snap-m1', payload_json: '{"body":"old"}' }]);
    expect(count(source.hub.db, 'SELECT COUNT(*) AS n FROM notifications')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM notifications')).toBe(0);
    source.handle.release();
  });

  it('never carries an in-memory room', async () => {
    const source = liveSource();
    const hubRooms = rooms();
    const created = hubRooms.create('Planning');
    if (!created.ok) throw new Error('room not created');
    const joined = hubRooms.join(created.room.id);
    if (!joined.ok) throw new Error('room not joined');
    const local = new Y.Doc();
    local.getText(MARKDOWN_TEXT).insert(0, ROOM_MARKER);
    expect(joined.handle.apply(Y.encodeStateAsUpdate(local), { deviceId: 'dev-1' })).toEqual({ ok: true });
    expect(hubRooms.text(created.room.id)).toBe(ROOM_MARKER);

    const file = await backup(source, 'rooms', () => source.registry.flushAll());
    const opened = await openBackup(new Uint8Array(readFileSync(file)), { passphrase: PASSPHRASE }, cheapDeps());
    const dbBytes = opened.files.get('dude.db')!;
    expect(Buffer.from(dbBytes).includes(Buffer.from(ROOM_MARKER))).toBe(false);
    expect(Buffer.from(dbBytes).includes(Buffer.from(created.room.id))).toBe(false);

    const restored = await restoreInto(file);
    expect(count(restored.db, `SELECT COUNT(*) AS n FROM collab_docs WHERE doc_key LIKE 'room:%' OR kind = 'room'`)).toBe(0);
    joined.handle.release();
    source.handle.release();
  });
});
