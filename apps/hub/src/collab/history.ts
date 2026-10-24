import { randomBytes } from 'node:crypto';
import * as Y from 'yjs';
import { allRows, getRow, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { materializeCollabDoc, parseCollabDocKey, restoreAsForwardEdit } from '@dude/collab-doc';
import type { CollabDocKind } from '@dude/collab-doc';
import {
  COLLAB_HISTORY_MAX_BYTES, COLLAB_HISTORY_MAX_SNAPSHOTS, COLLAB_HISTORY_RETENTION_DAYS, COLLAB_SNAPSHOT_IDLE_MS, COLLAB_SNAPSHOT_MIN_INTERVAL_MS,
} from '@dude/contracts/hub';
import type { CollabSnapshotSummary } from '@dude/contracts/hub';
import { getCanonicalRecord } from '../db/canonical-repository.js';
import type { JobHandle } from '../jobs/job-status.js';
import type { CollabLog } from './doc-store.js';
import type { CollabPrincipal, CollabRegistry } from './doc-registry.js';

/** The history prune runs once a day (and once at start). */
export const COLLAB_HISTORY_PRUNE_INTERVAL_MS = 24 * 3600_000;

/** A loaded persisted document, as the registry supplies it. */
export interface HistorySource {
  readonly docKey: string;
  readonly kind: CollabDocKind;
  readonly doc: Y.Doc;
}

export interface CollabHistoryOptions {
  db: Db;
  now: () => number;
  log?: CollabLog;
  /** The loaded document for a key, or undefined once it is unloaded. */
  resolveSource: (docKey: string) => HistorySource | undefined;
  /** A document is snapshotted once it has been idle this long after an edit (default 2 min). */
  idleMs?: number;
  /** Snapshots of one document are at least this far apart, except the one a restore takes first (default 10 min). */
  minIntervalMs?: number;
  /** Per document, the oldest snapshots are dropped beyond this count (default 200)... */
  maxSnapshots?: number;
  /** ...or beyond this many payload bytes in total (default 8 MiB); the newest is always kept. */
  maxBytes?: number;
}

export type SnapshotOutcome =
  | { taken: true; id: string }
  /** The content equals the newest snapshot; the document is clean again. */
  | { taken: false; reason: 'unchanged' }
  /** The previous snapshot is too recent; a later attempt is scheduled while the document is pending. */
  | { taken: false; reason: 'too-soon' }
  /** Not a persisted document, or neither loaded nor captured. */
  | { taken: false; reason: 'missing' };

export interface StoredSnapshot { id: string; docKey: string; takenAt: string; payload: Record<string, unknown> }

export interface CollabHistory {
  /** A loaded document received an update: it is dirty and is snapshotted after the idle delay. */
  edited(docKey: string): void;
  /** The document's last subscriber left: a dirty document is snapshotted now (within the minimum interval). */
  settled(docKey: string): void;
  /** The document is about to unload: a still-pending snapshot keeps its content so the deferred attempt can write it. */
  unloading(source: HistorySource): void;
  /** Drops pending work for the document (its rows were deleted with it). */
  forget(docKey: string): void;
  forgetAll(): void;
  /** Snapshots the document now unless its content equals the newest snapshot; `force` ignores the minimum interval (a restore). */
  take(docKey: string, options?: { force?: boolean }): SnapshotOutcome;
  /** Newest first. */
  list(docKey: string): CollabSnapshotSummary[];
  get(id: string): StoredSnapshot | undefined;
  /** Clears every timer; pending snapshots are not written. */
  close(): void;
}

interface Capture { payloadJson: string; content: Record<string, unknown> }
interface Pending { dirty: boolean; timer: ReturnType<typeof setTimeout> | undefined; captured: Capture | undefined }

const isPersistedKey = (docKey: string): boolean => {
  const ref = parseCollabDocKey(docKey);
  return ref !== null && ref.kind !== 'room';
};

/** Whether a stored payload holds exactly the collaborative content (the keys a content-only materialization produces). */
function sameContent(storedJson: string, content: Record<string, unknown>): boolean {
  let stored: unknown;
  try { stored = JSON.parse(storedJson); } catch { return false; }
  if (typeof stored !== 'object' || stored === null) return false;
  const record = stored as Record<string, unknown>;
  return Object.keys(content).every((key) => JSON.stringify(record[key] ?? null) === JSON.stringify(content[key] ?? null));
}

/**
 * Version history of the persisted collaborative documents (PD-105). A document is snapshotted (its materialized record payload)
 * once it has been idle `idleMs` after an edit or when its last subscriber leaves, only when its content differs from the newest
 * snapshot and at least `minIntervalMs` after it; per document the oldest snapshots are dropped beyond `maxSnapshots` or
 * `maxBytes`. Rooms are never snapshotted. Snapshots go out with the database in backups and are removed with their document.
 */
export function createCollabHistory(options: CollabHistoryOptions): CollabHistory {
  const { db, now } = options;
  const idleMs = options.idleMs ?? COLLAB_SNAPSHOT_IDLE_MS;
  const minIntervalMs = options.minIntervalMs ?? COLLAB_SNAPSHOT_MIN_INTERVAL_MS;
  const maxSnapshots = options.maxSnapshots ?? COLLAB_HISTORY_MAX_SNAPSHOTS;
  const maxBytes = options.maxBytes ?? COLLAB_HISTORY_MAX_BYTES;
  const pending = new Map<string, Pending>();
  let closed = false;

  const ownerEnvironment = (): string | undefined =>
    getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;

  /** The payload a materialization would write now (over the current record), plus the collaborative content alone for comparison. */
  function captureOf(source: HistorySource): Capture {
    const ref = parseCollabDocKey(source.docKey);
    const environmentId = ownerEnvironment();
    const record = ref === null || environmentId === undefined ? undefined : getCanonicalRecord(db, environmentId, ref.kind, ref.id);
    const current = record && !record.deleted && typeof record.payload === 'object' && record.payload !== null
      ? record.payload as Record<string, unknown> : {};
    return {
      payloadJson: JSON.stringify(materializeCollabDoc(source.doc, source.kind, current)),
      content: materializeCollabDoc(source.doc, source.kind, {}),
    };
  }

  const newest = (docKey: string): { taken_at: string; payload_json: string } | undefined =>
    getRow(db.prepare('SELECT taken_at, payload_json FROM collab_snapshots WHERE doc_key = ? ORDER BY taken_at DESC, rowid DESC LIMIT 1'), docKey);

  function write(docKey: string, capture: Capture): string {
    const id = randomBytes(12).toString('base64url');
    const bytes = Buffer.byteLength(capture.payloadJson, 'utf8');
    transaction(db, () => {
      db.prepare('INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES(?, ?, ?, ?, ?)')
        .run(id, docKey, new Date(now()).toISOString(), capture.payloadJson, bytes);
      // Newest first: keep while under both caps (the newest always), then drop everything older.
      const rows = allRows<{ id: string; bytes: number }>(
        db.prepare('SELECT id, bytes FROM collab_snapshots WHERE doc_key = ? ORDER BY taken_at DESC, rowid DESC'), docKey);
      const drop = db.prepare('DELETE FROM collab_snapshots WHERE id = ?');
      let total = 0;
      let over = false;
      rows.forEach((row, index) => {
        total += row.bytes;
        if (!over && index > 0 && (index >= maxSnapshots || total > maxBytes)) over = true;
        if (over) drop.run(row.id);
      });
    });
    return id;
  }

  function clearTimer(state: Pending): void {
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.timer = undefined;
  }

  function settle(docKey: string, state: Pending | undefined): void {
    if (!state) return;
    state.dirty = false;
    state.captured = undefined;
    clearTimer(state);
    if (options.resolveSource(docKey) === undefined) pending.delete(docKey);
  }

  function arm(docKey: string, state: Pending, delay: number): void {
    clearTimer(state);
    if (closed) return;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      if (!state.dirty || pending.get(docKey) !== state) return;
      try {
        attempt(docKey, false);
      } catch (error) {
        options.log?.warn({ event: 'collab.snapshot-failed', doc: docKey, code: (error as { code?: unknown }).code }, 'A history snapshot could not be written.');
      }
    }, Math.max(0, delay));
    state.timer.unref?.();
  }

  function attempt(docKey: string, force: boolean): SnapshotOutcome {
    if (!isPersistedKey(docKey)) return { taken: false, reason: 'missing' };
    const state = pending.get(docKey);
    const source = options.resolveSource(docKey);
    const capture = source ? captureOf(source) : state?.captured;
    if (!capture) {
      if (state) { clearTimer(state); pending.delete(docKey); }
      return { taken: false, reason: 'missing' };
    }
    const last = newest(docKey);
    if (last && sameContent(last.payload_json, capture.content)) {
      settle(docKey, state);
      return { taken: false, reason: 'unchanged' };
    }
    if (!force && last) {
      const wait = Date.parse(last.taken_at) + minIntervalMs - now();
      if (wait > 0) {
        if (state?.dirty) arm(docKey, state, wait);
        return { taken: false, reason: 'too-soon' };
      }
    }
    const id = write(docKey, capture);
    settle(docKey, state);
    return { taken: true, id };
  }

  return {
    edited(docKey) {
      if (closed || !isPersistedKey(docKey)) return;
      let state = pending.get(docKey);
      if (!state) {
        state = { dirty: false, timer: undefined, captured: undefined };
        pending.set(docKey, state);
      }
      state.dirty = true;
      state.captured = undefined;
      arm(docKey, state, idleMs);
    },

    settled(docKey) {
      if (closed || pending.get(docKey)?.dirty !== true) return;
      attempt(docKey, false);
    },

    unloading(source) {
      const state = pending.get(source.docKey);
      if (!state) return;
      if (!state.dirty || closed) {
        clearTimer(state);
        pending.delete(source.docKey);
        return;
      }
      state.captured = captureOf(source);
      if (state.timer === undefined) arm(source.docKey, state, 0);
    },

    forget(docKey) {
      const state = pending.get(docKey);
      if (state) clearTimer(state);
      pending.delete(docKey);
    },

    forgetAll() {
      for (const state of pending.values()) clearTimer(state);
      pending.clear();
    },

    take: (docKey, takeOptions) => attempt(docKey, takeOptions?.force === true),

    list: (docKey) => allRows<{ id: string; taken_at: string; bytes: number }>(
      db.prepare('SELECT id, taken_at, bytes FROM collab_snapshots WHERE doc_key = ? ORDER BY taken_at DESC, rowid DESC LIMIT ?'), docKey, maxSnapshots,
    ).map((row) => ({ id: row.id, takenAt: row.taken_at, bytes: row.bytes })),

    get(id) {
      const row = getRow<{ doc_key: string; taken_at: string; payload_json: string }>(
        db.prepare('SELECT doc_key, taken_at, payload_json FROM collab_snapshots WHERE id = ?'), id);
      if (!row || !isPersistedKey(row.doc_key)) return undefined;
      let payload: unknown;
      try { payload = JSON.parse(row.payload_json); } catch { return undefined; }
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
      return { id, docKey: row.doc_key, takenAt: row.taken_at, payload: payload as Record<string, unknown> };
    },

    close() {
      closed = true;
      for (const state of pending.values()) clearTimer(state);
      pending.clear();
    },
  };
}

export type RestoreOutcome = { ok: true; docKey: string } | { ok: false; code: 'not-found' | 'too-large' | 'closed' };

/**
 * Restores a snapshot (PD-105): the current state is snapshotted first (ignoring the minimum interval), then the document is brought
 * to the snapshot's content with ordinary Yjs edits computed on a clone and applied through the registry as an edit by `principal`
 * (the CRDT is never rewound, so an edit made concurrently or afterwards still merges), and the record is written at once.
 */
export function restoreCollabSnapshot(registry: CollabRegistry, snapshotId: string, principal: CollabPrincipal): RestoreOutcome {
  const snapshot = registry.history.get(snapshotId);
  const ref = snapshot ? parseCollabDocKey(snapshot.docKey) : null;
  if (!snapshot || !ref || ref.kind === 'room') return { ok: false, code: 'not-found' };
  const handle = registry.open(snapshot.docKey, principal);
  try {
    registry.history.take(snapshot.docKey, { force: true });
    const before = Y.encodeStateVector(handle.doc);
    const clone = new Y.Doc();
    let update: Uint8Array;
    try {
      Y.applyUpdate(clone, Y.encodeStateAsUpdate(handle.doc));
      restoreAsForwardEdit(clone, ref.kind, snapshot.payload);
      update = Y.encodeStateAsUpdate(clone, before);
    } finally {
      clone.destroy();
    }
    const applied = handle.apply(update, principal);
    if (!applied.ok) return { ok: false, code: applied.code };
    registry.materializer.flush(snapshot.docKey);
    return { ok: true, docKey: snapshot.docKey };
  } finally {
    handle.release();
  }
}

/** Deletes snapshots older than the retention; returns how many were removed. */
export function pruneCollabHistory(db: Db, nowMs: number, retentionDays = COLLAB_HISTORY_RETENTION_DAYS): number {
  const cutoff = new Date(nowMs - retentionDays * 24 * 3600_000).toISOString();
  return Number(db.prepare('DELETE FROM collab_snapshots WHERE taken_at < ?').run(cutoff).changes);
}

/** The `collab-history-prune` job (PD-112): once at start and then daily, reported to the job registry. */
export function startCollabHistoryPruning(db: Db, now: () => number = Date.now, intervalMs = COLLAB_HISTORY_PRUNE_INTERVAL_MS, job?: JobHandle): () => void {
  const run = (): void => {
    try {
      const prune = (): number => pruneCollabHistory(db, now());
      if (job) job.track(prune, (deleted) => ({ outcome: 'success', summary: deleted === 0 ? 'No history snapshots were past retention.' : `Removed ${deleted} old history snapshots.` }));
      else prune();
    } catch { /* the database may be closing */ }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
