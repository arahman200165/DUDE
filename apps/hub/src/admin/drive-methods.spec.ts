import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V2_PASSPHRASE, openV2AdminFixture } from '../backup/backup-v2-admin-fixture.js';
import { FakeDriveServer } from '../backup/destinations/drive/fake-drive-server.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { readDestinationState } from '../hub/backup-destination-state.js';
import { notificationForAudit } from '../notifications/producers.js';
import { readExpectedSecrets } from '../provisioning/index.js';
import type { AuditNotice } from '../security/audit.js';

/**
 * The Google Drive destination through the admin pipe against the fake Google (Milestone 856): the two-step connect, the callback
 * bridge, the repository on Drive, a full backup run, verify, probe, restore drill, prune and disconnect, and that nothing secret
 * reaches `hub.json`, the audit log, `meta`, an answer or the log. The engine-level conformance (a real backup written to, listed
 * on, read back from and pruned at the destination) is here; the destination contract itself is `drive-destination.spec.ts`.
 */
const REDIRECT = 'https://hub.example.com';
const configText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const fixtures: Array<ReturnType<typeof openV2AdminFixture>> = [];
const servers: FakeDriveServer[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) f.close();
  for (const server of servers.splice(0)) await server.close();
});

async function open(label: string, serverOptions: ConstructorParameters<typeof FakeDriveServer>[0] = {}) {
  const server = new FakeDriveServer(serverOptions);
  servers.push(server);
  await server.start();
  const f = openV2AdminFixture(label, { drive: { endpoints: server.endpoints() } });
  fixtures.push(f);
  const request = (extra: Record<string, unknown> = {}) => ({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, ...extra });
  /** preview, apply and the browser's approval; returns what `complete` needs. */
  const authorize = async (extra: Record<string, unknown> = {}, approve: { deny?: boolean } = {}) => {
    const preview = await f.call('backup.destination.drive.connect.preview', request(extra));
    const started = await f.call('backup.destination.drive.connect.apply', { ...request(extra), confirmToken: preview.confirmToken });
    const browser = server.authorize(started.authorizationUrl, approve);
    if ('error' in browser) throw new Error(`the fake consent refused: ${browser.error}`);
    const redirected = new URL(browser.redirect);
    const outcome = await f.driveAuth.handleCallback({ state: redirected.searchParams.get('state'), code: redirected.searchParams.get('code') ?? undefined, error: redirected.searchParams.get('error') ?? undefined });
    return { preview, started, browser, redirected, outcome };
  };
  const connect = async (extra: Record<string, unknown> = {}, passphrase = V2_PASSPHRASE) => {
    const step = await authorize(extra);
    const done = await f.call('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId, passphrase });
    return { ...step, done, id: done.destination.id as string };
  };
  return { f, server, request, authorize, connect };
}

describe('google drive connect (two steps, then the callback, then complete)', () => {
  it('the preview changes and contacts nothing; the apply starts one in-memory authorization and stores nothing', async () => {
    const { f, server, request } = await open('drive-preview');
    loadOrCreateHubConfig(f.paths.configFile); // the default file exists from here on, so a preview that wrote the config would show
    const before = JSON.stringify({ config: configText(f.paths.configFile), meta: f.db.prepare('SELECT * FROM meta').all(), audit: f.auditRows() });
    const preview = await f.call('backup.destination.drive.connect.preview', request({ label: 'My Drive' }));
    expect(preview.consequenceClass).toEqual(['secret-management', 'remote-write']);
    expect(preview.summary).toMatchObject({
      provider: 'Google Drive', scope: 'https://www.googleapis.com/auth/drive.file', clientId: server.options.clientId, redirectUri: `${REDIRECT}/api/v1/backup/drive/callback`, reconnect: false, folderName: 'DUDE Hub backups',
    });
    expect(JSON.stringify(preview)).not.toContain(server.options.clientSecret);
    expect(JSON.stringify({ config: configText(f.paths.configFile), meta: f.db.prepare('SELECT * FROM meta').all(), audit: f.auditRows() })).toBe(before);
    expect(server.requests).toHaveLength(0);
    expect(f.driveAuth.waiting()).toBe(false);
    expect(f.driveCredentialsPresent()).toBe(false);

    const started = await f.call('backup.destination.drive.connect.apply', { ...request({ label: 'My Drive' }), confirmToken: preview.confirmToken });
    const url = new URL(started.authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${server.endpoints().authUrl}`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code', client_id: server.options.clientId, redirect_uri: `${REDIRECT}/api/v1/backup/drive/callback`, scope: 'https://www.googleapis.com/auth/drive.file',
      code_challenge_method: 'S256', access_type: 'offline',
    });
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.searchParams.has('code_verifier')).toBe(false);
    expect(started).toMatchObject({ pendingId: expect.stringMatching(/^[0-9a-f]{32}$/), redirectUri: `${REDIRECT}/api/v1/backup/drive/callback` });
    expect(f.driveAuth.waiting()).toBe(true);
    expect(await f.call('backup.destination.drive.connect.status', { pendingId: started.pendingId })).toMatchObject({ state: 'waiting' });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(server.requests).toHaveLength(0);
    expect(f.driveCredentialsPresent()).toBe(false);
  });

  it('adds the destination after the owner approved: an app folder, an encrypted repository, protected credentials, and nothing secret anywhere else', async () => {
    const { f, server, connect } = await open('drive-add');
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    const { done, id, started, outcome, redirected } = await connect({ label: 'My Drive' });
    expect(outcome).toEqual({ result: 'authorized' });
    expect(done).toMatchObject({ added: true, adopted: false, destination: { id, kind: 'drive', label: 'My Drive', clientId: server.options.clientId, credentialsStored: true } });
    expect(id).toMatch(/^d-[0-9a-f]{8}$/);
    const folderId = done.destination.folderId as string;
    expect(server.files.get(folderId)).toMatchObject({ name: 'DUDE Hub backups', mime: 'application/vnd.google-apps.folder' });
    expect(server.names(folderId)).toEqual(['repo']);
    expect(server.authFailures).toBe(0);
    const stored = f.driveCredentials.get(id)!;
    expect(stored.clientSecret).toBe(server.options.clientSecret);
    expect(server.refreshTokens.has(stored.refreshToken)).toBe(true);
    expect(loadOrCreateHubConfig(f.paths.configFile).backup?.destinations).toEqual([{ id, kind: 'drive', label: 'My Drive', folderId, clientId: server.options.clientId }]);
    expect(f.keys.key()).toHaveLength(32);
    expect(readDestinationState(f.db, id).repoId).toMatch(/^[0-9a-f]{32}$/);
    expect(readExpectedSecrets(f.ss.sdb)).toEqual(expect.arrayContaining(['backup.masterKey', 'backup.drive.refreshToken']));
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-added')).toEqual([
      { event: 'backup.destination-added', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ destination: id, kind: 'drive', adopted: false }) },
    ]);
    expect(await f.call('backup.destination.drive.connect.status', { pendingId: started.pendingId })).toEqual({ state: 'unknown' }); // taken: gone
    expect(f.driveAuth.waiting()).toBe(false);
    const listed = await f.call('backup.destination.list');
    expect(listed.destinations).toEqual([expect.objectContaining({ id, kind: 'drive', folderId, clientId: server.options.clientId, credentialsStored: true })]);
    const everything = JSON.stringify({
      done, listed, audit: f.auditRows(), meta: f.db.prepare('SELECT * FROM meta').all(), config: configText(f.paths.configFile), logged: logs.map((spy) => spy.mock.calls),
      schedule: await f.call('backup.schedule.status'), redirected: redirected.search.length > 0,
    });
    for (const secret of [server.options.clientSecret, stored.refreshToken, V2_PASSPHRASE, started.authorizationUrl, new URL(started.authorizationUrl).searchParams.get('state')!]) expect(everything, secret).not.toContain(secret);
  });

  it('writes real backups to Drive, lists, verifies, probes, drills, prunes and disconnects (the engine against the destination)', async () => {
    const { f, server, connect } = await open('drive-engine');
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
    expect(server.sessions.size).toBeGreaterThan(0);
    expect((await f.call('backup.destination.backups', { id })).backups.map((b: { backupId: string }) => b.backupId)).toEqual([first.backupId, second.backupId]);
    expect(await f.call('backup.destination.verify', { id })).toMatchObject({ ok: true, id, backupId: second.backupId, blobs: 1 });
    expect(readDestinationState(f.db, id)).toMatchObject({ lastOutcome: 'success', lastBackupId: second.backupId });
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ id, kind: 'drive', ok: true, authorized: true, folder: true, write: true, read: true, delete: true });
    const drill = await f.call('backup.drill');
    expect(drill).toMatchObject({ ok: true, results: [expect.objectContaining({ destinationId: id, outcome: 'passed' })] });

    const preview = await f.call('backup.prune.preview', { destination: id });
    expect(preview.summary).toMatchObject({ keep: [second.backupId], deleteBackups: [first.backupId] });
    const names = server.names(folderId);
    await f.call('backup.prune.apply', { destination: id, confirmToken: preview.confirmToken });
    expect(server.names(folderId)).not.toContain(`manifests/${first.backupId}`);
    expect(server.names(folderId)).toContain(`manifests/${second.backupId}`);
    expect(names.length).toBeGreaterThan(server.names(folderId).length - 1);
    expect(await f.call('backup.destination.verify', { id })).toMatchObject({ ok: true, backupId: second.backupId });
  });

  it('a second Drive destination must use the same passphrase; a wrong one removes the new folder and credentials and revokes the consent', async () => {
    const { f, server, connect, authorize } = await open('drive-passphrase');
    await connect();
    const step = await authorize();
    const wrong = await f.fail('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId, passphrase: `${V2_PASSPHRASE}-other` });
    expect(wrong.code).toBe('wrong-passphrase-or-corrupt');
    expect(wrong.message).not.toContain(V2_PASSPHRASE);
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
    expect([...server.files.values()].filter((file) => file.name === 'DUDE Hub backups')).toHaveLength(1); // the second folder was deleted again
    expect(server.revoked).toHaveLength(1);
    expect(server.revoked[0]).not.toBe(f.driveCredentials.get((await f.call('backup.destination.list')).destinations[0].id)!.refreshToken);
    expect(f.driveAuth.waiting()).toBe(false);
  });

  it('refuses a short passphrase before spending the authorization, and creates nothing', async () => {
    const { f, server, authorize } = await open('drive-short');
    const step = await authorize();
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId, passphrase: 'short' })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId })).code).toBe('bad-request');
    expect(server.files.size).toBe(0);
    // The authorization is still there for a corrected call.
    const done = await f.call('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId, passphrase: V2_PASSPHRASE });
    expect(done.added).toBe(true);
  });
});

describe('google drive connect refusals', () => {
  it('validates the OAuth client, the label, the redirect origin and unknown parameters without echoing a value', async () => {
    const { f, request } = await open('drive-validate');
    const bad: Array<Record<string, unknown>> = [
      { clientId: '' }, { clientId: 'has space' }, { clientId: 'x'.repeat(257) }, { clientSecret: 'short' }, { clientSecret: 'has a space in it ok' }, { clientSecret: 42 },
      { label: '' }, { label: 'x'.repeat(65) }, { redirectOrigin: 'http://hub.example.com' }, { redirectOrigin: 'https://hub.example.com/path' }, { redirectOrigin: 'https://hub.example.com/' }, { redirectOrigin: 'ftp://hub.example.com' },
      { surprise: true },
    ];
    for (const extra of bad) {
      const error = await f.fail('backup.destination.drive.connect.preview', request(extra));
      expect(error.code, JSON.stringify(extra)).toBe('bad-request');
      expect(error.message, JSON.stringify(extra)).not.toContain('has a space in it ok');
    }
    expect((await f.fail('backup.destination.drive.connect.preview', { clientId: 'x'.repeat(10), clientSecret: 'a'.repeat(20) })).code).toBe('bad-request'); // no redirect origin and none configured
    expect(await f.call('backup.destination.drive.connect.preview', request({ redirectOrigin: 'http://localhost:8443' }))).toMatchObject({ summary: { redirectUri: 'http://localhost:8443/api/v1/backup/drive/callback' } });
    expect(f.driveAuth.waiting()).toBe(false);
  });

  it('the apply needs the exact token of the exact request: forged, replayed, expired and changed requests start nothing', async () => {
    const { f, request } = await open('drive-token');
    expect((await f.fail('backup.destination.drive.connect.apply', request())).code).toBe('bad-request');
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: 'forged' })).code).toBe('confirmation-required');
    const { confirmToken } = await f.call('backup.destination.drive.connect.preview', request());
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request({ clientId: 'another-client-id-0123' }), confirmToken })).code).toBe('conflict'); // bound to the previewed client
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken })).code).toBe('confirmation-required'); // single use: the changed attempt spent it
    const second = (await f.call('backup.destination.drive.connect.preview', request())).confirmToken;
    f.advance(61_000);
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: second })).code).toBe('confirmation-required');
    const removeToken = (await f.call('backup.destination.drive.connect.preview', request())).confirmToken;
    expect((await f.fail('backup.destination.remove.apply', { id: 'd-00000000', confirmToken: removeToken })).code).toBe('not-found'); // another action's token is useless elsewhere
    expect(f.driveAuth.waiting()).toBe(false);
    const secretChanged = (await f.call('backup.destination.drive.connect.preview', request())).confirmToken;
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request({ clientSecret: 'a-different-client-secret-0001' }), confirmToken: secretChanged })).code).toBe('conflict');
  });

  it('a one-call add of a drive destination is refused; the callback outcomes decide what complete can do', async () => {
    const { f, authorize, connect } = await open('drive-callback-outcomes');
    expect((await f.fail('backup.destination.add', { kind: 'drive', passphrase: V2_PASSPHRASE })).code).toBe('bad-request');
    // Declined by the owner.
    const declined = await authorize({}, { deny: true });
    expect(declined.outcome).toEqual({ result: 'failed', reason: 'declined' });
    expect(await f.call('backup.destination.drive.connect.status', { pendingId: declined.started.pendingId })).toEqual({ state: 'failed', reason: 'declined' });
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: declined.started.pendingId, passphrase: V2_PASSPHRASE })).code).toBe('refused');
    // A replayed callback, a wrong state and an unknown pending id do nothing.
    const step = await authorize();
    expect(await f.driveAuth.handleCallback({ state: step.redirected.searchParams.get('state'), code: step.redirected.searchParams.get('code'), error: undefined })).toEqual({ result: 'unknown' });
    expect(await f.driveAuth.handleCallback({ state: 'A'.repeat(43), code: 'x', error: undefined })).toEqual({ result: 'unknown' });
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: 'f'.repeat(32), passphrase: V2_PASSPHRASE })).code).toBe('refused');
    // An authorization that expired before it was completed cannot be used.
    f.advance(11 * 60_000);
    expect(await f.call('backup.destination.drive.connect.status', { pendingId: step.started.pendingId })).toEqual({ state: 'expired' });
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId, passphrase: V2_PASSPHRASE })).code).toBe('refused');
    expect((await f.call('backup.destination.list')).destinations).toEqual([]);
    await connect(); // and a fresh connect still works
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
  });

  it('starting another connect replaces the waiting one and the old callback is refused', async () => {
    const { f, request } = await open('drive-replace');
    const start = async () => {
      const preview = await f.call('backup.destination.drive.connect.preview', request());
      return f.call('backup.destination.drive.connect.apply', { ...request(), confirmToken: preview.confirmToken });
    };
    const first = await start();
    await start();
    expect(await f.call('backup.destination.drive.connect.status', { pendingId: first.pendingId })).toEqual({ state: 'unknown' });
    expect(await f.driveAuth.handleCallback({ state: new URL(first.authorizationUrl).searchParams.get('state'), code: 'c', error: undefined })).toEqual({ result: 'unknown' });
    expect(await f.call('backup.destination.drive.connect.cancel')).toEqual({ cancelled: true });
    expect(f.driveAuth.waiting()).toBe(false);
  });

  it('Google refusing the code (a wrong client secret) is a failed authorization with a closed reason', async () => {
    const { f, server } = await open('drive-bad-secret');
    const step = await (async () => {
      const request = { clientId: server.options.clientId, clientSecret: 'GOCSPX-not-the-right-secret-000', redirectOrigin: REDIRECT };
      const preview = await f.call('backup.destination.drive.connect.preview', request);
      const started = await f.call('backup.destination.drive.connect.apply', { ...request, confirmToken: preview.confirmToken });
      const approved = server.authorize(started.authorizationUrl) as { redirect: string };
      const url = new URL(approved.redirect);
      return { started, outcome: await f.driveAuth.handleCallback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: undefined }) };
    })();
    expect(step.outcome).toEqual({ result: 'failed', reason: 'invalid_client' });
    expect(await f.call('backup.destination.drive.connect.status', { pendingId: step.started.pendingId })).toEqual({ state: 'failed', reason: 'invalid_client' });
  });
});

describe('google drive reconnect, failure and disconnect', () => {
  it('a revoked consent fails the run with `reauth`, flows to the failed-backup notification, and a reconnect restores it without a passphrase', async () => {
    const { f, server, connect, authorize } = await open('drive-revoked');
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
    expect(notificationForAudit(f.db, notice, () => 'My Drive')).toMatchObject({ kind: 'backup-failed', severity: 'error', title: 'A backup failed', body: expect.stringContaining('(reauth)') });
    expect((await f.call('backup.schedule.status')).health.destinations).toEqual([expect.objectContaining({ id, failed: { code: 'reauth' } })]);
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ ok: false, failedStep: 'authorize', reason: 'reauth' });
    expect(JSON.stringify([run, failedRow])).not.toContain(f.driveCredentials.get(id)!.refreshToken);

    // Reconnect: same client, same folder, new consent, no passphrase, no new destination.
    const stale = f.driveCredentials.get(id)!.refreshToken;
    const step = await authorize({ id });
    expect(step.preview.summary).toMatchObject({ reconnect: true, id, folderId: done.destination.folderId });
    const reconnected = await f.call('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId });
    expect(reconnected).toMatchObject({ added: false, reconnected: true, destination: { id, credentialsStored: true } });
    expect(f.driveCredentials.get(id)!.refreshToken).not.toBe(stale);
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
    expect((await f.call('backup.run')).ok).toBe(true);
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-added').pop()!.detail_json).toBe(JSON.stringify({ destination: id, kind: 'drive', adopted: false, reconnected: true }));
  });

  it('after a restore onto a new machine the credentials are absent: the destination is `unavailable` until reconnected, never an unauthenticated request', async () => {
    const { f, server, connect } = await open('drive-reenter');
    const { id } = await connect();
    expect(f.driveCredentials.delete(id)).toBe(true); // what a restore onto another machine looks like: the config is back, the secret store is empty
    const run = await f.call('backup.run');
    expect(run).toMatchObject({ ok: false, results: [{ destination: id, ok: false }] });
    expect((await f.fail('backup.destination.probe', { id })).code).toBe('unavailable');
    expect((await f.call('backup.destination.list')).destinations[0]).toMatchObject({ id, credentialsStored: false });
    const requestsBefore = server.requests.length;
    await f.fail('backup.destination.verify', { id });
    expect(server.requests.length).toBe(requestsBefore);
  });

  it('refuses to reconnect a destination of another kind, another client or a folder that is not in that account', async () => {
    const { f, server, connect, authorize } = await open('drive-reconnect-refusals');
    const { id } = await connect();
    await f.call('backup.destination.add', { folder: f.folder('usb'), passphrase: V2_PASSPHRASE });
    const local = (await f.call('backup.destination.list')).destinations.find((d: { kind: string }) => d.kind === 'local-folder');
    expect((await f.fail('backup.destination.drive.connect.preview', { clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, id: local.id })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.drive.connect.preview', { clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, id: 'd-00000000' })).code).toBe('not-found');
    server.files.delete((await f.call('backup.destination.list')).destinations.find((d: { id: string }) => d.id === id).folderId); // the folder is not in this Google account (or was deleted)
    const before = f.driveCredentials.get(id)!;
    const step = await authorize({ id });
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: step.started.pendingId })).code).toBe('not-found');
    expect(f.driveCredentials.get(id)).toEqual(before); // the previous credentials are kept
    expect(server.revoked.length).toBe(1); // and the new consent was revoked again
  });

  it('disconnect is the two-step remove: it deletes the stored authorization, revokes the token and never deletes the backups', async () => {
    const { f, server, connect } = await open('drive-remove');
    await connect();
    const only = (await f.call('backup.destination.list')).destinations[0];
    const id = only.id as string;
    const folderId = only.folderId as string;
    const refreshToken = f.driveCredentials.get(id)!.refreshToken;
    const preview = await f.call('backup.destination.remove.preview', { id });
    expect(preview.consequenceClass).toEqual(['system-config', 'secret-management', 'remote-write']);
    expect(preview.summary).toMatchObject({ id, kind: 'drive', folderId, removesCredentials: true, revokesToken: true, last: true });
    expect(preview.summary.note).toMatch(/NOT deleted/);
    expect(f.driveCredentialsPresent()).toBe(true); // a preview removes nothing
    expect(server.revoked).toEqual([]);
    const applied = await f.call('backup.destination.remove.apply', { id, confirmToken: preview.confirmToken });
    expect(applied).toMatchObject({ removed: true, id, credentialsRemoved: true, revokedAtGoogle: true, last: true });
    expect(f.driveCredentialsPresent()).toBe(false);
    expect(server.revoked).toEqual([refreshToken]);
    expect(server.names(folderId)).toEqual(['repo']); // the backups stay in Drive
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-removed')).toEqual([
      { event: 'backup.destination-removed', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ destination: id, kind: 'drive', last: true, unattendedCleared: true, credentialsCleared: true, revokedAtGoogle: true }) },
    ]);
    expect(JSON.stringify({ applied, audit: f.auditRows() })).not.toContain(refreshToken);
  });

  it('a disconnect while Google is unreachable still removes the stored authorization and says the revocation did not happen', async () => {
    const { f, server, connect } = await open('drive-remove-offline');
    await connect();
    const id = (await f.call('backup.destination.list')).destinations[0].id as string;
    const preview = await f.call('backup.destination.remove.preview', { id });
    server.fail((r) => r.path === '/revoke', { kind: 'drop' }, 10);
    const applied = await f.call('backup.destination.remove.apply', { id, confirmToken: preview.confirmToken });
    expect(applied).toMatchObject({ removed: true, credentialsRemoved: true, revokedAtGoogle: false });
    expect(f.driveCredentialsPresent()).toBe(false);
  });
});
