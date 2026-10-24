import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31J Hub notifications (PD-109, PD-110). `notifications` holds the owner-visible outcomes of the Hub's background work and
 * its security alerts: a short title and body, never record content, credentials or paths. `source_key` is unique so a producer
 * that fires twice for one event (an audit row, a job run, a day) inserts once. `devices.notifications_access` is the per-device
 * notification-reader grant (desktop rows only; enforced by the route). Both additions default to "nothing", so minReaderVersion stays 1.
 */
export const migration0009: Migration = {
  version: 9,
  name: 'notifications',
  minReaderVersion: 1,
  sql: `
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT
) STRICT;
CREATE INDEX idx_notifications_created ON notifications(created_at);
ALTER TABLE devices ADD COLUMN notifications_access INTEGER NOT NULL DEFAULT 0 CHECK (notifications_access IN (0, 1));
`,
};
