import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { SignInResponse } from '@dude/contracts/hub';
import { CHEAP, PASSWORD, START, cookieValueOf, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub } from './auth-test-helpers.js';
import { createSession } from '../auth/sessions.js';
import { listAudit } from '../security/audit.js';
import { verifyPassword } from '../auth/password.js';
import { getStoredPassword } from '../auth/owner.js';

const HOUR = 3600_000;

describe('owner authentication routes', () => {
  let h: AuthHub;
  beforeAll(async () => { h = await startAuthHub(); });
  afterAll(async () => { await h.close(); });

  it('signs in with a fully attributed __Host- cookie and returns a valid SignInResponse', async () => {
    const s = await h.signIn();
    expect(Value.Check(SignInResponse, s.body)).toBe(true);
    expect(s.setCookie).toMatch(/^__Host-dude_session=[A-Za-z0-9_-]{43}; /);
    for (const attr of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', `Max-Age=${7 * 24 * 3600}`]) expect(s.setCookie).toContain(attr);
    expect(s.setCookie).not.toContain('Domain');
    expect(s.res.raw.headers['cache-control']).toBe('no-store');
    expect(s.body.owner).toMatchObject({ displayName: 'Ada', remainingRecoveryCodes: 10 });
    expect(s.body.session).toMatchObject({ kind: 'cookie', current: true, deviceId: null });
    const row = h.hub.hub.db.prepare('SELECT session_hash, csrf_hash, kind FROM sessions').all() as Array<{ session_hash: string; csrf_hash: string }>;
    expect(JSON.stringify(row)).not.toContain(s.cookie);
    expect(JSON.stringify(row)).not.toContain(s.csrf);
  });

  it('GET /auth/session returns the same csrf token and enforces it on mutations', async () => {
    const s = await h.signIn();
    const cur = await h.call('GET', '/auth/session', { cookie: s.cookie });
    expect(cur.status).toBe(200);
    expect(cur.json.csrfToken).toBe(s.csrf);
    expect(cur.json.session.current).toBe(true);

    const path = '/owner/recovery-codes/preview';
    expect((await h.call('POST', path, { cookie: s.cookie })).status).toBe(403);
    expect((await h.call('POST', path, { cookie: s.cookie, csrf: 'nope' })).status).toBe(403);
    const other = await h.signIn();
    expect((await h.call('POST', path, { cookie: s.cookie, csrf: other.csrf })).status).toBe(403); // another session's token
    expect((await h.call('POST', path, { cookie: s.cookie, csrf: s.csrf })).status).toBe(200);
    expect((await h.call('POST', path, { csrf: s.csrf })).status).toBe(401);
  });

  it('signs in even with a stale session cookie (no CSRF demanded on credential routes)', async () => {
    const res = await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD }, cookie: 'stale-cookie-value' });
    expect(res.status).toBe(200);
  });

  it('never accepts a session token from the query string', async () => {
    const s = await h.signIn();
    expect((await h.call('GET', `/sessions?session=${s.cookie}`)).status).toBe(401);
    expect((await h.call('GET', `/sessions?access_token=${s.cookie}`)).status).toBe(401);
  });

  it('expires idle sessions after 12 hours and slides activity', async () => {
    const s = await h.signIn();
    h.clock.t += 11 * HOUR;
    expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(200); // slides to +12 h from now
    h.clock.t += 11 * HOUR;
    expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(200); // 22 h after sign-in, still alive
    h.clock.t += 12 * HOUR + 1;
    expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(401);
  });

  it('expires sessions at the absolute 7 day limit even while active', async () => {
    const s = await h.signIn();
    const start = h.clock.t;
    for (let i = 0; i < 15; i++) {
      h.clock.t += 11 * HOUR;
      expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(200);
    }
    expect(h.clock.t - start).toBe(165 * HOUR);
    h.clock.t = start + 7 * 24 * HOUR + 1;
    expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(401);
  });

  it('writes the sliding refresh at most once per minute', async () => {
    const s = await h.signIn();
    const read = () => h.hub.hub.db.prepare('SELECT last_active_at FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as { last_active_at: string };
    const first = read().last_active_at;
    h.clock.t += 30_000;
    await h.call('GET', '/sessions', { cookie: s.cookie });
    expect(read().last_active_at).toBe(first);
    h.clock.t += 31_000;
    await h.call('GET', '/sessions', { cookie: s.cookie });
    expect(read().last_active_at).toBe(new Date(h.clock.t).toISOString());
  });

  it('signs out: revokes the session, clears the cookie, audits', async () => {
    const s = await h.signIn();
    const out = await h.call('POST', '/auth/sign-out', { cookie: s.cookie, csrf: s.csrf });
    expect(out.status).toBe(200);
    expect(out.setCookie).toMatch(/^__Host-dude_session=; .*Max-Age=0/);
    expect((await h.call('GET', '/auth/session', { cookie: s.cookie })).status).toBe(401);
    expect(listAudit(h.hub.hub.db, { limit: 5 }).some((r) => r.event === 'owner.sign-out')).toBe(true);
  });

  it('authenticates a bearer dob_ session without Origin or CSRF', async () => {
    const created = createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'bearer', deviceId: 'device-1', now: h.clock.t });
    expect(created.token).toMatch(/^dob_[A-Za-z0-9_-]{43}$/);
    expect(created.csrfToken).toBeNull();
    const list = await h.call('GET', '/sessions', { bearer: created.token });
    expect(list.status).toBe(200);
    expect(list.json.find((x: { current: boolean }) => x.current)).toMatchObject({ kind: 'bearer', deviceId: 'device-1' });
    expect((await h.call('POST', '/sessions/revoke-all/preview', { bearer: created.token })).status).toBe(200);
    // the cookie-only endpoint refuses a bearer
    expect((await h.call('GET', '/auth/session', { bearer: created.token })).status).toBe(401);
    // bearer and cookie together are ambiguous
    const s = await h.signIn();
    expect((await h.call('GET', '/sessions', { bearer: created.token, cookie: s.cookie })).status).toBe(400);
    expect(() => createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'bearer', now: h.clock.t })).toThrow();
  });

  it('rejects unknown bearer prefixes and a dob_ token that is not a session', async () => {
    expect((await h.call('GET', '/sessions', { bearer: 'ddt_abcdefghijklmnopqrstuvwxyz' })).status).toBe(403);
    expect((await h.call('GET', '/sessions', { bearer: 'xyz' })).status).toBe(401);
    expect((await h.call('GET', '/sessions', { bearer: `dob_${'A'.repeat(43)}` })).status).toBe(401);
    const cookieSession = await h.signIn();
    expect((await h.call('GET', '/sessions', { bearer: cookieSession.cookie })).status).toBe(401); // a cookie token as bearer
  });

  it('applies bearer idle (30 min) and absolute (12 h) expiry', async () => {
    const created = createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'bearer', deviceId: 'd', now: h.clock.t });
    h.clock.t += 29 * 60_000;
    expect((await h.call('GET', '/sessions', { bearer: created.token })).status).toBe(200);
    h.clock.t += 31 * 60_000;
    expect((await h.call('GET', '/sessions', { bearer: created.token })).status).toBe(401);
    const second = createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'bearer', deviceId: 'd', now: h.clock.t });
    for (let i = 0; i < 24; i++) {
      h.clock.t += 29 * 60_000;
      expect((await h.call('GET', '/sessions', { bearer: second.token })).status).toBe(200);
    }
    h.clock.t += 29 * 60_000; // 12 h 6 min after creation
    expect((await h.call('GET', '/sessions', { bearer: second.token })).status).toBe(401);
  });

  it('truncates the stored user agent to 256 characters', async () => {
    const res = await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD }, headers: { 'user-agent': 'x'.repeat(400) } });
    expect(res.json.session.userAgent).toHaveLength(256);
  });

  it('changes the password, revokes other sessions and invalidates the old password', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const revoked: string[] = [];
    h.hub.app.hubEvents.on('session-revoked', (e) => revoked.push(e.reason));
    const bad = await h.call('POST', '/owner/password', { cookie: a.cookie, csrf: a.csrf, body: { currentPassword: 'not the password', newPassword: 'a brand new password' } });
    expect(bad.status).toBe(403);
    const weak = await h.call('POST', '/owner/password', { cookie: a.cookie, csrf: a.csrf, body: { currentPassword: PASSWORD, newPassword: ' '.repeat(14) } });
    expect(weak.status).toBe(400);
    const ok = await h.call('POST', '/owner/password', { cookie: a.cookie, csrf: a.csrf, body: { currentPassword: PASSWORD, newPassword: 'a brand new password' } });
    expect(ok.status).toBe(200);
    expect((await h.call('GET', '/sessions', { cookie: a.cookie })).status).toBe(200);
    expect((await h.call('GET', '/sessions', { cookie: b.cookie })).status).toBe(401);
    expect(revoked).toContain('password-changed');
    expect((await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD } })).status).toBe(401);
    expect((await h.call('POST', '/auth/sign-in', { body: { password: 'a brand new password' } })).status).toBe(200);
    const stored = getStoredPassword(h.hub.hub.db, h.ownerId)!;
    expect(await verifyPassword('a brand new password', stored)).toBe(true);
    expect(h.hub.hub.db.prepare('SELECT password_changed_at FROM owner').get()).toEqual({ password_changed_at: new Date(h.clock.t).toISOString() });
    // restore for later specs
    const restore = await h.call('POST', '/owner/password', { cookie: a.cookie, csrf: a.csrf, body: { currentPassword: 'a brand new password', newPassword: PASSWORD } });
    expect(restore.status).toBe(200);
  });

  it('regenerates recovery codes only through the two-step flow and invalidates the old codes', async () => {
    const s = await h.signIn();
    const auth = { cookie: s.cookie, csrf: s.csrf };
    const before = h.recoveryCodes;
    // apply without preview
    expect((await h.call('POST', '/owner/recovery-codes', { ...auth, body: { confirmToken: 'x'.repeat(43) } })).status).toBe(403);
    const preview = await h.call('POST', '/owner/recovery-codes/preview', auth);
    expect(preview.status).toBe(200);
    expect(preview.json.summary).toMatchObject({ action: 'owner.recovery-codes', remainingRecoveryCodes: 10 });
    // preview alone changes nothing
    expect(h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL').get()).toEqual({ n: 10 });
    const applied = await h.call('POST', '/owner/recovery-codes', { ...auth, body: { confirmToken: preview.json.confirmToken } });
    expect(applied.status).toBe(200);
    expect(applied.json.recoveryCodes).toHaveLength(10);
    expect(applied.json.recoveryCodes).not.toContain(before[0]);
    h.recoveryCodes = applied.json.recoveryCodes;
    // replay rejected
    expect((await h.call('POST', '/owner/recovery-codes', { ...auth, body: { confirmToken: preview.json.confirmToken } })).status).toBe(403);
    // old code no longer works
    expect((await h.call('POST', '/auth/recover', { body: { recoveryCode: before[0], newPassword: 'whatever password 1' } })).status).toBe(401);
    expect(listAudit(h.hub.hub.db, { limit: 20 }).some((r) => r.event === 'owner.recovery-codes-regenerated')).toBe(true);
  });

  it('recovers with a single-use code, revokes every session and creates a fresh one', async () => {
    const old = await h.signIn();
    const code = h.recoveryCodes[0]!;
    const lower = code.toLowerCase().replace('-', ' ');
    const weak = await h.call('POST', '/auth/recover', { body: { recoveryCode: code, newPassword: ' '.repeat(14) } });
    expect(weak.status).toBe(400); // policy failure does not burn the code
    const res = await h.call('POST', '/auth/recover', { body: { recoveryCode: lower, newPassword: 'recovered password 1' } });
    expect(res.status).toBe(200);
    expect(res.json.owner.remainingRecoveryCodes).toBe(9);
    expect(Value.Check(SignInResponse, res.json)).toBe(true);
    const fresh = cookieValueOf(res.setCookie);
    expect((await h.call('GET', '/sessions', { cookie: old.cookie })).status).toBe(401);
    expect((await h.call('GET', '/sessions', { cookie: fresh })).status).toBe(200);
    // single-use
    expect((await h.call('POST', '/auth/recover', { body: { recoveryCode: code, newPassword: 'another password 1' } })).status).toBe(401);
    expect((await h.call('POST', '/auth/sign-in', { body: { password: 'recovered password 1' } })).status).toBe(200);
    const events = listAudit(h.hub.hub.db, { limit: 20 }).map((r) => r.event);
    expect(events).toContain('owner.recovery-code-used');
    expect(JSON.stringify(h.hub.hub.db.prepare('SELECT * FROM audit_events').all())).not.toContain(code);
    h.hub.hub.db.prepare('DELETE FROM throttle').run();
  });
});

describe('sign-in throttling', () => {
  let h: AuthHub;
  beforeAll(async () => { h = await startAuthHub(); });
  afterAll(async () => { await h.close(); });

  it('401s the first six wrong passwords, then locks with 423, and audits without the password', async () => {
    const wrong = 'definitely the wrong password';
    for (let i = 0; i < 6; i++) expect((await h.call('POST', '/auth/sign-in', { body: { password: wrong } })).status).toBe(401);
    const locked = await h.call('POST', '/auth/sign-in', { body: { password: wrong } });
    expect(locked.status).toBe(423);
    expect(locked.raw.headers['retry-after']).toBeDefined();
    // even the right password is refused while locked
    expect((await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD } })).status).toBe(423);
    const failures = listAudit(h.hub.hub.db, { limit: 50 }).filter((r) => r.event === 'auth.failure');
    expect(failures).toHaveLength(6);
    expect(failures[0]).toMatchObject({ outcome: 'failure', detail: { kind: 'password' } });
    expect(JSON.stringify(h.hub.hub.db.prepare('SELECT * FROM audit_events').all())).not.toContain(wrong);
    // the lockout elapses with the (injected) clock
    h.clock.t += 20_000;
    expect((await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD } })).status).toBe(200);
    expect(CHEAP.m).toBe(64);
    expect(h.clock.t).toBeGreaterThan(START);
  });

  it('answers 409 before bootstrap', async () => {
    const { startTestHub, request } = await import('./test-helpers.js');
    const fresh = await startTestHub({}, { passwordParams: CHEAP });
    try {
      const res = await request(fresh.port, fresh.tls.certPem, '/api/v1/auth/sign-in', {
        method: 'POST', body: JSON.stringify({ password: PASSWORD }),
        headers: { 'content-type': 'application/json', origin: `https://localhost:${fresh.port}`, host: `localhost:${fresh.port}` },
      });
      expect(res.status).toBe(409);
    } finally {
      await fresh.close();
    }
  });
});
