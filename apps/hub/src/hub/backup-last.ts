import { getMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

/**
 * The read side of the last-backup record, kept outside `backup/` so the owner status route can show it without importing the
 * backup modules (a boundary spec keeps request handlers away from them). Writing it stays in `backup/backup-state.ts`.
 */

/** `meta` key holding the outcome of the most recent backup run (manual or scheduled), as JSON. */
export const BACKUP_LAST_META = 'backup_last';

/** What the last run recorded. Only the folder-relative file name and a short error code ever go in here: no path, no secret. */
export interface BackupLastRecord {
  at: string;
  ok: boolean;
  file?: string;
  size?: number;
  error?: string;
}

export function readBackupLast(db: Db): BackupLastRecord | null {
  const raw = getMeta(db, BACKUP_LAST_META);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BackupLastRecord> | null;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.at !== 'string' || typeof parsed.ok !== 'boolean') return null;
    const record: BackupLastRecord = { at: parsed.at, ok: parsed.ok };
    if (typeof parsed.file === 'string') record.file = parsed.file;
    if (typeof parsed.size === 'number') record.size = parsed.size;
    if (typeof parsed.error === 'string') record.error = parsed.error;
    return record;
  } catch {
    return null;
  }
}
