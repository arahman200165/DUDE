import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HUB_API_PREFIX, INGEST_MAX_LIVE_TOKENS, INGEST_PATH_PREFIX, INGEST_SCOPES, INGEST_TOKEN_PATTERN } from '@dude/contracts/hub';
import { INGEST_BEARER_RESOLVERS } from '../auth/ingest-auth.js';
import { OWNER_BEARER_RESOLVERS } from '../auth/owner-auth.js';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { INGEST_LAST_USED_GRANULARITY_MS, createIngestTokenStore } from '../ingest/ingest-tokens.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import type { SaveSphereDb } from '../savesphere-db/open.js';
import { audit, listAudit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { BLOCK_CREDENTIAL_FAILURES, blockedForMs, registerIpBlock } from '../security/ip-block.js';
import { createRateLimiter, registerRateLimit } from '../security/rate-limit.js';
import { hubErrorHandler } from './errors.js';
import { startIngestHub } from './ingest-test-helpers.js';
import type { IngestHub } from './ingest-test-helpers.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { startTestHub, tempDir } from './test-helpers.js';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const GENEROUS = { perMinute: 6_000_000, burst: 1_000_000 };
const DAY = 24 * 3600_000;
const auditRows = (h: IngestHub, event?: string) => listAudit(h.hub.hub.db, { limit: 500 }).filter((r) => event === undefined || r.event === event);

describe('ingest scaffold: tokens, the token-only route and the credential matrix', () => {
  let h: IngestHub;
  beforeAll(async () => { h = await startIngestHub({ rateLimit: { ingestToken: GENEROUS, ingestFailure: GENEROUS } }); });
  afterAll(async () => { await h.close(); });

  describe('storage, hashing and the one-time reveal', () => {
    it('mints a dit_ secret exactly once and stores only its SHA-256', async () => {
      const { secret, id, body } = await h.mintOk('Mac shortcut', { expiresInDays: 30 });
      expect(secret).toMatch(INGEST_TOKEN_PATTERN);
      expect(body.token).toMatchObject({ id, label: 'Mac shortcut', prefix: secret.slice(0, 10), scopes: [...INGEST_SCOPES], state: 'active', lastUsedAt: null, revokedAt: null });
      expect(Date.parse(body.token.expiresAt!) - Date.parse(body.token.createdAt)).toBe(30 * DAY);
      const rows = h.sdb!.db.prepare('SELECT * FROM ingest_tokens WHERE id = ?').all(id) as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.token_hash).toBe(sha256(secret));
      expect(rows[0]!.created_by).toBe(h.ownerId);
      // No column (and so no row dump) holds the secret itself.
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect((await h.mintOk()).secret).not.toBe(secret);
    });

    it('never returns the secret or hash again: list, ping, audit rows and the audit outbox are free of both', async () => {
      const { secret, id } = await h.mintOk('Leak check');
      const hash = sha256(secret);
      await h.ping(secret);
      const listed = await h.call('GET', '/admin/ingest-tokens', { cookie: h.owner.cookie });
      expect(listed.status).toBe(200);
      const entry = listed.json.tokens.find((t: { id: string }) => t.id === id);
      expect(Object.keys(entry).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'label', 'lastUsedAt', 'prefix', 'revokedAt', 'scopes', 'state']);
      const everything = [
        listed.raw.body,
        JSON.stringify(listAudit(h.hub.hub.db, { limit: 500 })),
        JSON.stringify(h.sdb!.db.prepare('SELECT * FROM audit_outbox').all()),
        JSON.stringify(h.hub.hub.db.prepare('SELECT * FROM throttle').all()),
      ].join('\n');
      for (const needle of [secret, hash, secret.slice(4)]) expect(everything).not.toContain(needle);
      // The display prefix is only `dit_` plus six characters: far too short to use.
      expect(entry.prefix).toHaveLength(10);
    });

    it('writes ingest.token-created through the outbox into the audit log, with ids and a label only', async () => {
      const { id } = await h.mintOk('Audited');
      const row = auditRows(h, 'ingest.token-created').find((r) => (r.detail as { ingestId?: string }).ingestId === id)!;
      expect(row).toMatchObject({ actorKind: 'owner', actorId: h.ownerId, outcome: 'success' });
      expect(row.detail).toMatchObject({ ingestId: id, label: 'Audited', scopes: ['ingest:ping'], expiresAt: null });
    });

    it('validates a mint: closed scope list, at least one scope, unique scopes, label and expiry bounds, no extra fields', async () => {
      const post = (body: unknown) => h.call('POST', '/admin/ingest-tokens', { cookie: h.owner.cookie, csrf: h.owner.csrf, body });
      for (const bad of [
        { label: 'x', scopes: ['capture:write'] }, { label: 'x', scopes: [] }, { label: 'x', scopes: ['ingest:ping', 'ingest:ping'] }, { label: '', scopes: ['ingest:ping'] },
        { label: 'x'.repeat(65), scopes: ['ingest:ping'] }, { label: 'x', scopes: ['ingest:ping'], expiresInDays: 0 }, { label: 'x', scopes: ['ingest:ping'], expiresInDays: 366 },
        { label: 'x', scopes: ['ingest:ping'], extra: true }, { scopes: ['ingest:ping'] },
      ]) expect([bad, (await post(bad)).status]).toEqual([bad, 400]);
      expect((await post({ label: '   ', scopes: ['ingest:ping'] })).status).toBe(400);
    });

    it('caps the live tokens, and revoking one frees a slot', async () => {
      const own = await startIngestHub();
      try {
        const ids: string[] = [];
        for (let i = 0; i < INGEST_MAX_LIVE_TOKENS; i += 1) ids.push((await own.mintOk(`t${i}`)).id);
        const over = await own.mint('one too many');
        expect([over.status, over.json.error.code]).toEqual([409, 'conflict']);
        const store = createIngestTokenStore({ db: own.sdb!.db, hubDb: own.hub.hub.db, auditWriter: (i) => audit(own.hub.hub.db, i), now: () => own.clock.t });
        expect(store.revoke(own.ownerId, ids[0]!).status).toBe('revoked');
        expect((await own.mint('fits again')).status).toBe(201);
      } finally { await own.close(); }
    });
  });

  describe('GET /api/v1/ingest/ping', () => {
    it('answers a valid token with its id, scopes and the server time, uncached and without a cookie', async () => {
      const { secret, id } = await h.mintOk('Ping');
      const res = await h.ping(secret);
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ ok: true, tokenId: id, scopes: ['ingest:ping'] });
      expect(new Date(res.json.serverTime).toISOString()).toBe(res.json.serverTime);
      expect(res.raw.headers['cache-control']).toBe('no-store');
      expect(res.raw.headers['set-cookie']).toBeUndefined();
    });

    it('refreshes last_used_at at most once a minute', async () => {
      const { secret, id } = await h.mintOk('Last used');
      const lastUsed = async () => (await h.call('GET', '/admin/ingest-tokens', { cookie: h.owner.cookie })).json.tokens.find((t: { id: string }) => t.id === id).lastUsedAt as string | null;
      expect(await lastUsed()).toBeNull();
      await h.ping(secret);
      const first = await lastUsed();
      expect(first).toBe(new Date(h.clock.t).toISOString());
      h.clock.t += INGEST_LAST_USED_GRANULARITY_MS - 1;
      await h.ping(secret);
      expect(await lastUsed()).toBe(first);
      h.clock.t += 1;
      await h.ping(secret);
      expect(await lastUsed()).toBe(new Date(h.clock.t).toISOString());
    });

    it('refuses unknown, malformed, expired and revoked tokens with the same 401, auditing the reason (once a minute per address) and never the token', async () => {
      const own = await startIngestHub({ rateLimit: { ingestToken: GENEROUS, ingestFailure: GENEROUS } });
      try {
        const unknown = `dit_${'A'.repeat(43)}`;
        const expiring = await own.mintOk('Expiring', { expiresInDays: 1 });
        const toRevoke = await own.mintOk('Revoked');
        const store = createIngestTokenStore({ db: own.sdb!.db, hubDb: own.hub.hub.db, auditWriter: (i) => audit(own.hub.hub.db, i), now: () => own.clock.t });
        expect(store.revoke(own.ownerId, toRevoke.id).status).toBe('revoked');
        const seen: string[] = [];
        const refuse = async (secret: string, expected: string) => {
          const res = await own.ping(secret);
          expect([expected, res.status, res.json.error.code, res.json.error.message]).toEqual([expected, 401, 'unauthorized', 'A valid ingest token is required.']);
          seen.push(expected);
          own.clock.t += 61_000;
        };
        await refuse(unknown, 'unknown');
        await refuse('dit_short', 'malformed');
        await refuse(`dit_${'!'.repeat(43)}`, 'malformed');
        await refuse(toRevoke.secret, 'revoked');
        expect((await own.ping(expiring.secret)).status).toBe(200);
        own.clock.t += DAY;
        await refuse(expiring.secret, 'expired');
        const rows = listAudit(own.hub.hub.db, { limit: 500 }).filter((r) => r.event === 'ingest.auth-failed').reverse();
        expect(rows.map((r) => (r.detail as { reason: string }).reason)).toEqual(seen);
        expect(rows.find((r) => (r.detail as { reason: string }).reason === 'revoked')!.detail).toMatchObject({ ingestId: toRevoke.id });
        const everything = JSON.stringify(rows);
        for (const needle of [unknown, toRevoke.secret, expiring.secret, sha256(toRevoke.secret)]) expect(everything).not.toContain(needle);
      } finally { await own.close(); }
    });

    it('enforces the scope: a token without it is 403, and an unknown stored scope is never granted', async () => {
      const { secret, id } = await h.mintOk('No scope');
      const sdb = h.sdb!.db;
      sdb.prepare('UPDATE ingest_tokens SET scopes_json = ? WHERE id = ?').run('[]', id);
      expect((await h.ping(secret)).status).toBe(403);
      sdb.prepare('UPDATE ingest_tokens SET scopes_json = ? WHERE id = ?').run('["capture:write","ingest:admin"]', id);
      const res = await h.ping(secret);
      expect([res.status, res.json.error.code]).toEqual([403, 'forbidden']);
      const denied = auditRows(h, 'ingest.auth-failed').find((r) => (r.detail as { reason?: string; ingestId?: string }).reason === 'scope' && (r.detail as { ingestId?: string }).ingestId === id);
      expect(denied).toBeDefined();
    });
  });

  describe('credential matrix', () => {
    it('the ingest route accepts an ingest token only: no credential, an owner cookie, an owner bearer, a device token and a wrong-family bearer are all 401', async () => {
      const ownerBearer = await h.ownerBearer();
      const deviceToken = await h.deviceToken();
      expect(ownerBearer.startsWith('dob_')).toBe(true);
      expect(deviceToken.startsWith('ddt_')).toBe(true);
      const attempts: Array<[string, () => Promise<{ status: number; json: any }>]> = [
        ['none', () => h.ping(undefined)],
        ['owner cookie', () => h.call('GET', '/ingest/ping', { cookie: h.owner.cookie, csrf: h.owner.csrf })],
        ['owner bearer', () => h.ping(ownerBearer)],
        ['device token', () => h.ping(deviceToken)],
        ['setup-token shaped', () => h.ping('dst_abc')],
        ['basic auth', () => h.call('GET', '/ingest/ping', { noOrigin: true, headers: { authorization: 'Basic dXNlcjpwYXNz' } })],
      ];
      for (const [name, attempt] of attempts) {
        const res = await attempt();
        expect([name, res.status, res.json.error.code]).toEqual([name, 401, 'unauthorized']);
      }
    });

    it('an ingest token is refused everywhere else: owner, device, sync, web and realtime-adjacent routes answer 401 and never run', async () => {
      const { secret } = await h.mintOk('Everywhere else');
      const routes: Array<[string, string, unknown?]> = [
        ['GET', '/sessions'], ['GET', '/auth/session'], ['GET', '/devices'], ['GET', '/devices/self'], ['GET', '/admin/ingest-tokens'], ['GET', '/jobs'], ['GET', '/queue'],
        ['GET', '/provisioning'], ['GET', '/tunnel'], ['GET', '/diagnostics'], ['GET', '/audit'], ['GET', '/notifications'], ['GET', '/presence'], ['GET', '/sync/summary'],
        ['GET', '/sync/changes?after=0'], ['GET', '/web/access'], ['GET', '/web/snapshot'], ['GET', '/backup/status'], ['GET', '/reachability/echo'], ['GET', '/security/alerts'], ['GET', '/auth/oidc/accounts'],
        ['POST', '/auth/step-up', { password: 'x' }], ['POST', '/auth/owner/bearer', { password: 'x' }], ['POST', '/auth/sign-out'], ['POST', '/pairing-codes', {}],
        ['POST', '/admin/ingest-tokens', { label: 'nope', scopes: ['ingest:ping'] }], ['POST', '/auth/device-recovery/challenge'],
        ['POST', '/collab/rooms', { name: 'x' }], ['GET', '/collab/documents'],
      ];
      const before = (h.sdb!.db.prepare('SELECT COUNT(*) AS n FROM ingest_tokens').get() as { n: number }).n;
      for (const [method, path, body] of routes) {
        const res = await h.call(method, path, { bearer: secret, ...(body === undefined ? {} : { body }) });
        expect([method, path, res.status]).toEqual([method, path, 401]);
      }
      expect((h.sdb!.db.prepare('SELECT COUNT(*) AS n FROM ingest_tokens').get() as { n: number }).n).toBe(before);
      // Not a cookie credential either: the same secret in the session cookie is not a session.
      expect((await h.call('GET', '/auth/session', { cookie: secret })).status).toBe(401);
    });

    it('the owner bearer family has no ingest resolver and the ingest family has no owner one (separate, disjoint prefixes)', () => {
      expect(Object.keys(OWNER_BEARER_RESOLVERS)).toEqual(['dob_']);
      expect(Object.keys(INGEST_BEARER_RESOLVERS)).toEqual(['dit_']);
    });

    it('a session cookie sent with a valid token is never read: the token alone decides, and a cookie alone is nothing', async () => {
      const { secret, id } = await h.mintOk('Cookie ignored');
      const withCookie = await h.call('GET', '/ingest/ping', { bearer: secret, cookie: h.owner.cookie, csrf: h.owner.csrf });
      expect([withCookie.status, withCookie.json.tokenId]).toEqual([200, id]);
      expect(withCookie.raw.headers['set-cookie']).toBeUndefined();
      expect((await h.call('GET', '/ingest/ping', { cookie: h.owner.cookie })).status).toBe(401);
    });
  });

  describe('browser exposure', () => {
    it('sends no CORS header, on the route or on a preflight', async () => {
      const { secret } = await h.mintOk('Cors');
      const get = await h.call('GET', '/ingest/ping', { bearer: secret, headers: { origin: 'https://evil.example', 'sec-fetch-mode': 'same-origin' } });
      expect(get.status).toBe(200);
      const preflight = await h.call('OPTIONS', '/ingest/ping', {
        noOrigin: true, headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
      });
      for (const res of [get, preflight]) {
        expect(Object.keys(res.raw.headers).filter((k) => k.toLowerCase().startsWith('access-control-'))).toEqual([]);
      }
      expect(preflight.status).not.toBe(200);
    });
  });

  describe('route inventory', () => {
    it('the only route under /api/v1/ingest/ is the token-only ping, and the management routes live under /api/v1/admin/ingest-tokens', async () => {
      const registered: string[] = [];
      const probe = await startTestHub({}, { configure: (app) => app.addHook('onRoute', (route) => { for (const m of [route.method].flat()) if (m !== 'HEAD') registered.push(`${m} ${route.url}`); }) });
      try {
        expect(registered.filter((r) => r.split(' ')[1]!.startsWith(INGEST_PATH_PREFIX))).toEqual(['GET /api/v1/ingest/ping']);
        expect(registered.filter((r) => r.includes('ingest-tokens')).sort()).toEqual([
          'GET /api/v1/admin/ingest-tokens', 'POST /api/v1/admin/ingest-tokens', 'POST /api/v1/admin/ingest-tokens/:id/revoke', 'POST /api/v1/admin/ingest-tokens/:id/revoke/preview',
        ]);
      } finally { await probe.close(); }
    });
  });
});

describe('ingest scaffold: Hub without SaveSphere storage', () => {
  let h: IngestHub;
  beforeAll(async () => { h = await startIngestHub({ unprovisioned: true }); });
  afterAll(async () => { await h.close(); });

  it('the owner routes answer 409 (never an empty list that looks like "no tokens"), and every token is unknown (401)', async () => {
    const own = { cookie: h.owner.cookie, csrf: h.owner.csrf };
    for (const [method, path, body] of [['GET', '/admin/ingest-tokens', undefined], ['POST', '/admin/ingest-tokens', { label: 'x', scopes: ['ingest:ping'] }], ['POST', '/admin/ingest-tokens/abc/revoke/preview', undefined], ['POST', '/admin/ingest-tokens/abc/revoke', { confirmToken: 'x' }]] as const) {
      const res = await h.call(method, path, { ...own, ...(body === undefined ? {} : { body }) });
      expect([path, res.status, res.json.error.code]).toEqual([path, 409, 'conflict']);
    }
    expect((await h.ping(`dit_${'B'.repeat(43)}`)).status).toBe(401);
  });
});

describe('ingest scaffold: per-token bucket, per-address failure bucket and the IP block', () => {
  const open: IngestHub[] = [];
  afterEach(async () => { for (const x of open.splice(0)) await x.close(); });

  it('meters a valid token in its own bucket (429 with Retry-After), separate from other tokens and from the owner routes', async () => {
    const own = await startIngestHub({ rateLimit: { ingestToken: { perMinute: 60, burst: 3 }, ingestFailure: GENEROUS } });
    open.push(own);
    const a = await own.mintOk('A');
    const b = await own.mintOk('B');
    for (let i = 0; i < 3; i += 1) expect((await own.ping(a.secret)).status).toBe(200);
    const limited = await own.ping(a.secret);
    expect([limited.status, limited.json.error.code]).toEqual([429, 'rate-limited']);
    expect(Number(limited.raw.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(limited.raw.headers['cache-control']).toBe('no-store');
    expect((await own.ping(b.secret)).status).toBe(200);
    expect((await own.call('GET', '/admin/ingest-tokens', { cookie: own.owner.cookie })).status).toBe(200);
    own.clock.t += 1000;
    expect((await own.ping(a.secret)).status).toBe(200);
  });

  it('caps refused attempts per address BEFORE evaluating any token: once the allowance is gone even a valid token waits', async () => {
    const own = await startIngestHub({ rateLimit: { ingestToken: GENEROUS, ingestFailure: { perMinute: 6, burst: 3 } } });
    open.push(own);
    const good = await own.mintOk('Good');
    for (let i = 0; i < 3; i += 1) expect((await own.ping(`dit_${String(i).repeat(43)}`)).status).toBe(401);
    const blocked = await own.ping(good.secret);
    expect([blocked.status, blocked.json.error.code]).toEqual([429, 'rate-limited']);
    expect(Number(blocked.raw.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    own.clock.t += 20_000;
    expect((await own.ping(good.secret)).status).toBe(200);
  });

  it('a request without any Authorization header is a plain 401 that costs nothing', async () => {
    const own = await startIngestHub({ rateLimit: { ingestToken: GENEROUS, ingestFailure: { perMinute: 1, burst: 2 } } });
    open.push(own);
    const good = await own.mintOk('Good');
    for (let i = 0; i < 20; i += 1) expect((await own.ping(undefined)).status).toBe(401);
    expect((await own.ping(good.secret)).status).toBe(200);
  });

  describe('automatic IP block', () => {
    let hub: HubDb;
    let sdb: SaveSphereDb;
    let app: FastifyInstance;
    const clock = { t: Date.parse('2026-10-27T12:00:00.000Z') };
    const IP = '203.0.113.9';
    const OTHER_IP = '203.0.113.77';
    let secret: string;

    beforeAll(async () => {
      const paths = ensureLayout(tempDir('hub-ingest-block-'));
      const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
      if (opened.status !== 'ready') throw new Error('hub db not ready');
      hub = opened.hub;
      const sOpened = openSaveSphereDb(paths);
      if (sOpened.status !== 'ready') throw new Error('savesphere.db not ready');
      sdb = sOpened.store;
      const now = () => clock.t;
      const store = createIngestTokenStore({ db: sdb.db, hubDb: hub.db, auditWriter: (input) => audit(hub.db, input), now });
      secret = (store.create('owner-1', { label: 'Block test', scopes: ['ingest:ping'] }) as { secret: string }).secret;
      const limiter = createRateLimiter({ now, ingestFailure: GENEROUS });
      app = Fastify({ trustProxy: true });
      app.setErrorHandler(hubErrorHandler);
      registerIpBlock(app, hub.db, now);
      registerRateLimit(app, limiter);
      registerIngestRoutes(app, { store: () => store, hubDb: hub.db, limiter, now, confirmations: new ConfirmationStore(), requireOwner: async () => undefined });
      await app.ready();
    });
    afterAll(async () => { await app.close(); hub.close(); sdb.close(); });

    const probe = (ip: string, authorization?: string) => app.inject({ method: 'GET', url: `${HUB_API_PREFIX}/ingest/ping`, headers: { 'x-forwarded-for': ip, ...(authorization ? { authorization } : {}) } });

    it('requests with no credential never count', async () => {
      for (let i = 0; i < BLOCK_CREDENTIAL_FAILURES + 5; i += 1) expect((await probe(IP)).statusCode).toBe(401);
      expect(blockedForMs(hub.db, IP, clock.t)).toBe(0);
    });

    it('counts refused credentials like failed logins and blocks the address on the 25th, for every route (429 with Retry-After)', async () => {
      const wrong = `Bearer dit_${'Z'.repeat(43)}`;
      for (let i = 0; i < BLOCK_CREDENTIAL_FAILURES - 1; i += 1) expect((await probe(IP, wrong)).statusCode).toBe(401);
      expect(blockedForMs(hub.db, IP, clock.t)).toBe(0);
      expect((await probe(IP, wrong)).statusCode).toBe(401);
      expect(blockedForMs(hub.db, IP, clock.t)).toBeGreaterThan(0);
      const after = await probe(IP, `Bearer ${secret}`);
      expect([after.statusCode, Number(after.headers['retry-after']) > 0]).toEqual([429, true]);
      // A different address, with the valid token, is untouched.
      expect((await probe(OTHER_IP, `Bearer ${secret}`)).statusCode).toBe(200);
      const blocked = listAudit(hub.db, { limit: 500 }).filter((r) => r.event === 'security.ip-blocked');
      expect(blocked).toHaveLength(1);
      expect(blocked[0]!.detail).toMatchObject({ reason: 'credential-failures' });
    });

    it('audits refused attempts at most once a minute per address (the counters still see every one)', () => {
      const failed = listAudit(hub.db, { limit: 500 }).filter((r) => r.event === 'ingest.auth-failed');
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(failed.length).toBeLessThan(BLOCK_CREDENTIAL_FAILURES);
      for (const row of failed) expect(row).toMatchObject({ actorKind: 'anonymous', outcome: 'denied' });
    });
  });
});

describe('ingest scaffold: owner bearer session on the management routes', () => {
  it('lists with an owner bearer, and a device token there is a 403 like every owner route', async () => {
    const h = await startIngestHub();
    try {
      const bearer = await h.ownerBearer();
      const list = await h.call('GET', '/admin/ingest-tokens', { bearer });
      expect([list.status, Array.isArray(list.json.tokens)]).toEqual([200, true]);
      const deviceToken = await h.deviceToken();
      expect((await h.call('GET', '/admin/ingest-tokens', { bearer: deviceToken })).status).toBe(403);
    } finally { await h.close(); }
  });
});
