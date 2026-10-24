import type * as Y from 'yjs';

/** A plain record payload, as the Hub stores it in the sync record. Collaborative fields are replaced on materialize. */
export type CollabPayload = Readonly<Record<string, unknown>>;

/** Origin tag of the Hub's initial seeding transaction. */
export const COLLAB_SEED_ORIGIN = 'collab-seed';

export interface CollabSchema {
  /** Writes the initial content of a brand-new document. Only the Hub calls this, on first load. */
  seed(doc: Y.Doc, payload: CollabPayload): void;
  /** The plain record payload for the document's current state; non-collaborative fields come from `current`. */
  materialize(doc: Y.Doc, current: CollabPayload): Record<string, unknown>;
  /** Brings the document's content to `snapshot` with ordinary edits (history restore is a forward edit). */
  restore(doc: Y.Doc, snapshot: CollabPayload): void;
}

export const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
