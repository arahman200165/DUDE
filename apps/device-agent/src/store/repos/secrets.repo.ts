import { SECRET_PURPOSES, isSecretPurpose } from '@dude/persistence';
import type { SecretPurpose } from '@dude/persistence';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';

/** What the store exposes about a secret: never plaintext, never ciphertext. */
export interface SecretStatusRow {
  purpose: SecretPurpose;
  isSet: boolean;
  needsReentry: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

function assertPurpose(purpose: unknown): asserts purpose is SecretPurpose {
  if (!isSecretPurpose(purpose)) throw new Error('Unknown secret purpose.');
}

/** Insert or replace a purpose's ciphertext atomically. Keeps the existing ref id and clears needs_reentry. */
export function setSecretCiphertext(db: Db, purpose: SecretPurpose, ciphertext: Uint8Array, now: Date, newRef: () => string): string {
  assertPurpose(purpose);
  if (!(ciphertext instanceof Uint8Array) || ciphertext.length === 0) throw new Error('Secret ciphertext must be non-empty bytes.');
  return transaction(db, () => {
    const existing = db.prepare('SELECT ref FROM secret_refs WHERE purpose = ?').get(purpose) as unknown as { ref: string } | undefined;
    const ref = existing?.ref ?? newRef();
    if (existing) {
      db.prepare('UPDATE secret_refs SET needs_reentry = 0 WHERE ref = ?').run(ref);
    } else {
      db.prepare('INSERT INTO secret_refs(ref, purpose, owner, scope, created_at, last_used_at, needs_reentry) VALUES(?, ?, ?, ?, ?, NULL, 0)')
        .run(ref, purpose, SECRET_PURPOSES[purpose].owner, 'device', now.toISOString());
    }
    db.prepare(
      `INSERT INTO secret_values(ref, ciphertext) VALUES(?, ?)
       ON CONFLICT(ref) DO UPDATE SET ciphertext = excluded.ciphertext`,
    ).run(ref, ciphertext);
    return ref;
  });
}

/** Stored ciphertext for main to decrypt; stamps last_used_at. Null when unset. */
export function getSecretCiphertext(db: Db, purpose: SecretPurpose, now: Date): Uint8Array | null {
  assertPurpose(purpose);
  return transaction(db, () => {
    const row = db.prepare(
      'SELECT r.ref AS ref, v.ciphertext AS ciphertext FROM secret_refs r JOIN secret_values v ON v.ref = r.ref WHERE r.purpose = ?',
    ).get(purpose) as unknown as { ref: string; ciphertext: Uint8Array } | undefined;
    if (!row) return null;
    db.prepare('UPDATE secret_refs SET last_used_at = ? WHERE ref = ?').run(now.toISOString(), row.ref);
    return new Uint8Array(row.ciphertext);
  });
}

export function secretStatus(db: Db, purpose: SecretPurpose): SecretStatusRow {
  assertPurpose(purpose);
  const row = db.prepare(
    `SELECT r.created_at AS created_at, r.last_used_at AS last_used_at, r.needs_reentry AS needs_reentry,
            (SELECT COUNT(*) FROM secret_values v WHERE v.ref = r.ref) AS has_value
       FROM secret_refs r WHERE r.purpose = ?`,
  ).get(purpose) as unknown as { created_at: string; last_used_at: string | null; needs_reentry: number; has_value: number } | undefined;
  if (!row) return { purpose, isSet: false, needsReentry: false, createdAt: null, lastUsedAt: null };
  return { purpose, isSet: row.has_value > 0, needsReentry: row.needs_reentry === 1, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

export function listSecretStatus(db: Db): SecretStatusRow[] {
  return (Object.keys(SECRET_PURPOSES) as SecretPurpose[]).map((p) => secretStatus(db, p));
}

export function removeSecret(db: Db, purpose: SecretPurpose): boolean {
  assertPurpose(purpose);
  // secret_values rows go with their ref (ON DELETE CASCADE).
  return Number(db.prepare('DELETE FROM secret_refs WHERE purpose = ?').run(purpose).changes) > 0;
}
