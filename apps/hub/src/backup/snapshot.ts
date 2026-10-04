import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { getMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

/** Tables holding transient credentials and sessions; emptied in the snapshot copy (PD-070). `throttle` and `ip_blocks` are kept. */
export const SCRUBBED_TABLES = ['sessions', 'device_tokens', 'challenges', 'pairing_codes', 'setup_state'] as const;

/** Exact meta keys removed from the snapshot copy. */
export const SCRUBBED_META_KEYS = ['csrf_key', 'alerts_seen_seq', 'hub_addresses', 'reachability_last', 'acme_last_attempt'] as const;

/**
 * Meta key prefixes removed from the snapshot copy. The Hub writes `revoked_attempt:<via>:<deviceId>` (devices/revoked-attempts.ts);
 * PD-070 spells it `revoked-attempts`, so both spellings are scrubbed.
 */
export const SCRUBBED_META_PREFIXES = ['revoked_attempt', 'revoked-attempts'] as const;

/** Tables whose row counts go into the manifest (those that exist). */
export const COUNTED_TABLES = ['devices', 'records', 'audit_events', 'change_feed'] as const;

export interface ScrubbedSnapshot {
  bytes: Uint8Array;
  schemaVersion: number;
  dbMinReaderVersion: number;
  counts: Record<string, number>;
}

const quote = (file: string): string => `'${file.replace(/'/g, "''")}'`;

function removeFile(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(file + suffix, { force: true });
    } catch {
      /* best effort: a locked temp file is retried by nobody, but must not mask the original error */
    }
  }
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

/**
 * A consistent, scrubbed copy of the live database for a backup. Never writes to `db`.
 * The first `VACUUM INTO` copy is scrubbed, then vacuumed again into a second file: deleted rows leave residue in free pages,
 * so the returned bytes always come from a fresh vacuum. Both temp files are removed even on error.
 */
export async function createScrubbedDbSnapshot(db: Db, workDir: string): Promise<ScrubbedSnapshot> {
  mkdirSync(workDir, { recursive: true, mode: 0o700 });
  const token = randomBytes(8).toString('hex');
  const first = path.join(workDir, `snap-${token}.tmp`);
  const second = path.join(workDir, `snap-${token}-final.tmp`);
  try {
    db.exec(`VACUUM INTO ${quote(first)}`);

    let schemaVersion = 0;
    let dbMinReaderVersion = 0;
    const counts: Record<string, number> = {};
    const copy = new DatabaseSync(first);
    try {
      copy.exec('PRAGMA journal_mode = DELETE');
      copy.exec('PRAGMA secure_delete = ON');
      transaction(copy, () => {
        for (const table of SCRUBBED_TABLES) if (tableExists(copy, table)) copy.exec(`DELETE FROM ${table}`);
        const del = copy.prepare('DELETE FROM meta WHERE key = ?');
        for (const key of SCRUBBED_META_KEYS) del.run(key);
        const keys = (copy.prepare('SELECT key FROM meta').all() as Array<{ key: string }>).map((row) => row.key);
        for (const key of keys) if (SCRUBBED_META_PREFIXES.some((prefix) => key.startsWith(prefix))) del.run(key);
      });
      schemaVersion = Number(getMeta(copy, 'schema_version')) || 0;
      dbMinReaderVersion = Number(getMeta(copy, 'min_reader_version')) || 0;
      for (const table of COUNTED_TABLES) {
        if (!tableExists(copy, table)) continue;
        counts[table] = Number((copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
      }
      copy.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      copy.exec(`VACUUM INTO ${quote(second)}`);
    } finally {
      copy.close();
    }

    const bytes = new Uint8Array(readFileSync(second));
    return { bytes, schemaVersion, dbMinReaderVersion, counts };
  } finally {
    removeFile(first);
    removeFile(second);
  }
}
