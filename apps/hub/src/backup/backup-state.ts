import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { BackupError } from '@dude/hub-backup';

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

export function writeBackupLast(db: Db, record: BackupLastRecord): void {
  setMeta(db, BACKUP_LAST_META, JSON.stringify(record));
}

/**
 * A short, stable, non-secret code for a failed backup run. Error messages are never used because they can name folders or
 * paths; only a library code, an OS error code or one of the known verification failures survives.
 */
export function backupFailureCode(error: unknown): string {
  if (error instanceof BackupError) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,30}$/.test(code)) return code;
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('The backup failed verification')) return 'verification-failed';
  if (message.includes('already exists') || message.includes('appeared in')) return 'file-exists';
  return 'create-failed';
}
