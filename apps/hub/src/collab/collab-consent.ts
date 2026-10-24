import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { categoryOf } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';
import type { CollabDocKind } from '@dude/collab-doc';
import { getWebAccess } from '../db/web-access.js';
import type { WsPrincipal } from '../realtime/ws-auth.js';

/**
 * Consent for collaboration (PD-103): collaborating on a document needs the same consent as syncing it.
 *
 * - A DEVICE: the category is on in the map the device itself reported (`device_sync_state.reported_json`), and the device has
 *   completed its first sync. The Hub cannot see the Agent's `firstSyncState`, but the Agent runs a sync cycle (which stamps
 *   `lastSyncAt` into every later state report) only after its first sync is done, so a report with a `lastSyncAt` is the
 *   Hub's evidence of a completed first sync; a device that never reported state, or reported `lastSyncAt: null`, has no consent.
 * - A Hub web OWNER-COOKIE session: the environment's web-access toggle for the category (`web_access`).
 * - An OWNER-BEARER session (the Agent's owner session): the consent of the device it is bound to; an unbound bearer has none.
 *
 * Rooms (ephemeral, never stored) need no category.
 */
export function collabCategory(kind: CollabDocKind): SyncCategory | null {
  return kind === 'room' ? null : (categoryOf(kind) ?? null);
}

/** True when `deviceId` is an active desktop whose last state report enabled `category` and shows a completed first sync. */
export function deviceConsents(db: Db, deviceId: string | null, category: SyncCategory): boolean {
  if (deviceId === null) return false;
  const row = getRow<{ reported_json: string | null }>(
    db.prepare(
      `SELECT s.reported_json AS reported_json FROM device_sync_state s JOIN devices d ON d.device_id = s.device_id
       WHERE s.device_id = ? AND d.kind = 'desktop' AND d.revoked_at IS NULL AND d.unenrolled_at IS NULL`,
    ),
    deviceId,
  );
  if (!row || row.reported_json === null) return false;
  let reported: unknown;
  try { reported = JSON.parse(row.reported_json); } catch { return false; }
  if (typeof reported !== 'object' || reported === null) return false;
  const { categories, lastSyncAt } = reported as { categories?: Record<string, unknown>; lastSyncAt?: unknown };
  return typeof lastSyncAt === 'string' && lastSyncAt.length > 0 && categories?.[category] === true;
}

/** The environment-level Hub web toggle for `category`. */
export function webAccessConsents(db: Db, category: SyncCategory): boolean {
  const environmentId = getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
  return environmentId !== undefined && getWebAccess(db, environmentId)[category];
}

/** Whether the authenticated principal has consented to collaborating on a document of `category`. */
export function principalConsents(db: Db, principal: Pick<WsPrincipal, 'kind' | 'deviceId' | 'boundDeviceId'>, category: SyncCategory): boolean {
  if (principal.kind === 'owner-cookie') return webAccessConsents(db, category);
  return deviceConsents(db, principal.deviceId ?? principal.boundDeviceId, category);
}
