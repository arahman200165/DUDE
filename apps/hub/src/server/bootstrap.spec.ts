import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { BootstrapResponse, HUB_API_PREFIX, HelloResponse } from '@dude/contracts/hub';
import { request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';
import { ensureSetupToken, setupTokenFile } from '../auth/setup-token.js';
import { verifyPassword } from '../auth/password.js';
import { buildAdminMethods } from '../admin/methods.js';
import { AdminError } from '../admin/admin-endpoint.js';
import { listAudit } from '../security/audit.js';

const CHEAP = { v: 1, m: 64, t: 1, p: 1, len: 32 } as const;
const PASSWORD = 'a very long password';

describe('POST /bootstrap', () => {
  let hub: TestHub;
  let token: string;
  beforeAll(async () => {
    hub = await startTestHub({}, { passwordParams: CHEAP, rateLimit: { auth: { perMinute: 6000, burst: 1000 } } });
    token = ensureSetupToken(hub.hub.db, hub.paths.configDir, Date.now())!;
  });
  afterAll(async () => { await hub.close(); });

  const post = (body: unknown) =>
    request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/bootstrap`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: `https://localhost:${hub.port}`, host: `localhost:${hub.port}` },
    });
  const good = (over: Record<string, unknown> = {}) => ({ setupToken: token, ownerDisplayName: 'Ada', environmentName: 'Home', password: PASSWORD, ...over });
  const hello = async () => JSON.parse((await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`)).body) as HelloResponse;

  it('requires an Origin header', async () => {
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/bootstrap`, {
      method: 'POST', body: JSON.stringify(good()), headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });

  it('exposes the setup token through the admin method until bootstrap', async () => {
    const methods = buildAdminMethods({
      db: hub.hub.db, hubVersion: 't', hubInstanceId: hub.hub.hubInstanceId, bind: 'loopback', getPort: () => hub.port, startedAt: 0,
      configDir: hub.paths.configDir, spkiSha256: hub.tls.spkiSha256,
    });
    expect(await methods['setup.token']!({})).toEqual({ token, purpose: 'bootstrap', spkiSha256: hub.tls.spkiSha256, port: hub.port, hubInstanceId: hub.hub.hubInstanceId });
    const hubBefore = await hello();
    expect(hubBefore.bootstrapped).toBe(false);
  });

  it('rejects bad tokens, audits without the token and locks out after repeated failures', async () => {
    const wrong = 'A'.repeat(43);
    for (let i = 0; i < 6; i++) expect((await post(good({ setupToken: wrong }))).status).toBe(401);
    const locked = await post(good({ setupToken: wrong }));
    expect(locked.status).toBe(423);
    expect(locked.headers['retry-after']).toBeDefined();
    // even the correct token is refused while locked
    expect((await post(good())).status).toBe(423);
    const rows = listAudit(hub.hub.db, { limit: 50 }).filter((r) => r.event === 'auth.failure');
    expect(rows.length).toBe(6);
    expect(rows[0]).toMatchObject({ actorKind: 'anonymous', outcome: 'failure', detail: { kind: 'setup-token' } });
    const dump = JSON.stringify(hub.hub.db.prepare('SELECT * FROM audit_events').all());
    expect(dump).not.toContain(wrong);
    expect(dump).not.toContain(token);
    // reset the lockout for the following tests
    hub.hub.db.prepare('DELETE FROM throttle').run();
  });

  it('validates the password policy', async () => {
    const res = await post(good({ password: ' '.repeat(14) }));
    expect(res.status).toBe(400);
    expect(res.body).toContain('blank');
    expect((await hello()).bootstrapped).toBe(false);
  });

  it('bootstraps the owner, flips hello and removes the setup-token file', async () => {
    expect(existsSync(setupTokenFile(hub.paths.configDir))).toBe(true);
    const res = await post(good());
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = JSON.parse(res.body) as BootstrapResponse;
    expect(Value.Check(BootstrapResponse, body)).toBe(true);
    expect(body.recoveryCodes).toHaveLength(10);

    const h = await hello();
    expect(h.bootstrapped).toBe(true);
    expect(h.environmentId).toBe(body.environmentId);
    expect(existsSync(setupTokenFile(hub.paths.configDir))).toBe(false);

    const cred = hub.hub.db.prepare('SELECT params_json, salt, hash FROM owner_credentials WHERE owner_id = ?').get(body.ownerId) as {
      params_json: string; salt: Uint8Array; hash: Uint8Array;
    };
    expect(await verifyPassword(PASSWORD, { paramsJson: cred.params_json, salt: Buffer.from(cred.salt), hash: Buffer.from(cred.hash) })).toBe(true);
    expect(hub.hub.db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get()).toEqual({ n: 10 });
    const event = listAudit(hub.hub.db, { limit: 5 }).find((r) => r.event === 'hub.bootstrap');
    expect(event).toMatchObject({ actorKind: 'system', outcome: 'success', detail: { ownerId: body.ownerId } });
    expect(JSON.stringify(event)).not.toContain(body.recoveryCodes[0]!);
  });

  it('refuses a second bootstrap and the admin token method', async () => {
    expect((await post(good())).status).toBe(409);
    const methods = buildAdminMethods({
      db: hub.hub.db, hubVersion: 't', hubInstanceId: hub.hub.hubInstanceId, bind: 'loopback', getPort: () => hub.port, startedAt: 0,
      configDir: hub.paths.configDir, spkiSha256: hub.tls.spkiSha256,
    });
    await expect(Promise.resolve().then(() => methods['setup.token']!({}))).rejects.toMatchObject({ code: 'already-bootstrapped' });
    await expect(Promise.resolve().then(() => methods['setup.token']!({}))).rejects.toBeInstanceOf(AdminError);
  });
});
