import type { Db } from '../sqlite.js';
import { transaction } from '../sqlite.js';
import { MAX_POWERSHELL_HISTORY } from './retention.js';

export interface PowerShellHistoryRecord { readonly id: string; readonly completedAt?: string; readonly startedAt?: string }

/** Add an entry and keep only the newest `max`. */
export function addPowerShellHistory<E extends PowerShellHistoryRecord>(db: Db, entry: E, now: () => number = Date.now, max: number = MAX_POWERSHELL_HISTORY): void {
  const parsed = Date.parse(entry.completedAt ?? entry.startedAt ?? '');
  const createdAt = Number.isNaN(parsed) ? now() : parsed;
  transaction(db, () => {
    db.prepare('INSERT OR REPLACE INTO powershell_history(id, created_at, entry_json) VALUES(?, ?, ?)').run(entry.id, createdAt, JSON.stringify(entry));
    db.prepare(
      `DELETE FROM powershell_history WHERE id NOT IN
         (SELECT id FROM powershell_history ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    ).run(max);
  });
}

/** Newest first. */
export function listPowerShellHistory<E = PowerShellHistoryRecord>(db: Db): E[] {
  const rows = db.prepare('SELECT entry_json FROM powershell_history ORDER BY created_at DESC, rowid DESC').all() as unknown as Array<{ entry_json: string }>;
  return rows.map((r) => JSON.parse(r.entry_json) as E);
}

export function clearPowerShellHistory(db: Db): void {
  db.exec('DELETE FROM powershell_history');
}
