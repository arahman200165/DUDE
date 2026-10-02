import { createHash } from 'node:crypto';
import { uuidv7 } from '@dude/persistence';
import type { ResetKind } from '@dude/contracts';
import type { Db } from './sqlite.js';
import { getMeta, setMeta, transaction } from './sqlite.js';

/** Tables wiped by both reset kinds. Identity (meta) and migrations are never touched here. */
export const DATA_TABLES = [
  'kv', 'records', 'outbox', 'history_entries', 'network_runs', 'mutation_journal',
  'snapshot_headers', 'powershell_history', 'device_docs',
] as const;
/** Additionally wiped by 'reset-device' (values go with their refs). */
export const SECRET_TABLES = ['secret_refs', 'secret_values'] as const;

export interface ResetPreviewData {
  kind: ResetKind;
  counts: Record<string, number>;
  keepsIdentity: boolean;
  wipesSecrets: boolean;
  /** Binds a confirmation to exactly what the preview showed; main wraps it in an expiring token. */
  digest: string;
}

export interface ResetDeps {
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export type ResetApplyResult = { ok: true } | { ok: false; error: 'stale-preview' };

const tablesFor = (kind: ResetKind): readonly string[] => (kind === 'reset-device' ? [...DATA_TABLES, ...SECRET_TABLES] : DATA_TABLES);

function countRows(db: Db, kind: ResetKind): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of tablesFor(kind)) {
    counts[table] = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as unknown as { n: number }).n;
  }
  return counts;
}

function digestOf(kind: ResetKind, counts: Record<string, number>, deviceId: string): string {
  return createHash('sha256').update(JSON.stringify([kind, counts, deviceId])).digest('hex');
}

export function previewReset(db: Db, kind: ResetKind): ResetPreviewData {
  if (kind !== 'clear-data' && kind !== 'reset-device') throw new Error('Unknown reset kind.');
  const counts = countRows(db, kind);
  return {
    kind,
    counts,
    keepsIdentity: kind === 'clear-data',
    wipesSecrets: kind === 'reset-device',
    digest: digestOf(kind, counts, getMeta(db, 'device_id') ?? ''),
  };
}

/** Recomputes the digest inside the transaction; a mismatch means the data changed since the preview. */
export function applyReset(db: Db, kind: ResetKind, expectedDigest: string, deps: ResetDeps): ResetApplyResult {
  if (kind !== 'clear-data' && kind !== 'reset-device') throw new Error('Unknown reset kind.');
  return transaction(db, () => {
    const current = digestOf(kind, countRows(db, kind), getMeta(db, 'device_id') ?? '');
    if (current !== expectedDigest) return { ok: false as const, error: 'stale-preview' as const };
    for (const table of tablesFor(kind)) db.exec(`DELETE FROM ${table}`);
    if (kind === 'reset-device') {
      const newId = (): string => uuidv7(deps.randomBytes, () => deps.now().getTime());
      setMeta(db, 'device_id', newId());
      setMeta(db, 'environment_id', newId());
      db.prepare("DELETE FROM meta WHERE key = 'cloned_from'").run();
    }
    return { ok: true as const };
  });
}
