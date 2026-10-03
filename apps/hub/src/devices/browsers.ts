import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { newId } from '../util/ids.js';
import { touchLastSeen } from './registry.js';

/**
 * Browser rows (PD-050): a key-less `devices` row (`kind = 'browser'`) per Hub web installation, used only for attribution
 * (usage ownership, audit, the Devices list). It is never a credential: it has no key, so no device token can exist for it.
 */
export interface BrowserBinding { deviceId: string; environmentId: string; displayName: string }

const iso = (ms: number): string => new Date(ms).toISOString();

export type AttachResult = { status: 'attached'; binding: BrowserBinding } | { status: 'no-environment' };

/**
 * Creates or reuses the browser row of this installation, (re)activates it, and binds the session to it. A session is
 * bound to exactly one browser row; attaching another installation rebinds it.
 */
export function attachBrowser(db: Db, input: { installationId: string; label: string; sessionHash: string; now: number }): AttachResult {
  return transaction(db, (): AttachResult => {
    const environment = db.prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string } | undefined;
    if (!environment) return { status: 'no-environment' };
    const environmentId = environment.environment_id;
    const at = iso(input.now);
    const label = input.label.trim();
    const existing = db
      .prepare("SELECT device_id FROM devices WHERE kind = 'browser' AND environment_id = ? AND installation_id = ?")
      .get(environmentId, input.installationId) as { device_id: string } | undefined;
    let deviceId: string;
    if (existing) {
      deviceId = existing.device_id;
      // A fresh owner sign-in re-activates a browser that was removed from Devices.
      db.prepare('UPDATE devices SET display_name = ?, last_session_at = ?, last_seen_at = ?, revoked_at = NULL, unenrolled_at = NULL WHERE device_id = ?')
        .run(label, at, at, deviceId);
    } else {
      deviceId = newId(() => input.now);
      db.prepare(
        `INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version,
           registered_at, last_seen_at, kind, installation_id, last_session_at)
         VALUES(?, ?, ?, 'web', '0', '[]', 0, 1, ?, ?, 'browser', ?, ?)`,
      ).run(deviceId, environmentId, label, at, at, input.installationId, at);
    }
    db.prepare('UPDATE sessions SET browser_device_id = ? WHERE session_hash = ?').run(deviceId, input.sessionHash);
    return { status: 'attached', binding: { deviceId, environmentId, displayName: label } };
  });
}

/** The active browser row bound to the session, or null (not attached, removed, or not a browser row). */
export function boundBrowser(db: Db, sessionHash: string, now?: number): BrowserBinding | null {
  const row = db
    .prepare(
      `SELECT d.device_id AS device_id, d.environment_id AS environment_id, d.display_name AS display_name FROM sessions s
       JOIN devices d ON d.device_id = s.browser_device_id
       WHERE s.session_hash = ? AND d.kind = 'browser' AND d.revoked_at IS NULL AND d.unenrolled_at IS NULL`,
    )
    .get(sessionHash) as { device_id: string; environment_id: string; display_name: string } | undefined;
  if (!row) return null;
  if (now !== undefined) touchLastSeen(db, row.device_id, now);
  return { deviceId: row.device_id, environmentId: row.environment_id, displayName: row.display_name };
}
