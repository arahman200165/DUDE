import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '@dude/sqlite-store';
import { PAIRING_CODE_TTL_MS, PAIRING_MAX_WRONG_ATTEMPTS, displayPairingCode, isNormalizedPairingCode, normalizePairingCode } from '@dude/contracts/hub';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

export const hashPairingCode = (normalized: string): string => createHash('sha256').update(normalized).digest('hex');

/** 8 random Crockford characters (40 bits), normalized form. */
export function generatePairingCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i]! & 31];
  return out;
}

export interface CreatedPairingCode { code: string; displayCode: string; expiresAt: string }

/** Stores only SHA-256 of the normalized code; the plaintext is returned once. */
export function createPairingCode(db: Db, createdBySessionHash: string, now: number, reattachDeviceId?: string): CreatedPairingCode {
  const expiresAt = new Date(now + PAIRING_CODE_TTL_MS).toISOString();
  for (;;) {
    const code = generatePairingCode();
    try {
      db.prepare('INSERT INTO pairing_codes(code_hash, created_by_session_hash, created_at, expires_at, attempts, reattach_device_id) VALUES(?, ?, ?, ?, 0, ?)').run(
        hashPairingCode(code), createdBySessionHash, new Date(now).toISOString(), expiresAt, reattachDeviceId ?? null,
      );
      return { code, displayCode: displayPairingCode(code), expiresAt };
    } catch (error) {
      if (!/UNIQUE|constraint/i.test(String(error))) throw error;
    }
  }
}

/** Valid code shape after normalization, else null. */
export function normalizeSubmittedCode(input: string): string | null {
  const normalized = normalizePairingCode(input);
  return isNormalizedPairingCode(normalized) ? normalized : null;
}

/** Read-only: is this code live (unknown/expired/consumed/over-attempted codes are not)? */
export function pairingCodeIsLive(db: Db, normalized: string, now: number): boolean {
  const row = db.prepare('SELECT 1 AS x FROM pairing_codes WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < ?').get(
    hashPairingCode(normalized), new Date(now).toISOString(), PAIRING_MAX_WRONG_ATTEMPTS,
  );
  return row !== undefined;
}

/**
 * Read-only: the device a live code is bound to (a re-attach code, PD-072). `undefined` = the code is not live or unknown,
 * `null` = an ordinary code, a string = bound to exactly that deviceId.
 */
export function pairingCodeReattachTarget(db: Db, normalized: string, now: number): string | null | undefined {
  const row = db.prepare('SELECT reattach_device_id FROM pairing_codes WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < ?').get(
    hashPairingCode(normalized), new Date(now).toISOString(), PAIRING_MAX_WRONG_ATTEMPTS,
  ) as { reattach_device_id: string | null } | undefined;
  return row === undefined ? undefined : row.reattach_device_id;
}

/** Single-use: marks the code consumed by the device; false if it was not live. */
export function consumePairingCode(db: Db, normalized: string, deviceId: string, now: number): boolean {
  const result = db
    .prepare('UPDATE pairing_codes SET consumed_at = ?, consumed_by_device_id = ? WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < ?')
    .run(new Date(now).toISOString(), deviceId, hashPairingCode(normalized), new Date(now).toISOString(), PAIRING_MAX_WRONG_ATTEMPTS);
  return Number(result.changes) === 1;
}

/**
 * A wrong guess cannot be attributed to one code (only hashes are stored), so it counts against every live code: after
 * 5 wrong attempts an outstanding code is dead and the owner must create a new one. Returns how many codes were
 * invalidated by this attempt.
 */
export function recordWrongPairingAttempt(db: Db, now: number): number {
  const at = new Date(now).toISOString();
  db.prepare('UPDATE pairing_codes SET attempts = attempts + 1 WHERE consumed_at IS NULL AND expires_at > ? AND attempts < ?').run(at, PAIRING_MAX_WRONG_ATTEMPTS);
  const row = db.prepare('SELECT COUNT(*) AS n FROM pairing_codes WHERE consumed_at IS NULL AND expires_at > ? AND attempts = ?').get(at, PAIRING_MAX_WRONG_ATTEMPTS) as { n: number };
  return Number(row.n);
}
