import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { DEVICE_CAPABILITIES } from '@dude/contracts/hub';
import type { DeviceCapability, DeviceInfo, DeviceRegistryPlatform, DeviceSelfUpdate, EnrollDevice } from '@dude/contracts/hub';
import { publicSessionId } from '../auth/sessions.js';
import type { RevokedSession } from '../auth/sessions.js';
import { newId } from '../util/ids.js';

/** `last_seen_at` is written at most once per minute. */
export const LAST_SEEN_MIN_INTERVAL_MS = 60_000;

interface DeviceRow {
  device_id: string; environment_id: string; display_name: string; platform: string; app_version: string; capabilities_json: string;
  protocol_version: number; registered_at: string; last_seen_at: string | null; revoked_at: string | null; unenrolled_at: string | null;
  recovery_trusted: number;
}

const COLUMNS = 'device_id, environment_id, display_name, platform, app_version, capabilities_json, protocol_version, registered_at, last_seen_at, revoked_at, unenrolled_at, recovery_trusted';
const iso = (ms: number): string => new Date(ms).toISOString();

function toInfo(row: DeviceRow, currentDeviceId: string | null): DeviceInfo {
  const stored = JSON.parse(row.capabilities_json) as string[];
  return {
    deviceId: row.device_id, displayName: row.display_name, platform: row.platform as DeviceRegistryPlatform, appVersion: row.app_version,
    protocolVersion: row.protocol_version, capabilities: stored.filter((c): c is DeviceCapability => (DEVICE_CAPABILITIES as readonly string[]).includes(c)),
    registeredAt: row.registered_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, unenrolledAt: row.unenrolled_at,
    recoveryTrusted: row.recovery_trusted === 1, online: false, current: row.device_id === currentDeviceId,
  };
}

const rowOf = (db: Db, deviceId: string): DeviceRow | undefined =>
  db.prepare(`SELECT ${COLUMNS} FROM devices WHERE device_id = ?`).get(deviceId) as DeviceRow | undefined;

export const isActiveRow = (row: Pick<DeviceRow, 'revoked_at' | 'unenrolled_at'>): boolean => row.revoked_at === null && row.unenrolled_at === null;

export function getDevice(db: Db, deviceId: string, currentDeviceId: string | null = null): DeviceInfo | null {
  const row = rowOf(db, deviceId);
  return row ? toInfo(row, currentDeviceId) : null;
}

export function listDevices(db: Db, currentDeviceId: string | null): DeviceInfo[] {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM devices ORDER BY registered_at, device_id`).all() as unknown as DeviceRow[];
  return rows.map((row) => toInfo(row, currentDeviceId));
}

export function isDeviceActive(db: Db, deviceId: string): boolean {
  const row = rowOf(db, deviceId);
  return row !== undefined && isActiveRow(row);
}

/** Key ids of the device that are not revoked, sorted (for the revoke confirmation digest). */
export function activeKeyIds(db: Db, deviceId: string): string[] {
  const rows = db.prepare('SELECT key_id FROM device_keys WHERE device_id = ? AND revoked_at IS NULL ORDER BY key_id').all(deviceId) as unknown as Array<{ key_id: string }>;
  return rows.map((r) => r.key_id);
}

export type EnrollOutcome =
  | { status: 'enrolled'; keyId: string; registeredAt: string; environmentId: string }
  | { status: 'active-conflict' }
  | { status: 'key-reused' }
  | { status: 'no-environment' }
  | { status: 'code-rejected' };

export interface EnrollInput { device: EnrollDevice; publicKey: Buffer; now: number }

/**
 * Registers a device or re-enrolls a revoked/unenrolled one. A revoked key is dead forever: re-enrollment needs a key
 * that differs from every key the device ever registered. `consumeCode` runs inside the same transaction, after every
 * other check, so a rejected enrollment never burns a pairing code.
 */
export function enrollDevice(db: Db, input: EnrollInput, consumeCode: () => boolean): EnrollOutcome {
  return transaction(db, (): EnrollOutcome => {
    const environment = db.prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string } | undefined;
    if (!environment) return { status: 'no-environment' };
    const existing = rowOf(db, input.device.deviceId);
    if (existing && isActiveRow(existing)) return { status: 'active-conflict' };
    if (existing) {
      const reused = db.prepare('SELECT 1 AS x FROM device_keys WHERE device_id = ? AND public_key = ?').get(input.device.deviceId, input.publicKey);
      if (reused !== undefined) return { status: 'key-reused' };
    }
    if (!consumeCode()) return { status: 'code-rejected' };
    const at = iso(input.now);
    const d = input.device;
    const capabilities = JSON.stringify(d.capabilities);
    const hubEligible = d.capabilities.includes('hub-host') ? 1 : 0;
    if (existing) {
      db.prepare(
        `UPDATE devices SET display_name = ?, platform = ?, app_version = ?, capabilities_json = ?, hub_eligible = ?, protocol_version = ?,
         registered_at = ?, last_seen_at = NULL, revoked_at = NULL, unenrolled_at = NULL, recovery_trusted = 0 WHERE device_id = ?`,
      ).run(d.displayName, d.platform, d.appVersion, capabilities, hubEligible, d.protocolVersion, at, d.deviceId);
    } else {
      db.prepare(
        `INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(d.deviceId, environment.environment_id, d.displayName, d.platform, d.appVersion, capabilities, hubEligible, d.protocolVersion, at);
    }
    const keyId = newId(() => input.now);
    db.prepare("INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at, revoked_at) VALUES(?, ?, 'ed25519', ?, ?, NULL)").run(keyId, d.deviceId, input.publicKey, at);
    return { status: 'enrolled', keyId, registeredAt: at, environmentId: environment.environment_id };
  });
}

export function renameDevice(db: Db, deviceId: string, displayName: string): boolean {
  return Number(db.prepare('UPDATE devices SET display_name = ? WHERE device_id = ?').run(displayName, deviceId).changes) === 1;
}

export function setRecoveryTrust(db: Db, deviceId: string, trusted: boolean): boolean {
  return Number(db.prepare('UPDATE devices SET recovery_trusted = ? WHERE device_id = ? AND revoked_at IS NULL AND unenrolled_at IS NULL').run(trusted ? 1 : 0, deviceId).changes) === 1;
}

/** Applies the provided fields only. */
export function updateSelf(db: Db, deviceId: string, update: DeviceSelfUpdate): void {
  const sets: string[] = [];
  const values: Array<string | number> = [];
  if (update.displayName !== undefined) { sets.push('display_name = ?'); values.push(update.displayName); }
  if (update.appVersion !== undefined) { sets.push('app_version = ?'); values.push(update.appVersion); }
  if (update.protocolVersion !== undefined) { sets.push('protocol_version = ?'); values.push(update.protocolVersion); }
  if (update.capabilities !== undefined) {
    sets.push('capabilities_json = ?', 'hub_eligible = ?');
    values.push(JSON.stringify(update.capabilities), update.capabilities.includes('hub-host') ? 1 : 0);
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE device_id = ?`).run(...values, deviceId);
}

/** Records `last_seen_at`, at most once per minute per device. */
export function touchLastSeen(db: Db, deviceId: string, now: number): void {
  const cutoff = iso(now - LAST_SEEN_MIN_INTERVAL_MS);
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE device_id = ? AND (last_seen_at IS NULL OR last_seen_at <= ?)').run(iso(now), deviceId, cutoff);
}

export interface Deactivation { keyIds: string[]; revokedTokens: number; revokedSessions: RevokedSession[] }

/**
 * Ends a device: stamps `revoked_at` or `unenrolled_at`, revokes all its keys and device tokens, and revokes the owner
 * bearer sessions bound to it. Returns null when the device is unknown or already inactive.
 */
export function deactivateDevice(db: Db, deviceId: string, how: 'revoked' | 'unenrolled', now: number): Deactivation | null {
  return transaction(db, () => {
    const row = rowOf(db, deviceId);
    if (!row || !isActiveRow(row)) return null;
    const at = iso(now);
    db.prepare(`UPDATE devices SET ${how === 'revoked' ? 'revoked_at' : 'unenrolled_at'} = ? WHERE device_id = ?`).run(at, deviceId);
    const keyIds = activeKeyIds(db, deviceId);
    db.prepare('UPDATE device_keys SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').run(at, deviceId);
    const tokens = db.prepare('UPDATE device_tokens SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').run(at, deviceId);
    const sessions = db
      .prepare('SELECT session_hash, owner_id, kind, device_id FROM sessions WHERE device_id = ? AND revoked_at IS NULL')
      .all(deviceId) as unknown as Array<{ session_hash: string; owner_id: string; kind: 'cookie' | 'bearer'; device_id: string | null }>;
    const revoke = db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_hash = ?');
    for (const s of sessions) revoke.run(at, s.session_hash);
    const result: Deactivation = {
      keyIds, revokedTokens: Number(tokens.changes),
      revokedSessions: sessions.map((s) => ({ sessionHash: s.session_hash, sessionId: publicSessionId(s.session_hash), ownerId: s.owner_id, kind: s.kind, deviceId: s.device_id })),
    };
    return result;
  });
}
