import { afterEach, describe, expect, it } from 'vitest';
import { OIDC_UNLINK_ACTION, OIDC_UNLINK_CONSEQUENCE_CLASS } from '@dude/contracts/hub';
import { STEP_UP_WINDOW_MS } from '../auth/sessions.js';
import { listAudit } from '../security/audit.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { PASSWORD, cookieValueOf } from './auth-test-helpers.js';
import { OWNER_ACCOUNT, SECOND_ACCOUNT, STRANGER_ACCOUNT, startOidcHub } from './oidc-test-helpers.js';
import type { OidcHub } from './oidc-test-helpers.js';

/**
 * Destructive-Action Contract for unlinking a Google account and for the authority-changing link (Milestone 842, PD-121, PD-145).
 * Unlink is two-step: the preview changes nothing and issues a single-use, 60-second token bound to the account; the apply needs
 * step-up and the token. Link is not two-step but is gated: step-up at both legs, the session that started it, a verified single-use
 * flow, binding by `sub` only.
 */
describe('Google link and unlink confirmation boundary', () => {
  const open: OidcHub[] = [];
  afterEach(async () => { for (const h of open.splice(0)) await h.close(); });

  const hubWith = async (...accounts: Array<typeof OWNER_ACCOUNT>) => {
    const h = await startOidcHub();
    open.push(h);
    const s = await h.signIn();
    const ids: string[] = [];
    for (const account of accounts) {
      const linked = await h.linkAccount(s, account);
      expect(linked.status).toBe(200);
      ids.push(linked.json.account.id as string);
    }
    return { h, s, ids };
  };
  const db = (h: OidcHub) => h.hub.hub.db;
  const auditCount = (h: OidcHub) => (db(h).prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n;
  const linkedCount = (h: OidcHub) => (db(h).prepare('SELECT COUNT(*) AS n FROM linked_identities').get() as { n: number }).n;
  const audits = (h: OidcHub, event: string) => listAudit(db(h), { limit: 500 }).filter((r) => r.event === event);
  type Session = { cookie: string; csrf: string };
  const preview = (h: OidcHub, s: Session, accountId: string) => h.call('POST', '/auth/oidc/unlink/preview', { cookie: s.cookie, csrf: s.csrf, body: { accountId } });
  const apply = (h: OidcHub, s: Session, accountId: string, confirmToken: string) => h.call('POST', '/auth/oidc/unlink', { cookie: s.cookie, csrf: s.csrf, body: { accountId, confirmToken } });

  describe('unlink', () => {
    it('the preview writes nothing, carries the consequence class and a token bound to the account', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const audited = auditCount(h);
      const res = await preview(h, s, ids[1]!);
      expect(res.status).toBe(200);
      expect(res.json.consequenceClass).toEqual([...OIDC_UNLINK_CONSEQUENCE_CLASS]);
      expect(res.json.consequenceClass).toEqual(['secret-management']);
      expect(res.json.summary).toEqual({ action: OIDC_UNLINK_ACTION, accountId: ids[1], email: 'second@example.com', remainingAccounts: 1 });
      expect(res.json.confirmToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Date.parse(res.json.expiresAt)).toBe(h.clock.t + CONFIRMATION_TTL_MS);
      // Nothing changed: both accounts linked, no audit row (not even a preview row), both can still sign in.
      expect(linkedCount(h)).toBe(2);
      expect(auditCount(h)).toBe(audited);
      expect((await h.signInWithGoogle(SECOND_ACCOUNT)).callback.setCookie).toBeDefined();
    });

    it('applies only with the token: it is single use, expires after 60 seconds and is bound to the account', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const token = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      // No preview, a made-up token, and a missing one never remove anything.
      expect((await apply(h, s, ids[1]!, 'q'.repeat(43))).status).toBe(403);
      expect((await h.call('POST', '/auth/oidc/unlink', { cookie: s.cookie, csrf: s.csrf, body: { accountId: ids[1] } })).status).toBe(400);
      expect(linkedCount(h)).toBe(2);
      // A token for one account is refused for another, and the failed attempt spends it.
      expect((await apply(h, s, ids[0]!, token)).status).toBe(403);
      expect((await apply(h, s, ids[1]!, token)).status).toBe(403);
      expect(linkedCount(h)).toBe(2);
      // Expiry.
      const stale = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      h.clock.t += CONFIRMATION_TTL_MS + 1;
      expect((await apply(h, s, ids[1]!, stale)).status).toBe(403);
      expect(linkedCount(h)).toBe(2);
      // The happy path, then replay.
      const good = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      const done = await apply(h, s, ids[1]!, good);
      expect(done.status).toBe(200);
      expect(linkedCount(h)).toBe(1);
      expect(audits(h, 'oidc.unlink')[0]).toMatchObject({ outcome: 'success', actorKind: 'owner' });
      expect((await apply(h, s, ids[1]!, good)).status).toBe(403);
      // The unlinked account is now a stranger.
      const gone = await h.signInWithGoogle(SECOND_ACCOUNT);
      expect(gone.callback.setCookie).toBeUndefined();
      expect(audits(h, 'oidc.refused-account')).toHaveLength(1);
      expect((await h.signInWithGoogle(OWNER_ACCOUNT)).callback.setCookie).toBeDefined();
    });

    it('a token is bound to the session that previewed', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const other = await h.signIn();
      const token = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      const res = await apply(h, other, ids[1]!, token);
      expect([403, 409]).toContain(res.status);
      expect(linkedCount(h)).toBe(2);
    });

    it('needs step-up for both steps: a Google-created session is refused until the password is entered, and so is a lapsed one', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const google = await h.signInWithGoogle(OWNER_ACCOUNT);
      const googleCookie = cookieValueOf(google.callback.setCookie);
      const g = { cookie: googleCookie, csrf: (await h.call('GET', '/auth/session', { cookie: googleCookie })).json.csrfToken as string };
      for (const res of [await preview(h, g, ids[1]!), await apply(h, g, ids[1]!, 'x'.repeat(43))]) {
        expect([res.status, res.json.error.code]).toEqual([403, 'step-up-required']);
      }
      const token = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      h.clock.t += STEP_UP_WINDOW_MS + 1;
      const lapsed = await apply(h, s, ids[1]!, token);
      expect([lapsed.status, lapsed.json.error.code]).toEqual([403, 'step-up-required']);
      expect(linkedCount(h)).toBe(2);
      // After the password, the same session proceeds.
      const stepped = await h.call('POST', '/auth/step-up', { cookie: s.cookie, csrf: s.csrf, body: { password: PASSWORD } });
      const fresh = { cookie: cookieValueOf(stepped.setCookie), csrf: stepped.json.csrfToken as string };
      const again = (await preview(h, fresh, ids[1]!)).json.confirmToken as string;
      expect((await apply(h, fresh, ids[1]!, again)).status).toBe(200);
    });

    it('needs a CSRF token and an owner credential on both steps', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      for (const [path, body] of [['/auth/oidc/unlink/preview', { accountId: ids[1] }], ['/auth/oidc/unlink', { accountId: ids[1], confirmToken: 'x'.repeat(43) }]] as const) {
        expect((await h.call('POST', path, { cookie: s.cookie, body })).status).toBe(403);
        expect((await h.call('POST', path, { body })).status).toBe(401);
      }
      expect(linkedCount(h)).toBe(2);
    });

    it('refuses an unknown account with 404', async () => {
      const { h, s } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const res = await preview(h, s, 'nope');
      expect([res.status, res.json.error.code]).toEqual([404, 'not-found']);
    });

    it('the last linked account cannot be unlinked: refused at the preview without a token, and audited when a stale token is applied', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT);
      const alone = await preview(h, s, ids[0]!);
      expect([alone.status, alone.json.error.code]).toEqual([409, 'conflict']);
      expect(alone.json.confirmToken).toBeUndefined();

      const two = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const tokenForFirst = (await preview(two.h, two.s, two.ids[0]!)).json.confirmToken as string;
      const tokenForSecond = (await preview(two.h, two.s, two.ids[1]!)).json.confirmToken as string;
      expect((await apply(two.h, two.s, two.ids[1]!, tokenForSecond)).status).toBe(200);
      const refused = await apply(two.h, two.s, two.ids[0]!, tokenForFirst);
      expect([refused.status, refused.json.error.code]).toEqual([409, 'conflict']);
      expect(linkedCount(two.h)).toBe(1);
      expect(audits(two.h, 'oidc.unlink').find((r) => r.outcome === 'denied')?.detail).toMatchObject({ reason: 'last-account' });
      // The remaining account still signs in.
      expect((await two.h.signInWithGoogle(OWNER_ACCOUNT)).callback.setCookie).toBeDefined();
    });

    it('answers 409 and removes nothing when the set of accounts changed after the preview', async () => {
      const { h, s, ids } = await hubWith(OWNER_ACCOUNT, SECOND_ACCOUNT);
      const token = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      expect((await h.linkAccount(s, STRANGER_ACCOUNT)).status).toBe(200);
      const res = await apply(h, s, ids[1]!, token);
      expect([res.status, res.json.error.code]).toEqual([409, 'conflict']);
      expect(linkedCount(h)).toBe(3);
      const again = (await preview(h, s, ids[1]!)).json.confirmToken as string;
      expect((await apply(h, s, ids[1]!, again)).status).toBe(200);
      expect(linkedCount(h)).toBe(2);
    });
  });

  describe('link', () => {
    it('is refused at both legs without step-up, and never binds anything from the cross-site callback alone', async () => {
      const h = await startOidcHub();
      open.push(h);
      const s = await h.signIn();
      h.clock.t += STEP_UP_WINDOW_MS + 1000;
      const lapsed = await h.call('POST', '/auth/oidc/link/start', { cookie: s.cookie, csrf: s.csrf, body: {} });
      expect([lapsed.status, lapsed.json.error.code]).toEqual([403, 'step-up-required']);
      expect(h.idp.calls).toHaveLength(0);

      const fresh = await h.signIn();
      const leg = await h.linkLegOne(fresh, OWNER_ACCOUNT);
      expect(leg.linkToken).toBeDefined();
      expect(linkedCount(h)).toBe(0);
      h.clock.t += STEP_UP_WINDOW_MS + 1000;
      const gated = await h.call('POST', '/auth/oidc/link/complete', { cookie: fresh.cookie, csrf: fresh.csrf, body: { linkToken: leg.linkToken } });
      expect([gated.status, gated.json.error.code]).toEqual([403, 'step-up-required']);
      expect(linkedCount(h)).toBe(0);
    });

    it('a link flow started by one owner session cannot be finished by another, a token is single use, and a sign-in flow never links', async () => {
      const h = await startOidcHub();
      open.push(h);
      const a = await h.signIn();
      const b = await h.signIn();
      const leg = await h.linkLegOne(a, SECOND_ACCOUNT);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: b.cookie, csrf: b.csrf, body: { linkToken: leg.linkToken } })).status).toBe(403);
      expect(linkedCount(h)).toBe(0);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: a.cookie, csrf: a.csrf, body: { linkToken: leg.linkToken } })).status).toBe(200);
      expect((await h.call('POST', '/auth/oidc/link/complete', { cookie: a.cookie, csrf: a.csrf, body: { linkToken: leg.linkToken } })).status).toBe(403);
      expect(linkedCount(h)).toBe(1);
      // A sign-in of an unlinked account links nothing.
      await h.signInWithGoogle(STRANGER_ACCOUNT);
      expect(linkedCount(h)).toBe(1);
    });

    it('binds by the provider subject only: the same address under another subject is a different account, and nothing links by address', async () => {
      const h = await startOidcHub();
      open.push(h);
      const s = await h.signIn();
      expect((await h.linkAccount(s, OWNER_ACCOUNT)).status).toBe(200);
      const sameAddress = await h.linkAccount(s, { sub: 'a-different-subject', email: OWNER_ACCOUNT.email });
      expect(sameAddress.status).toBe(200);
      expect(linkedCount(h)).toBe(2);
      const subs = (db(h).prepare('SELECT sub FROM linked_identities ORDER BY sub').all() as Array<{ sub: string }>).map((r) => r.sub);
      expect(subs).toEqual(['a-different-subject', 'google-sub-owner']);
    });
  });
});
