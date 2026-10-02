export const OUTBOX_SCHEMA_VERSION = 1;

export type OutboxOpKind = 'upsert' | 'delete';

/** 'unsent-standalone' only in 31B; 31D adds 'pending' | 'sent' | 'quarantined'. */
export type OutboxStatus = 'unsent-standalone';

/** One coalesced local change to a journaled entity, written in the same transaction as its row. */
export interface OutboxOp {
  opId: string;
  environmentId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  opKind: OutboxOpKind;
  schemaVersion: number;
  /** Hub revision this change was made on top of; null when the entity is not known to a Hub. */
  basedOnRevision: number | null;
  localRevision: number;
  /** Encoded entity for upserts; null for deletes. */
  payload: unknown | null;
  status: OutboxStatus;
  /** ISO-8601. */
  createdAt: string;
  updatedAt: string;
}

/**
 * Maximum outbox rows. Provisional; to be measured later. Exceeding it surfaces backpressure to the
 * user and never drops edits.
 */
export const OUTBOX_MAX_ROWS = 10_000;
