import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { listAudit } from '../security/audit.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';

describe('sync environment clear confirmation boundary', () => {
  let h: AuthHub;
  let owner: Signed;
  let token: string;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
    token = (await enrolled(h, owner)).token;
  });
  afterAll(async () => { await h.close(); });
  beforeEach(async () => {
    h.hub.hub.db.prepare('DELETE FROM throttle').run();
    await h.call('POST', '/sync/push', { bearer: token, body: { ops: [{
      opId: `o-${Math.random()}`, entityType: 'favorite', entityId: 'tool:a', opKind: 'upsert', schemaVersion: 1, basedOnRevision: null,
      payload: { id: 'tool:a', kind: 'tool', targetId: 'a', order: 0 },
    }] } });
  });

  const auth = () => ({ cookie: owner.cookie, csrf: owner.csrf });
  const preview = () => h.call('POST', '/sync/environment/clear/preview', auth());
  const apply = (confirmationId: string, who: { cookie: string; csrf: string } = auth()) =>
    h.call('POST', '/sync/environment/clear', { ...who, body: { confirmationId } });
  const live = (): number => (h.hub.hub.db.prepare('SELECT COUNT(*) AS c FROM records WHERE deleted = 0').get() as { c: number }).c;

  it('preview alone deletes nothing; apply needs a valid single-use confirmation bound to the session', async () => {
    const p = await preview();
    expect(p.status).toBe(200);
    expect(live()).toBeGreaterThan(0);
    expect((await h.call('POST', '/sync/environment/clear', { ...auth(), body: {} })).status).toBe(400);
    expect((await apply('q'.repeat(43))).status).toBe(403);
    const other = await h.signIn();
    expect((await apply(p.json.confirmationId, { cookie: other.cookie, csrf: other.csrf })).status).toBe(403);
    expect(live()).toBeGreaterThan(0);
    expect((await h.call('POST', '/sync/environment/clear', { cookie: owner.cookie, body: { confirmationId: p.json.confirmationId } })).status).toBeGreaterThanOrEqual(400);
    expect(live()).toBeGreaterThan(0);
    expect(listAudit(h.hub.hub.db, { limit: 20 }).some((r) => r.event === 'sync.environment-cleared')).toBe(false);
  });

  it('refuses an expired confirmation and a replay, and applies a fresh one', async () => {
    const stale = await preview();
    h.clock.t += CONFIRMATION_TTL_MS + 1;
    owner = await h.signIn();
    expect((await apply(stale.json.confirmationId)).status).toBe(403);
    expect(live()).toBeGreaterThan(0);
    const p = await preview();
    expect((await apply(p.json.confirmationId)).status).toBe(200);
    expect(live()).toBe(0);
    expect((await apply(p.json.confirmationId)).status).toBe(403);
  });
});
