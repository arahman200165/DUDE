import type * as Y from 'yjs';
import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { materializeCollabDoc, parseCollabDocKey } from '@dude/collab-doc';
import type { CollabDocKind } from '@dude/collab-doc';
import { SYNC_LIMITS } from '@dude/sync';
import { CanonicalRejection, DeviceInactiveError, commitCanonical, getCanonicalRecord } from '../db/canonical-repository.js';
import type { CommitActor } from '../db/canonical-repository.js';
import { categoryDisabled, getWebAccess } from '../db/web-access.js';
import type { CollabDocStore, CollabLog } from './doc-store.js';

/** Quiet period after the last edit before a document is written to its record (PD-101). */
export const MATERIALIZE_QUIET_MS = 2000;
/** The longest a continuously edited document waits between writes. */
export const MATERIALIZE_MAX_WAIT_MS = 10_000;

/** What the materializer needs to know about a loaded document; the registry supplies it. */
export interface MaterializeSource {
  readonly docKey: string;
  readonly kind: CollabDocKind;
  readonly doc: Y.Doc;
  /** Device ids that edited the document, most recent first: the last editor, then the session's most recent active editors. */
  editors(): readonly string[];
}

export type MaterializeOutcome =
  /** A new record revision was committed. */
  | 'committed'
  /** The materialized payload equals the record; nothing was written. */
  | 'unchanged'
  /** The record does not exist (or is a tombstone) and the document kind cannot create one. */
  | 'no-record'
  /** The payload would exceed the record cap; refused. */
  | 'too-large'
  /** The record codec refused the payload. */
  | 'rejected'
  /** No editor is active (revoked, signed out or without web consent); retried later. */
  | 'no-actor'
  /** The document is no longer loaded. */
  | 'missing';

export interface MaterializerOptions {
  db: Db;
  now: () => number;
  store: CollabDocStore;
  resolveSource: (docKey: string) => MaterializeSource | undefined;
  /** Emits the normal `records-changed` event so devices pull the new revision. */
  emitRecordsChanged: (event: { environmentId: string; revision: number; originDeviceId: string | null }) => void;
  log?: CollabLog;
  quietMs?: number;
  maxWaitMs?: number;
  /** Delay before retrying a write that found no active editor (default: the max wait). */
  retryMs?: number;
}

export interface Materializer {
  /** Marks the document dirty: it is written `quietMs` after the last call, and at most `maxWaitMs` after the first one. */
  schedule(docKey: string): void;
  /** Writes the document now (cancelling its timer); a no-actor result is retried later. */
  flush(docKey: string): MaterializeOutcome;
  /** Forgets the document without writing it (it was deleted or evicted). */
  cancel(docKey: string): void;
  /** True while a write is scheduled for the document. */
  pending(docKey: string): boolean;
  /** Clears every timer; pending writes are not performed (the registry flushes first). */
  close(): void;
}

/** A scratchpad that was never synced has no record; every other kind must already have one (the keep flow creates it first). */
function defaultPayload(kind: CollabDocKind): Record<string, unknown> | undefined {
  return kind === 'scratchpad' ? { schemaVersion: 1, snippets: [], drawerExpanded: false } : undefined;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
}

interface Timing { firstDirtyAt: number; timer: ReturnType<typeof setTimeout> | undefined }

export function createMaterializer(options: MaterializerOptions): Materializer {
  const { db, now, store } = options;
  const quietMs = options.quietMs ?? MATERIALIZE_QUIET_MS;
  const maxWaitMs = options.maxWaitMs ?? MATERIALIZE_MAX_WAIT_MS;
  const retryMs = options.retryMs ?? maxWaitMs;
  const timings = new Map<string, Timing>();
  let closed = false;

  const iso = (): string => new Date(now()).toISOString();
  const ownerEnvironment = (): string | undefined =>
    getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;

  /**
   * The commit actor for an editor, re-resolved from the database at write time: a desktop needs a live key, a Hub web browser a live
   * session AND its category switched on. Anything else is skipped so a revoked or unconsented editor never authors a revision.
   */
  function actorFor(deviceId: string, environmentId: string, entityType: string): CommitActor | undefined {
    const device = getRow<{ kind: 'desktop' | 'browser'; revoked_at: string | null; unenrolled_at: string | null }>(
      db.prepare('SELECT kind, revoked_at, unenrolled_at FROM devices WHERE device_id = ?'), deviceId);
    if (!device || device.revoked_at !== null || device.unenrolled_at !== null) return undefined;
    if (device.kind === 'desktop') {
      const key = getRow<{ key_id: string }>(
        db.prepare('SELECT key_id FROM device_keys WHERE device_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1'), deviceId);
      return key ? { kind: 'device', deviceId, keyId: key.key_id } : undefined;
    }
    if (categoryDisabled(getWebAccess(db, environmentId), entityType)) return undefined;
    const at = iso();
    const session = getRow<{ session_hash: string }>(
      db.prepare(
        `SELECT session_hash FROM sessions WHERE browser_device_id = ? AND revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?
         ORDER BY last_active_at DESC LIMIT 1`), deviceId, at, at);
    return session ? { kind: 'browser', deviceId, sessionHash: session.session_hash } : undefined;
  }

  function materialize(docKey: string): MaterializeOutcome {
    const source = options.resolveSource(docKey);
    const ref = parseCollabDocKey(docKey);
    if (!source || !ref || ref.kind === 'room') return 'missing';
    const environmentId = ownerEnvironment();
    if (!environmentId) return 'no-record';
    const record = getCanonicalRecord(db, environmentId, ref.kind, ref.id);
    const live = record && !record.deleted && typeof record.payload === 'object' && record.payload !== null ? record : undefined;
    const current = (live?.payload as Record<string, unknown> | undefined) ?? (record ? undefined : defaultPayload(ref.kind));
    if (!current) return 'no-record';

    const materialized = materializeCollabDoc(source.doc, ref.kind, current);
    if (live && deepEqual(materialized, live.payload)) {
      // The document already equals the record: remember that, so a later non-Yjs write based on this revision can be merged.
      store.recordMaterialized(docKey, live.revision, JSON.stringify(live.payload));
      return 'unchanged';
    }
    // An untouched document with no record yet (a scratchpad nobody has written) does not create an empty one.
    if (!live && deepEqual(materialized, current)) return 'unchanged';
    // A text edit is an edit of the record: records that carry an `updatedAt` move it forward (the merge rule is max-iso).
    const payload = typeof current['updatedAt'] === 'string' ? { ...materialized, updatedAt: iso() } : materialized;
    const payloadJson = JSON.stringify(payload);
    const bytes = Buffer.byteLength(payloadJson, 'utf8');
    if (bytes > SYNC_LIMITS.maxRecordBytes) {
      options.log?.warn({ event: 'collab.materialize-refused', doc: docKey, reason: 'too-large', bytes }, 'A collaborative document exceeds the record size cap and was not written.');
      return 'too-large';
    }

    const candidates = [...new Set(source.editors())];
    for (const deviceId of candidates) {
      const actor = actorFor(deviceId, environmentId, ref.kind);
      if (!actor) continue;
      try {
        // Not `enforcePolicy`: this write IS the Yjs state, based on the record read above in the same tick, and must never be merged against itself.
        const result = commitCanonical(db, {
          environmentId, entityType: ref.kind, entityId: ref.id, op: 'upsert', payload, deviceId, now: iso(), actor,
        });
        store.recordMaterialized(docKey, result.revision, payloadJson);
        // Every device pulls it, the editor's own included: its record mirror comes from the feed, not from a push.
        options.emitRecordsChanged({ environmentId, revision: result.revision, originDeviceId: null });
        return 'committed';
      } catch (error) {
        if (error instanceof DeviceInactiveError) continue;
        if (error instanceof CanonicalRejection) {
          options.log?.warn({ event: 'collab.materialize-refused', doc: docKey, reason: error.code }, 'The record codec refused a collaborative document.');
          return 'rejected';
        }
        throw error;
      }
    }
    return 'no-actor';
  }

  function clear(docKey: string): void {
    const timing = timings.get(docKey);
    if (timing?.timer !== undefined) clearTimeout(timing.timer);
    timings.delete(docKey);
  }

  function arm(docKey: string, timing: Timing, delay: number): void {
    if (timing.timer !== undefined) clearTimeout(timing.timer);
    timing.timer = setTimeout(() => run(docKey), Math.max(0, delay));
    timing.timer.unref?.();
  }

  function run(docKey: string): void {
    const timing = timings.get(docKey);
    if (timing) timing.timer = undefined;
    let outcome: MaterializeOutcome | undefined;
    try {
      outcome = materialize(docKey);
    } catch (error) {
      options.log?.warn({ event: 'collab.materialize-failed', doc: docKey, code: (error as { code?: unknown }).code }, 'A collaborative document could not be written; it will be retried.');
    }
    if (outcome === undefined || outcome === 'no-actor') {
      // Keep the document dirty and try again later; a fresh wait window starts now so edits do not trigger an attempt each.
      const retained = timings.get(docKey);
      if (retained && !closed) {
        retained.firstDirtyAt = now();
        arm(docKey, retained, retryMs);
      }
      return;
    }
    clear(docKey);
  }

  return {
    schedule(docKey) {
      if (closed) return;
      const at = now();
      let timing = timings.get(docKey);
      if (!timing) {
        timing = { firstDirtyAt: at, timer: undefined };
        timings.set(docKey, timing);
      }
      arm(docKey, timing, Math.min(quietMs, timing.firstDirtyAt + maxWaitMs - at));
    },

    flush(docKey) {
      const had = timings.has(docKey);
      const timing = timings.get(docKey);
      if (timing?.timer !== undefined) {
        clearTimeout(timing.timer);
        timing.timer = undefined;
      }
      let outcome: MaterializeOutcome;
      try {
        outcome = materialize(docKey);
      } catch (error) {
        options.log?.warn({ event: 'collab.materialize-failed', doc: docKey, code: (error as { code?: unknown }).code }, 'A collaborative document could not be written.');
        outcome = 'no-actor';
      }
      if (outcome === 'no-actor' && had && !closed) {
        const retained = timings.get(docKey);
        if (retained) {
          retained.firstDirtyAt = now();
          arm(docKey, retained, retryMs);
        }
      } else {
        clear(docKey);
      }
      return outcome;
    },

    cancel: clear,

    pending: (docKey) => timings.has(docKey),

    close() {
      closed = true;
      for (const timing of timings.values()) if (timing.timer !== undefined) clearTimeout(timing.timer);
      timings.clear();
    },
  };
}
