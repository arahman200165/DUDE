import { afterEach, describe, expect, it } from 'vitest';
import { OIDC_FLOW_TTL_MS, OIDC_LINK_TTL_MS } from '../auth/oidc/constants.js';
import { STEP_UP_WINDOW_MS } from '../auth/sessions.js';
import { listAudit } from '../security/audit.js';
import { PASSWORD, cookieValueOf } from './auth-test-helpers.js';
import { CROSS_SITE_NAVIGATION, OWNER_ACCOUNT, SECOND_ACCOUNT, STRANGER_ACCOUNT, startOidcHub } from './oidc-test-helpers.js';
import type { OidcHub } from './oidc-test-helpers.js';

/**
 * Google sign-in through the real Hub test server and the in-process fake provider (Milestone 842, PD-121, PD-145). The link flow and
 * the unlink confirmation boundary have their own spec (`oidc.confirmation-boundary.spec.ts`).
 */
describe('Google sign-in routes', () => {
  const open: OidcHub[] = [];
  const start = async (options: Parameters<typeof startOidcHub>[0] = {}): Promise<OidcHub> => {
    const h = await startOidcHub(options);
    open.push(h);
    return h;
  };
  afterEach(async () => { for (const h of open.splice(0)) await h.close(); });

  const db = (h: OidcHub) => h.hub.hub.db;
  const audits = (h: OidcHub, event: string) => listAudit(db(h), { limit: 500 }).filter((r) => r.event === event);
  const location = (res: { raw: { headers: Record<string, string | string[] | undefined> } }): string => String(res.raw.headers['location']);
  /** A Hub with one linked Google account, the password session that linked it, and no other session. */
  const linkedHub = async (options: Parameters<typeof startOidcHub>[0] = {}) => {
    const h = await start(options);
    const s = await h.signIn();
    const linked = await h.linkAccount(s, OWNER_ACCOUNT);
    expect(linked.status).toBe(200);
    return { h, s, account: linked.json.account as { id: string } };
  };

  describe('status', () => {
    it('says only whether Google can be offered, from configuration and the secret, never from a probe of Google', async () => {
      const h = await start();
      const res = await h.call('GET', '/auth/oidc/status');
      expect(res.json).toEqual({ configured: true, enabled: true });
      expect(h.idp.calls).toHaveLength(0);
      expect(res.raw.headers['cache-control']).toBe('no-store');

      h.secret.value = null;
      expect((await h.call('GET', '/auth/oidc/status')).json).toEqual({ configured: true, enabled: false });
    });

    it('a Hub without an oidc block is not configured', async () => {
      const h = await start({ unconfigured: true });
      expect((await h.call('GET', '/auth/oidc/status')).json).toEqual({ configured: false, enabled: false });
    });
  });

  describe('route credentials', () => {
    it('each route demands exactly its declared credential', async () => {
      const h = await start();
      const s = await h.signIn();
      const none = { noOrigin: false } as const;
      // none
      expect((await h.call('GET', '/auth/oidc/status', none)).status).toBe(200);
      expect((await h.call('POST', '/auth/oidc/start', { body: {} })).status).toBe(200);
      // owner required: no credential is 401 whatever the body
      for (const [method, path, body] of [
        ['POST', '/auth/oidc/link/start', {}], ['POST', '/auth/oidc/link/complete', { linkToken: 'a'.repeat(43) }], ['GET', '/auth/oidc/accounts', undefined],
        ['POST', '/auth/oidc/unlink/preview', { accountId: 'x' }], ['POST', '/auth/oidc/unlink', { accountId: 'x', confirmToken: 'y' }],
      ] as const) {
        const res = await h.call(method, path, { ...(body === undefined ? {} : { body }) });
        expect([method, path, res.status]).toEqual([method, path, 401]);
      }
      // a bearer-shaped credential that is not a session is refused on the cookie-only link routes
      expect((await h.call('POST', '/auth/oidc/link/start', { bearer: 'dob_nope', body: {} })).status).toBe(401);
      // cookie without CSRF is refused on every POST
      for (const [path, body] of [['/auth/oidc/link/start', {}], ['/auth/oidc/link/complete', { linkToken: 'a'.repeat(43) }], ['/auth/oidc/unlink/preview', { accountId: 'x' }]] as const) {
        expect((await h.call('POST', path, { cookie: s.cookie, body })).status).toBe(403);
      }
      // the owner reads accounts with the cookie alone
      expect((await h.call('GET', '/auth/oidc/accounts', { cookie: s.cookie })).json).toEqual({ accounts: [] });
    });

    it('the callback is session-less: a valid owner cookie on it changes nothing and is never read', async () => {
      const { h, s } = await linkedHub();
      const started = await h.call('POST', '/auth/oidc/start', { body: {} });
      const { callbackUrl } = h.idp.authorize(started.json.authorizationUrl, { account: STRANGER_ACCOUNT });
      const url = new URL(callbackUrl);
      const res = await h.call('GET', `/auth/oidc/callback${url.search}`, { cookie: s.cookie, headers: { ...CROSS_SITE_NAVIGATION } });
      expect(res.status).toBe(302);
      expect(location(res)).toBe('/hub/sign-in?oidc=failed');
    });

    it('a provider failure is an ordinary answer, never a 5xx other than the explained 503', async () => {
      const h = await start();
      h.idp.setDown('all', true);
      const res = await h.call('POST', '/auth/oidc/start', { body: {} });
      expect(res.status).toBe(503);
      expect(res.json.error.code).toBe('oidc-unavailable');
    });
  });

  describe('sign in', () => {
    it('a linked account gets the same kind of session as a password sign-in, except that it starts NOT stepped up', async () => {
      const { h, s } = await linkedHub();
      h.clock.t += STEP_UP_WINDOW_MS + 1000;
      const { start: started, callback } = await h.signInWithGoogle(OWNER_ACCOUNT, { returnTo: '/tools/base64' });
      expect(started.status).toBe(200);
      expect(started.json.authorizationUrl).toContain('accounts.google.com');
      expect(callback.status).toBe(302);
      expect(location(callback)).toBe('/tools/base64');
      expect(callback.raw.headers['cache-control']).toBe('no-store');

      const cookie = cookieValueOf(callback.setCookie);
      expect(cookie).not.toBe('');
      // Same cookie attributes and lifetime as the password path.
      const password = await h.signIn();
      expect(callback.setCookie!.replace(cookie, 'X')).toBe(password.setCookie.replace(password.cookie, 'X'));

      const session = await h.call('GET', '/auth/session', { cookie });
      expect(session.status).toBe(200);
      // Google is not a step-up factor: the session cannot link, unlink or do anything else that needs step-up until the password is entered.
      const csrf = session.json.csrfToken as string;
      const gated = await h.call('POST', '/auth/oidc/link/start', { cookie, csrf, body: {} });
      expect(gated.status).toBe(403);
      expect(gated.json.error.code).toBe('step-up-required');
      expect((await h.call('POST', '/pairing-codes', { cookie, csrf, body: {} })).status).toBe(403);
      const stepped = await h.call('POST', '/auth/step-up', { cookie, csrf, body: { password: PASSWORD } });
      expect(stepped.status).toBe(200);
      expect(s.cookie).not.toBe(cookie);

      const signIn = audits(h, 'owner.sign-in').find((r) => (r.detail as { via?: string } | null)?.via === 'google');
      expect(signIn?.actorKind).toBe('owner');
      expect(audits(h, 'oidc.signin')).toHaveLength(1);
      const accounts = await h.call('GET', '/auth/oidc/accounts', { cookie });
      expect(accounts.json.accounts[0].lastUsedAt).not.toBeNull();
    });

    it('rotating the Google display address updates the label, never the identity', async () => {
      const { h } = await linkedHub();
      await h.signInWithGoogle({ sub: OWNER_ACCOUNT.sub, email: 'renamed@example.com' });
      const s = await h.signIn();
      expect((await h.call('GET', '/auth/oidc/accounts', { cookie: s.cookie })).json.accounts.map((a: { email: string }) => a.email)).toEqual(['renamed@example.com']);
    });

    it('refuses an account that is not linked, whatever its address, with the generic redirect and no session', async () => {
      const { h } = await linkedHub();
      const stranger = await h.signInWithGoogle(STRANGER_ACCOUNT);
      expect(stranger.callback.status).toBe(302);
      expect(location(stranger.callback)).toBe('/hub/sign-in?oidc=failed');
      expect(stranger.callback.setCookie).toBeUndefined();

      // The SAME address under another subject is a stranger: identity is the sub, never the address.
      const sameAddress = await h.signInWithGoogle({ sub: 'someone-elses-sub', email: OWNER_ACCOUNT.email });
      expect(location(sameAddress.callback)).toBe('/hub/sign-in?oidc=failed');
      expect(sameAddress.callback.setCookie).toBeUndefined();

      const refused = audits(h, 'oidc.refused-account');
      expect(refused).toHaveLength(2);
      const text = JSON.stringify(listAudit(db(h), { limit: 500 }));
      for (const needle of [STRANGER_ACCOUNT.sub, STRANGER_ACCOUNT.email!, OWNER_ACCOUNT.email!, 'someone-elses-sub']) expect(text).not.toContain(needle);
      expect((refused[0]!.detail as { subjectTag: string }).subjectTag).toMatch(/^[0-9a-f]{12}$/);
    });

    it('a Hub with no linked account refuses every Google account the same way (nothing reveals whether any exists)', async () => {
      const h = await start();
      const res = await h.signInWithGoogle(OWNER_ACCOUNT);
      expect(location(res.callback)).toBe('/hub/sign-in?oidc=failed');
      const linked = await linkedHub();
      const other = await linked.h.signInWithGoogle(STRANGER_ACCOUNT);
      expect(location(other.callback)).toBe(location(res.callback));
      expect(other.callback.status).toBe(res.callback.status);
    });

    it('refuses a replayed callback, an unknown or malformed state, an expired flow and every bad token', async () => {
      const { h } = await linkedHub();
      expect((await h.signInWithGoogle(OWNER_ACCOUNT)).callback.setCookie).toBeDefined();
      const authorizationUrl = (await h.call('POST', '/auth/oidc/start', { body: {} })).json.authorizationUrl as string;
      const approved = h.idp.authorize(authorizationUrl, { account: OWNER_ACCOUNT });
      const path = `/auth/oidc/callback${new URL(approved.callbackUrl).search}`;
      expect((await h.call('GET', path, { headers: { ...CROSS_SITE_NAVIGATION } })).setCookie).toBeDefined();
      const again = await h.call('GET', path, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(again.setCookie).toBeUndefined();
      expect(location(again)).toBe('/hub/sign-in?oidc=failed');

      for (const query of ['?state=nope&code=x', '?code=x', '?state=' + 'A'.repeat(43), '']) {
        const res = await h.call('GET', `/auth/oidc/callback${query}`, { headers: { ...CROSS_SITE_NAVIGATION } });
        expect([query, res.status, location(res)]).toEqual([query, 302, '/hub/sign-in?oidc=failed']);
        expect(res.setCookie).toBeUndefined();
      }

      const slow = await h.call('POST', '/auth/oidc/start', { body: {} });
      const slowApproved = h.idp.authorize(slow.json.authorizationUrl, { account: OWNER_ACCOUNT });
      h.clock.t += OIDC_FLOW_TTL_MS + 1;
      const late = await h.call('GET', `/auth/oidc/callback${new URL(slowApproved.callbackUrl).search}`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(location(late)).toBe('/hub/sign-in?oidc=failed');
      expect(late.setCookie).toBeUndefined();

      const reasons = audits(h, 'oidc.signin-failed').map((r) => (r.detail as { reason: string }).reason);
      expect(reasons).toEqual(expect.arrayContaining(['consumed', 'malformed-callback', 'unknown', 'expired']));
    });

    it.each(['wrong-nonce', 'wrong-aud', 'wrong-iss', 'bad-signature', 'expired', 'alg-none', 'alg-hs256', 'missing-sub'] as const)('refuses an ID token the provider mis-signed or mis-claimed (%s)', async (failure) => {
      const { h } = await linkedHub();
      h.idp.setFailure(failure);
      const res = await h.signInWithGoogle(OWNER_ACCOUNT);
      expect(location(res.callback)).toBe('/hub/sign-in?oidc=failed');
      expect(res.callback.setCookie).toBeUndefined();
    });

    it('a wrong code and a wrong client secret are refused or reported unavailable, never a session', async () => {
      const { h } = await linkedHub();
      const authorizationUrl = (await h.call('POST', '/auth/oidc/start', { body: {} })).json.authorizationUrl as string;
      const approved = h.idp.authorize(authorizationUrl, { account: OWNER_ACCOUNT });
      const state = new URL(approved.callbackUrl).searchParams.get('state')!;
      const bad = await h.call('GET', `/auth/oidc/callback?state=${state}&code=not-the-code`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(location(bad)).toBe('/hub/sign-in?oidc=failed');
      expect(bad.setCookie).toBeUndefined();
    });

    it('the provider reporting an error (the owner declined) spends the flow and is not counted as an attack', async () => {
      const { h } = await linkedHub();
      const before = (db(h).prepare("SELECT COUNT(*) AS n FROM throttle WHERE throttle_key LIKE 'oidc:%'").get() as { n: number }).n;
      const authorizationUrl = (await h.call('POST', '/auth/oidc/start', { body: {} })).json.authorizationUrl as string;
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      const declined = await h.call('GET', `/auth/oidc/callback?error=access_denied&state=${state}`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(location(declined)).toBe('/hub/sign-in?oidc=failed');
      expect((db(h).prepare("SELECT COUNT(*) AS n FROM throttle WHERE throttle_key LIKE 'oidc:%'").get() as { n: number }).n).toBe(before);
      const approved = h.idp.authorize(authorizationUrl, { account: OWNER_ACCOUNT });
      const replay = await h.call('GET', `/auth/oidc/callback${new URL(approved.callbackUrl).search}`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(replay.setCookie).toBeUndefined();
      expect(audits(h, 'oidc.signin-failed').some((r) => (r.detail as { reason: string }).reason === 'provider-error')).toBe(true);
    });

    it('failed callbacks count toward the per-address throttle and then lock the Google path (the password path is untouched)', async () => {
      const { h } = await linkedHub();
      // A flow started (and approved) before the lock still hits the lock when its callback arrives.
      const pending = h.idp.authorize((await h.call('POST', '/auth/oidc/start', { body: {} })).json.authorizationUrl, { account: OWNER_ACCOUNT });
      for (let i = 0; i < 6; i += 1) await h.signInWithGoogle(STRANGER_ACCOUNT);
      const row = db(h).prepare("SELECT failures FROM throttle WHERE throttle_key = 'oidc:ip:127.0.0.1'").get() as { failures: number };
      expect(row.failures).toBe(6);
      // Locked: even the owner's own account is told to wait, and a start is a 423 with Retry-After.
      const locked = await h.call('GET', `/auth/oidc/callback${new URL(pending.callbackUrl).search}`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(location(locked)).toBe('/hub/sign-in?oidc=locked');
      expect(locked.setCookie).toBeUndefined();
      const startLocked = await h.call('POST', '/auth/oidc/start', { body: {} });
      expect(startLocked.status).toBe(423);
      expect(startLocked.raw.headers['retry-after']).toBeDefined();
      expect(audits(h, 'throttle.locked').some((r) => (r.detail as { kind: string }).kind === 'oidc')).toBe(true);
      // Password sign-in is independent of the Google counter.
      expect((await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD } })).status).toBe(200);
    });

    it('only same-site relative return paths are honoured', async () => {
      const { h } = await linkedHub();
      for (const [asked, expected] of [['https://evil.example/x', '/'], ['//evil.example', '/'], ['/api/v1/hello', '/'], ['/settings/security', '/settings/security']] as const) {
        const res = await h.signInWithGoogle(OWNER_ACCOUNT, { returnTo: asked });
        expect([asked, location(res.callback)]).toEqual([asked, expected]);
      }
    });
  });

  describe('Google unreachable, removed or misconfigured: the Hub stays fully operable', () => {
    const passwordPathWorks = async (h: OidcHub) => {
      const s = await h.signIn();
      expect((await h.call('POST', '/auth/step-up', { cookie: s.cookie, csrf: s.csrf, body: { password: PASSWORD } })).status).toBe(200);
      const recovery = await h.call('POST', '/auth/recover', { body: { recoveryCode: h.recoveryCodes[0], newPassword: 'another very long password' } });
      expect(recovery.status).toBe(200);
      expect((await h.call('POST', '/auth/sign-in', { body: { password: 'another very long password' } })).status).toBe(200);
    };

    it('provider down before the first discovery: start is an explained 503, the callback redirects to the password page, no 500', async () => {
      const h = await start();
      h.idp.setDown('all', true);
      const res = await h.call('POST', '/auth/oidc/start', { body: {} });
      expect(res.status).toBe(503);
      expect(res.json).toEqual({ error: { code: 'oidc-unavailable', message: expect.stringContaining('password') } });
      const callback = await h.call('GET', '/auth/oidc/callback?state=' + 'A'.repeat(43) + '&code=x', { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(callback.status).toBe(302);
      expect(audits(h, 'oidc.unreachable')).toHaveLength(1); // the log is not flooded by repeated attempts
      await h.call('POST', '/auth/oidc/start', { body: {} });
      expect(audits(h, 'oidc.unreachable')).toHaveLength(1);
      expect((await h.call('GET', '/auth/oidc/status')).json.enabled).toBe(true);
      await passwordPathWorks(h);

      // It comes back by itself once the provider does (after the failure back-off).
      h.idp.setDown('all', false);
      h.clock.t += 60_000;
      expect((await h.call('POST', '/auth/oidc/start', { body: {} })).status).toBe(200);
    });

    it('provider goes down between start and callback: an unavailable redirect, the flow is spent, no session', async () => {
      const { h } = await linkedHub();
      const authorizationUrl = (await h.call('POST', '/auth/oidc/start', { body: {} })).json.authorizationUrl as string;
      const approved = h.idp.authorize(authorizationUrl, { account: OWNER_ACCOUNT });
      h.idp.setDown('token', true);
      const res = await h.call('GET', `/auth/oidc/callback${new URL(approved.callbackUrl).search}`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(location(res)).toBe('/hub/sign-in?oidc=unavailable');
      expect(res.setCookie).toBeUndefined();
      // An outage is not an attack: it never counts toward the throttle.
      expect(db(h).prepare("SELECT COUNT(*) AS n FROM throttle WHERE throttle_key LIKE 'oidc:%'").get()).toEqual({ n: 0 });
      await passwordPathWorks(h);
    });

    it('JWKS failure is the same unavailable outcome', async () => {
      const { h } = await linkedHub();
      const authorizationUrl = (await h.call('POST', '/auth/oidc/start', { body: {} })).json.authorizationUrl as string;
      const approved = h.idp.authorize(authorizationUrl, { account: OWNER_ACCOUNT });
      h.idp.setDown('jwks', true);
      await h.idp.rotateKey();
      h.clock.t += 2 * 60 * 60_000; // the cached key set is stale and Google is down
      const res = await h.call('GET', `/auth/oidc/callback${new URL(approved.callbackUrl).search}`, { headers: { ...CROSS_SITE_NAVIGATION } });
      expect([res.status, res.setCookie]).toEqual([302, undefined]);
      expect(['/hub/sign-in?oidc=unavailable', '/hub/sign-in?oidc=failed']).toContain(location(res));
    });

    it('client secret removed: Google is off, status says so, the password path works', async () => {
      const { h } = await linkedHub();
      h.secret.value = null;
      expect((await h.call('GET', '/auth/oidc/status')).json).toEqual({ configured: true, enabled: false });
      const res = await h.call('POST', '/auth/oidc/start', { body: {} });
      expect([res.status, res.json.error.code]).toEqual([503, 'oidc-unavailable']);
      await passwordPathWorks(h);
    });

    it('no oidc block: every Google route answers without error and sign-in is exactly the password', async () => {
      const h = await start({ unconfigured: true });
      expect((await h.call('POST', '/auth/oidc/start', { body: {} })).status).toBe(503);
      const callback = await h.call('GET', '/auth/oidc/callback?state=' + 'A'.repeat(43) + '&code=x');
      expect([callback.status, location(callback)]).toEqual([302, '/hub/sign-in?oidc=unavailable']);
      // The cross-site exemption does not apply without an oidc block.
      const cross = await h.call('GET', '/auth/oidc/callback?state=' + 'A'.repeat(43) + '&code=x', { headers: { ...CROSS_SITE_NAVIGATION } });
      expect(cross.status).toBe(403);
      await passwordPathWorks(h);
    });

    it('a linked account still listed with the provider down; linking needs the provider and says so', async () => {
      const { h, s } = await linkedHub();
      h.idp.setDown('all', true);
      h.clock.t += 26 * 60 * 60_000; // past the 24 h the cached discovery may be served stale
      const fresh = await h.signIn();
      expect((await h.call('GET', '/auth/oidc/accounts', { cookie: fresh.cookie })).json.accounts).toHaveLength(1);
      const link = await h.call('POST', '/auth/oidc/link/start', { cookie: fresh.cookie, csrf: fresh.csrf, body: {} });
      expect([link.status, link.json.error.code]).toEqual([503, 'oidc-unavailable']);
      expect(s.cookie).not.toBe('');
    });
  });

  describe('responses, audit and storage never carry a secret', () => {
    it('keeps the client secret, the code, the state, the nonce, the link token and every address out of audit rows, responses and the database', async () => {
      const h = await start();
      const s = await h.signIn();
      const responses: string[] = [];
      const leg = await h.linkLegOne(s, OWNER_ACCOUNT, { returnTo: '/settings/security' });
      responses.push(leg.start.raw.body, leg.callback.raw.body, JSON.stringify(leg.callback.raw.headers));
      const complete = await h.call('POST', '/auth/oidc/link/complete', { cookie: s.cookie, csrf: s.csrf, body: { linkToken: leg.linkToken } });
      responses.push(complete.raw.body);
      const signIn = await h.signInWithGoogle(OWNER_ACCOUNT);
      responses.push(signIn.callback.raw.body, JSON.stringify(signIn.callback.raw.headers));

      const secretsToHide = [h.idp.clientSecret, leg.linkToken!, OWNER_ACCOUNT.sub, ...h.idp.tokenRequestBodies.flatMap((b) => [new URLSearchParams(b).get('code') ?? '', new URLSearchParams(b).get('code_verifier') ?? ''])];
      const audit = JSON.stringify(listAudit(db(h), { limit: 500 }));
      for (const secret of secretsToHide) {
        expect(secret).not.toBe('');
        expect(audit).not.toContain(secret);
      }
      for (const email of [OWNER_ACCOUNT.email!]) expect(audit).not.toContain(email);
      // The authorization URL legitimately carries state and nonce (they travel through the browser); nothing else in a response may.
      for (const body of responses) {
        expect(body).not.toContain(h.idp.clientSecret);
        expect(body).not.toContain('id_token');
        expect(body).not.toContain(OWNER_ACCOUNT.sub);
      }
      // The database holds hashes, never the raw state, nonce, link token or an unspent verifier.
      const rows = JSON.stringify(db(h).prepare('SELECT * FROM oidc_flows').all());
      expect(rows).not.toContain(leg.linkToken!);
      for (const state of [new URL(leg.start.json.authorizationUrl).searchParams.get('state')!, new URL(leg.start.json.authorizationUrl).searchParams.get('nonce')!]) expect(rows).not.toContain(state);
      const spent = db(h).prepare("SELECT COUNT(*) AS n FROM oidc_flows WHERE consumed_at IS NOT NULL AND code_verifier <> ''").get();
      expect(spent).toEqual({ n: 0 });
    });
  });

  describe('link flow, both legs', () => {
    it('leg one only records; the signed-in owner binds the account on leg two, by sub, never by address', async () => {
      const h = await start();
      const s = await h.signIn();
      const leg = await h.linkLegOne(s, SECOND_ACCOUNT, { returnTo: '/settings/security' });
      expect(leg.callback.status).toBe(302);
      expect(location(leg.callback)).toMatch(/^\/settings\/security\?oidcLink=[A-Za-z0-9_-]{43}$/);
      expect(leg.callback.setCookie).toBeUndefined();
      // Nothing is linked yet, and nothing was written to the audit log about a link.
      expect((await h.call('GET', '/auth/oidc/accounts', { cookie: s.cookie })).json).toEqual({ accounts: [] });
      expect(audits(h, 'oidc.link')).toHaveLength(0);

      const done = await h.call('POST', '/auth/oidc/link/complete', { cookie: s.cookie, csrf: s.csrf, body: { linkToken: leg.linkToken } });
      expect(done.status).toBe(200);
      expect(done.json.account).toMatchObject({ provider: 'google', email: 'second@example.com', lastUsedAt: null });
      expect(JSON.stringify(done.json)).not.toContain(SECOND_ACCOUNT.sub);
      expect(audits(h, 'oidc.link')[0]).toMatchObject({ outcome: 'success', actorKind: 'owner' });
      expect(audits(h, 'oidc.link-started')).toHaveLength(1);

      // The token is single use.
      const replay = await h.call('POST', '/auth/oidc/link/complete', { cookie: s.cookie, csrf: s.csrf, body: { linkToken: leg.linkToken } });
      expect(replay.status).toBe(403);
    });

    it('several accounts can be linked and each signs in; linking the same sub twice is refused and nothing duplicates', async () => {
      const { h, s } = await linkedHub();
      expect((await h.linkAccount(s, SECOND_ACCOUNT)).status).toBe(200);
      const twice = await h.linkAccount(s, SECOND_ACCOUNT);
      expect([twice.status, twice.json.error.code]).toEqual([409, 'conflict']);
      expect((await h.call('GET', '/auth/oidc/accounts', { cookie: s.cookie })).json.accounts).toHaveLength(2);
      expect(audits(h, 'oidc.link').filter((r) => r.outcome === 'denied')[0]!.detail).toMatchObject({ reason: 'already-linked' });
      for (const account of [OWNER_ACCOUNT, SECOND_ACCOUNT]) {
        const res = await h.signInWithGoogle(account);
        expect(res.callback.setCookie).toBeDefined();
      }
    });

    it('requires the signed-in owner at both ends: a stepped-up cookie session, and the one that started the link', async () => {
      const h = await start();
      const a = await h.signIn();
      const b = await h.signIn();
      const leg = await h.linkLegOne(a, SECOND_ACCOUNT);
      // Another session of the same owner cannot finish a link it did not start; the token survives the attempt.
      const other = await h.call('POST', '/auth/oidc/link/complete', { cookie: b.cookie, csrf: b.csrf, body: { linkToken: leg.linkToken } });
      expect(other.status).toBe(403);
      expect(audits(h, 'oidc.link').some((r) => (r.detail as { reason?: string }).reason === 'wrong-session')).toBe(true);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: a.cookie, csrf: a.csrf, body: { linkToken: leg.linkToken } })).status).toBe(200);
    });

    it('survives the step-up between the legs (the session rotates; the link is still bound to its lineage)', async () => {
      const h = await start();
      const a = await h.signIn();
      const leg = await h.linkLegOne(a, SECOND_ACCOUNT);
      h.clock.t += STEP_UP_WINDOW_MS + 1000;
      const gated = await h.call('POST', '/auth/oidc/link/complete', { cookie: a.cookie, csrf: a.csrf, body: { linkToken: leg.linkToken } });
      expect([gated.status, gated.json.error.code]).toEqual([403, 'step-up-required']);
      const stepped = await h.call('POST', '/auth/step-up', { cookie: a.cookie, csrf: a.csrf, body: { password: PASSWORD } });
      const fresh = { cookie: cookieValueOf(stepped.setCookie), csrf: stepped.json.csrfToken as string };
      expect(fresh.cookie).not.toBe(a.cookie);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: fresh.cookie, csrf: fresh.csrf, body: { linkToken: leg.linkToken } })).status).toBe(200);
    });

    it('a stale link token and a stale flow are refused', async () => {
      const h = await start();
      const a = await h.signIn();
      const leg = await h.linkLegOne(a, SECOND_ACCOUNT);
      h.clock.t += OIDC_LINK_TTL_MS + 1000;
      const fresh = await h.signIn();
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: fresh.cookie, csrf: fresh.csrf, body: { linkToken: leg.linkToken } })).status).toBe(403);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: fresh.cookie, csrf: fresh.csrf, body: { linkToken: 'Z'.repeat(43) } })).status).toBe(403);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: fresh.cookie, csrf: fresh.csrf, body: { linkToken: 'short' } })).status).toBe(400);
    });

    it('a link flow can never sign anyone in, and a sign-in flow can never be completed as a link', async () => {
      const { h, s } = await linkedHub();
      // A link callback for the OWNER account sets no cookie.
      const leg = await h.linkLegOne(s, OWNER_ACCOUNT);
      expect(leg.callback.setCookie).toBeUndefined();
      // The completion token of one flow is not obtainable from a sign-in flow's callback.
      const signIn = await h.signInWithGoogle(OWNER_ACCOUNT);
      expect(location(signIn.callback)).not.toContain('oidcLink');
    });

    it('a failed link leg redirects back to the return path with a generic failure, never the sign-in page', async () => {
      const h = await start();
      const s = await h.signIn();
      h.idp.setFailure('wrong-nonce');
      const leg = await h.linkLegOne(s, SECOND_ACCOUNT, { returnTo: '/settings/security' });
      expect(location(leg.callback)).toBe('/settings/security?oidcLink=failed');
      expect(leg.linkToken).toBeUndefined();
    });
  });
});
