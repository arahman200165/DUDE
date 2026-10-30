import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HubProvisioningResponse } from '@dude/contracts/hub';
import { checkProvisioning, provision } from '../provisioning/index.js';
import { cleanRoots, engineOptions, tempPaths } from '../provisioning/provisioning-fixture.js';
import { createSecretStore } from '../secrets/secret-store.js';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

const paths = tempPaths('route');
const SECRET = 'tunnel-token-VALUE-must-never-appear';

/** `GET /api/v1/provisioning`: the owner's read-only per-component status (PD-118, PD-153). */
describe('GET /provisioning', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    createSecretStore({ secretsDir: paths.secretsDir, platform: 'linux' }).put('tunnel.connectorToken', SECRET);
    h = await startAuthHub({ provisioning: { status: () => checkProvisioning(paths, engineOptions({ hubInstanceId: 'hub-a' })) } });
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); cleanRoots(); });
  afterEach(() => undefined);

  it('reports components, presence-only secrets and copyable commands matching the contract, uncached, with no value or path', async () => {
    const res = await h.call('GET', '/provisioning', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(HubProvisioningResponse, res.json)).toBe(true);
    expect(res.json.components.map((c: { id: string }) => c.id)).toEqual(['content-store', 'fts', 'vector', 'blob-store', 'cache', 'queue', 'workers', 'secrets', 'tunnel', 'oidc', 'power']);
    expect(res.json.commands).toEqual(['dude-hub provision', 'dude-hub provision status']);
    expect(res.json.secrets.find((s: { purpose: string }) => s.purpose === 'tunnel.connectorToken')).toEqual({ purpose: 'tunnel.connectorToken', present: true, needsReentry: false });
    expect(res.raw.body).not.toContain(SECRET);
    expect(res.raw.body).not.toContain(paths.root);
    expect(res.raw.body).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it('is owner-only: anonymous is 401, a device token is refused, a bearer owner session works', async () => {
    expect((await h.call('GET', '/provisioning')).status).toBe(401);
    expect((await h.call('GET', '/provisioning', { cookie: 'not-a-session' })).status).toBe(401);
    const { token } = await enrolled(h, owner);
    expect((await h.call('GET', '/provisioning', { bearer: token, noOrigin: true })).status).toBe(403);
    const bearer = await h.call('POST', '/auth/owner/bearer', { bearer: token, noOrigin: true, body: { password: PASSWORD } });
    expect((await h.call('GET', '/provisioning', { bearer: bearer.json.accessToken as string, noOrigin: true })).status).toBe(200);
  });

  it('writes no audit event for a read and has no mutating sibling', async () => {
    const count = () => Number((h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n);
    const before = count();
    await h.call('GET', '/provisioning', { cookie: owner.cookie });
    expect(count()).toBe(before);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await h.call(method, '/provisioning', { cookie: owner.cookie, csrf: owner.csrf, body: {} });
      expect(res.status, method).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('GET /provisioning without a provisioning read model', () => {
  it('reports not-provisioned with the commands and no components', async () => {
    const h = await startAuthHub();
    try {
      const owner = await h.signIn();
      const res = await h.call('GET', '/provisioning', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect(Value.Check(HubProvisioningResponse, res.json)).toBe(true);
      expect(res.json).toMatchObject({ overall: 'not-provisioned', lastRun: null, components: [], secrets: [], commands: ['dude-hub provision', 'dude-hub provision status'] });
    } finally {
      await h.close();
    }
  });

  it('degrades to the same report when the check throws', async () => {
    const h = await startAuthHub({ provisioning: { status: () => Promise.reject(new Error('C:\\secret\\path failed')) } });
    try {
      const owner = await h.signIn();
      const res = await h.call('GET', '/provisioning', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect(res.json.overall).toBe('not-provisioned');
      expect(res.raw.body).not.toContain('path failed');
    } finally {
      await h.close();
    }
  });
});
