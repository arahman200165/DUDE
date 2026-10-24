import * as Y from 'yjs';
import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { contentBytes, parseCollabDocKey } from '@dude/collab-doc';
import type { CollabDocKind } from '@dude/collab-doc';
import { SYNC_LIMITS } from '@dude/sync';
import { getCanonicalRecord } from '../db/canonical-repository.js';
import { createCollabDocStore } from './doc-store.js';
import type { CollabDocStore, CollabDocStoreOptions, CollabLog } from './doc-store.js';
import { createMaterializer } from './materializer.js';
import type { MaterializeSource, Materializer, MaterializerOptions } from './materializer.js';
import { createCollabHistory } from './history.js';
import type { CollabHistory, CollabHistoryOptions } from './history.js';

/** A document unloads this long after its last subscriber released it (its state is already compacted by then). */
export const COLLAB_IDLE_UNLOAD_MS = 60_000;
/** The update tail is folded into the stored state once it reaches this many updates while a document stays open. */
export const COLLAB_COMPACT_AFTER_UPDATES = 200;
/**
 * Materialized JSON grows by at most this many bytes per update byte (a control character escapes to six bytes), so an
 * update that cannot reach the cap even at this bound skips the trial apply on a clone.
 */
const MAX_JSON_GROWTH_PER_UPDATE_BYTE = 6;
const RECENT_EDITORS = 16;

/** Who opens or edits a document: the authenticated device (desktop or Hub web browser row), or null for an owner session without a row. */
export interface CollabPrincipal { deviceId: string | null }

export type CollabApplyResult = { ok: true } | { ok: false; code: 'too-large' | 'closed' };
export type CollabCloseReason = 'evicted' | 'shutdown';

export interface CollabDocHandle {
  readonly docKey: string;
  /** The live document. Read it; change it only through `apply` (the registry persists and materializes what `apply` accepts). */
  readonly doc: Y.Doc;
  /**
   * Applies one Yjs update from a subscriber (the handle is the transaction origin). Refuses it when the document would exceed the
   * record cap. A malformed update throws from Yjs and changes nothing; the socket layer treats that as a protocol error.
   */
  apply(update: Uint8Array, editor: CollabPrincipal): CollabApplyResult;
  /** Called for every update the document receives (this handle's own included: compare `origin` with the handle), and until released. */
  onUpdate(listener: (update: Uint8Array, origin: unknown) => void): () => void;
  /** Called once when the document is evicted (record deleted, environment cleared) or the registry shuts down; later applies answer `closed`. */
  onClosed(listener: (reason: CollabCloseReason) => void): () => void;
  /** Idempotent. The last release materializes, compacts and schedules the unload. */
  release(): void;
}

export interface CollabRegistryOptions {
  db: Db;
  now: () => number;
  log?: CollabLog;
  /** Emits the normal `records-changed` event after a materialization (the server maps it onto `hubEvents`). */
  emitRecordsChanged: MaterializerOptions['emitRecordsChanged'];
  idleUnloadMs?: number;
  compactAfterUpdates?: number;
  store?: Pick<CollabDocStoreOptions, 'flushMs' | 'flushCount'>;
  materializer?: Pick<MaterializerOptions, 'quietMs' | 'maxWaitMs' | 'retryMs'>;
  /** History snapshot timings and caps (PD-105; tests inject short ones). */
  history?: Pick<CollabHistoryOptions, 'idleMs' | 'minIntervalMs' | 'maxSnapshots' | 'maxBytes'>;
}

export interface CollabRegistry {
  open(docKey: string, opener: CollabPrincipal): CollabDocHandle;
  /** Deletes the document's collaborative state (record deleted) and ends its handles. Safe for a document that is not loaded. */
  evict(docKey: string): void;
  /** Deletes all collaborative state (environment cleared) and ends every handle. */
  evictAll(): void;
  /** Materializes, compacts and unloads every document and flushes the update tail; the registry stays usable (manual transfer). */
  closeAll(): void;
  /** `closeAll`, then stops the store and materializer for good (server shutdown). */
  dispose(): void;
  /** Currently loaded document keys (diagnostics and tests). */
  loadedKeys(): string[];
  readonly store: CollabDocStore;
  readonly materializer: Materializer;
  /** Version history snapshots (PD-105) of the loaded documents. */
  readonly history: CollabHistory;
}

interface Entry {
  readonly docKey: string;
  readonly kind: CollabDocKind;
  readonly doc: Y.Doc;
  readonly handles: Set<Handle>;
  lastEditor: string | null;
  openers: string[];
  applying: CollabPrincipal | undefined;
  bytes: number | null;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

interface Handle extends CollabDocHandle {
  readonly entry: Entry;
  readonly updateListeners: Set<(update: Uint8Array, origin: unknown) => void>;
  readonly closedListeners: Set<(reason: CollabCloseReason) => void>;
  released: boolean;
  closed: boolean;
}

const pushFront = (list: string[], value: string, limit: number): void => {
  const at = list.indexOf(value);
  if (at >= 0) list.splice(at, 1);
  list.unshift(value);
  if (list.length > limit) list.length = limit;
};

export function createCollabRegistry(options: CollabRegistryOptions): CollabRegistry {
  const { db, now } = options;
  const idleUnloadMs = options.idleUnloadMs ?? COLLAB_IDLE_UNLOAD_MS;
  const compactAfter = options.compactAfterUpdates ?? COLLAB_COMPACT_AFTER_UPDATES;
  const entries = new Map<string, Entry>();
  /** Editors seen in this process, most recent first: the fallback author when a document's last editor is gone. */
  const recentEditors: string[] = [];

  const store = createCollabDocStore({ db, now, ...(options.log ? { log: options.log } : {}), ...options.store });
  const materializer = createMaterializer({
    db, now, store, emitRecordsChanged: options.emitRecordsChanged, ...(options.log ? { log: options.log } : {}), ...options.materializer,
    resolveSource: (docKey): MaterializeSource | undefined => {
      const entry = entries.get(docKey);
      if (!entry) return undefined;
      return {
        docKey, kind: entry.kind, doc: entry.doc,
        editors: () => [...(entry.lastEditor === null ? [] : [entry.lastEditor]), ...recentEditors, ...entry.openers],
      };
    },
  });

  const history = createCollabHistory({
    db, now, ...(options.log ? { log: options.log } : {}), ...options.history,
    resolveSource: (docKey) => {
      const entry = entries.get(docKey);
      return entry ? { docKey, kind: entry.kind, doc: entry.doc } : undefined;
    },
  });

  const bytesOf = (entry: Entry): number => {
    entry.bytes ??= contentBytes(entry.doc, entry.kind);
    return entry.bytes;
  };

  function onDocUpdate(entry: Entry, update: Uint8Array, origin: unknown): void {
    entry.bytes = null;
    const editor = entry.applying?.deviceId ?? null;
    if (editor !== null) {
      entry.lastEditor = editor;
      pushFront(recentEditors, editor, RECENT_EDITORS);
    }
    store.appendUpdate(entry.docKey, update);
    if (store.tailLength(entry.docKey) >= compactAfter) store.compact(entry.docKey, entry.doc);
    materializer.schedule(entry.docKey);
    history.edited(entry.docKey);
    for (const handle of entry.handles) {
      for (const listener of handle.updateListeners) listener(update, origin);
    }
  }

  function trialExceedsCap(entry: Entry, update: Uint8Array): boolean {
    const current = bytesOf(entry);
    if (current + update.byteLength * MAX_JSON_GROWTH_PER_UPDATE_BYTE <= SYNC_LIMITS.maxRecordBytes) return false;
    const clone = new Y.Doc();
    try {
      Y.applyUpdate(clone, Y.encodeStateAsUpdate(entry.doc));
      Y.applyUpdate(clone, update);
      const grown = contentBytes(clone, entry.kind);
      // An update that shrinks an over-cap document is always allowed, or the owner could never edit their way back under the cap.
      return grown > SYNC_LIMITS.maxRecordBytes && grown > current;
    } finally {
      clone.destroy();
    }
  }

  function makeHandle(entry: Entry): Handle {
    const handle: Handle = {
      entry,
      docKey: entry.docKey,
      doc: entry.doc,
      updateListeners: new Set(),
      closedListeners: new Set(),
      released: false,
      closed: false,
      apply(update, editor) {
        if (handle.closed || handle.released || !entries.has(entry.docKey)) return { ok: false, code: 'closed' };
        if (trialExceedsCap(entry, update)) return { ok: false, code: 'too-large' };
        entry.applying = editor;
        try {
          Y.applyUpdate(entry.doc, update, handle);
        } finally {
          entry.applying = undefined;
        }
        return { ok: true };
      },
      onUpdate(listener) {
        handle.updateListeners.add(listener);
        return () => void handle.updateListeners.delete(listener);
      },
      onClosed(listener) {
        handle.closedListeners.add(listener);
        return () => void handle.closedListeners.delete(listener);
      },
      release() {
        if (handle.released) return;
        handle.released = true;
        handle.updateListeners.clear();
        entry.handles.delete(handle);
        if (handle.closed || entries.get(entry.docKey) !== entry) return;
        if (entry.handles.size === 0) settle(entry);
      },
    };
    return handle;
  }

  /** The last subscriber left: write the document to its record, fold the tail into the state, and unload after the idle delay. */
  function settle(entry: Entry): void {
    persist(entry);
    try {
      history.settled(entry.docKey);
    } catch (error) {
      options.log?.warn({ event: 'collab.snapshot-failed', doc: entry.docKey, code: (error as { code?: unknown }).code }, 'A history snapshot could not be written.');
    }
    if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined;
      if (entry.handles.size > 0 || entries.get(entry.docKey) !== entry) return;
      // A write that found no active editor is tried once more before the document goes away.
      persist(entry);
      unload(entry);
    }, idleUnloadMs);
    entry.idleTimer.unref?.();
  }

  function persist(entry: Entry): void {
    try {
      if (materializer.pending(entry.docKey)) materializer.flush(entry.docKey);
      if (store.tailLength(entry.docKey) > 0) store.compact(entry.docKey, entry.doc);
    } catch (error) {
      options.log?.warn({ event: 'collab.persist-failed', doc: entry.docKey, code: (error as { code?: unknown }).code }, 'A collaborative document could not be persisted.');
    }
  }

  /** `keepHistory` false: the document is being deleted, so a pending snapshot is dropped rather than kept for its deferred write. */
  function unload(entry: Entry, keepHistory = true): void {
    if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
    materializer.cancel(entry.docKey);
    if (!keepHistory) history.forget(entry.docKey);
    else {
      try {
        history.unloading({ docKey: entry.docKey, kind: entry.kind, doc: entry.doc });
      } catch (error) {
        history.forget(entry.docKey);
        options.log?.warn({ event: 'collab.snapshot-failed', doc: entry.docKey, code: (error as { code?: unknown }).code }, 'A history snapshot could not be kept.');
      }
    }
    entries.delete(entry.docKey);
    entry.doc.destroy();
  }

  function endHandles(entry: Entry, reason: CollabCloseReason): void {
    for (const handle of [...entry.handles]) {
      handle.closed = true;
      handle.updateListeners.clear();
      const listeners = [...handle.closedListeners];
      handle.closedListeners.clear();
      for (const listener of listeners) {
        try { listener(reason); } catch { /* a subscriber's failure never blocks the cascade */ }
      }
    }
    entry.handles.clear();
  }

  function load(docKey: string, kind: CollabDocKind, id: string, opener: CollabPrincipal): Entry {
    const loaded = store.loadDocWithMeta(docKey);
    const entry: Entry = {
      docKey, kind, doc: loaded.doc, handles: new Set(), lastEditor: null, openers: [], applying: undefined, bytes: null, idleTimer: undefined,
    };
    entries.set(docKey, entry);
    entry.doc.on('update', (update: Uint8Array, origin: unknown) => onDocUpdate(entry, update, origin));
    if (!loaded.seeded) {
      // A stored document whose last materialization failed (no active editor, a crash inside the debounce) is ahead of its record. Catch it
      // up only while nobody else has written the record since: otherwise the document is stale and the three-way merge decides (PD-102).
      const environmentId = getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
      const record = environmentId === undefined ? undefined : getCanonicalRecord(db, environmentId, kind, id);
      const caughtUp = record !== undefined && !record.deleted ? record.revision === loaded.materializedRevision : loaded.materializedRevision === null;
      if (caughtUp) {
        if (opener.deviceId !== null) pushFront(entry.openers, opener.deviceId, RECENT_EDITORS);
        materializer.schedule(docKey);
      }
    }
    return entry;
  }

  function closeAll(): void {
    for (const entry of [...entries.values()]) {
      persist(entry);
      unload(entry);
      endHandles(entry, 'shutdown');
    }
    store.flush();
  }

  return {
    store,
    materializer,
    history,

    open(docKey, opener) {
      const ref = parseCollabDocKey(docKey);
      if (!ref || ref.kind === 'room') throw new RangeError('Not a persisted collaborative document key.');
      let entry = entries.get(docKey);
      if (entry) {
        if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer);
        entry.idleTimer = undefined;
      } else {
        entry = load(docKey, ref.kind, ref.id, opener);
      }
      if (opener.deviceId !== null) pushFront(entry.openers, opener.deviceId, RECENT_EDITORS);
      const handle = makeHandle(entry);
      entry.handles.add(handle);
      return handle;
    },

    evict(docKey) {
      const entry = entries.get(docKey);
      if (entry) {
        unload(entry, false);
        endHandles(entry, 'evicted');
      }
      history.forget(docKey);
      materializer.cancel(docKey);
      store.deleteDoc(docKey);
    },

    evictAll() {
      for (const entry of [...entries.values()]) {
        unload(entry, false);
        endHandles(entry, 'evicted');
      }
      history.forgetAll();
      store.deleteAll();
    },

    closeAll,

    dispose() {
      try {
        closeAll();
      } finally {
        history.close();
        materializer.close();
        store.close();
      }
    },

    loadedKeys: () => [...entries.keys()],
  };
}
