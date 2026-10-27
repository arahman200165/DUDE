import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { getMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

/**
 * Tables holding transient credentials and sessions, plus per-instance notifications (PD-109); emptied in the snapshot copy (PD-070) and
 * on restore. `oidc_flows` (32-SS1, Milestone 841) holds in-flight sign-in attempts and PKCE verifiers. `linked_identities` is scrubbed too
 * (PD-145): a restored Hub is a new instance whose OAuth redirect origin and client may differ, so a restored Hub never trusts the
 * old links; the owner signs in with the password or a recovery code and links Google again. `throttle` and `ip_blocks` are kept. `devices.notifications_access` stays: it is a per-device grant, and every desktop
 * must re-pair after a restore anyway.
 */
export const SCRUBBED_TABLES = ['sessions', 'device_tokens', 'challenges', 'pairing_codes', 'setup_state', 'notifications', 'oidc_flows', 'linked_identities'] as const;

/**
 * Every other `dude.db` table: kept in a backup as is (`meta` and `audit_events` are kept too; `meta` is scrubbed per key below).
 * Together with `SCRUBBED_TABLES` this must name EVERY table of the Hub database; `backup/classification.spec.ts` fails on a new table
 * nobody classified, so each new migration decides its backup behaviour explicitly.
 */
export const HUB_KEPT_TABLES = [
  'meta', 'schema_migrations', 'environment', 'owner', 'owner_credentials', 'recovery_codes', 'devices', 'device_keys', 'throttle', 'audit_events',
  'tls_pins', 'tls_pin_acks', 'records', 'change_feed', 'applied_ops', 'device_sync_state', 'tls_proxy_pins', 'tls_proxy_pin_acks', 'web_access', 'ip_blocks',
  'collab_docs', 'collab_updates', 'collab_snapshots', 'collab_bases',
] as const;

/**
 * `savesphere.db` tables emptied in its snapshot copy (32-SS1, Milestone 832). `audit_outbox` is transient: it only carries events
 * to `dude.db`'s audit log and a restored store must not replay them. The backup engine integrates `savesphere.db` at
 * Milestone 847; until then these lists are only exported and enforced by `backup/classification.spec.ts`. `jobs` (Milestone 834,
 * the durable queue) is operational state with leases and attempt counts that mean nothing on another machine: a restored Hub
 * starts with an empty queue and re-derives pending work from content state. `ingest_tokens` (Milestone 843, PD-149) holds capture
 * credentials (hashes, never secrets): scrubbed, so a restored Hub never carries one from before the restore and the owner mints new ones.
 * `uploads` and `upload_chunks` (Milestone 845, PD-148) are resumable-upload sessions: transient, because the chunk files they describe live under
 * `storage/uploads` and are never backed up (the expiry job releases an `upload` blob reference whose session is gone, which is the restore case).
 */
export const SAVESPHERE_SCRUBBED_TABLES = ['audit_outbox', 'jobs', 'ingest_tokens', 'uploads', 'upload_chunks'] as const;

/**
 * `savesphere.db` tables kept as is. Each content table added by a later milestone is classified here or above, never silently.
 * `blobs` and `blob_refs` (Milestone 833) are kept content metadata; the backup v2 engine (Milestone 847) carries the bytes of every
 * REFERENCED blob and drops unreferenced `blobs` rows from the copy (they are garbage the collector would remove, and a restored row
 * must always have its bytes).
 */
export const SAVESPHERE_KEPT_TABLES = ['meta', 'schema_migrations', 'blobs', 'blob_refs'] as const;

/**
 * `savesphere.db` meta key prefixes removed from the snapshot copy (Milestone 847): `blob_lease:*` is a live claim of this process
 * (the backup's own lease is held while the copy is taken). The `queue_schedule:*` keys are kept (Milestone 834).
 */
export const SAVESPHERE_SCRUBBED_META_PREFIXES = ['blob_lease:'] as const;

/** Exact meta keys removed from the snapshot copy. */
export const SCRUBBED_META_KEYS = ['csrf_key', 'alerts_seen_seq', 'hub_addresses', 'reachability_last', 'acme_last_attempt'] as const;

/**
 * Meta key prefixes removed from the snapshot copy. The Hub writes `revoked_attempt:<via>:<deviceId>` (devices/revoked-attempts.ts);
 * PD-070 spells it `revoked-attempts`, so both spellings are scrubbed. `job_last:<id>` is a background job's last run (jobs/job-status.ts, PD-112).
 * `backup_dest` (Milestone 847) covers `backup_dest_state:<id>` and `backup_dest_journal:<id>`: the state and in-flight journal of this
 * machine's backup destinations, which a restored Hub does not have.
 */
export const SCRUBBED_META_PREFIXES = ['revoked_attempt', 'revoked-attempts', 'job_last:', 'backup_dest'] as const;

/** Tables whose row counts go into the manifest (those that exist). */
export const COUNTED_TABLES = ['devices', 'records', 'audit_events', 'change_feed'] as const;
/** `savesphere.db` tables whose row counts go into a v2 manifest (as `savesphere.<table>`). */
export const SAVESPHERE_COUNTED_TABLES = ['blobs', 'blob_refs'] as const;

export interface ScrubbedSnapshot {
  bytes: Uint8Array;
  schemaVersion: number;
  dbMinReaderVersion: number;
  counts: Record<string, number>;
}

/** What one database's snapshot scrubs and counts. */
export interface SnapshotSpec {
  tables: readonly string[];
  metaKeys: readonly string[];
  metaPrefixes: readonly string[];
  counted: readonly string[];
  /** Extra scrub on the first copy, inside the scrub transaction. */
  extra?: (copy: DatabaseSync) => void;
}

export const HUB_SNAPSHOT_SPEC: SnapshotSpec = { tables: SCRUBBED_TABLES, metaKeys: SCRUBBED_META_KEYS, metaPrefixes: SCRUBBED_META_PREFIXES, counted: COUNTED_TABLES };

export const SAVESPHERE_SNAPSHOT_SPEC: SnapshotSpec = {
  tables: SAVESPHERE_SCRUBBED_TABLES,
  metaKeys: [],
  metaPrefixes: SAVESPHERE_SCRUBBED_META_PREFIXES,
  counted: SAVESPHERE_COUNTED_TABLES,
  extra: (copy) => {
    if (!tableExists(copy, 'blobs') || !tableExists(copy, 'blob_refs')) return;
    copy.exec('DELETE FROM blobs WHERE NOT EXISTS (SELECT 1 FROM blob_refs r WHERE r.blob_sha256 = blobs.sha256)');
  },
};

/** A scrubbed snapshot on disk (streamed into a backup, never read whole); `dispose()` removes the file. */
export interface SnapshotFile {
  file: string;
  size: number;
  schemaVersion: number;
  dbMinReaderVersion: number;
  counts: Record<string, number>;
  dispose(): void;
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
 * A consistent, scrubbed copy of a live database, as a file in `workDir`. Never writes to `db`. The first `VACUUM INTO` copy is
 * scrubbed, then vacuumed again into a second file: deleted rows leave residue in free pages, so the result always comes from a
 * fresh vacuum. The first file is always removed; the second is the caller's to `dispose()` (removed here on error).
 */
export async function createScrubbedSnapshotFile(db: Db, workDir: string, spec: SnapshotSpec = HUB_SNAPSHOT_SPEC): Promise<SnapshotFile> {
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
        for (const table of spec.tables) if (tableExists(copy, table)) copy.exec(`DELETE FROM ${table}`);
        if (tableExists(copy, 'meta')) {
          const del = copy.prepare('DELETE FROM meta WHERE key = ?');
          for (const key of spec.metaKeys) del.run(key);
          const keys = (copy.prepare('SELECT key FROM meta').all() as Array<{ key: string }>).map((row) => row.key);
          for (const key of keys) if (spec.metaPrefixes.some((prefix) => key.startsWith(prefix))) del.run(key);
        }
        spec.extra?.(copy);
      });
      if (tableExists(copy, 'meta')) {
        schemaVersion = Number(getMeta(copy, 'schema_version')) || 0;
        dbMinReaderVersion = Number(getMeta(copy, 'min_reader_version')) || 0;
      }
      for (const table of spec.counted) {
        if (!tableExists(copy, table)) continue;
        counts[table] = Number((copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
      }
      copy.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      copy.exec(`VACUUM INTO ${quote(second)}`);
    } finally {
      copy.close();
    }
    return { file: second, size: statSync(second).size, schemaVersion, dbMinReaderVersion, counts, dispose: () => removeFile(second) };
  } catch (error) {
    removeFile(second);
    throw error;
  } finally {
    removeFile(first);
  }
}

/** The v1 form (31G): the scrubbed `dude.db` copy as bytes (v1 backups are whole-buffer by design and capped at 512 MiB). */
export async function createScrubbedDbSnapshot(db: Db, workDir: string): Promise<ScrubbedSnapshot> {
  const snapshot = await createScrubbedSnapshotFile(db, workDir, HUB_SNAPSHOT_SPEC);
  try {
    return { bytes: new Uint8Array(readFileSync(snapshot.file)), schemaVersion: snapshot.schemaVersion, dbMinReaderVersion: snapshot.dbMinReaderVersion, counts: snapshot.counts };
  } finally {
    snapshot.dispose();
  }
}
