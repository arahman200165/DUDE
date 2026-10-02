import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub } from './auth-test-helpers.js';
import { listAudit } from '../security/audit.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';

describe('sessions confirmation boundary', () => {
  let h: AuthHub;
  beforeAll(async () => { h = await startAuthHub(); });
  afterAll(async () => { await h.close(); });

  const alive = async (s: { cookie: string }) => (await h.call('GET', '/sessions', { cookie: s.cookie })).status === 200;

  it('lists sessions without hashes and revokes one by public id (404 when unknown)', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const events: Array<{ sessionId: string; reason: string }> = [];
    h.hub.app.hubEvents.on('session-revoked', (e) => events.push({ sessionId: e.sessionId, reason: e.reason }));
    const list = await h.call('GET', '/sessions', { cookie: a.cookie });
    expect(list.status).toBe(200);
    const stored = h.hub.hub.db.prepare('SELECT session_hash FROM sessions').all() as Array<{ session_hash: string }>;
    for (const row of stored) expect(list.raw.body).not.toContain(row.session_hash);
    expect(list.json.filter((x: { current: boolean }) => x.current)).toHaveLength(1);
    const target = list.json.find((x: { sessionId: string; current: boolean }) => !x.current && x.sessionId === b.body.session.sessionId);
    expect(target.sessionId).toMatch(/^[0-9a-f]{16}$/);

    expect((await h.call('DELETE', '/sessions/0000000000000000', { cookie: a.cookie, csrf: a.csrf })).status).toBe(404);
    expect((await h.call('DELETE', '/sessions/zz', { cookie: a.cookie, csrf: a.csrf })).status).toBe(400);
    expect((await h.call('DELETE', `/sessions/${target.sessionId}`, { cookie: a.cookie })).status).toBe(403); // no CSRF
    expect((await h.call('DELETE', `/sessions/${target.sessionId}`, { cookie: a.cookie, csrf: a.csrf })).status).toBe(200);
    expect(events).toEqual([{ sessionId: target.sessionId, reason: 'revoked' }]);
    expect(await alive(b)).toBe(false);
    expect(await alive(a)).toBe(true);
    expect((await h.call('DELETE', `/sessions/${target.sessionId}`, { cookie: a.cookie, csrf: a.csrf })).status).toBe(404);
    expect(listAudit(h.hub.hub.db, { limit: 10 }).some((r) => r.event === 'session.revoked')).toBe(true);
  });

  it('revoke-all: preview alone changes nothing, apply revokes others but not the current session', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const c = await h.signIn();
    const auth = { cookie: a.cookie, csrf: a.csrf };
    const events: string[] = [];
    h.hub.app.hubEvents.on('session-revoked', (e) => events.push(e.reason));

    const preview = await h.call('POST', '/sessions/revoke-all/preview', auth);
    expect(preview.status).toBe(200);
    expect(preview.json.summary.action).toBe('sessions.revoke-all');
    expect(preview.json.summary.affectedSessions).toBeGreaterThanOrEqual(2);
    expect(await alive(b) && await alive(c)).toBe(true);

    const apply = await h.call('POST', '/sessions/revoke-all', { ...auth, body: { confirmToken: preview.json.confirmToken } });
    expect(apply.status).toBe(200);
    expect(await alive(a)).toBe(true);
    expect(await alive(b)).toBe(false);
    expect(await alive(c)).toBe(false);
    expect(events.every((r) => r === 'revoke-all')).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(listAudit(h.hub.hub.db, { limit: 10 }).some((r) => r.event === 'session.revoked-all')).toBe(true);

    // replay
    expect((await h.call('POST', '/sessions/revoke-all', { ...auth, body: { confirmToken: preview.json.confirmToken } })).status).toBe(403);
  });

  it('rejects apply without a preview, with a foreign token and with an expired token', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const other = await h.signIn();
    expect((await h.call('POST', '/sessions/revoke-all', { cookie: a.cookie, csrf: a.csrf, body: { confirmToken: 'q'.repeat(43) } })).status).toBe(403);
    expect((await h.call('POST', '/sessions/revoke-all', { cookie: a.cookie, csrf: a.csrf, body: {} })).status).toBe(400);
    const preview = await h.call('POST', '/sessions/revoke-all/preview', { cookie: a.cookie, csrf: a.csrf });
    // a token is bound to the session that previewed
    expect((await h.call('POST', '/sessions/revoke-all', { cookie: b.cookie, csrf: b.csrf, body: { confirmToken: preview.json.confirmToken } })).status).toBe(403);
    expect(await alive(other)).toBe(true);
    // consumed by the failed attempt: now unusable by its owner too
    expect((await h.call('POST', '/sessions/revoke-all', { cookie: a.cookie, csrf: a.csrf, body: { confirmToken: preview.json.confirmToken } })).status).toBe(403);
    const stale = await h.call('POST', '/sessions/revoke-all/preview', { cookie: a.cookie, csrf: a.csrf });
    h.clock.t += CONFIRMATION_TTL_MS + 1;
    expect((await h.call('POST', '/sessions/revoke-all', { cookie: a.cookie, csrf: a.csrf, body: { confirmToken: stale.json.confirmToken } })).status).toBe(403);
    expect(await alive(other)).toBe(true);
  });

  it('answers 409 and revokes nothing when the set of sessions changed after the preview', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const preview = await h.call('POST', '/sessions/revoke-all/preview', { cookie: a.cookie, csrf: a.csrf });
    const c = await h.signIn(); // a session appears
    const apply = await h.call('POST', '/sessions/revoke-all', { cookie: a.cookie, csrf: a.csrf, body: { confirmToken: preview.json.confirmToken } });
    expect(apply.status).toBe(409);
    expect(apply.json.error.code).toBe('conflict');
    expect(await alive(b) && await alive(c)).toBe(true);
    // a fresh preview then succeeds
    const again = await h.call('POST', '/sessions/revoke-all/preview', { cookie: a.cookie, csrf: a.csrf });
    expect((await h.call('POST', '/sessions/revoke-all', { cookie: a.cookie, csrf: a.csrf, body: { confirmToken: again.json.confirmToken } })).status).toBe(200);
    expect(await alive(b) || await alive(c)).toBe(false);
  });
});
