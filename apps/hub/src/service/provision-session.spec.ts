import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import type { Duplex } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { HUB_TUNNEL_PHRASE } from '@dude/contracts/hub';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { PROVISION_SESSION_OPS, PROVISION_SESSION_PIPE, runProvisionSession } from './provision-session.js';
import type { ProvisionSessionDeps } from './provision-session.js';
import { SESSION_DEVICE, SESSION_HOST, SESSION_PIPE, SESSION_TOKEN, sessionHarness } from './provision-session-fixture.js';
import { fixture } from './test-helpers.js';

const PASSPHRASE = 'correct horse battery staple 42';
const CLIENT_SECRET = 'GOCSPX-abcdefghijklmnop1234567890';
const SECRETS = [SESSION_TOKEN, PASSPHRASE, CLIENT_SECRET];

describe('provision session (elevated, driven by the desktop wizard)', () => {
  it('refuses a bad pipe name, a non-elevated terminal and a Hub that is not running, before connecting to anything', async () => {
    let connected = 0;
    const connect = async (): Promise<Duplex> => { connected += 1; return new PassThrough() as unknown as Duplex; };
    const f = fixture({ state: 'running', elevated: false });
    const deps: ProvisionSessionDeps = { ...f.deps, platform: 'win32', connect };
    expect(await runProvisionSession({ pipeName: '..\\evil', dataDir: f.dataDir }, deps)).toBe(2);
    expect(await runProvisionSession({ pipeName: SESSION_PIPE, dataDir: f.dataDir }, deps)).toBe(2);
    expect(f.err.join('')).toMatch(/elevated/);
    const g = fixture({ state: 'running', elevated: true });
    const down: ProvisionSessionDeps = { ...g.deps, platform: 'win32', connect, call: async () => { throw new AdminCallError(HUB_NOT_RUNNING, 'down'); } };
    expect(await runProvisionSession({ pipeName: SESSION_PIPE, dataDir: g.dataDir }, down)).toBe(2);
    expect(connected).toBe(0);
    expect(PROVISION_SESSION_PIPE.test(SESSION_PIPE)).toBe(true);
  });

  it('reads the status of every part in one operation, tolerating a part that cannot be read', async () => {
    const h = sessionHarness({ script: (m) => (m === 'power.status' ? new AdminCallError('unavailable', 'no') : undefined) });
    const answer = await h.ask('status');
    expect(answer.ok).toBe(true);
    expect(answer.result.provisioning.overall).toBe('ready');
    expect(answer.result.power).toBeNull();
    expect(answer.result.tunnel).toEqual({ configured: false, hostname: null, state: 'not-configured', tokenPresent: false, supported: true });
    expect(answer.result.backup).toEqual({ configured: false, intervalHours: null, destinations: 0, keyPresent: false });
    expect(JSON.stringify(answer)).not.toContain('logTail');
    await h.close();
  });

  it('serves only its closed list of operations, and refuses an unknown one or an unknown parameter without echoing it', async () => {
    const h = sessionHarness();
    const unknown = await h.ask('service.uninstall', { purge: true });
    expect(unknown).toMatchObject({ ok: false, error: { code: 'unknown-operation' } });
    expect(JSON.stringify(unknown)).not.toContain('service.uninstall');
    const extra = await h.ask('provision', { secrets: { x: PASSPHRASE } });
    expect(extra).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(JSON.stringify(extra)).not.toContain(PASSPHRASE);
    expect(h.adminCalls()).toEqual([]);
    expect([...PROVISION_SESSION_OPS]).toContain('tunnel-apply');
    expect((PROVISION_SESSION_OPS as readonly string[]).includes('tunnel-off')).toBe(false);
    await h.close();
  });

  it('answers malformed lines with a fixed error and keeps serving', async () => {
    const h = sessionHarness();
    h.toSession.write('not json\n');
    h.toSession.write('[]\n');
    // Answers arrive in order: the two refusals, then the status asked for.
    const replies = [await h.ask('status'), await h.ask('status'), await h.ask('status')];
    expect(replies.map((r) => r.ok)).toEqual([false, false, true]);
    expect(replies[0].error).toEqual({ code: 'bad-request', message: 'The request is not valid.' });
    await h.close();
  });

  it('runs provision, the Google client, the backup and the standby grant as one fixed admin call each, with the secrets only in the call parameters', async () => {
    const h = sessionHarness();
    expect((await h.ask('provision')).result).toMatchObject({ created: ['storage'], restartRequired: false });
    expect((await h.ask('oidc', { clientId: '1.apps.googleusercontent.com', clientSecret: CLIENT_SECRET, redirectOrigin: 'https://notes.example.com' })).result).toEqual({ configured: true, redirectOrigin: 'https://notes.example.com', restartRequired: true });
    const backup = await h.ask('backup', { folder: 'D:\\Backups', passphrase: PASSPHRASE, intervalHours: 24 });
    expect(backup.result).toEqual({ configured: true, intervalHours: 24, destinations: 1, destinationAdded: true });
    const preview = await h.ask('standby-preview', { deviceId: SESSION_DEVICE });
    expect(preview.result.confirmToken).toBe('tok-s');
    expect((await h.ask('standby-apply', { deviceId: SESSION_DEVICE, confirmToken: 'tok-s' })).result).toEqual({ granted: true, renewed: false });
    expect(h.adminCalls().map((c) => c.method)).toEqual(['provision.run', 'oidc.configure', 'backup.schedule.set', 'standby.grant.preview', 'standby.grant.apply']);
    expect(h.adminCalls()[1]!.params).toMatchObject({ clientSecret: CLIENT_SECRET });
    expect(h.adminCalls()[2]!.params).toEqual({ intervalHours: 24, folder: 'D:\\Backups', passphrase: PASSPHRASE });
    for (const bad of [{ folder: 'D:\\B', passphrase: PASSPHRASE, intervalHours: 0 }, { folder: 'D:\\B', passphrase: PASSPHRASE, intervalHours: 1.5 }, { passphrase: PASSPHRASE, intervalHours: 24 }]) {
      expect((await h.ask('backup', bad)).error.code).toBe('bad-request');
    }
    expect((await h.ask('standby-preview', { deviceId: 'not-a-uuid-not-a-uuid-not-a-uuid-xxxx' })).error.code).toBe('bad-request');
    await h.close();
  });

  it('never returns a value from a request in an answer: a failing call yields the Hub code and message only, anything else a fixed sentence', async () => {
    const h = sessionHarness({
      script: (m) => {
        if (m === 'backup.schedule.set') return new AdminCallError('bad-request', 'The backup passphrase must be at least 12 characters.');
        if (m === 'oidc.configure') return new Error(`boom ${CLIENT_SECRET}`);
        return undefined;
      },
    });
    const backup = await h.ask('backup', { folder: 'D:\\B', passphrase: PASSPHRASE, intervalHours: 24 });
    expect(backup).toEqual({ id: expect.any(Number), ok: false, error: { code: 'bad-request', message: 'The backup passphrase must be at least 12 characters.' } });
    const oidc = await h.ask('oidc', { clientId: '1.apps.googleusercontent.com', clientSecret: CLIENT_SECRET, redirectOrigin: 'https://notes.example.com' });
    expect(oidc).toEqual({ id: expect.any(Number), ok: false, error: { code: 'internal', message: 'The step failed.' } });
    expect(JSON.stringify([backup, oidc])).not.toContain(CLIENT_SECRET);
    await h.close();
  });

  it('ends when the pipe closes, and after the idle time with no request', async () => {
    const h = sessionHarness();
    await h.ask('status');
    expect(await h.close()).toBe(0);
    const idle = sessionHarness({ idleMs: 20 });
    expect(await idle.done).toBe(0);
  });

  it('shows no secret in anything it prints (standard output and error)', async () => {
    const h = sessionHarness();
    const preview = await h.ask('tunnel-preview', { hostname: SESSION_HOST, acceptUnverifiedReachability: true });
    await h.ask('tunnel-apply', { hostname: SESSION_HOST, confirmToken: preview.result.confirmToken, acknowledgement: HUB_TUNNEL_PHRASE, acceptUnverifiedReachability: true, connectorToken: SESSION_TOKEN });
    await h.close();
    const printed = [...h.f.out, ...h.f.err].join('\n');
    for (const secret of SECRETS) expect(printed).not.toContain(secret);
  });

  it('keeps the module free of logging and of reading process arguments or the environment', () => {
    const source = readFileSync(new URL('./provision-session.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/console\.|process\.argv|process\.env/);
  });
});
