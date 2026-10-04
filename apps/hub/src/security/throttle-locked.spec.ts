import { afterEach, describe, expect, it } from 'vitest';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { listAudit } from './audit.js';
import { THROTTLE_FREE_FAILURES, recordFailure, recordFailureKeys, throttleKeys } from './throttle.js';

const opened: HubDb[] = [];
function open(): HubDb {
  const paths = ensureLayout(tempDir('hub-locked-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return result.hub;
}
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* closed */ } } });

const locked = (hub: HubDb) => listAudit(hub.db, { limit: 200 }).filter((r) => r.event === 'throttle.locked');

describe('throttle.locked audit', () => {
  it('is written once per lockout start, per key, without credential content', () => {
    const hub = open();
    const keys = throttleKeys.password('203.0.113.9');
    let now = 1_000_000;
    for (let i = 0; i < THROTTLE_FREE_FAILURES; i++) recordFailureKeys(hub.db, keys, now++);
    expect(locked(hub)).toHaveLength(0);

    recordFailureKeys(hub.db, keys, now++); // 6th: both keys newly locked
    const rows = locked(hub);
    expect(rows).toHaveLength(2);
    const byScope = Object.fromEntries(rows.map((r) => [(r.detail as { scope: string }).scope, r]));
    expect(byScope.address!.detail).toEqual({ kind: 'password', scope: 'address' });
    expect(byScope.address!.ip).toBe('203.0.113.9');
    expect(byScope.address!.actorKind).toBe('anonymous');
    expect(byScope.address!.outcome).toBe('denied');
    expect(byScope.global!.detail).toEqual({ kind: 'password', scope: 'global' });
    expect(byScope.global!.ip).toBeNull();
    expect(byScope.global!.actorKind).toBe('system');

    recordFailureKeys(hub.db, keys, now++); // still locked: nothing new
    expect(locked(hub)).toHaveLength(2);

    now += 20 * 60_000; // window and lockout elapse, then a fresh run of failures
    for (let i = 0; i <= THROTTLE_FREE_FAILURES; i++) recordFailureKeys(hub.db, keys, now++);
    expect(locked(hub)).toHaveLength(4);
  });

  it('ignores keys that do not name a throttle kind', () => {
    const hub = open();
    for (let i = 0; i < 8; i++) recordFailure(hub.db, 'k', 1000 + i);
    expect(locked(hub)).toHaveLength(0);
  });
});
