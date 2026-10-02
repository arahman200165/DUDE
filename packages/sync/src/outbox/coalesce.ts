import type { OutboxOp } from './outbox-op.model.js';

/**
 * Coalesce a new op for an entity with its existing unsent op (one op per entity).
 * Returns the op to store, or null when the entity's op row should be removed.
 *
 * - no previous op: store `next`.
 * - upsert then upsert: latest payload/localRevision/updatedAt and the new opId, original createdAt and basedOnRevision.
 * - upsert then delete: if the entity was never known to a Hub (prev.basedOnRevision === null) the pair cancels (null);
 *   otherwise a delete op that keeps the original basedOnRevision and createdAt.
 * - delete then upsert: an upsert that keeps the original basedOnRevision and createdAt.
 * - delete then delete: the latest delete with original basedOnRevision and createdAt.
 */
export function coalesceOutbox(prev: OutboxOp | undefined, next: OutboxOp): OutboxOp | null {
  if (!prev) return next;
  if (prev.opKind === 'upsert' && next.opKind === 'delete' && prev.basedOnRevision === null) return null;
  return { ...next, basedOnRevision: prev.basedOnRevision, createdAt: prev.createdAt };
}
