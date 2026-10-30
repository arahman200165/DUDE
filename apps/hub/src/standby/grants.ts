import type { Db } from '@dude/sqlite-store';
import type { StandbyGrantInfo } from '@dude/contracts/hub';

/**
 * The per-device warm-standby grant (32-SS1, Milestone 849, PD-151), the `notifications_access` pattern with its own table
 * (`standby_grants`, migration 0013, scrubbed from backups). A grant is effective only while the device row is an ACTIVE DESKTOP row
 * that does not await re-pair AND still has the enrollment the grant was given to (`device_registered_at` equals the row's
 * `registered_at`): a revoked, unenrolled, re-enrolled or re-attached device holds no grant. Only the elevated admin methods
 * (`admin/standby-methods.ts`) write it; request handlers only read it through `standbyGrantOf`.
 */
interface GrantRow { device_id: string; device_registered_at: string; granted_at: string }
interface DeviceRow { kind: string; registered_at: string; revoked_at: string | null; unenrolled_at: string | null; needs_re_pair: number; display_name: string }

const deviceOf = (db: Db, deviceId: string): DeviceRow | undefined =>
  db.prepare('SELECT kind, registered_at, revoked_at, unenrolled_at, needs_re_pair, display_name FROM devices WHERE device_id = ?').get(deviceId) as DeviceRow | undefined;

/** Why a device cannot be granted: `null` when it can. */
export function standbyIneligibility(db: Db, deviceId: string): 'not-found' | 'not-desktop' | 'inactive' | 'needs-re-pair' | null {
  const row = deviceOf(db, deviceId);
  if (row === undefined) return 'not-found';
  if (row.kind !== 'desktop') return 'not-desktop';
  if (row.revoked_at !== null || row.unenrolled_at !== null) return 'inactive';
  if (row.needs_re_pair === 1) return 'needs-re-pair';
  return null;
}

const effective = (grant: GrantRow, device: DeviceRow | undefined): boolean =>
  device !== undefined && device.kind === 'desktop' && device.revoked_at === null && device.unenrolled_at === null && device.needs_re_pair === 0
  && device.registered_at === grant.device_registered_at;

/** The device's effective grant (`grantedAt`), or null. Re-read on every request, so a revoke is effective on the next call. */
export function standbyGrantOf(db: Db, deviceId: string): { grantedAt: string } | null {
  const grant = db.prepare('SELECT device_id, device_registered_at, granted_at FROM standby_grants WHERE device_id = ?').get(deviceId) as GrantRow | undefined;
  if (grant === undefined || !effective(grant, deviceOf(db, deviceId))) return null;
  return { grantedAt: grant.granted_at };
}

/**
 * Grants (or renews, for a re-enrolled device) the standby grant of an eligible device. Returns false when the device is not eligible.
 * The caller audits.
 */
export function grantStandby(db: Db, deviceId: string, now: number): boolean {
  if (standbyIneligibility(db, deviceId) !== null) return false;
  const device = deviceOf(db, deviceId)!;
  db.prepare(
    `INSERT INTO standby_grants(device_id, device_registered_at, granted_at) VALUES(?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET device_registered_at = excluded.device_registered_at, granted_at = excluded.granted_at`,
  ).run(deviceId, device.registered_at, new Date(now).toISOString());
  return true;
}

/** Removes the grant row (effective or not). Returns whether there was one. The caller audits. */
export function revokeStandby(db: Db, deviceId: string): boolean {
  return Number(db.prepare('DELETE FROM standby_grants WHERE device_id = ?').run(deviceId).changes) === 1;
}

/** Every grant row, oldest first, with whether it is still effective. Display names only, never a credential. */
export function listStandbyGrants(db: Db): StandbyGrantInfo[] {
  const rows = db.prepare('SELECT device_id, device_registered_at, granted_at FROM standby_grants ORDER BY granted_at, device_id').all() as unknown as GrantRow[];
  return rows.map((row) => {
    const device = deviceOf(db, row.device_id);
    return { deviceId: row.device_id, displayName: device?.display_name ?? null, grantedAt: row.granted_at, active: effective(row, device) };
  });
}

/** The raw grant row's time (effective or not), for binding a confirmation token to the state that was previewed. */
export function standbyGrantRowAt(db: Db, deviceId: string): string | null {
  const row = db.prepare('SELECT granted_at FROM standby_grants WHERE device_id = ?').get(deviceId) as { granted_at: string } | undefined;
  return row?.granted_at ?? null;
}
