import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Value } from 'typebox/value';
import { HubDiagnosticsReport } from '@dude/contracts/hub';
import { createSession } from '../auth/sessions.js';
import { ensureSetupToken } from '../auth/setup-token.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

// The route's host facts use the real `defaultExec` unless injected; a scripted one keeps the suite off netsh/sc.exe.
const scripted = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../service/common.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service/common.js')>()),
  defaultExec: (file: string, args: readonly string[]) => {
    scripted.calls.push(`${file} ${args[0]}`);
    return Promise.resolve({ stdout: '', stderr: '', code: 1 });
  },
}));

describe('GET /diagnostics', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  it('requires the owner: anonymous 401, device token 403', async () => {
    expect((await h.call('GET', '/diagnostics')).status).toBe(401);
    const device = await enrolled(h, owner);
    const res = await h.call('GET', '/diagnostics', { bearer: device.token, noOrigin: true });
    expect(res.status).toBe(403);
  });

  it('returns a schema-valid, no-store, redacted report and audits the view without detail', async () => {
    const res = await h.call('GET', '/diagnostics', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(HubDiagnosticsReport, res.json)).toBe(true);
    expect(res.json.hubVersion).toBe('test');
    expect(res.json.service.mode).toBe('foreground');
    expect(res.json.certificate.source).toBe('self-signed');
    expect(res.json.checks.find((c: { id: string }) => c.id === 'authentication-active')).toMatchObject({ status: 'pass', basis: 'verified' });
    expect(res.json.checks.find((c: { id: string }) => c.id === 'external-reachability').basis).toBe('not-checked');

    const token = ensureSetupToken(h.hub.hub.db, h.hub.paths.configDir, h.clock.t);
    for (const secret of ['PRIVATE KEY', 'BEGIN CERTIFICATE', owner.csrf, owner.cookie, token ?? 'no-token']) expect(res.raw.body).not.toContain(secret);

    const audit = await h.call('GET', '/audit', { cookie: owner.cookie });
    const viewed = audit.json.events.filter((e: { event: string }) => e.event === 'hub.diagnostics-viewed');
    expect(viewed.length).toBeGreaterThan(0);
    expect(viewed[0].detail).toBeNull();
  });

  it('works with an owner bearer session and caches host facts between requests', async () => {
    const created = createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'bearer', deviceId: 'device-1', now: h.clock.t });
    const before = scripted.calls.length;
    const res = await h.call('GET', '/diagnostics', { bearer: created.token });
    expect(res.status).toBe(200);
    await h.call('GET', '/diagnostics', { bearer: created.token });
    expect(scripted.calls.length).toBe(before); // facts were cached by the earlier request (60 s TTL)
  });
});
