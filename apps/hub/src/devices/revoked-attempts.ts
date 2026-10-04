import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { audit } from '../security/audit.js';
import { hashDeviceToken } from './device-tokens.js';

export type RevokedAttemptVia = 'token' | 'challenge' | 'redeem' | 'realtime';

/** At most one `device.revoked-attempt` row per (device, via) per hour. */
export const REVOKED_ATTEMPT_INTERVAL_MS = 3600_000;

/**
 * Failure-path only: the device id behind a `ddt_` token whose row exists but whose token, device or key has been ended
 * (revoked or unenrolled). An unknown or merely expired token returns null. Never called on a successful resolution.
 */
export function revokedDeviceOfToken(db: Db, raw: string): string | null {
  const row = db
    .prepare(
      `SELECT t.device_id AS device_id FROM device_tokens t
       LEFT JOIN devices d ON d.device_id = t.device_id LEFT JOIN device_keys k ON k.key_id = t.key_id
       WHERE t.token_hash = ? AND d.kind = 'desktop'
         AND (t.revoked_at IS NOT NULL OR d.revoked_at IS NOT NULL OR d.unenrolled_at IS NOT NULL OR k.revoked_at IS NOT NULL)`,
    )
    .get(hashDeviceToken(raw)) as { device_id: string } | undefined;
  return row?.device_id ?? null;
}

/** True when the id names a desktop device that exists but is revoked or unenrolled. */
export function isRevokedDevice(db: Db, deviceId: string): boolean {
  const row = db.prepare("SELECT 1 AS x FROM devices WHERE device_id = ? AND kind = 'desktop' AND (revoked_at IS NOT NULL OR unenrolled_at IS NOT NULL)").get(deviceId);
  return row !== undefined;
}

/** Audits (rate-limited per device and via, meta-backed) that a revoked device kept trying. Never throws, never carries a credential. */
export function noteRevokedAttempt(db: Db, input: { deviceId: string; via: RevokedAttemptVia; ip: string | undefined; now: number }): void {
  try {
    const key = `revoked_attempt:${input.via}:${input.deviceId}`;
    const last = Number(getMeta(db, key) ?? 0);
    if (Number.isFinite(last) && last > 0 && input.now - last < REVOKED_ATTEMPT_INTERVAL_MS) return;
    setMeta(db, key, String(input.now));
    audit(db, { event: 'device.revoked-attempt', outcome: 'denied', actorKind: 'device', actorId: input.deviceId, ip: input.ip, detail: { via: input.via }, now: input.now });
  } catch {
    // Auditing must never change the response of a denied request.
  }
}

/** Failure-path helper for a bearer token: audits when it belonged to an ended device. */
export function noteRevokedToken(db: Db, raw: string, via: RevokedAttemptVia, ip: string | undefined, now: number): void {
  if (typeof raw !== 'string' || raw.length > 512) return;
  const deviceId = revokedDeviceOfToken(db, raw);
  if (deviceId !== null) noteRevokedAttempt(db, { deviceId, via, ip, now });
}
