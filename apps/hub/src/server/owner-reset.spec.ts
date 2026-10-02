import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { OwnerResetResponse } from '@dude/contracts/hub';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub } from './auth-test-helpers.js';
import { buildAdminMethods } from '../admin/methods.js';
import { AdminError } from '../admin/admin-endpoint.js';
import { setupTokenFile } from '../auth/setup-token.js';
import { listAudit } from '../security/audit.js';
import { parseArgs } from '../cli/args.js';
import { runOwnerReset } from '../cli/owner-reset.js';

describe('local owner reset', () => {
  let h: AuthHub;
  let methods: ReturnType<typeof buildAdminMethods>;
  const revokedByAdmin: string[] = [];
  beforeAll(async () => {
    h = await startAuthHub();
    methods = buildAdminMethods({
      db: h.hub.hub.db, hubVersion: 't', hubInstanceId: h.hub.hub.hubInstanceId, bind: 'loopback', getPort: () => h.hub.port, startedAt: 0,
      configDir: h.hub.paths.configDir, spkiSha256: h.hub.tls.spkiSha256, now: () => h.clock.t,
      onSessionsRevoked: (s) => revokedByAdmin.push(...s.map((x) => x.sessionId)),
    });
  });
  afterAll(async () => { await h.close(); });

  const reset = (token: string, newPassword = 'reset password 123') => h.call('POST', '/owner/reset', { body: { resetToken: token, newPassword } });

  it('refuses /owner/reset while no reset is pending', async () => {
    expect((await reset('A'.repeat(43))).status).toBe(409);
  });

  it('parses the CLI arguments', () => {
    expect(parseArgs(['owner', 'reset'])).toEqual({ command: 'owner-reset' });
    expect(parseArgs(['owner', 'reset', '--data-dir', 'x', '--confirm=tok'])).toEqual({ command: 'owner-reset', dataDir: 'x', confirm: 'tok' });
    expect(() => parseArgs(['owner'])).toThrow();
    expect(() => parseArgs(['owner', 'reset', '--bogus'])).toThrow();
  });

  it('previews without changing anything and refuses apply without a preview', async () => {
    const s = await h.signIn();
    const db = h.hub.hub.db;
    db.prepare(
      `INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
       SELECT 'dev-1', environment_id, 'Laptop', 'win32', '1', '{}', 1, 1, ? FROM environment`,
    ).run(new Date(h.clock.t).toISOString());
    const preview = (await methods['owner.reset.preview']!({})) as { confirmToken: string; summary: { sessions: number; devices: number } };
    expect(preview.summary.devices).toBe(1);
    expect(preview.summary.sessions).toBeGreaterThanOrEqual(1);
    expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get()).toEqual({ n: 10 });
    expect(existsSync(setupTokenFile(h.hub.paths.configDir))).toBe(false);

    await expect(Promise.resolve().then(() => methods['owner.reset.apply']!({ confirmToken: 'nope' }))).rejects.toMatchObject({ code: 'confirmation-required' });
    await expect(Promise.resolve().then(() => methods['owner.reset.apply']!({}))).rejects.toBeInstanceOf(AdminError);
    // the preview token was not consumed by unrelated failures, but is single-use once tried
    expect((await h.call('GET', '/sessions', { cookie: s.cookie })).status).toBe(200);
  });

  it('applies: kills sessions, deletes recovery codes, writes the reset token, keeps devices; then /owner/reset completes it', async () => {
    const db = h.hub.hub.db;
    const old = await h.signIn();
    const deviceRows = JSON.stringify(db.prepare('SELECT * FROM devices').all());
    const ownerRow = JSON.stringify(db.prepare('SELECT owner_id, environment_id FROM owner').all());

    const preview = (await methods['owner.reset.preview']!({})) as { confirmToken: string };
    const applied = (await methods['owner.reset.apply']!({ confirmToken: preview.confirmToken })) as { token: string; purpose: string };
    expect(applied.purpose).toBe('owner-reset');
    expect(revokedByAdmin.length).toBeGreaterThanOrEqual(1);
    expect(readFileSync(setupTokenFile(h.hub.paths.configDir), 'utf8').trim()).toBe(applied.token);
    expect((await h.call('GET', '/sessions', { cookie: old.cookie })).status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get()).toEqual({ n: 0 });
    expect(JSON.stringify(db.prepare('SELECT * FROM devices').all())).toBe(deviceRows);
    expect(JSON.stringify(db.prepare('SELECT owner_id, environment_id FROM owner').all())).toBe(ownerRow);
    const event = listAudit(db, { limit: 10 }).find((r) => r.event === 'owner.reset-local');
    expect(event).toMatchObject({ actorKind: 'cli', outcome: 'success' });
    expect(JSON.stringify(db.prepare('SELECT * FROM audit_events').all())).not.toContain(applied.token);

    // replay of the confirm token fails; setup.token reports the pending reset with its purpose
    await expect(Promise.resolve().then(() => methods['owner.reset.apply']!({ confirmToken: preview.confirmToken }))).rejects.toMatchObject({ code: 'confirmation-required' });
    expect(await methods['setup.token']!({})).toMatchObject({ token: applied.token, purpose: 'owner-reset' });

    // a wrong token is rejected and audited without the token; a bootstrap-style 43-char guess is not the reset token
    const wrong = 'B'.repeat(43);
    expect((await reset(wrong)).status).toBe(401);
    expect(JSON.stringify(db.prepare('SELECT * FROM audit_events').all())).not.toContain(wrong);
    expect((await reset(applied.token, 'short')).status).toBe(400);

    const done = await reset(applied.token);
    expect(done.status).toBe(200);
    expect(Value.Check(OwnerResetResponse, done.json)).toBe(true);
    expect(existsSync(setupTokenFile(h.hub.paths.configDir))).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL').get()).toEqual({ n: 10 });
    expect((await reset(applied.token)).status).toBe(409); // consumed
    await expect(Promise.resolve().then(() => methods['setup.token']!({}))).rejects.toMatchObject({ code: 'already-bootstrapped' });

    expect((await h.call('POST', '/auth/sign-in', { body: { password: PASSWORD } })).status).toBe(401);
    expect((await h.call('POST', '/auth/sign-in', { body: { password: 'reset password 123' } })).status).toBe(200);
    expect(JSON.stringify(db.prepare('SELECT * FROM devices').all())).toBe(deviceRows);
  });

  it('digest change between preview and apply is a conflict', async () => {
    const preview = (await methods['owner.reset.preview']!({})) as { confirmToken: string };
    await h.signIn('reset password 123'); // a session appears
    await expect(Promise.resolve().then(() => methods['owner.reset.apply']!({ confirmToken: preview.confirmToken }))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('the CLI prints a preview, then applies with the confirm token', async () => {
    const out: string[] = [];
    const calls: Array<{ method: string; params: unknown }> = [];
    const call = async (_dir: string, method: string, params: unknown) => {
      calls.push({ method, params });
      return method === 'owner.reset.preview' ? { confirmToken: 'tok', summary: { sessions: 1, devices: 0 } } : { token: 'reset', purpose: 'owner-reset' };
    };
    expect(await runOwnerReset({ dataDir: 'x' }, { stdout: (t) => out.push(t), stderr: () => {}, call })).toBe(0);
    expect(await runOwnerReset({ dataDir: 'x', confirm: 'tok' }, { stdout: (t) => out.push(t), stderr: () => {}, call })).toBe(0);
    expect(calls).toEqual([{ method: 'owner.reset.preview', params: {} }, { method: 'owner.reset.apply', params: { confirmToken: 'tok' } }]);
    expect(JSON.parse(out[1]!)).toMatchObject({ purpose: 'owner-reset' });
  });
});
