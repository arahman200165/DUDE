import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { FLOOD_POLICY, GLOBAL_POLICY, READ_POLICY, createRateLimiter, registerRateLimit, withPrincipalLimit } from './rate-limit.js';
import { trustProxyFor } from './trusted-proxy.js';
import { startAuthHub } from '../server/auth-test-helpers.js';

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

/** A bare app: a stub authenticator reads the principal from `x-principal`; no network, `remoteAddress` plays the peer. */
async function build(trusted?: string[]): Promise<FastifyInstance> {
  const now = (): number => 1_000_000;
  const limiter = createRateLimiter({
    now,
    global: { perMinute: 60, burst: 3 },
    auth: { perMinute: 60, burst: 2 },
    read: { perMinute: 60, burst: 5 },
    flood: { perMinute: 60, burst: 8 },
  });
  const app = Fastify({ trustProxy: trustProxyFor(trusted) });
  apps.push(app);
  registerRateLimit(app, limiter);
  const requirePrincipal = withPrincipalLimit(
    limiter,
    async (req, reply) => {
      const id = req.headers['x-principal'];
      if (typeof id !== 'string') return reply.code(401).send({ error: 'no' });
      (req as unknown as { who: string }).who = id;
      return undefined;
    },
    (req) => `owner:${(req as unknown as { who: string }).who}`,
  );
  app.get('/api/v1/private', { preHandler: requirePrincipal }, async () => ({ ok: true }));
  app.get('/api/v1/web/files', { preHandler: requirePrincipal }, async () => ({ ok: true }));
  app.get('/api/v1/sync/changes', { preHandler: requirePrincipal }, async () => ({ ok: true }));
  app.post('/api/v1/sign-in', { config: { authLimited: true } }, async () => ({ ok: true }));
  app.get('/api/v1/open', async () => ({ ok: true }));
  app.get('/index.html', async () => 'page');
  await app.ready();
  return app;
}

const hit = async (app: FastifyInstance, url: string, remoteAddress: string, headers: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET'): Promise<number> =>
  (await app.inject({ method, url, remoteAddress, headers: { ...(headers['x-principal'] !== undefined ? { authorization: 'Bearer test' } : {}), ...headers } })).statusCode;

describe('rate limiter policies', () => {
  it('ships the PD-061 defaults', () => {
    expect(GLOBAL_POLICY).toEqual({ perMinute: 300, burst: 60 });
    expect(READ_POLICY).toEqual({ perMinute: 600, burst: 120 });
    expect(FLOOD_POLICY).toEqual({ perMinute: 1200, burst: 240 });
  });
});

describe('per-principal limits', () => {
  it('two principals behind one address do not share a bucket', async () => {
    const app = await build();
    const ip = '198.51.100.1';
    for (let i = 0; i < 3; i++) expect(await hit(app, '/api/v1/private', ip, { 'x-principal': 'a' })).toBe(200);
    expect(await hit(app, '/api/v1/private', ip, { 'x-principal': 'a' })).toBe(429);
    for (let i = 0; i < 3; i++) expect(await hit(app, '/api/v1/private', ip, { 'x-principal': 'b' })).toBe(200);
  });

  it('one principal shares its bucket across addresses', async () => {
    const app = await build();
    expect(await hit(app, '/api/v1/private', '198.51.100.1', { 'x-principal': 'a' })).toBe(200);
    expect(await hit(app, '/api/v1/private', '198.51.100.2', { 'x-principal': 'a' })).toBe(200);
    expect(await hit(app, '/api/v1/private', '198.51.100.3', { 'x-principal': 'a' })).toBe(200);
    expect(await hit(app, '/api/v1/private', '198.51.100.4', { 'x-principal': 'a' })).toBe(429);
    expect(await hit(app, '/api/v1/private', '198.51.100.4', { 'x-principal': 'c' })).toBe(200);
  });

  it('web read routes and sync changes use the higher read bucket; other routes keep the global one', async () => {
    const app = await build();
    const ip = '198.51.100.1';
    for (let i = 0; i < 5; i++) expect(await hit(app, '/api/v1/web/files?x=1', ip, { 'x-principal': 'a' })).toBe(200);
    expect(await hit(app, '/api/v1/web/files', ip, { 'x-principal': 'a' })).toBe(429);
    for (let i = 0; i < 5; i++) expect(await hit(app, '/api/v1/sync/changes', '198.51.100.9', { 'x-principal': 'b' })).toBe(200);
    expect(await hit(app, '/api/v1/sync/changes', '198.51.100.9', { 'x-principal': 'b' })).toBe(429);
    // The read bucket is separate from the principal's global bucket.
    expect(await hit(app, '/api/v1/private', ip, { 'x-principal': 'a' })).toBe(200);
  });

  it('a failed authentication is not metered per principal', async () => {
    const app = await build();
    for (let i = 0; i < 6; i++) expect(await hit(app, '/api/v1/private', '198.51.100.1', { authorization: 'Bearer bad' })).toBe(401);
  });
});

describe('per-address limits', () => {
  it('authLimited routes use the strict bucket per address; other addresses are unaffected', async () => {
    const app = await build();
    expect(await hit(app, '/api/v1/sign-in', '198.51.100.1', {}, 'POST')).toBe(200);
    expect(await hit(app, '/api/v1/sign-in', '198.51.100.1', {}, 'POST')).toBe(200);
    expect(await hit(app, '/api/v1/sign-in', '198.51.100.1', {}, 'POST')).toBe(429);
    expect(await hit(app, '/api/v1/sign-in', '198.51.100.2', {}, 'POST')).toBe(200);
  });

  it('credential-less requests share the global bucket per address', async () => {
    const app = await build();
    for (let i = 0; i < 3; i++) expect(await hit(app, '/api/v1/open', '198.51.100.1')).toBe(200);
    expect(await hit(app, '/api/v1/open', '198.51.100.1')).toBe(429);
    expect(await hit(app, '/api/v1/open', '198.51.100.2')).toBe(200);
  });

  it('the flood guard caps all API traffic from one address, whatever the principals, and ignores non-API paths', async () => {
    const app = await build();
    const ip = '198.51.100.1';
    for (let i = 0; i < 8; i++) expect(await hit(app, '/api/v1/private', ip, { 'x-principal': `p${i}` })).toBe(200);
    expect(await hit(app, '/api/v1/private', ip, { 'x-principal': 'p99' })).toBe(429);
    expect(await hit(app, '/api/v1/private', '198.51.100.2', { 'x-principal': 'p99' })).toBe(200);
    expect(await hit(app, '/index.html', ip)).toBe(200);
  });
});

describe('client address behind a proxy', () => {
  it('a trusted proxy peer: X-Forwarded-For selects the bucket', async () => {
    const app = await build(['127.0.0.1']);
    for (let i = 0; i < 2; i++) expect(await hit(app, '/api/v1/sign-in', '127.0.0.1', { 'x-forwarded-for': '203.0.113.5' }, 'POST')).toBe(200);
    expect(await hit(app, '/api/v1/sign-in', '127.0.0.1', { 'x-forwarded-for': '203.0.113.5' }, 'POST')).toBe(429);
    expect(await hit(app, '/api/v1/sign-in', '127.0.0.1', { 'x-forwarded-for': '203.0.113.6' }, 'POST')).toBe(200);
    // Only the entry the trusted proxy appended counts; a forged leading entry does not pick a fresh bucket.
    expect(await hit(app, '/api/v1/sign-in', '127.0.0.1', { 'x-forwarded-for': '10.1.1.1, 203.0.113.5' }, 'POST')).toBe(429);
  });

  it('an untrusted peer: X-Forwarded-For is ignored, so rotating it does not evade the limit', async () => {
    const app = await build(['10.0.0.1']);
    const results: number[] = [];
    for (let i = 0; i < 4; i++) results.push(await hit(app, '/api/v1/sign-in', '198.51.100.77', { 'x-forwarded-for': `203.0.113.${i}` }, 'POST'));
    expect(results).toEqual([200, 200, 429, 429]);
  });

  it('without a proxy configured, X-Forwarded-For is ignored', async () => {
    const app = await build();
    const results: number[] = [];
    for (let i = 0; i < 3; i++) results.push(await hit(app, '/api/v1/sign-in', '198.51.100.77', { 'x-forwarded-for': `203.0.113.${i}` }, 'POST'));
    expect(results).toEqual([200, 200, 429]);
  });
});

describe('wired into the Hub', () => {
  it('meters an authenticated owner per session, not per address', async () => {
    const h = await startAuthHub({ rateLimit: { global: { perMinute: 60, burst: 40 } } });
    try {
      const first = await h.signIn();
      const second = await h.signIn();
      let limited = 0;
      for (let i = 0; i < 45; i++) {
        const res = await h.call('GET', '/devices', { cookie: first.cookie });
        if (res.status === 429) limited += 1;
      }
      expect(limited).toBeGreaterThan(0);
      // Another session from the same address still has its own bucket.
      expect((await h.call('GET', '/devices', { cookie: second.cookie })).status).toBe(200);
    } finally {
      await h.close();
    }
  });
});
