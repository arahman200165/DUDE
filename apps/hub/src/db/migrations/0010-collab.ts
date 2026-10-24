import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31J collaborative documents (PD-101, PD-102, PD-105). `collab_docs` keeps one compacted Y.Doc state per document key
 * (`kind:id`, never a room: rooms are ephemeral) and `collab_updates` the short tail of Yjs updates applied since the last
 * compaction. `collab_bases` stores the plain payload the Hub materialized (or seeded from) at a record revision, so a later
 * non-Yjs write based on that revision can be three-way merged. `collab_snapshots` holds the history snapshots (policy and
 * pruning arrive with the history milestone). The record stays the interchange form; these tables are the live truth only while
 * a document is being edited.
 *
 * Unlike every earlier migration this one RAISES the reader floor to 10: a Hub without collaboration would keep accepting
 * record writes next to a Y.Doc it knows nothing about, so it must refuse the database instead (PD-101).
 */
export const migration0010: Migration = {
  version: 10,
  name: 'collab',
  minReaderVersion: 10,
  sql: `
CREATE TABLE collab_docs (
  doc_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  state BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  materialized_revision INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
) STRICT;
CREATE TABLE collab_updates (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_key TEXT NOT NULL,
  update_blob BLOB NOT NULL,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_collab_updates_doc ON collab_updates(doc_key, seq);
CREATE TABLE collab_snapshots (
  id TEXT PRIMARY KEY,
  doc_key TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  bytes INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_collab_snapshots_doc ON collab_snapshots(doc_key, taken_at);
CREATE TABLE collab_bases (
  doc_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (doc_key, revision)
) STRICT;
`,
};
