import * as Y from 'yjs';
import { allRows, getRow, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { parseCollabDocKey, seedCollabDoc } from '@dude/collab-doc';
import type { CollabDocKind } from '@dude/collab-doc';
import { getCanonicalRecord } from '../db/canonical-repository.js';

/** The structured logger the collaboration modules use (Fastify's `app.log` fits); never given document content. */
export interface CollabLog {
  warn(fields: Record<string, unknown>, message: string): void;
}

export interface CollabDocStoreOptions {
  db: Db;
  now?: () => number;
  log?: CollabLog;
  /** The buffered update tail is written at most this long after the first buffered update (default 1 s). */
  flushMs?: number;
  /** ...or as soon as one document has this many buffered updates (default 50). */
  flushCount?: number;
}

export interface LoadedDoc {
  doc: Y.Doc;
  /** The record revision the document content is known to equal, or null (nothing materialized or seeded from a record yet). */
  materializedRevision: number | null;
  /** True when this load created the document row (seeded from the record). */
  seeded: boolean;
}

export interface CollabDocStore {
  /** The document for `docKey`: state plus the update tail when its row exists, else seeded once from the current record. */
  loadDoc(docKey: string): Y.Doc;
  loadDocWithMeta(docKey: string): LoadedDoc;
  /** Buffers one Yjs update for the document's tail; written within `flushMs` or `flushCount` updates, whichever is first. */
  appendUpdate(docKey: string, update: Uint8Array): void;
  /** Writes buffered updates now (one document, or all of them). */
  flush(docKey?: string): void;
  /** Replaces the stored state with the document's full state and drops its tail, in one transaction. */
  compact(docKey: string, doc: Y.Doc): void;
  /** Updates in the tail, buffered ones included. */
  tailLength(docKey: string): number;
  /** Deletes the document's state, tail, snapshots and bases. */
  deleteDoc(docKey: string): void;
  /** Deletes every document (an environment clear). */
  deleteAll(): void;
  /** Records the record revision the document content now equals, plus the payload as the three-way merge base for it. */
  recordMaterialized(docKey: string, revision: number, payloadJson: string): void;
  /** Document keys that have a stored row. */
  listDocKeys(): string[];
  /** Flushes and stops the flush timer; appending afterwards throws. */
  close(): void;
}

const LOAD_ORIGIN = 'collab-load';
const DOC_TABLES = ['collab_updates', 'collab_snapshots', 'collab_bases', 'collab_docs'] as const;

function ownerEnvironment(db: Db): string | undefined {
  return getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
}

function refOf(docKey: string): { kind: CollabDocKind; id: string } {
  const ref = parseCollabDocKey(docKey);
  // Rooms are ephemeral: no row, no record, never persisted.
  if (!ref || ref.kind === 'room') throw new RangeError('Not a persisted collaborative document key.');
  return ref;
}

export function createCollabDocStore(options: CollabDocStoreOptions): CollabDocStore {
  const { db } = options;
  const now = options.now ?? Date.now;
  const flushMs = options.flushMs ?? 1000;
  const flushCount = options.flushCount ?? 50;
  const iso = (): string => new Date(now()).toISOString();
  const buffer = new Map<string, Uint8Array[]>();
  const tails = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const stopTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  function flush(docKey?: string): void {
    const keys = docKey === undefined ? [...buffer.keys()] : buffer.has(docKey) ? [docKey] : [];
    if (keys.length === 0) return;
    const at = iso();
    // Only a document whose row exists keeps a tail: an update that races a deletion must not leave an orphan.
    const insert = db.prepare('INSERT INTO collab_updates(doc_key, update_blob, at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM collab_docs WHERE doc_key = ?)');
    const pending = keys.map((key) => [key, buffer.get(key) ?? []] as const);
    for (const key of keys) buffer.delete(key);
    try {
      transaction(db, () => {
        for (const [key, updates] of pending) for (const update of updates) insert.run(key, update, at, key);
      });
    } catch (error) {
      // Keep the updates for the next attempt rather than losing them; the caller decides whether this is fatal.
      for (const [key, updates] of pending) buffer.set(key, [...updates, ...(buffer.get(key) ?? [])]);
      throw error;
    }
    for (const [key, updates] of pending) tails.set(key, (tails.get(key) ?? 0) + updates.length);
    if (buffer.size === 0) stopTimer();
  }

  function scheduleFlush(): void {
    if (timer !== undefined || closed) return;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        flush();
      } catch (error) {
        options.log?.warn({ event: 'collab.flush-failed', code: (error as { code?: unknown }).code }, 'Collaborative update tail could not be written; it will be retried.');
        scheduleFlush();
      }
    }, flushMs);
    timer.unref?.();
  }

  function loadDocWithMeta(docKey: string): LoadedDoc {
    const ref = refOf(docKey);
    // Anything still buffered for this document belongs to the tail before it is replayed.
    flush(docKey);
    const row = getRow<{ state: Uint8Array; materialized_revision: number | null }>(
      db.prepare('SELECT state, materialized_revision FROM collab_docs WHERE doc_key = ?'), docKey);
    // A fresh random clientID per load, never persisted or reused: two loads of one document can never mint colliding Yjs ids.
    const doc = new Y.Doc();
    if (row) {
      Y.applyUpdate(doc, row.state, LOAD_ORIGIN);
      const tail = allRows<{ update_blob: Uint8Array }>(db.prepare('SELECT update_blob FROM collab_updates WHERE doc_key = ? ORDER BY seq'), docKey);
      for (const entry of tail) Y.applyUpdate(doc, entry.update_blob, LOAD_ORIGIN);
      tails.set(docKey, tail.length);
      db.prepare('UPDATE collab_docs SET last_opened_at = ? WHERE doc_key = ?').run(iso(), docKey);
      return { doc, materializedRevision: row.materialized_revision, seeded: false };
    }

    // First load: the Hub (and only the Hub) seeds the content from the current record, or starts empty when the record does not exist yet.
    const environmentId = ownerEnvironment(db);
    const record = environmentId === undefined ? undefined : getCanonicalRecord(db, environmentId, ref.kind, ref.id);
    const live = record !== undefined && !record.deleted && typeof record.payload === 'object' && record.payload !== null ? record : undefined;
    seedCollabDoc(doc, ref.kind, (live?.payload ?? {}) as Record<string, unknown>);
    const state = Y.encodeStateAsUpdate(doc);
    const at = iso();
    transaction(db, () => {
      db.prepare(
        `INSERT INTO collab_docs(doc_key, kind, entity_type, entity_id, state, bytes, materialized_revision, created_at, updated_at, last_opened_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(docKey, ref.kind, ref.kind, ref.id, state, state.byteLength, live?.revision ?? null, at, at, at);
      // The seeded payload is the merge base for a later non-Yjs write that was based on the revision seeded from (PD-102).
      if (live) {
        db.prepare('INSERT OR REPLACE INTO collab_bases(doc_key, revision, payload_json, at) VALUES(?, ?, ?, ?)').run(docKey, live.revision, JSON.stringify(live.payload), at);
      }
    });
    tails.set(docKey, 0);
    return { doc, materializedRevision: live?.revision ?? null, seeded: true };
  }

  return {
    loadDoc: (docKey) => loadDocWithMeta(docKey).doc,
    loadDocWithMeta,

    appendUpdate(docKey, update) {
      if (closed) throw new Error('The collaborative document store is closed.');
      const queue = buffer.get(docKey) ?? [];
      queue.push(update);
      buffer.set(docKey, queue);
      if (queue.length >= flushCount) flush(docKey);
      else scheduleFlush();
    },

    flush,

    compact(docKey, doc) {
      // The full state includes every buffered update, so the buffer is dropped rather than written and then deleted.
      buffer.delete(docKey);
      const state = Y.encodeStateAsUpdate(doc);
      transaction(db, () => {
        db.prepare('UPDATE collab_docs SET state = ?, bytes = ?, updated_at = ? WHERE doc_key = ?').run(state, state.byteLength, iso(), docKey);
        db.prepare('DELETE FROM collab_updates WHERE doc_key = ?').run(docKey);
      });
      tails.set(docKey, 0);
      if (buffer.size === 0) stopTimer();
    },

    tailLength: (docKey) => (tails.get(docKey) ?? 0) + (buffer.get(docKey)?.length ?? 0),

    deleteDoc(docKey) {
      buffer.delete(docKey);
      tails.delete(docKey);
      transaction(db, () => {
        for (const table of DOC_TABLES) db.prepare(`DELETE FROM ${table} WHERE doc_key = ?`).run(docKey);
      });
      if (buffer.size === 0) stopTimer();
    },

    deleteAll() {
      buffer.clear();
      tails.clear();
      transaction(db, () => {
        for (const table of DOC_TABLES) db.exec(`DELETE FROM ${table}`);
      });
      stopTimer();
    },

    recordMaterialized(docKey, revision, payloadJson) {
      const at = iso();
      transaction(db, () => {
        db.prepare('INSERT OR REPLACE INTO collab_bases(doc_key, revision, payload_json, at) VALUES(?, ?, ?, ?)').run(docKey, revision, payloadJson, at);
        db.prepare('UPDATE collab_docs SET materialized_revision = ?, updated_at = ? WHERE doc_key = ?').run(revision, at, docKey);
      });
    },

    listDocKeys: () => allRows<{ doc_key: string }>(db.prepare('SELECT doc_key FROM collab_docs ORDER BY doc_key')).map((r) => r.doc_key),

    close() {
      if (closed) return;
      stopTimer();
      try {
        flush();
      } finally {
        closed = true;
      }
    },
  };
}
