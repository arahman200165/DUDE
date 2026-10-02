import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { StoredPassword } from './password.js';

export interface OwnerRow { ownerId: string; displayName: string }

/** The single owner, or null before bootstrap. */
export function getOwner(db: Db): OwnerRow | null {
  const row = db.prepare('SELECT owner_id, display_name FROM owner LIMIT 1').get() as { owner_id: string; display_name: string } | undefined;
  return row ? { ownerId: row.owner_id, displayName: row.display_name } : null;
}

export function getStoredPassword(db: Db, ownerId: string): StoredPassword | null {
  const row = db.prepare('SELECT params_json, salt, hash FROM owner_credentials WHERE owner_id = ?').get(ownerId) as
    | { params_json: string; salt: Uint8Array; hash: Uint8Array } | undefined;
  return row ? { paramsJson: row.params_json, salt: Buffer.from(row.salt), hash: Buffer.from(row.hash) } : null;
}

/** Replaces the password verifier and stamps `password_changed_at`. */
export function setStoredPassword(db: Db, ownerId: string, credential: StoredPassword, now: number): void {
  const at = new Date(now).toISOString();
  transaction(db, () => {
    db.prepare("UPDATE owner_credentials SET algorithm = 'argon2id', params_json = ?, salt = ?, hash = ?, updated_at = ? WHERE owner_id = ?").run(
      credential.paramsJson, credential.salt, credential.hash, at, ownerId,
    );
    db.prepare('UPDATE owner SET password_changed_at = ? WHERE owner_id = ?').run(at, ownerId);
  });
}

export function remainingRecoveryCodes(db: Db, ownerId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE owner_id = ? AND used_at IS NULL').get(ownerId) as { n: number };
  return Number(row.n);
}
