import { afterEach, describe, expect, it } from 'vitest';
import { INGEST_REVOKE_ACTION, INGEST_REVOKE_CONSEQUENCE_CLASS } from '@dude/contracts/hub';
import { createSession, STEP_UP_WINDOW_MS } from '../auth/sessions.js';
import { listAudit } from '../security/audit.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { PASSWORD, cookieValueOf } from './auth-test-helpers.js';
import { startIngestHub } from './ingest-test-helpers.js';
import type { IngestHub } from './ingest-test-helpers.js';

/**
 * Destructive-Action Contract for revoking an ingest token and for minting one (Milestone 843, PD-119, PD-149). Revoke is two-step: the
 * preview changes and writes nothing and issues a single-use, 60-second token bound to the ingest token id (and to the session that
 * previewed); the apply needs step-up and that token. Minting is not two-step (it adds a credential, never removes one) but is gated: owner
 * session, step-up and a CSRF token for a cookie. A token's authority is only ever its own: it can neither mint, preview nor revoke.
 */
describe('ingest token revoke and mint confirmation boundary', () => {
  const open: IngestHub[] = [];
  afterEach(async () => { for (const h of open.splice(0)) await h.close(); });

  const start = async () => {
    const h = await startIngestHub({ rateLimit: { ingestToken: { perMinute: 6_000_000, burst: 1_000_000 }, ingestFailure: { perMinute: 6_000_000, burst: 1_000_000 } } });
    open.push(h);
    return h;
  };
  type Session = { cookie: string; csrf: string };
  const preview = (h: IngestHub, s: Session, id: string) => h.call('POST', `/admin/ingest-tokens/${id}/revoke/preview`, { cookie: s.cookie, csrf: s.csrf });
  const apply = (h: IngestHub, s: Session, id: string, confirmToken: string) => h.call('POST', `/admin/ingest-tokens/${id}/revoke`, { cookie: s.cookie, csrf: s.csrf, body: { confirmToken } });
  const stateOf = (h: IngestHub, id: string) => (h.sdb!.db.prepare('SELECT revoked_at FROM ingest_tokens WHERE id = ?').get(id) as { revoked_at: number | null }).revoked_at;
  const auditCount = (h: IngestHub) => (h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n;
  const outboxCount = (h: IngestHub) => (h.sdb!.db.prepare('SELECT COUNT(*) AS n FROM audit_outbox').get() as { n: number }).n;
  const audits = (h: IngestHub, event: string) => listAudit(h.hub.hub.db, { limit: 500 }).filter((r) => r.event === event);
  /** A cookie session that has NOT confirmed the password (what a Google sign-in creates). */
  const unsteppedSession = (h: IngestHub): Session => {
    const created = createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'cookie', now: h.clock.t, steppedUp: false });
    return { cookie: created.token, csrf: created.csrfToken! };
  };

  describe('revoke', () => {
    it('the preview writes nothing, carries the consequence class and a token bound to the ingest token, and the token still works', async () => {
      const h = await start();
      const { id, secret } = await h.mintOk('Shortcut');
      const audited = auditCount(h);
      const outbox = outboxCount(h);
      const res = await preview(h, h.owner, id);
      expect(res.status).toBe(200);
      expect(res.json.consequenceClass).toEqual([...INGEST_REVOKE_CONSEQUENCE_CLASS]);
      expect(res.json.consequenceClass).toEqual(['secret-management']);
      expect(res.json.summary).toEqual({ action: INGEST_REVOKE_ACTION, id, label: 'Shortcut', prefix: secret.slice(0, 10) });
      expect(res.json.confirmToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Date.parse(res.json.expiresAt)).toBe(h.clock.t + CONFIRMATION_TTL_MS);
      expect(stateOf(h, id)).toBeNull();
      expect(auditCount(h)).toBe(audited);
      expect(outboxCount(h)).toBe(outbox);
      expect((await h.ping(secret)).status).toBe(200);
    });

    it('applies only with the token: it is single use, expires after 60 seconds and is bound to the ingest token', async () => {
      const h = await start();
      const a = await h.mintOk('A');
      const b = await h.mintOk('B');
      const token = (await preview(h, h.owner, a.id)).json.confirmToken as string;
      // No preview, a made-up token, and a missing one never revoke anything.
      expect((await apply(h, h.owner, a.id, 'q'.repeat(43))).status).toBe(403);
      expect((await h.call('POST', `/admin/ingest-tokens/${a.id}/revoke`, { cookie: h.owner.cookie, csrf: h.owner.csrf, body: {} })).status).toBe(400);
      expect(stateOf(h, a.id)).toBeNull();
      // A token for one ingest token is refused for another, and the failed attempt spends it.
      expect((await apply(h, h.owner, b.id, token)).status).toBe(403);
      expect((await apply(h, h.owner, a.id, token)).status).toBe(403);
      expect([stateOf(h, a.id), stateOf(h, b.id)]).toEqual([null, null]);
      // Expiry.
      const stale = (await preview(h, h.owner, a.id)).json.confirmToken as string;
      h.clock.t += CONFIRMATION_TTL_MS + 1;
      expect((await apply(h, h.owner, a.id, stale)).status).toBe(403);
      expect(stateOf(h, a.id)).toBeNull();
      // The happy path, then replay.
      const good = (await preview(h, h.owner, a.id)).json.confirmToken as string;
      const done = await apply(h, h.owner, a.id, good);
      expect([done.status, done.json]).toEqual([200, { ok: true }]);
      expect(stateOf(h, a.id)).not.toBeNull();
      expect(stateOf(h, b.id)).toBeNull();
      expect((await apply(h, h.owner, a.id, good)).status).toBe(403);
      expect(audits(h, 'ingest.token-revoked')).toHaveLength(1);
      expect(audits(h, 'ingest.token-revoked')[0]).toMatchObject({ outcome: 'success', actorKind: 'owner', actorId: h.ownerId, detail: { ingestId: a.id, label: 'A' } });
      // The revoked token is dead on the next request; the other is untouched.
      expect((await h.ping(a.secret)).status).toBe(401);
      expect((await h.ping(b.secret)).status).toBe(200);
    });

    it('a token is bound to the session that previewed', async () => {
      const h = await start();
      const { id } = await h.mintOk('Bound');
      const other = await h.signIn();
      const token = (await preview(h, h.owner, id)).json.confirmToken as string;
      const res = await apply(h, other, id, token);
      expect([403, 409]).toContain(res.status);
      expect(stateOf(h, id)).toBeNull();
    });

    it('needs step-up for both steps (a session that never confirmed the password, and a lapsed one, are refused), then proceeds after the password', async () => {
      const h = await start();
      const { id } = await h.mintOk('Gated');
      const unstepped = unsteppedSession(h);
      for (const res of [await preview(h, unstepped, id), await apply(h, unstepped, id, 'x'.repeat(43))]) {
        expect([res.status, res.json.error.code]).toEqual([403, 'step-up-required']);
      }
      const token = (await preview(h, h.owner, id)).json.confirmToken as string;
      h.clock.t += STEP_UP_WINDOW_MS + 1;
      const lapsed = await apply(h, h.owner, id, token);
      expect([lapsed.status, lapsed.json.error.code]).toEqual([403, 'step-up-required']);
      expect(stateOf(h, id)).toBeNull();
      const stepped = await h.call('POST', '/auth/step-up', { cookie: h.owner.cookie, csrf: h.owner.csrf, body: { password: PASSWORD } });
      const fresh = { cookie: cookieValueOf(stepped.setCookie), csrf: stepped.json.csrfToken as string };
      const again = (await preview(h, fresh, id)).json.confirmToken as string;
      expect((await apply(h, fresh, id, again)).status).toBe(200);
      expect(stateOf(h, id)).not.toBeNull();
    });

    it('needs a CSRF token and an owner credential on both steps, and an ingest token or device token is no owner', async () => {
      const h = await start();
      const { id, secret } = await h.mintOk('Guarded');
      for (const [path, body] of [[`/admin/ingest-tokens/${id}/revoke/preview`, undefined], [`/admin/ingest-tokens/${id}/revoke`, { confirmToken: 'x'.repeat(43) }]] as const) {
        const opts = body === undefined ? {} : { body };
        expect((await h.call('POST', path, { cookie: h.owner.cookie, ...opts })).status).toBe(403);
        expect((await h.call('POST', path, { ...opts })).status).toBe(401);
        // The token revoking itself, or anyone else's, is the usual "unknown credential".
        expect((await h.call('POST', path, { bearer: secret, ...opts })).status).toBe(401);
        expect((await h.call('POST', path, { bearer: await h.deviceToken(), ...opts })).status).toBe(403);
      }
      expect(stateOf(h, id)).toBeNull();
      expect((await h.ping(secret)).status).toBe(200);
    });

    it('answers 404 for an unknown token and 409 for one that is already revoked or changed after the preview', async () => {
      const h = await start();
      const { id } = await h.mintOk('Twice');
      const missing = await preview(h, h.owner, 'nope');
      expect([missing.status, missing.json.error.code]).toEqual([404, 'not-found']);
      const token = (await preview(h, h.owner, id)).json.confirmToken as string;
      expect((await apply(h, h.owner, id, token)).status).toBe(200);
      const again = await preview(h, h.owner, id);
      expect([again.status, again.json.error.code, again.json.confirmToken]).toEqual([409, 'conflict', undefined]);
      // A token minted for a token that was re-created under the same id (digest covers its creation time) is a 409 and revokes nothing.
      const other = await h.mintOk('Changed');
      const stale = (await preview(h, h.owner, other.id)).json.confirmToken as string;
      h.sdb!.db.prepare('UPDATE ingest_tokens SET created_at = created_at + 1 WHERE id = ?').run(other.id);
      const mismatch = await apply(h, h.owner, other.id, stale);
      expect([mismatch.status, mismatch.json.error.code]).toEqual([409, 'conflict']);
      expect(stateOf(h, other.id)).toBeNull();
    });
  });

  describe('mint', () => {
    it('needs step-up, a CSRF token and an owner credential, and writes nothing otherwise', async () => {
      const h = await start();
      const body = { label: 'Gated mint', scopes: ['ingest:ping'] };
      const before = (h.sdb!.db.prepare('SELECT COUNT(*) AS n FROM ingest_tokens').get() as { n: number }).n;
      const unstepped = unsteppedSession(h);
      const refused = await h.call('POST', '/admin/ingest-tokens', { cookie: unstepped.cookie, csrf: unstepped.csrf, body });
      expect([refused.status, refused.json.error.code]).toEqual([403, 'step-up-required']);
      expect((await h.call('POST', '/admin/ingest-tokens', { cookie: h.owner.cookie, body })).status).toBe(403);
      expect((await h.call('POST', '/admin/ingest-tokens', { body })).status).toBe(401);
      expect((h.sdb!.db.prepare('SELECT COUNT(*) AS n FROM ingest_tokens').get() as { n: number }).n).toBe(before);
      expect(audits(h, 'ingest.token-created')).toHaveLength(0);
      expect((await h.mint('Allowed')).status).toBe(201);
      expect(audits(h, 'ingest.token-created')).toHaveLength(1);
    });

    it('the secret is returned by the mint response only, with no-store', async () => {
      const h = await start();
      const res = await h.mint('Once');
      expect(res.raw.headers['cache-control']).toBe('no-store');
      expect(res.json.secret).toMatch(/^dit_/);
      const list = await h.call('GET', '/admin/ingest-tokens', { cookie: h.owner.cookie });
      expect(list.raw.body).not.toContain(res.json.secret);
      expect(list.raw.headers['cache-control']).toBe('no-store');
    });
  });
});
