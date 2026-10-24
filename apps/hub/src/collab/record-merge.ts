import * as Y from 'yjs';
import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { collabKindForEntity, formatCollabDocKey, materializeCollabDoc, restoreAsForwardEdit } from '@dude/collab-doc';
import { merge3, syncPolicyFor } from '@dude/sync';
import type { CanonicalCommit, CollabMerge } from '../db/canonical-repository.js';
import type { CollabLog } from './doc-store.js';
import type { CollabDocHandle, CollabPrincipal, CollabRegistry } from './doc-registry.js';

export interface CollabRecordMergeDeps {
  db: Db;
  registry: CollabRegistry;
  log?: CollabLog;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The merge callback for `commitCanonical` (PD-102), built per push for a client that declared `accept: ['merged']`. A record write
 * to a collaborative entity that is based on an older revision is merged three ways: the base is the materialization stored for the
 * writer's revision (`collab_bases`), "theirs" is the live document (or the current record when the entity has no collaborative state)
 * and "ours" is the incoming payload, under the entity's field rules. A clean merge is then applied to the live Y.Doc as an ordinary
 * Yjs edit once the record holds it (so subscribers receive it, it is persisted like any edit, and an edit that arrived both as a Yjs
 * frame and as an outbox write is not duplicated), and the new revision is recorded as a merge base. Anything else (no base, a field
 * that does not merge) is left to the ordinary conflict.
 */
export function createCollabRecordMerge(deps: CollabRecordMergeDeps, principal: CollabPrincipal): CollabMerge {
  const { db, registry } = deps;
  return (request, defer) => {
    const kind = collabKindForEntity(request.entityType);
    const policy = syncPolicyFor(request.entityType);
    if (kind === null || kind === 'room' || !policy || policy.conflict !== 'merge3') return undefined;
    let docKey: string;
    try {
      docKey = formatCollabDocKey(kind, request.entityId);
    } catch {
      return undefined; // not a legal document id: the entity has no collaborative state
    }
    // A write based on the current revision (the document was ahead of its record and could not be written into it) has the record itself as base.
    const baseJson = request.basedOnRevision === request.current.revision
      ? JSON.stringify(request.current.payload)
      : getRow<{ payload_json: string }>(
        db.prepare('SELECT payload_json FROM collab_bases WHERE doc_key = ? AND revision = ?'), docKey, request.basedOnRevision)?.payload_json;
    if (baseJson === undefined || !isRecord(request.current.payload)) return undefined;

    const hasState = getRow(db.prepare('SELECT 1 AS x FROM collab_docs WHERE doc_key = ?'), docKey) !== undefined;
    // The document is held open until the commit is over (released in the deferred step), so its last release never materializes
    // into a record while the commit transaction is still open.
    let handle: CollabDocHandle | undefined;
    let update: Uint8Array | undefined;
    if (hasState) {
      handle = registry.open(docKey, principal);
      const held = handle;
      defer((committed) => {
        try {
          if (committed !== null) settleMerged(deps, held, docKey, request.entityType, request.entityId, committed, principal, update);
        } finally {
          held.release();
        }
      });
    }
    const theirs = handle ? materializeCollabDoc(handle.doc, kind, request.current.payload) : request.current.payload;

    const merged = merge3(JSON.parse(baseJson) as unknown, request.incoming, theirs, policy.fieldRules);
    if (merged.kind === 'conflict' || !isRecord(merged.value)) return undefined;
    if (Buffer.byteLength(JSON.stringify(merged.value), 'utf8') > request.maxBytes) return undefined;
    if (handle) update = diffToMerged(handle.doc, kind, merged.value);
    return merged.value;
  };
}

/** The Yjs update that brings a copy of the live document to `merged` with forward edits (computed on a clone, so the live document is untouched). */
function diffToMerged(live: Y.Doc, kind: Parameters<typeof restoreAsForwardEdit>[1], merged: Record<string, unknown>): Uint8Array {
  const before = Y.encodeStateVector(live);
  const clone = new Y.Doc();
  try {
    Y.applyUpdate(clone, Y.encodeStateAsUpdate(live));
    restoreAsForwardEdit(clone, kind, merged);
    return Y.encodeStateAsUpdate(clone, before);
  } finally {
    clone.destroy();
  }
}

function settleMerged(
  deps: CollabRecordMergeDeps, handle: CollabDocHandle, docKey: string,
  entityType: string, entityId: string, revision: number, principal: CollabPrincipal, update: Uint8Array | undefined,
): void {
  if (update !== undefined) {
    const applied = handle.apply(update, principal);
    if (!applied.ok) {
      deps.log?.warn({ event: 'collab.merge-apply-refused', doc: docKey, code: applied.code }, 'A merged edit could not be applied to the live document.');
      return;
    }
  }
  // The live document now equals the committed record: remember that revision as a merge base without waiting for the debounce.
  const row = getRow<{ revision: number; payload_json: string | null }>(
    deps.db.prepare('SELECT revision, payload_json FROM records WHERE entity_type = ? AND entity_id = ?'), entityType, entityId);
  if (row?.revision === revision && row.payload_json !== null) deps.registry.store.recordMaterialized(docKey, revision, row.payload_json);
}

/** The commit options a push of one op carries for a collaborative record (none for any other entity). */
export type CollabCommitOptions = Partial<Pick<CanonicalCommit, 'collabMerge' | 'collabDiverged' | 'collabApplied'>>;

/**
 * Prepares one push op for `commitCanonical` (PD-102). Call it immediately before the commit, in the same synchronous turn.
 *
 * 1. When the entity has collaborative state, the record is first brought up to date with the live document: the document is opened
 *    through the registry (which catches a stale unloaded one up on load), its materializer is flushed synchronously, outside any
 *    transaction, and it is released. Live edits therefore never sit unwritten behind a write based on the record's current revision.
 *    The flush writes only when the document differs from the record, so it cannot keep nudging devices into pushing again. If it
 *    cannot write (no active editor, over the cap, refused by the codec) the record stays behind the document and the write may not
 *    overwrite it: `collabDiverged` makes it merge (clients that accept `merged`) or conflict.
 * 2. After an applied upsert the committed payload is applied to the live document as a forward edit (attributed to the pushing device)
 *    and recorded as a merge base, so the document and the record agree and no later materialization overwrites the write.
 */
export function collabCommitOptions(
  deps: CollabRecordMergeDeps, principal: CollabPrincipal, acceptMerged: boolean, entityType: string, entityId: string,
): CollabCommitOptions {
  const kind = collabKindForEntity(entityType);
  if (kind === null || kind === 'room') return {};
  let docKey: string;
  try {
    docKey = formatCollabDocKey(kind, entityId);
  } catch {
    return {};
  }
  const options: CollabCommitOptions = {};
  if (acceptMerged) options.collabMerge = createCollabRecordMerge(deps, principal);
  if (getRow(deps.db.prepare('SELECT 1 AS x FROM collab_docs WHERE doc_key = ?'), docKey) === undefined) return options;

  const handle = deps.registry.open(docKey, principal);
  try {
    const outcome = deps.registry.materializer.flush(docKey);
    if (outcome === 'no-actor' || outcome === 'too-large' || outcome === 'rejected') {
      options.collabDiverged = true;
      deps.log?.warn({ event: 'collab.catch-up-refused', doc: docKey, outcome }, 'A collaborative record could not be brought up to date with its live document.');
    }
  } finally {
    handle.release();
  }
  options.collabApplied = (revision) => {
    const held = deps.registry.open(docKey, principal);
    try {
      const row = getRow<{ revision: number; payload_json: string | null }>(
        deps.db.prepare('SELECT revision, payload_json FROM records WHERE entity_type = ? AND entity_id = ?'), entityType, entityId);
      if (!row || row.revision !== revision || row.payload_json === null) return;
      const committed = JSON.parse(row.payload_json) as unknown;
      settleMerged(deps, held, docKey, entityType, entityId, revision, principal, isRecord(committed) ? diffToMerged(held.doc, kind, committed) : undefined);
    } finally {
      held.release();
    }
  };
  return options;
}
