import { SYNC_CATEGORY_IDS, defaultCategoryMap } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';

export interface SyncStateRow {
  cursor: number;
  floor: number;
  paused: boolean;
  categories: Record<SyncCategory, boolean>;
  firstSyncState: 'pending' | 'done';
  firstSyncAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export type SyncStatePatch = Partial<Omit<SyncStateRow, 'categories'>> & { categories?: Partial<Record<SyncCategory, boolean>> };

interface Raw {
  cursor: number; floor: number; paused: number; categories_json: string; first_sync_state: 'pending' | 'done';
  first_sync_at: string | null; last_sync_at: string | null; last_error: string | null;
}

/** Stored categories overlaid on the live defaults, so a category added later defaults correctly and unknown keys are dropped. */
export function mergeCategories(stored: unknown): Record<SyncCategory, boolean> {
  const map = defaultCategoryMap();
  if (typeof stored === 'object' && stored !== null) {
    for (const id of SYNC_CATEGORY_IDS) {
      const v = (stored as Record<string, unknown>)[id];
      if (typeof v === 'boolean') map[id] = v;
    }
  }
  return map;
}

function parseCategories(json: string): Record<SyncCategory, boolean> {
  try { return mergeCategories(JSON.parse(json)); } catch { return defaultCategoryMap(); }
}

function ensureRow(db: Db): void {
  db.prepare(
    "INSERT OR IGNORE INTO sync_state(id, cursor, floor, paused, categories_json, first_sync_state) VALUES(1, 0, 0, 0, ?, 'pending')",
  ).run(JSON.stringify(defaultCategoryMap()));
}

export function getSyncState(db: Db): SyncStateRow {
  ensureRow(db);
  const r = db.prepare('SELECT * FROM sync_state WHERE id = 1').get() as unknown as Raw;
  return {
    cursor: Number(r.cursor), floor: Number(r.floor), paused: Number(r.paused) === 1, categories: parseCategories(r.categories_json),
    firstSyncState: r.first_sync_state, firstSyncAt: r.first_sync_at, lastSyncAt: r.last_sync_at, lastError: r.last_error,
  };
}

/** Applies only the supplied fields; `categories` merges into the stored map. Returns the new state. */
export function updateSyncState(db: Db, patch: SyncStatePatch): SyncStateRow {
  const current = getSyncState(db);
  const { categories, ...rest } = patch;
  const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const next: SyncStateRow = { ...current, ...defined, categories: mergeCategories({ ...current.categories, ...categories }) };
  db.prepare(
    'UPDATE sync_state SET cursor = ?, floor = ?, paused = ?, categories_json = ?, first_sync_state = ?, first_sync_at = ?, last_sync_at = ?, last_error = ? WHERE id = 1',
  ).run(next.cursor, next.floor, next.paused ? 1 : 0, JSON.stringify(next.categories), next.firstSyncState, next.firstSyncAt, next.lastSyncAt, next.lastError);
  return next;
}

/** Back to a never-synced device (cursor 0, first sync pending, default categories). */
export function resetSyncState(db: Db): void {
  ensureRow(db);
  db.prepare(
    "UPDATE sync_state SET cursor = 0, floor = 0, paused = 0, categories_json = ?, first_sync_state = 'pending', first_sync_at = NULL, last_sync_at = NULL, last_error = NULL WHERE id = 1",
  ).run(JSON.stringify(defaultCategoryMap()));
}

/**
 * Hub revisions, merge bases, the pull cursor and first-sync progress describe ONE registration. A clone or a (re-)enrollment
 * drops them so the next first sync starts clean; local data and unsent ops are kept (their `based_on_revision` is cleared).
 */
export function resetHubBookkeeping(db: Db): void {
  db.exec('UPDATE records SET hub_revision = NULL, hub_payload_json = NULL; DELETE FROM kv_sync; UPDATE outbox SET based_on_revision = NULL');
  db.exec("DELETE FROM meta WHERE key IN ('first_sync_progress', 'sync_rebase_pending')");
  resetSyncState(db);
}
