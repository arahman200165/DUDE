import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { deactivateDevice } from '../devices/registry.js';
import { grantStandby, listStandbyGrants, revokeStandby, standbyGrantOf, standbyIneligibility } from './grants.js';

const T0 = Date.parse('2026-10-27T10:00:00.000Z');
const opened: HubDb[] = [];
afterEach(() => { for (const hub of opened.splice(0)) hub.close(); });

function fixture(): HubDb {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-standby-grants-'));
  const result = openHubDb({ dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') });
  if (result.status !== 'ready') throw new Error('expected ready');
  opened.push(result.hub);
  result.hub.db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'Home', 't');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('pc', 'env', 'Desk PC', 'windows', '1', '[]', 0, 1, '2026-10-01T00:00:00.000Z');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('laptop', 'env', 'Laptop', 'windows', '1', '[]', 0, 1, '2026-10-01T00:00:00.000Z');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, kind)
  VALUES ('browser', 'env', 'Browser', 'web', '1', '[]', 0, 1, '2026-10-01T00:00:00.000Z', 'browser');
`);
  return result.hub;
}

describe('the warm-standby grant', () => {
  it('is granted to an active desktop only, listed with its display name, and removed by a revoke', () => {
    const { db } = fixture();
    expect(standbyGrantOf(db, 'pc')).toBeNull();
    expect(grantStandby(db, 'pc', T0)).toBe(true);
    expect(standbyGrantOf(db, 'pc')).toEqual({ grantedAt: '2026-10-27T10:00:00.000Z' });
    expect(standbyGrantOf(db, 'laptop')).toBeNull();
    expect(listStandbyGrants(db)).toEqual([{ deviceId: 'pc', displayName: 'Desk PC', grantedAt: '2026-10-27T10:00:00.000Z', active: true }]);
    // Granting again renews the time (one row per device).
    expect(grantStandby(db, 'pc', T0 + 1000)).toBe(true);
    expect(listStandbyGrants(db)).toHaveLength(1);
    expect(standbyGrantOf(db, 'pc')).toEqual({ grantedAt: '2026-10-27T10:00:01.000Z' });
    expect(revokeStandby(db, 'pc')).toBe(true);
    expect(revokeStandby(db, 'pc')).toBe(false);
    expect(standbyGrantOf(db, 'pc')).toBeNull();
    expect(listStandbyGrants(db)).toEqual([]);
  });

  it('refuses a browser row, an unknown, revoked or unenrolled device and one awaiting re-pair', () => {
    const { db } = fixture();
    expect(standbyIneligibility(db, 'nobody')).toBe('not-found');
    expect(standbyIneligibility(db, 'browser')).toBe('not-desktop');
    expect(grantStandby(db, 'browser', T0)).toBe(false);
    db.exec("UPDATE devices SET needs_re_pair = 1 WHERE device_id = 'laptop'");
    expect(standbyIneligibility(db, 'laptop')).toBe('needs-re-pair');
    expect(grantStandby(db, 'laptop', T0)).toBe(false);
    deactivateDevice(db, 'pc', 'unenrolled', T0);
    expect(standbyIneligibility(db, 'pc')).toBe('inactive');
    expect(grantStandby(db, 'pc', T0)).toBe(false);
    expect(listStandbyGrants(db)).toEqual([]);
  });

  it('stops being effective when the device is revoked, awaits re-pair, or is re-enrolled with a new registration', () => {
    const { db } = fixture();
    grantStandby(db, 'pc', T0);
    grantStandby(db, 'laptop', T0);
    deactivateDevice(db, 'pc', 'revoked', T0);
    expect(standbyGrantOf(db, 'pc')).toBeNull();
    // A re-enrolment updates `registered_at` and clears the revocation: the old grant does not carry over to the new key.
    db.exec("UPDATE devices SET revoked_at = NULL, registered_at = '2026-10-28T00:00:00.000Z' WHERE device_id = 'pc'");
    expect(standbyGrantOf(db, 'pc')).toBeNull();
    expect(listStandbyGrants(db).find((g) => g.deviceId === 'pc')).toMatchObject({ active: false });
    db.exec("UPDATE devices SET needs_re_pair = 1 WHERE device_id = 'laptop'");
    expect(standbyGrantOf(db, 'laptop')).toBeNull();
    // Granting again binds the new registration.
    expect(grantStandby(db, 'pc', T0 + 5000)).toBe(true);
    expect(standbyGrantOf(db, 'pc')).toEqual({ grantedAt: '2026-10-27T10:00:05.000Z' });
  });
});
