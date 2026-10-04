import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD, cookieValueOf, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { hashSessionToken, STEP_UP_WINDOW_MS, ROTATION_GRACE_MS } from '../auth/sessions.js';
import { sessionLive } from '../realtime/realtime.js';
import { listAudit } from '../security/audit.js';

describe('owner step-up and session rotation', () => {
  let h: AuthHub;
  beforeAll(async () => { h = await startAuthHub(); });
  afterAll(async () => { await h.close(); });
  beforeEach(() => { h.hub.hub.db.prepare('DELETE FROM throttle').run(); });

  const auth = (s: { cookie: string; csrf: string }) => ({ cookie: s.cookie, csrf: s.csrf });
  const guarded = (s: { cookie: string; csrf: string }) => ({
    pairing: () => h.call('POST', '/pairing-codes', { ...auth(s), body: {} }),
    revokeAllPreview: () => h.call('POST', '/sessions/revoke-all/preview', auth(s)),
    recoveryPreview: () => h.call('POST', '/owner/recovery-codes/preview', auth(s)),
  });
  const stepUp = (s: { cookie: string; csrf: string }, password = PASSWORD) => h.call('POST', '/auth/step-up', { ...auth(s), body: { password } });
  const audits = (event: string) => listAudit(h.hub.hub.db, { limit: 500 }).filter((r) => r.event === event);

  it('refuses guarded routes once the sign-in step-up lapses, and accepts them after a step-up', async () => {
    const s: Signed = await h.signIn();
    for (const call of Object.values(guarded(s))) expect((await call()).status).toBe(200);
    h.clock.t += STEP_UP_WINDOW_MS + 1;
    for (const call of Object.values(guarded(s))) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe('step-up-required');
    }
    const res = await stepUp(s);
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.steppedUpUntil).toBe(new Date(h.clock.t + STEP_UP_WINDOW_MS).toISOString());
    const fresh = { cookie: cookieValueOf(res.setCookie), csrf: res.json.csrfToken as string };
    expect((await guarded(fresh).pairing()).status).toBe(200);
    expect((await guarded(fresh).recoveryPreview()).status).toBe(200);
  });

  it('counts a wrong step-up password toward the throttle', async () => {
    const s = await h.signIn();
    const count = () => (h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM throttle').get() as { n: number }).n;
    expect(count()).toBe(0);
    const res = await stepUp(s, 'not the password');
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('forbidden');
    expect(res.setCookie).toBeUndefined();
    expect(count()).toBeGreaterThan(0);
    expect(audits('auth.failure').length).toBeGreaterThan(0);
  });

  it('rotates the session: old cookie works through the grace, then fails; the new one works with a matching csrf', async () => {
    const s = await h.signIn();
    const res = await stepUp(s);
    const fresh = { cookie: cookieValueOf(res.setCookie), csrf: res.json.csrfToken as string };
    expect(fresh.cookie).not.toBe(s.cookie);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect((await h.call('GET', '/auth/session', { cookie: fresh.cookie })).json.csrfToken).toBe(fresh.csrf);
    h.clock.t += ROTATION_GRACE_MS - 1000;
    expect((await h.call('GET', '/auth/session', { cookie: s.cookie })).status).toBe(200);
    h.clock.t += 2000;
    expect((await h.call('GET', '/auth/session', { cookie: s.cookie })).status).toBe(401);
    expect((await h.call('GET', '/auth/session', { cookie: fresh.cookie })).status).toBe(200);
  });

  it('rotates on password change, returns a new csrf token and revokes the other sessions', async () => {
    const a = await h.signIn();
    const other = await h.signIn();
    const next = 'a brand new long password';
    const res = await h.call('POST', '/owner/password', { ...auth(a), body: { currentPassword: PASSWORD, newPassword: next } });
    expect(res.status).toBe(200);
    const fresh = { cookie: cookieValueOf(res.setCookie), csrf: res.json.csrfToken as string };
    expect(fresh.cookie).not.toBe(a.cookie);
    expect(fresh.csrf).toBeTruthy();
    expect((await h.call('GET', '/auth/session', { cookie: other.cookie })).status).toBe(401);
    expect((await h.call('GET', '/auth/session', { cookie: fresh.cookie })).json.csrfToken).toBe(fresh.csrf);
    expect((await guarded(fresh).revokeAllPreview()).status).toBe(200);
    expect(audits('session.rotated').some((r) => JSON.stringify(r.detail).includes('password-changed'))).toBe(true);
    // restore the password for later cases
    const back = await h.call('POST', '/owner/password', { ...auth(fresh), body: { currentPassword: next, newPassword: PASSWORD } });
    expect(back.status).toBe(200);
  });

  it('lets a bearer session through guarded routes and returns a null csrf token without rotating', async () => {
    const owner = await h.signIn();
    const { token } = await enrolled(h, owner);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: PASSWORD } })).json.accessToken as string;
    expect((await h.call('POST', '/sessions/revoke-all/preview', { bearer })).status).toBe(200);
    expect((await h.call('POST', '/owner/recovery-codes/preview', { bearer })).status).toBe(200);
    const res = await h.call('POST', '/auth/step-up', { bearer, body: { password: PASSWORD } });
    expect(res.status).toBe(200);
    expect(res.json.csrfToken).toBeNull();
    expect(res.setCookie).toBeUndefined();
    expect((await h.call('POST', '/auth/step-up', { bearer, body: { password: 'wrong wrong' } })).status).toBe(403);
    expect((await h.call('POST', '/auth/step-up', { body: { password: PASSWORD } })).status).toBe(401);
  });

  it('keeps a rotated session live for the realtime principal until its successor ends', async () => {
    const s = await h.signIn();
    const db = h.hub.hub.db;
    const oldHash = hashSessionToken(s.cookie);
    expect(sessionLive(db, oldHash, h.clock.t)).toBe(true);
    const res = await stepUp(s);
    const newHash = hashSessionToken(cookieValueOf(res.setCookie));
    expect(sessionLive(db, oldHash, h.clock.t + ROTATION_GRACE_MS * 10)).toBe(true);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_hash = ?').run(new Date(h.clock.t).toISOString(), newHash);
    expect(sessionLive(db, oldHash, h.clock.t)).toBe(false);
  });

  it('audits step-up and rotation without credential values', async () => {
    const s = await h.signIn();
    const res = await stepUp(s);
    const newCookie = cookieValueOf(res.setCookie);
    expect(audits('owner.step-up').length).toBeGreaterThan(0);
    expect(audits('session.rotated').length).toBeGreaterThan(0);
    const dump = JSON.stringify([...audits('owner.step-up'), ...audits('session.rotated')]);
    for (const secret of [PASSWORD, s.cookie, newCookie, s.csrf, res.json.csrfToken as string]) expect(dump).not.toContain(secret);
  });
});
