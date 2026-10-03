import type { Migration } from '@dude/sqlite-store';

/**
 * Phase 31E Hub web records (PD-050, PD-051). A browser is an owner cookie session plus a key-less `kind = 'browser'` row
 * in `devices` (keys live in `device_keys`, so no table rebuild is needed: browser rows simply have none). `installation_id`
 * identifies the browser installation and is unique per environment for browser rows. `sessions.browser_device_id` binds a
 * cookie session to its browser row. `web_access` holds the per-category web access toggles (an absent row means the
 * category default). Additive, so minReaderVersion stays 1.
 */
export const migration0005: Migration = {
  version: 5,
  name: 'web-browsers',
  minReaderVersion: 1,
  sql: `
ALTER TABLE devices ADD COLUMN kind TEXT NOT NULL DEFAULT 'desktop' CHECK (kind IN ('desktop', 'browser'));
ALTER TABLE devices ADD COLUMN installation_id TEXT;
ALTER TABLE devices ADD COLUMN last_session_at TEXT;
CREATE UNIQUE INDEX devices_browser_installation ON devices (environment_id, installation_id) WHERE kind = 'browser';
ALTER TABLE sessions ADD COLUMN browser_device_id TEXT;
CREATE INDEX sessions_browser_device ON sessions (browser_device_id) WHERE browser_device_id IS NOT NULL;
CREATE TABLE web_access (
  environment_id TEXT NOT NULL REFERENCES environment(environment_id), category TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)), updated_at TEXT NOT NULL,
  PRIMARY KEY (environment_id, category)
) STRICT;
`,
};
