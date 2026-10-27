import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Db } from '@dude/sqlite-store';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { HUB_KEPT_TABLES, SAVESPHERE_KEPT_TABLES, SAVESPHERE_SCRUBBED_TABLES, SCRUBBED_TABLES } from './snapshot.js';

const tablesOf = (db: Db): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);

/** A table is either emptied in a backup copy or kept; this fails the moment a migration adds one nobody classified. */
function unclassified(actual: string[], scrubbed: readonly string[], kept: readonly string[]): string[] {
  return actual.filter((name) => !scrubbed.includes(name) && !kept.includes(name));
}

describe('backup scrub classification covers every table of both databases', () => {
  const root = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-classify-')));
  const hub = openHubDb({ dbFile: root.dbFile, preMigrationDir: root.preMigrationDir });
  const store = openSaveSphereDb(root);
  if (hub.status !== 'ready' || store.status !== 'ready') throw new Error('expected both databases ready');
  const hubTables = tablesOf(hub.hub.db);
  const saveSphereTables = tablesOf(store.store.db);

  it('classifies every dude.db table (real migrations) as scrubbed or kept', () => {
    expect(hubTables.length).toBeGreaterThan(20);
    expect(unclassified(hubTables, SCRUBBED_TABLES, HUB_KEPT_TABLES)).toEqual([]);
  });

  it('classifies every savesphere.db table (real migrations) as scrubbed or kept', () => {
    expect(saveSphereTables).toContain('audit_outbox');
    expect(unclassified(saveSphereTables, SAVESPHERE_SCRUBBED_TABLES, SAVESPHERE_KEPT_TABLES)).toEqual([]);
  });

  it('lists no table twice and no table that does not exist', () => {
    for (const [scrubbed, kept, actual] of [[SCRUBBED_TABLES, HUB_KEPT_TABLES, hubTables], [SAVESPHERE_SCRUBBED_TABLES, SAVESPHERE_KEPT_TABLES, saveSphereTables]] as const) {
      const all = [...scrubbed, ...kept];
      expect(new Set(all).size).toBe(all.length);
      expect(all.filter((name) => !actual.includes(name))).toEqual([]);
    }
  });

  it('treats the audit outbox as transient (scrubbed)', () => {
    expect(SAVESPHERE_SCRUBBED_TABLES).toContain('audit_outbox');
  });

  it('treats the job queue as transient (scrubbed)', () => {
    expect(SAVESPHERE_SCRUBBED_TABLES).toContain('jobs');
  });

  it('the checker itself flags an unclassified table', () => {
    expect(unclassified([...saveSphereTables, 'brand_new'], SAVESPHERE_SCRUBBED_TABLES, SAVESPHERE_KEPT_TABLES)).toEqual(['brand_new']);
  });
});
