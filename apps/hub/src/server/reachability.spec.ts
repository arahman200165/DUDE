import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { ReachabilityEchoResponse } from '@dude/contracts/hub';
import { parseHubConfig } from '../config/hub-config.js';
import { readReachability } from '../diagnostics/reachability.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

const PUBLIC = 'https://hub.example.com';

describe('GET /reachability/echo (proxy mode)', () => {
  let h: AuthHub;
  let owner: Signed;
  let deviceToken: string;
  beforeAll(async () => {
    h = await startAuthHub({ config: parseHubConfig({ exposure: { names: ['hub.example.com'], proxy: { trusted: ['127.0.0.1'], publicOrigin: PUBLIC } } }) });
    owner = await h.signIn();
    deviceToken = (await enrolled(h, owner)).token;
  });
  afterAll(async () => { await h.close(); });

  const db = () => h.hub.hub.db;
  const via = (ip: string, host = 'hub.example.com') => ({ headers: { origin: PUBLIC, host: `localhost:${h.hub.port}`, 'x-forwarded-for': ip, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } });
  const events = () => db().prepare("SELECT actor_kind, detail_json FROM audit_events WHERE event = 'network.reachability-verified' ORDER BY seq").all() as { actor_kind: string; detail_json: string }[];

  it('requires a credential', async () => {
    expect((await h.call('GET', '/reachability/echo', via('203.0.113.9'))).status).toBe(401);
  });

  it('records nothing for a private address and never returns the address', async () => {
    const res = await h.call('GET', '/reachability/echo', { cookie: owner.cookie, ...via('192.168.1.20') });
    expect(res.status).toBe(200);
    expect(Value.Check(ReachabilityEchoResponse, res.json)).toBe(true);
    expect(res.json).toMatchObject({ verified: false, observed: { scope: 'private', viaProxy: true }, hostMatchesConfiguredName: true });
    expect(res.raw.body).not.toContain('192.168.1.20');
    expect(readReachability(db(), h.clock.t)).toBeNull();
    expect(events()).toHaveLength(0);
  });

  it('a host the Hub does not serve is refused and records nothing', async () => {
    const res = await h.call('GET', '/reachability/echo', { cookie: owner.cookie, ...via('203.0.113.9', 'hub.example.com:8443') });
    // The Host guard rejects a name the Hub does not serve before the route runs.
    expect(res.status).toBe(421);
    expect(readReachability(db(), h.clock.t)).toBeNull();
  });

  it('a device token is accepted, verifies, stores the meta record and audits once; a fresh record suppresses a second audit', async () => {
    const res = await h.call('GET', '/reachability/echo', { bearer: deviceToken, noOrigin: true, headers: { ...via('203.0.113.9').headers } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ verified: true, observed: { scope: 'public', viaProxy: true }, host: 'hub.example.com' });
    expect(res.raw.body).not.toContain('203.0.113.9');
    expect(readReachability(db(), h.clock.t)).toMatchObject({ host: 'hub.example.com' });
    expect(events()).toHaveLength(1);
    expect(events()[0]?.actor_kind).toBe('device');
    expect(JSON.parse(events()[0]!.detail_json)).toEqual({ host: 'hub.example.com', viaProxy: true });

    h.clock.t += 3600_000;
    const again = await h.call('GET', '/reachability/echo', { cookie: owner.cookie, ...via('203.0.113.10') });
    expect(again.json.verified).toBe(true);
    expect(events()).toHaveLength(1);
    expect(readReachability(db(), h.clock.t)?.ageMs).toBe(0);

    h.clock.t += 2 * 24 * 3600_000;
    const later = await h.signIn();
    const third = await h.call('GET', '/reachability/echo', { cookie: later.cookie, ...via('203.0.113.10') });
    expect(third.status).toBe(200);
    expect(events()).toHaveLength(2);
    expect(events()[1]?.actor_kind).toBe('owner');
  });

  it('a device token gains no owner rights', async () => {
    expect((await h.call('GET', '/diagnostics', { bearer: deviceToken, noOrigin: true, headers: via('203.0.113.9').headers })).status).toBe(403);
  });
});

describe('GET /reachability/echo (direct mode)', () => {
  let h: AuthHub;
  beforeAll(async () => { h = await startAuthHub(); });
  afterAll(async () => { await h.close(); });

  it('a loopback caller proves nothing', async () => {
    const owner = await h.signIn();
    const res = await h.call('GET', '/reachability/echo', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ verified: false, observed: { scope: 'loopback', viaProxy: false } });
    expect(readReachability(h.hub.hub.db, h.clock.t)).toBeNull();
  });
});
