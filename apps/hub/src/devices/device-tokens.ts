import { createHash, randomBytes } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { DEVICE_CHALLENGE_TTL_MS, DEVICE_TOKEN_PREFIX, DEVICE_TOKEN_TTL_MS, deviceAuthMessage } from '@dude/contracts/hub';
import { ED25519_SIGNATURE_BYTES, decodeBase64url, verifyEd25519 } from './keys.js';
import { isDeviceActive } from './registry.js';

export { DEVICE_TOKEN_PREFIX };
export const DEVICE_AUTH_PURPOSE = 'device-auth';

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const iso = (ms: number): string => new Date(ms).toISOString();
export const hashDeviceToken = (raw: string): string => sha256Hex(raw);

export interface Challenge { nonce: string; expiresAt: string }

/**
 * A 32-byte single-use nonce valid for 60 s. A challenge is stored only for an active device; for any other id a
 * well-formed nonce is returned but never stored, so the endpoint does not reveal which device ids exist (the token
 * request then fails exactly like a bad signature).
 */
export function createChallenge(db: Db, deviceId: string, now: number): Challenge {
  const nonce = randomBytes(32).toString('base64url');
  const expiresAt = iso(now + DEVICE_CHALLENGE_TTL_MS);
  db.prepare('DELETE FROM challenges WHERE expires_at <= ?').run(iso(now));
  if (isDeviceActive(db, deviceId)) {
    db.prepare('INSERT INTO challenges(nonce, purpose, device_id, created_at, expires_at, consumed_at) VALUES(?, ?, ?, ?, ?, NULL)').run(
      nonce, DEVICE_AUTH_PURPOSE, deviceId, iso(now), expiresAt,
    );
  }
  return { nonce, expiresAt };
}

export interface IssuedToken { accessToken: string; expiresAt: string; keyId: string }

/**
 * Consumes the challenge (always, even when the signature is wrong, so a nonce is never retried) and, when the
 * signature verifies under one of the non-revoked keys of the device, issues a 15-minute `ddt_` token (only its hash
 * is stored).
 */
export function redeemChallenge(db: Db, input: { deviceId: string; nonce: string; signature: string; hubInstanceId: string; now: number }): IssuedToken | null {
  return transaction(db, () => {
    const at = iso(input.now);
    const claimed = db
      .prepare("UPDATE challenges SET consumed_at = ? WHERE nonce = ? AND purpose = 'device-auth' AND device_id = ? AND consumed_at IS NULL AND expires_at > ?")
      .run(at, input.nonce, input.deviceId, at);
    if (Number(claimed.changes) !== 1) return null;
    if (!isDeviceActive(db, input.deviceId)) return null;
    const signature = decodeBase64url(input.signature, ED25519_SIGNATURE_BYTES);
    if (signature === null) return null;
    const message = deviceAuthMessage({ hubInstanceId: input.hubInstanceId, nonce: input.nonce, deviceId: input.deviceId });
    const keys = db.prepare('SELECT key_id, public_key FROM device_keys WHERE device_id = ? AND revoked_at IS NULL').all(input.deviceId) as unknown as Array<{ key_id: string; public_key: Uint8Array }>;
    const match = keys.find((k) => verifyEd25519(k.public_key, message, signature));
    if (!match) return null;
    const accessToken = `${DEVICE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const expiresAt = iso(input.now + DEVICE_TOKEN_TTL_MS);
    db.prepare('INSERT INTO device_tokens(token_hash, device_id, key_id, issued_at, expires_at, revoked_at) VALUES(?, ?, ?, ?, ?, NULL)').run(
      hashDeviceToken(accessToken), input.deviceId, match.key_id, at, expiresAt,
    );
    db.prepare('DELETE FROM device_tokens WHERE expires_at <= ?').run(iso(input.now - 3600_000));
    return { accessToken, expiresAt, keyId: match.key_id };
  });
}

export interface DeviceContext { deviceId: string; keyId: string }

/** Token unexpired and unrevoked, device active, key unrevoked. */
export function resolveDeviceToken(db: Db, raw: string, now: number): DeviceContext | null {
  if (typeof raw !== 'string' || !raw.startsWith(DEVICE_TOKEN_PREFIX) || raw.length > 512) return null;
  const row = db
    .prepare(
      `SELECT t.device_id AS device_id, t.key_id AS key_id FROM device_tokens t
       JOIN devices d ON d.device_id = t.device_id JOIN device_keys k ON k.key_id = t.key_id
       WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > ?
         AND d.kind = 'desktop' AND d.revoked_at IS NULL AND d.unenrolled_at IS NULL AND k.revoked_at IS NULL`,
    )
    .get(hashDeviceToken(raw), iso(now)) as { device_id: string; key_id: string } | undefined;
  return row ? { deviceId: row.device_id, keyId: row.key_id } : null;
}
