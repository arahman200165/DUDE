import { setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { BackupError } from '@dude/hub-backup';
import { BACKUP_LAST_META } from '../hub/backup-last.js';
import type { BackupLastRecord } from '../hub/backup-last.js';

// The record shape and its reader live in `hub/backup-last.ts` (the owner status route reads it without importing `backup/`).
export { BACKUP_LAST_META, readBackupLast } from '../hub/backup-last.js';
export type { BackupLastRecord } from '../hub/backup-last.js';

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
