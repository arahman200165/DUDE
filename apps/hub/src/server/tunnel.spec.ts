import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_TUNNEL_DISCLOSURE, HubTunnelStatusResponse } from '@dude/contracts/hub';
import type { HubTunnelStatusResponse as TunnelStatus } from '@dude/contracts/hub';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

const SECRET = 'connector-token-VALUE-must-never-appear';
const status = (over: Partial<TunnelStatus> = {}): TunnelStatus => ({
  configured: true, enabled: true, hostname: 'notes.example.com', supported: true, state: 'ready', ready: true, tokenPresent: true, restarts: 1, lastError: null,
  startedAt: '2026-10-27T10:00:00.000Z', lastReadyAt: '2026-10-27T10:00:05.000Z',
  dashboard: { hostname: 'notes.example.com', service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null },
  disclosure: [...HUB_TUNNEL_DISCLOSURE], logTail: [{ at: '2026-10-27T10:00:05.000Z', stream: 'stderr', text: 'Registered tunnel connection' }], ...over,
});

/** `GET /api/v1/tunnel`: the owner's read-only tunnel status (PD-142, PD-143, Milestone 837). */
describe('GET /tunnel', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub({ tunnel: { status: () => status(), facts: () => ({ enabled: true, hostname: 'notes.example.com', tokenPresent: true, supported: true, connector: null }) } });
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  it('returns the model matching the contract, uncached, with the disclosure and no secret', async () => {
    const res = await h.call('GET', '/tunnel', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(HubTunnelStatusResponse, res.json)).toBe(true);
    expect(res.json).toMatchObject({ state: 'ready', hostname: 'notes.example.com', tokenPresent: true, dashboard: { service: 'https://127.0.0.1:47600', noTlsVerify: true } });
    expect(res.json.disclosure).toEqual([...HUB_TUNNEL_DISCLOSURE]);
    expect(res.raw.body).not.toContain(SECRET);
    expect(res.raw.body).not.toMatch(/TUNNEL_TOKEN|eyJ/);
  });

  it('is owner-only: anonymous is 401, a device token is refused, a bearer owner session works', async () => {
    expect((await h.call('GET', '/tunnel')).status).toBe(401);
    expect((await h.call('GET', '/tunnel', { cookie: 'not-a-session' })).status).toBe(401);
    const { token } = await enrolled(h, owner);
    expect((await h.call('GET', '/tunnel', { bearer: token, noOrigin: true })).status).toBe(403);
    const bearer = await h.call('POST', '/auth/owner/bearer', { bearer: token, noOrigin: true, body: { password: PASSWORD } });
    expect((await h.call('GET', '/tunnel', { bearer: bearer.json.accessToken as string, noOrigin: true })).status).toBe(200);
  });

  it('writes no audit event for a read and has no mutating sibling: nothing over HTTP can change exposure or store a token', async () => {
    const count = () => Number((h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n);
    const before = count();
    await h.call('GET', '/tunnel', { cookie: owner.cookie });
    expect(count()).toBe(before);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const suffix of ['', '/on', '/off', '/token']) {
        const res = await h.call(method, `/tunnel${suffix}`, { cookie: owner.cookie, csrf: owner.csrf, ...(method === 'DELETE' ? {} : { body: { connectorToken: SECRET, hostname: 'x.example.com' } }) });
        expect(res.status, `${method} ${suffix}`).toBeGreaterThanOrEqual(400);
      }
    }
    expect(count()).toBe(before);
  });
});

describe('GET /tunnel without a tunnel runtime', () => {
  it('reports the tunnel as not configured with the disclosure', async () => {
    const h = await startAuthHub();
    try {
      const owner = await h.signIn();
      const res = await h.call('GET', '/tunnel', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect(Value.Check(HubTunnelStatusResponse, res.json)).toBe(true);
      expect(res.json).toMatchObject({ configured: false, enabled: false, state: 'not-configured', tokenPresent: false, dashboard: null, logTail: [] });
      expect(res.json.disclosure).toEqual([...HUB_TUNNEL_DISCLOSURE]);
    } finally {
      await h.close();
    }
  });

  it('survives a read model that throws', async () => {
    const h = await startAuthHub({ tunnel: { status: () => { throw new Error('boom'); }, facts: () => ({ enabled: false, hostname: null, tokenPresent: false, supported: true, connector: null }) } });
    try {
      const owner = await h.signIn();
      const res = await h.call('GET', '/tunnel', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect(res.json.state).toBe('not-configured');
    } finally {
      await h.close();
    }
  });
});
