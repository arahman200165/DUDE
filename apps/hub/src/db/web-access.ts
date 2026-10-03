import { allRows } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { SYNC_CATEGORIES, categoryOf, defaultCategoryMap } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';

/** Per-category Hub web access (PD-051). An absent row means the category default (usage, workspace layout and scratchpad off). */
export function getWebAccess(db: Db, environmentId: string): Record<SyncCategory, boolean> {
  const access = defaultCategoryMap();
  for (const row of allRows<{ category: string; enabled: number }>(db.prepare('SELECT category, enabled FROM web_access WHERE environment_id = ?'), environmentId)) {
    if (SYNC_CATEGORIES.some((c) => c.id === row.category)) access[row.category as SyncCategory] = row.enabled === 1;
  }
  return access;
}

export function setWebAccess(db: Db, environmentId: string, category: SyncCategory, enabled: boolean, now: string): void {
  db.prepare(
    `INSERT INTO web_access(environment_id, category, enabled, updated_at) VALUES(?, ?, ?, ?)
     ON CONFLICT(environment_id, category) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
  ).run(environmentId, category, enabled ? 1 : 0, now);
}

/** True when the record's entity type belongs to a category with web access on. Unknown types are never visible. */
export function entityVisible(access: Record<SyncCategory, boolean>, entityType: string): boolean {
  const category = categoryOf(entityType);
  return category !== undefined && access[category];
}

/** True when the entity type belongs to a category whose web access is off (unknown types are left to the commit path). */
export function categoryDisabled(access: Record<SyncCategory, boolean>, entityType: string): boolean {
  const category = categoryOf(entityType);
  return category !== undefined && !access[category];
}
