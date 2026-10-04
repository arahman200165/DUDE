import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { BACKUP_FILE_PATTERN } from '@dude/hub-backup';

export interface BackupListing {
  name: string;
  size: number;
  mtime: Date;
}

/** Only files whose names `backupFileName` could have produced, newest first by the timestamp in the name. `.part` and foreign files are ignored. */
export function listBackups(dir: string): BackupListing[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const out: BackupListing[] = [];
  for (const name of names) {
    if (!BACKUP_FILE_PATTERN.test(name)) continue;
    const stat = statSync(path.join(dir, name));
    if (!stat.isFile()) continue;
    out.push({ name, size: stat.size, mtime: stat.mtime });
  }
  // The fixed-width UTC stamp sorts lexicographically.
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/**
 * Keeps the newest `keep` backups and deletes older matching files. Never deletes the newest file or anything in `protect`.
 * Returns the deleted names.
 */
export function pruneBackups(dir: string, keep: number, options: { protect?: readonly string[] } = {}): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Backup retention must keep at least one backup.');
  const protect = new Set(options.protect ?? []);
  const deleted: string[] = [];
  for (const [index, entry] of listBackups(dir).entries()) {
    if (index < keep || index === 0 || protect.has(entry.name)) continue;
    rmSync(path.join(dir, entry.name), { force: true });
    deleted.push(entry.name);
  }
  return deleted;
}
