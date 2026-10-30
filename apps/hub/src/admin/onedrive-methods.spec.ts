import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V2_PASSPHRASE, openV2AdminFixture } from '../backup/backup-v2-admin-fixture.js';
import { FakeGraphServer } from '../backup/destinations/onedrive/fake-graph-server.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { readDestinationState } from '../hub/backup-destination-state.js';
import { notificationForAudit } from '../notifications/producers.js';
import { readExpectedSecrets } from '../provisioning/index.js';
import type { AuditNotice } from '../security/audit.js';

/**
 * The OneDrive destination through the admin pipe against the fake Microsoft (Milestone 857): the two-step connect, the callback
 * bridge, the repository in OneDrive, a full backup run, verify, probe, restore drill, prune and disconnect, refresh-token rotation,
 * and that nothing secret reaches `hub.json`, the audit log, `meta`, an answer or the log. The destination contract itself is
 * `onedrive-destination.spec.ts`.
 */
const REDIRECT = 'https://hub.example.com';
const CALLBACK = `${REDIRECT}/api/v1/backup/onedrive/callback`;
const configText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const fixtures: Array<ReturnType<typeof openV2AdminFixture>> = [];
const servers: FakeGraphServer[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) f.close();
  for (const server of servers.splice(0)) await server.close();
});

async function open(label: string, serverOptions: ConstructorParameters<typeof FakeGraphServer>[0] = {}) {
  const server = new FakeGraphServer(serverOptions);
  servers.push(server);
  await server.start();
  const f = openV2AdminFixture(label, { onedrive: { endpoints: server.endpoints() } });
  fixtures.push(f);
  const request = (extra: Record<string, unknown> = {}) => ({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, ...extra });
  /** preview, apply and the browser's approval; returns what `complete` needs. */
  const authorize = async (extra: Record<string, unknown> = {}, approve: { deny?: boolean } = {}) => {
    const preview = await f.call('backup.destination.onedrive.connect.preview', request(extra));
    const started = await f.call('backup.destination.onedrive.connect.apply', { ...request(extra), confirmToken: preview.confirmToken });
    const browser = server.authorize(started.authorizationUrl, approve);
    if ('error' in browser) throw new Error(`the fake consent refused: ${browser.error}`);
    const redirected = new URL(browser.redirect);
    const outcome = await f.onedriveAuth.handleCallback({ state: redirected.searchParams.get('state'), code: redirected.searchParams.get('code') ?? undefined, error: redirected.searchParams.get('error') ?? undefined });
    return { preview, started, browser, redirected, outcome };
  };
  const connect = async (extra: Record<string, unknown> = {}, passphrase = V2_PASSPHRASE) => {
    const step = await authorize(extra);
    const done = await f.call('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId, passphrase });
    return { ...step, done, id: done.destination.id as string };
  };
  return { f, server, request, authorize, connect };
}

describe('onedrive connect (two steps, then the callback, then complete)', () => {
  it('the preview changes and contacts nothing; the apply starts one in-memory authorization and stores nothing', async () => {
    const { f, server, request } = await open('onedrive-preview');
    loadOrCreateHubConfig(f.paths.configFile); // the default file exists from here on, so a preview that wrote the config would show
    const before = JSON.stringify({ config: configText(f.paths.configFile), meta: f.db.prepare('SELECT * FROM meta').all(), audit: f.auditRows() });
    const preview = await f.call('backup.destination.onedrive.connect.preview', request({ label: 'My OneDrive' }));
    expect(preview.consequenceClass).toEqual(['secret-management', 'remote-write']);
    expect(preview.summary).toMatchObject({
      provider: 'OneDrive', scope: 'Files.ReadWrite.AppFolder offline_access', clientId: server.options.clientId, redirectUri: CALLBACK, reconnect: false, folderName: 'DUDE Hub backups',
    });
    expect(JSON.stringify(preview)).not.toContain(server.options.clientSecret);
    expect(JSON.stringify({ config: configText(f.paths.configFile), meta: f.db.prepare('SELECT * FROM meta').all(), audit: f.auditRows() })).toBe(before);
    expect(server.requests).toHaveLength(0);
    expect(f.onedriveAuth.waiting()).toBe(false);
    expect(f.onedriveCredentialsPresent()).toBe(false);

    const started = await f.call('backup.destination.onedrive.connect.apply', { ...request({ label: 'My OneDrive' }), confirmToken: preview.confirmToken });
    const url = new URL(started.authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${server.endpoints().authUrl}`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code', client_id: server.options.clientId, redirect_uri: CALLBACK, scope: 'Files.ReadWrite.AppFolder offline_access', code_challenge_method: 'S256', prompt: 'consent',
    });
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.searchParams.has('code_verifier')).toBe(false);
    expect(started).toMatchObject({ pendingId: expect.stringMatching(/^[0-9a-f]{32}$/), redirectUri: CALLBACK });
    expect(f.onedriveAuth.waiting()).toBe(true);
    expect(await f.call('backup.destination.onedrive.connect.status', { pendingId: started.pendingId })).toMatchObject({ state: 'waiting' });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(server.requests).toHaveLength(0);
    expect(f.onedriveCredentialsPresent()).toBe(false);
  });

  it('adds the destination after the owner approved: a folder in the app folder, an encrypted repository, protected credentials, and nothing secret anywhere else', async () => {
    const { f, server, connect } = await open('onedrive-add', { strictRotation: true });
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    const { done, id, started, outcome, redirected } = await connect({ label: 'My OneDrive' });
    expect(outcome).toEqual({ result: 'authorized' });
    expect(done).toMatchObject({ added: true, adopted: false, destination: { id, kind: 'onedrive', label: 'My OneDrive', clientId: server.options.clientId, credentialsStored: true } });
    expect(id).toMatch(/^d-[0-9a-f]{8}$/);
    const folderId = done.destination.folderId as string;
    expect(server.items.get(folderId)).toMatchObject({ name: 'DUDE Hub backups', folder: true, parentId: server.approotId });
    expect(server.names(folderId)).toEqual(['repo']);
    expect(server.authFailures).toBe(0);
    const stored = f.onedriveCredentials.get(id)!;
    expect(stored.clientSecret).toBe(server.options.clientSecret);
    expect(server.refreshTokens.get(stored.refreshToken)).toEqual({ revoked: false }); // the stored token is the live end of the rotation chain, not a dead one
    expect(loadOrCreateHubConfig(f.paths.configFile).backup?.destinations).toEqual([{ id, kind: 'onedrive', label: 'My OneDrive', folderId, clientId: server.options.clientId }]);
    expect(f.keys.key()).toHaveLength(32);
    expect(readDestinationState(f.db, id).repoId).toMatch(/^[0-9a-f]{32}$/);
    expect(readExpectedSecrets(f.ss.sdb)).toEqual(expect.arrayContaining(['backup.masterKey', 'backup.onedrive.refreshToken']));
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-added')).toEqual([
      { event: 'backup.destination-added', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ destination: id, kind: 'onedrive', adopted: false }) },
    ]);
    expect(await f.call('backup.destination.onedrive.connect.status', { pendingId: started.pendingId })).toEqual({ state: 'unknown' }); // taken: gone
    expect(f.onedriveAuth.waiting()).toBe(false);
    const listed = await f.call('backup.destination.list');
    expect(listed.destinations).toEqual([expect.objectContaining({ id, kind: 'onedrive', folderId, clientId: server.options.clientId, credentialsStored: true })]);
    const everything = JSON.stringify({
      done, listed, audit: f.auditRows(), meta: f.db.prepare('SELECT * FROM meta').all(), config: configText(f.paths.configFile), logged: logs.map((spy) => spy.mock.calls),
      schedule: await f.call('backup.schedule.status'), redirected: redirected.search.length > 0,
    });
    const everyToken = [...server.refreshTokens.keys()];
    for (const secret of [server.options.clientSecret, V2_PASSPHRASE, started.authorizationUrl, new URL(started.authorizationUrl).searchParams.get('state')!, ...everyToken]) expect(everything, secret).not.toContain(secret);
  });

  it('writes real backups to OneDrive, lists, verifies, probes, drills, prunes and disconnects (the engine against the destination)', async () => {
    const { f, server, connect } = await open('onedrive-engine');
    await f.ss.add(new Uint8Array(randomBytes(200 * 1024)), 'doc');
    const { id, done } = await connect();
    const folderId = done.destination.folderId as string;
    const first = (await f.call('backup.run')).results[0];
    expect(first).toMatchObject({ destination: id, ok: true, blobs: 1, newBlobs: 1 });
    f.advance(3_600_000); // the same UTC day: the daily rule keeps only the newer one
    const second = (await f.call('backup.run')).results[0];
    expect(second.ok).toBe(true);
    expect(server.names(folderId).filter((n) => n.startsWith('manifests/'))).toHaveLength(2);
    expect(server.names(folderId).some((n) => n.startsWith('packs/'))).toBe(true);
    expect(server.count((r) => r.method === 'PUT' && r.path.startsWith('/upload/'))).toBeGreaterThan(0);
    expect((await f.call('backup.destination.backups', { id })).backups.map((b: { backupId: string }) => b.backupId)).toEqual([first.backupId, second.backupId]);
    expect(await f.call('backup.destination.verify', { id })).toMatchObject({ ok: true, id, backupId: second.backupId, blobs: 1 });
    expect(readDestinationState(f.db, id)).toMatchObject({ lastOutcome: 'success', lastBackupId: second.backupId });
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ id, kind: 'onedrive', ok: true, authorized: true, folder: true, write: true, read: true, delete: true });
    const drill = await f.call('backup.drill');
    expect(drill).toMatchObject({ ok: true, results: [expect.objectContaining({ destinationId: id, outcome: 'passed' })] });

    const preview = await f.call('backup.prune.preview', { destination: id });
    expect(preview.summary).toMatchObject({ keep: [second.backupId], deleteBackups: [first.backupId] });
    await f.call('backup.prune.apply', { destination: id, confirmToken: preview.confirmToken });
    expect(server.names(folderId)).not.toContain(`manifests/${first.backupId}`);
    expect(server.names(folderId)).toContain(`manifests/${second.backupId}`);
    expect(await f.call('backup.destination.verify', { id })).toMatchObject({ ok: true, backupId: second.backupId });
  });

  it('every run rotates the stored refresh token (strict rotation) and the next run, the probe and a restart-like reopen still work; no token is ever audited or logged', async () => {
    const { f, server, connect } = await open('onedrive-rotation', { strictRotation: true });
    await f.ss.add(new Uint8Array(randomBytes(40 * 1024)), 'doc');
    const { id } = await connect();
    const seen = new Set<string>([f.onedriveCredentials.get(id)!.refreshToken]);
    for (let run = 0; run < 3; run += 1) {
      server.expireAccessTokens();
      f.advance(86_400_000);
      expect((await f.call('backup.run')).ok, `run ${run}`).toBe(true);
      const now = f.onedriveCredentials.get(id)!.refreshToken;
      expect(server.refreshTokens.get(now)).toEqual({ revoked: false });
      seen.add(now);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ ok: true });
    expect(f.onedriveCredentials.get(id)!.clientSecret).toBe(server.options.clientSecret);
    const everything = JSON.stringify({ audit: f.auditRows(), meta: f.db.prepare('SELECT * FROM meta').all(), config: configText(f.paths.configFile) });
    for (const token of server.refreshTokens.keys()) expect(everything).not.toContain(token);
  });

  it('a second OneDrive destination must use the same passphrase; a wrong one removes the new folder and credentials again', async () => {
    const { f, server, connect, authorize } = await open('onedrive-passphrase');
    await connect();
    const step = await authorize();
    const wrong = await f.fail('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId, passphrase: `${V2_PASSPHRASE}-other` });
    expect(wrong.code).toBe('wrong-passphrase-or-corrupt');
    expect(wrong.message).not.toContain(V2_PASSPHRASE);
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
    expect([...server.items.values()].filter((item) => item.name.startsWith('DUDE Hub backups'))).toHaveLength(1); // the second folder was deleted again
    expect(f.onedriveAuth.waiting()).toBe(false);
  });

  it('refuses a short passphrase before spending the authorization, and creates nothing', async () => {
    const { f, server, authorize } = await open('onedrive-short');
    const step = await authorize();
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId, passphrase: 'short' })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId })).code).toBe('bad-request');
    expect(server.items.size).toBe(1); // only the app folder itself
    // The authorization is still there for a corrected call.
    const done = await f.call('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId, passphrase: V2_PASSPHRASE });
    expect(done.added).toBe(true);
  });

  it('a Drive destination and a OneDrive destination coexist, each with its own credentials, folder and callback', async () => {
    const { f, server, connect } = await open('onedrive-coexist');
    const { id, done } = await connect();
    expect((await f.call('backup.destination.list')).destinations).toEqual([expect.objectContaining({ id, kind: 'onedrive', folderId: done.destination.folderId })]);
    expect(f.driveCredentialsPresent()).toBe(false);
    expect(f.onedriveCredentialsPresent()).toBe(true);
    expect(f.driveAuth.waiting()).toBe(false);
    expect(server.requests.every((r) => !r.path.includes('drive/v3'))).toBe(true);
  });
});

describe('onedrive connect refusals', () => {
  it('validates the app registration, the label, the redirect origin and unknown parameters without echoing a value', async () => {
    const { f, request } = await open('onedrive-validate');
    const bad: Array<Record<string, unknown>> = [
      { clientId: '' }, { clientId: 'has space' }, { clientId: 'x'.repeat(257) }, { clientSecret: 'short' }, { clientSecret: 'has a space in it ok' }, { clientSecret: 42 },
      { label: '' }, { label: 'x'.repeat(65) }, { redirectOrigin: 'http://hub.example.com' }, { redirectOrigin: 'https://hub.example.com/path' }, { redirectOrigin: 'https://hub.example.com/' }, { redirectOrigin: 'ftp://hub.example.com' },
      { surprise: true },
    ];
    for (const extra of bad) {
      const error = await f.fail('backup.destination.onedrive.connect.preview', request(extra));
      expect(error.code, JSON.stringify(extra)).toBe('bad-request');
      expect(error.message, JSON.stringify(extra)).not.toContain('has a space in it ok');
    }
    expect((await f.fail('backup.destination.onedrive.connect.preview', { clientId: 'x'.repeat(10), clientSecret: 'a'.repeat(20) })).code).toBe('bad-request'); // no redirect origin and none configured
    expect(await f.call('backup.destination.onedrive.connect.preview', request({ redirectOrigin: 'http://localhost:8443' }))).toMatchObject({ summary: { redirectUri: 'http://localhost:8443/api/v1/backup/onedrive/callback' } });
    expect(f.onedriveAuth.waiting()).toBe(false);
  });

  it('the apply needs the exact token of the exact request: forged, replayed, expired and changed requests start nothing', async () => {
    const { f, request } = await open('onedrive-token');
    expect((await f.fail('backup.destination.onedrive.connect.apply', request())).code).toBe('bad-request');
    expect((await f.fail('backup.destination.onedrive.connect.apply', { ...request(), confirmToken: 'forged' })).code).toBe('confirmation-required');
    const { confirmToken } = await f.call('backup.destination.onedrive.connect.preview', request());
    expect((await f.fail('backup.destination.onedrive.connect.apply', { ...request({ clientId: 'another-client-id-0123' }), confirmToken })).code).toBe('conflict'); // bound to the previewed client
    expect((await f.fail('backup.destination.onedrive.connect.apply', { ...request(), confirmToken })).code).toBe('confirmation-required'); // single use: the changed attempt spent it
    const second = (await f.call('backup.destination.onedrive.connect.preview', request())).confirmToken;
    f.advance(61_000);
    expect((await f.fail('backup.destination.onedrive.connect.apply', { ...request(), confirmToken: second })).code).toBe('confirmation-required');
    const removeToken = (await f.call('backup.destination.onedrive.connect.preview', request())).confirmToken;
    expect((await f.fail('backup.destination.remove.apply', { id: 'd-00000000', confirmToken: removeToken })).code).toBe('not-found'); // another action's token is useless elsewhere
    expect(f.onedriveAuth.waiting()).toBe(false);
    const secretChanged = (await f.call('backup.destination.onedrive.connect.preview', request())).confirmToken;
    expect((await f.fail('backup.destination.onedrive.connect.apply', { ...request({ clientSecret: 'a-different-client-secret-0001' }), confirmToken: secretChanged })).code).toBe('conflict');
  });

  it('a one-call add of a onedrive destination is refused; the callback outcomes decide what complete can do', async () => {
    const { f, authorize, connect } = await open('onedrive-callback-outcomes');
    expect((await f.fail('backup.destination.add', { kind: 'onedrive', passphrase: V2_PASSPHRASE })).code).toBe('bad-request');
    // Declined by the owner.
    const declined = await authorize({}, { deny: true });
    expect(declined.outcome).toEqual({ result: 'failed', reason: 'declined' });
    expect(await f.call('backup.destination.onedrive.connect.status', { pendingId: declined.started.pendingId })).toEqual({ state: 'failed', reason: 'declined' });
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: declined.started.pendingId, passphrase: V2_PASSPHRASE })).code).toBe('refused');
    // A replayed callback, a wrong state and an unknown pending id do nothing.
    const step = await authorize();
    expect(await f.onedriveAuth.handleCallback({ state: step.redirected.searchParams.get('state'), code: step.redirected.searchParams.get('code'), error: undefined })).toEqual({ result: 'unknown' });
    expect(await f.onedriveAuth.handleCallback({ state: 'A'.repeat(43), code: 'x', error: undefined })).toEqual({ result: 'unknown' });
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: 'f'.repeat(32), passphrase: V2_PASSPHRASE })).code).toBe('refused');
    // An authorization that expired before it was completed cannot be used.
    f.advance(11 * 60_000);
    expect(await f.call('backup.destination.onedrive.connect.status', { pendingId: step.started.pendingId })).toEqual({ state: 'expired' });
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId, passphrase: V2_PASSPHRASE })).code).toBe('refused');
    expect((await f.call('backup.destination.list')).destinations).toEqual([]);
    await connect(); // and a fresh connect still works
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
  });

  it('starting another connect replaces the waiting one and the old callback is refused', async () => {
    const { f, request } = await open('onedrive-replace');
    const start = async () => {
      const preview = await f.call('backup.destination.onedrive.connect.preview', request());
      return f.call('backup.destination.onedrive.connect.apply', { ...request(), confirmToken: preview.confirmToken });
    };
    const first = await start();
    await start();
    expect(await f.call('backup.destination.onedrive.connect.status', { pendingId: first.pendingId })).toEqual({ state: 'unknown' });
    expect(await f.onedriveAuth.handleCallback({ state: new URL(first.authorizationUrl).searchParams.get('state'), code: 'c', error: undefined })).toEqual({ result: 'unknown' });
    expect(await f.call('backup.destination.onedrive.connect.cancel')).toEqual({ cancelled: true });
    expect(f.onedriveAuth.waiting()).toBe(false);
  });

  it('Microsoft refusing the code (a wrong client secret) is a failed authorization with a closed reason', async () => {
    const { f, server } = await open('onedrive-bad-secret');
    const request = { clientId: server.options.clientId, clientSecret: 'not~the.right_secret-value-000', redirectOrigin: REDIRECT };
    const preview = await f.call('backup.destination.onedrive.connect.preview', request);
    const started = await f.call('backup.destination.onedrive.connect.apply', { ...request, confirmToken: preview.confirmToken });
    const url = new URL((server.authorize(started.authorizationUrl) as { redirect: string }).redirect);
    const outcome = await f.onedriveAuth.handleCallback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: undefined });
    expect(outcome).toEqual({ result: 'failed', reason: 'invalid_client' });
    expect(await f.call('backup.destination.onedrive.connect.status', { pendingId: started.pendingId })).toEqual({ state: 'failed', reason: 'invalid_client' });
  });

  it('a consent that grants more than the app folder is refused and nothing can be completed', async () => {
    const { f, server } = await open('onedrive-wide-scope', { grantedScope: 'Files.ReadWrite.AppFolder Files.ReadWrite.All' });
    const request = { clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT };
    const preview = await f.call('backup.destination.onedrive.connect.preview', request);
    const started = await f.call('backup.destination.onedrive.connect.apply', { ...request, confirmToken: preview.confirmToken });
    const url = new URL((server.authorize(started.authorizationUrl) as { redirect: string }).redirect);
    expect(await f.onedriveAuth.handleCallback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: undefined })).toEqual({ result: 'failed', reason: 'scope-refused' });
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: started.pendingId, passphrase: V2_PASSPHRASE })).code).toBe('refused');
  });
});

describe('onedrive reconnect, failure and disconnect', () => {
  it('a revoked consent fails the run with `reauth`, flows to the failed-backup notification, and a reconnect restores it without a passphrase', async () => {
    const { f, server, connect, authorize } = await open('onedrive-revoked');
    await f.ss.add(new Uint8Array(randomBytes(40 * 1024)), 'doc');
    const { id, done } = await connect();
    expect((await f.call('backup.run')).ok).toBe(true);
    server.revokeAll();
    const run = await f.call('backup.run');
    expect(run).toMatchObject({ ok: false, results: [{ destination: id, ok: false, error: 'reauth' }] });
    expect(readDestinationState(f.db, id)).toMatchObject({ lastOutcome: 'failure', lastError: 'reauth' });
    const failedRow = f.auditRows().filter((r) => r.event === 'backup.v2-failed').pop()!;
    expect(JSON.parse(failedRow.detail_json!)).toMatchObject({ destination: id, reason: 'reauth' });
    const notice = { seq: 99, event: 'backup.v2-failed', outcome: 'failure', actorKind: 'cli', actorId: null, at: '2026-10-04T12:00:00.000Z', detail: JSON.parse(failedRow.detail_json!) } as AuditNotice;
    expect(notificationForAudit(f.db, notice, () => 'My OneDrive')).toMatchObject({ kind: 'backup-failed', severity: 'error', title: 'A backup failed', body: expect.stringContaining('(reauth)') });
    expect((await f.call('backup.schedule.status')).health.destinations).toEqual([expect.objectContaining({ id, failed: { code: 'reauth' } })]);
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ ok: false, failedStep: 'authorize', reason: 'reauth' });
    expect(JSON.stringify([run, failedRow])).not.toContain(f.onedriveCredentials.get(id)!.refreshToken);

    // Reconnect: same client, same folder, new consent, no passphrase, no new destination.
    const stale = f.onedriveCredentials.get(id)!.refreshToken;
    const step = await authorize({ id });
    expect(step.preview.summary).toMatchObject({ reconnect: true, id, folderId: done.destination.folderId });
    const reconnected = await f.call('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId });
    expect(reconnected).toMatchObject({ added: false, reconnected: true, destination: { id, credentialsStored: true } });
    expect(f.onedriveCredentials.get(id)!.refreshToken).not.toBe(stale);
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
    expect((await f.call('backup.run')).ok).toBe(true);
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-added').pop()!.detail_json).toBe(JSON.stringify({ destination: id, kind: 'onedrive', adopted: false, reconnected: true }));
  });

  it('after a restore onto a new machine the credentials are absent: the destination is `unavailable` until reconnected, never an unauthenticated request', async () => {
    const { f, server, connect } = await open('onedrive-reenter');
    const { id } = await connect();
    expect(f.onedriveCredentials.delete(id)).toBe(true); // what a restore onto another machine looks like: the config is back, the secret store is empty
    const run = await f.call('backup.run');
    expect(run).toMatchObject({ ok: false, results: [{ destination: id, ok: false }] });
    expect((await f.fail('backup.destination.probe', { id })).code).toBe('unavailable');
    expect((await f.call('backup.destination.list')).destinations[0]).toMatchObject({ id, credentialsStored: false });
    const requestsBefore = server.requests.length;
    await f.fail('backup.destination.verify', { id });
    expect(server.requests.length).toBe(requestsBefore);
  });

  it('refuses to reconnect a destination of another kind, another client or a folder that is not in that account', async () => {
    const { f, server, connect, authorize } = await open('onedrive-reconnect-refusals');
    const { id } = await connect();
    await f.call('backup.destination.add', { folder: f.folder('usb'), passphrase: V2_PASSPHRASE });
    const local = (await f.call('backup.destination.list')).destinations.find((d: { kind: string }) => d.kind === 'local-folder');
    expect((await f.fail('backup.destination.onedrive.connect.preview', { clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, id: local.id })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.onedrive.connect.preview', { clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, id: 'd-00000000' })).code).toBe('not-found');
    server.items.delete((await f.call('backup.destination.list')).destinations.find((d: { id: string }) => d.id === id).folderId); // the folder is not in this Microsoft account (or was deleted)
    const before = f.onedriveCredentials.get(id)!;
    const step = await authorize({ id });
    expect((await f.fail('backup.destination.onedrive.connect.complete', { pendingId: step.started.pendingId })).code).toBe('not-found');
    expect(f.onedriveCredentials.get(id)).toEqual(before); // the previous credentials are kept
  });

  it('disconnect is the two-step remove: it deletes the stored authorization, says nothing was revoked at Microsoft, and never deletes the backups', async () => {
    const { f, server, connect } = await open('onedrive-remove');
    await connect();
    const only = (await f.call('backup.destination.list')).destinations[0];
    const id = only.id as string;
    const folderId = only.folderId as string;
    const refreshToken = f.onedriveCredentials.get(id)!.refreshToken;
    const preview = await f.call('backup.destination.remove.preview', { id });
    expect(preview.consequenceClass).toEqual(['system-config', 'secret-management']);
    expect(preview.summary).toMatchObject({ id, kind: 'onedrive', folderId, removesCredentials: true, revokesToken: false, last: true });
    expect(preview.summary.note).toMatch(/NOT deleted/);
    expect(preview.summary.note).toMatch(/account\.microsoft\.com/);
    expect(f.onedriveCredentialsPresent()).toBe(true); // a preview removes nothing
    const applied = await f.call('backup.destination.remove.apply', { id, confirmToken: preview.confirmToken });
    expect(applied).toMatchObject({ removed: true, id, credentialsRemoved: true, last: true });
    expect(applied).not.toHaveProperty('revokedAtGoogle');
    expect(f.onedriveCredentialsPresent()).toBe(false);
    expect(server.names(folderId)).toEqual(['repo']); // the backups stay in OneDrive
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-removed')).toEqual([
      { event: 'backup.destination-removed', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ destination: id, kind: 'onedrive', last: true, unattendedCleared: true, credentialsCleared: true }) },
    ]);
    expect(JSON.stringify({ applied, audit: f.auditRows() })).not.toContain(refreshToken);
  });
});
