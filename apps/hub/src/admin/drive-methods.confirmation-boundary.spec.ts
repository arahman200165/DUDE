import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_DRIVE_CONNECT_ACTION, BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS, HUB_BACKUP_DRIVE_PATHS } from '@dude/contracts/hub';
import { V2_PASSPHRASE, openV2AdminFixture } from '../backup/backup-v2-admin-fixture.js';
import { createDriveAuthorizations } from '../backup/destinations/index.js';
import { FakeDriveServer } from '../backup/destinations/drive/fake-drive-server.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { request as httpsRequest, startTestHub } from '../server/test-helpers.js';
import { BACKUP_DESTINATION_REMOVE_DRIVE_CONSEQUENCE_CLASS } from './backup-methods.js';

/**
 * Destructive-Action Contract for connecting and disconnecting a Google Drive backup destination (Milestone 856, PD-154). Connecting
 * WIDENS where encrypted backups go and stores a refresh token; disconnecting deletes it. Both are admin-pipe-only, two-step, tagged
 * with a `ConsequenceClass`, bound to what was previewed and single-use for 60 seconds; nothing incidental (a backup run, a schedule,
 * a callback, a route) can connect or change a destination, and the only HTTP route can do nothing but hold an authorization in
 * memory for the admin pipe to complete. Registered in the high-consequence gate by its file name.
 */
const REDIRECT = 'https://hub.example.com';
const fixtures: Array<ReturnType<typeof openV2AdminFixture>> = [];
const servers: FakeDriveServer[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) f.close();
  for (const server of servers.splice(0)) await server.close();
});

async function open(label: string) {
  const server = new FakeDriveServer();
  servers.push(server);
  await server.start();
  const f = openV2AdminFixture(label, { drive: { endpoints: server.endpoints() } });
  fixtures.push(f);
  const request = (extra: Record<string, unknown> = {}) => ({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT, ...extra });
  const nothingChanged = (): string => JSON.stringify({
    destinations: loadOrCreateHubConfig(f.paths.configFile).backup, creds: f.driveCredentialsPresent(), waiting: f.driveAuth.waiting(), requests: server.requests.length, folders: server.files.size,
    audit: f.auditRows().length, key: f.keys.key() === null ? null : 'held',
  });
  return { f, server, request, nothingChanged };
}

describe('google drive connect confirmation boundary', () => {
  it('tags the consequence class and changes, stores and contacts nothing on a preview', async () => {
    const { f, request, nothingChanged } = await open('drive-bnd-preview');
    const before = nothingChanged();
    const preview = await f.call('backup.destination.drive.connect.preview', request());
    expect(preview.consequenceClass).toEqual([...BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS]);
    expect(preview.consequenceClass).toEqual(['secret-management', 'remote-write']);
    expect(BACKUP_DRIVE_CONNECT_ACTION).toBe('backup.destination.drive.connect');
    expect(preview.confirmToken).toEqual(expect.any(String));
    expect(preview.expiresAt).toEqual(expect.any(String));
    expect(nothingChanged()).toBe(before);
    // Disconnecting is the existing two-step remove, now also tagged `remote-write` for a Drive destination.
    expect(BACKUP_DESTINATION_REMOVE_DRIVE_CONSEQUENCE_CLASS).toEqual(['system-config', 'secret-management', 'remote-write']);
  });

  it('the apply cannot run without the token of this exact request, and the token is single-use and expires after 60 seconds', async () => {
    const { f, request, nothingChanged } = await open('drive-bnd-token');
    expect((await f.fail('backup.destination.drive.connect.apply', request())).code).toBe('bad-request');
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: '' })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: 'forged' })).code).toBe('confirmation-required');
    const otherToken = (await f.call('backup.create.preview', {})).confirmToken; // another action's token (its preview audits, so the baseline is taken after it)
    const before = nothingChanged();
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: otherToken })).code).toBe('confirmation-required');
    const stale = (await f.call('backup.destination.drive.connect.preview', request())).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: stale })).code).toBe('confirmation-required');
    expect(nothingChanged()).toBe(before);

    const fresh = (await f.call('backup.destination.drive.connect.preview', request())).confirmToken;
    const started = await f.call('backup.destination.drive.connect.apply', { ...request(), confirmToken: fresh });
    expect(started.authorizationUrl).toContain(request().clientId);
    expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken: fresh })).code).toBe('confirmation-required');
  });

  it('is bound to the previewed request: another client, secret, redirect, label or reconnect target is a conflict that spends the token', async () => {
    const { f, request, nothingChanged } = await open('drive-bnd-bound');
    const before = nothingChanged();
    for (const changed of [{ clientId: 'another-client-id-0123456' }, { clientSecret: 'another-client-secret-0123' }, { redirectOrigin: 'https://other.example.com' }, { label: 'Another label' }]) {
      const { confirmToken } = await f.call('backup.destination.drive.connect.preview', request());
      expect((await f.fail('backup.destination.drive.connect.apply', { ...request(changed), confirmToken })).code, JSON.stringify(changed)).toBe('conflict');
      expect((await f.fail('backup.destination.drive.connect.apply', { ...request(), confirmToken })).code).toBe('confirmation-required');
    }
    expect(nothingChanged()).toBe(before);
  });

  it('the apply starts only an in-memory authorization; the destination exists only after complete, with the passphrase', async () => {
    const { f, server, request } = await open('drive-bnd-apply');
    const preview = await f.call('backup.destination.drive.connect.preview', request());
    const started = await f.call('backup.destination.drive.connect.apply', { ...request(), confirmToken: preview.confirmToken });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(f.driveCredentialsPresent()).toBe(false);
    expect(server.files.size).toBe(0);
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: started.pendingId, passphrase: V2_PASSPHRASE })).code).toBe('refused'); // not approved yet
    // The browser callback, which is all an HTTP request can do, adds no destination either.
    const approved = server.authorize(started.authorizationUrl) as { redirect: string };
    const url = new URL(approved.redirect);
    expect(await f.driveAuth.handleCallback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: undefined })).toEqual({ result: 'authorized' });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(f.driveCredentialsPresent()).toBe(false);
    expect(server.files.size).toBe(0);
    expect((await f.fail('backup.destination.drive.connect.complete', { pendingId: started.pendingId })).code).toBe('bad-request'); // the passphrase is required
    const done = await f.call('backup.destination.drive.connect.complete', { pendingId: started.pendingId, passphrase: V2_PASSPHRASE });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup?.destinations).toHaveLength(1);
    expect(done.destination).toMatchObject({ kind: 'drive', credentialsStored: true });
  });

  it('nothing incidental connects a destination: no one-call add, no run, no schedule and no other method issues or spends the token', async () => {
    const { f, request, nothingChanged } = await open('drive-bnd-incidental');
    const before = nothingChanged();
    expect((await f.fail('backup.destination.add', { kind: 'drive', ...request(), passphrase: V2_PASSPHRASE })).code).toBe('bad-request');
    expect((await f.fail('backup.run')).code).toBe('refused'); // no destination configured
    expect((await f.fail('backup.schedule.set', { intervalHours: 24 })).code).toBe('bad-request');
    expect(nothingChanged()).toBe(before);
    // A plain `backup.destination.remove.apply` with a connect token is useless (the action is bound).
    const { confirmToken } = await f.call('backup.destination.drive.connect.preview', request());
    expect((await f.fail('backup.destination.remove.apply', { id: 'd-00000000', confirmToken })).code).toBe('not-found');
    expect(nothingChanged()).toBe(before);
  });
});

describe('google drive disconnect confirmation boundary', () => {
  it('a preview removes and revokes nothing; the apply needs the single-use token of this destination and then deletes the credentials and revokes the consent', async () => {
    const { f, server, request } = await open('drive-bnd-remove');
    const connect = async () => {
      const preview = await f.call('backup.destination.drive.connect.preview', request());
      const started = await f.call('backup.destination.drive.connect.apply', { ...request(), confirmToken: preview.confirmToken });
      const url = new URL((server.authorize(started.authorizationUrl) as { redirect: string }).redirect);
      await f.driveAuth.handleCallback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: undefined });
      return (await f.call('backup.destination.drive.connect.complete', { pendingId: started.pendingId, passphrase: V2_PASSPHRASE })).destination.id as string;
    };
    const first = await connect();
    const second = await connect();
    const preview = await f.call('backup.destination.remove.preview', { id: first });
    expect(preview.consequenceClass).toEqual(['system-config', 'secret-management', 'remote-write']);
    expect(server.revoked).toEqual([]);
    expect(f.driveCredentials.has(first)).toBe(true);
    expect((await f.fail('backup.destination.remove.apply', { id: first })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.remove.apply', { id: first, confirmToken: 'forged' })).code).toBe('confirmation-required');
    expect((await f.fail('backup.destination.remove.apply', { id: second, confirmToken: preview.confirmToken })).code).toBe('conflict'); // bound to the previewed destination (and spent by the attempt)
    expect(f.driveCredentials.has(first) && f.driveCredentials.has(second)).toBe(true);
    const fresh = (await f.call('backup.destination.remove.preview', { id: first })).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.destination.remove.apply', { id: first, confirmToken: fresh })).code).toBe('confirmation-required');
    expect(server.revoked).toEqual([]);
    const token = (await f.call('backup.destination.remove.preview', { id: first })).confirmToken;
    const applied = await f.call('backup.destination.remove.apply', { id: first, confirmToken: token });
    expect(applied).toMatchObject({ removed: true, last: false, credentialsRemoved: true, revokedAtGoogle: true });
    expect(f.driveCredentials.has(first)).toBe(false);
    expect(f.driveCredentials.has(second)).toBe(true); // only this destination's authorization goes
    expect(server.revoked).toHaveLength(1);
    expect((await f.fail('backup.destination.remove.apply', { id: first, confirmToken: token })).code).toBe('not-found');
  });
});

describe('the google drive callback is the only HTTP surface, and it can only hold an authorization in memory', () => {
  it('registers exactly one route (a GET) and no HTTP route connects, completes, cancels or removes a destination', async () => {
    const hub = await startTestHub();
    try {
      const routes = hub.app.printRoutes({ commonPrefix: false });
      const driveLines = routes.split('\n').filter((line) => /drive/i.test(line));
      expect(driveLines.join('\n')).toContain(HUB_BACKUP_DRIVE_PATHS.callback);
      expect(driveLines.join('\n')).not.toMatch(/POST|PUT|PATCH|DELETE/);
      expect(routes).not.toMatch(/backup\/destination|backup\/drive\/(?!callback)/i);
    } finally {
      await hub.close();
    }
  });

  it('a callback that Google really sent changes no destination and stores no credential, whoever calls it', async () => {
    const server = new FakeDriveServer();
    servers.push(server);
    await server.start();
    const authorizations = createDriveAuthorizations({ endpoints: server.endpoints() });
    const hub = await startTestHub({}, { driveAuthorizations: authorizations });
    try {
      const started = authorizations.begin({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: REDIRECT });
      const approved = server.authorize(started.authorizationUrl) as { redirect: string };
      const query = new URL(approved.redirect).search;
      const before = JSON.stringify(loadOrCreateHubConfig(hub.paths.configFile).backup ?? null);
      const answer = await httpsRequest(hub.port, hub.tls.certPem, `${HUB_BACKUP_DRIVE_PATHS.callback}${query}`, { headers: { cookie: 'dude_session=forged', authorization: 'Bearer forged' } });
      expect(answer.status).toBe(200);
      expect(answer.headers['content-type']).toContain('text/html');
      expect(answer.headers['cache-control']).toBe('no-store');
      expect(answer.headers['referrer-policy']).toBe('no-referrer');
      expect(answer.body).not.toMatch(/4\/|ya29|1\/\/|GOCSPX|code=|state=/);
      expect(JSON.stringify(loadOrCreateHubConfig(hub.paths.configFile).backup ?? null)).toBe(before);
      expect(authorizations.status(started.pendingId)).toMatchObject({ state: 'authorized' });
      const replay = await httpsRequest(hub.port, hub.tls.certPem, `${HUB_BACKUP_DRIVE_PATHS.callback}${query}`);
      expect(replay.status).toBe(400);
    } finally {
      await hub.close();
    }
  });

  it('no credential-bearing server module reaches the connect or remove actions or the destination credential stores', () => {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const srcRoot = path.resolve(here, '..');
    const offenders: string[] = [];
    for (const dir of ['server', 'auth', 'realtime', 'devices', 'security', 'sync']) {
      if (!existsSync(path.join(srcRoot, dir))) continue;
      for (const entry of readdirSync(path.join(srcRoot, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/BACKUP_DRIVE_CONNECT_ACTION|drive-credentials|DriveCredentialStore|drive-methods|backup\.destination\.drive/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
