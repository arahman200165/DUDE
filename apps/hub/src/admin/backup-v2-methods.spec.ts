import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMeta } from '@dude/sqlite-store';
import { openV2AdminFixture, V2_PASSPHRASE } from '../backup/backup-v2-admin-fixture.js';
import { makeRepositoryFolder, randomCheapDeps } from '../backup/backup-fixture.js';
import { FakeS3Server } from '../backup/destinations/s3/fake-s3-server.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { readDestinationState } from '../hub/backup-destination-state.js';
import { readExpectedSecrets } from '../provisioning/index.js';

const fixtures: Array<ReturnType<typeof openV2AdminFixture>> = [];
const servers: FakeS3Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) f.close();
  for (const server of servers.splice(0)) await server.close();
});
const open = (label: string) => { const f = openV2AdminFixture(label); fixtures.push(f); return f; };

describe('backup destination add (Milestone 847)', () => {
  it('creates a repository wrapping a new master key, stores the key (never the passphrase) and records the definition', async () => {
    const f = open('dest-add');
    const added = await f.call('backup.destination.add', { folder: f.folder('usb'), label: 'USB disk', passphrase: V2_PASSPHRASE });
    expect(added).toMatchObject({ added: true, adopted: false, destination: { kind: 'local-folder', label: 'USB disk', folder: f.folder('usb') } });
    const id = added.destination.id as string;
    expect(id).toMatch(/^d-[0-9a-f]{8}$/);
    expect(readdirSync(f.folder('usb'))).toEqual(['repo']);
    expect(f.keys.key()).toHaveLength(32);
    expect(loadOrCreateHubConfig(f.paths.configFile).backup?.destinations).toEqual([{ id, kind: 'local-folder', label: 'USB disk', folder: f.folder('usb') }]);
    expect(readDestinationState(f.db, id).repoId).toMatch(/^[0-9a-f]{32}$/);
    expect(readExpectedSecrets(f.ss.sdb)).toContain('backup.masterKey');
    const audit = f.auditRows().filter((r) => r.event === 'backup.destination-added');
    expect(audit).toEqual([{ event: 'backup.destination-added', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ destination: id, kind: 'local-folder', adopted: false }) }]);
    const everything = JSON.stringify({ audit: f.auditRows(), meta: f.db.prepare('SELECT * FROM meta').all(), config: readFileSync(f.paths.configFile, 'utf8'), listed: await f.call('backup.destination.list') });
    expect(everything).not.toContain(V2_PASSPHRASE);
    expect(everything).not.toContain(Buffer.from(f.keys.key()!).toString('base64url'));

    expect((await f.fail('backup.destination.add', { folder: f.folder('usb'), passphrase: V2_PASSPHRASE })).code).toBe('conflict');
    expect((await f.fail('backup.destination.add', { folder: path.join(f.folder('usb'), 'inner'), passphrase: V2_PASSPHRASE })).code).toBe('conflict');
  });

  it('a second destination shares the key and must use the same passphrase', async () => {
    const f = open('dest-two');
    await f.call('backup.destination.add', { folder: f.folder('one'), passphrase: V2_PASSPHRASE });
    const key = f.keys.key()!.slice();
    const wrong = await f.fail('backup.destination.add', { folder: f.folder('two'), passphrase: `${V2_PASSPHRASE}-other` });
    expect(wrong.code).toBe('wrong-passphrase-or-corrupt');
    expect(wrong.message).not.toContain(V2_PASSPHRASE);
    expect(existsSync(path.join(f.folder('two'), 'repo'))).toBe(false);
    await f.call('backup.destination.add', { folder: f.folder('two'), passphrase: V2_PASSPHRASE });
    expect(f.keys.key()).toEqual(key);
    expect(f.keys.saves).toBe(1);
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(2);
  });

  it('adopts a folder that already holds this key\'s repository and refuses one made with another key', async () => {
    const f = open('dest-adopt');
    const deps = randomCheapDeps();
    const { masterKey } = await makeRepositoryFolder(f.folder('old'), { passphrase: V2_PASSPHRASE, deps });
    const adopted = await f.call('backup.destination.add', { folder: f.folder('old'), passphrase: V2_PASSPHRASE });
    expect(adopted.adopted).toBe(true);
    expect(f.keys.key()).toEqual(masterKey);
    await makeRepositoryFolder(f.folder('foreign'), { passphrase: V2_PASSPHRASE, deps });
    expect((await f.fail('backup.destination.add', { folder: f.folder('foreign'), passphrase: V2_PASSPHRASE })).code).toBe('conflict');
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(1);
  });

  it('refuses unsafe folders, a short passphrase and an unknown kind, writing nothing', async () => {
    const f = open('dest-refuse');
    for (const folder of [f.paths.dataDir, f.paths.configDir, f.paths.tlsDir, f.paths.secretsDir, f.paths.storageDir, path.join(f.paths.blobsDir, 'x'), 'relative']) {
      expect((await f.fail('backup.destination.add', { folder, passphrase: V2_PASSPHRASE })).code, folder).toBe('bad-request');
    }
    expect((await f.fail('backup.destination.add', { folder: f.folder('x'), passphrase: 'short' })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.add', { folder: f.folder('x'), kind: 's3', passphrase: V2_PASSPHRASE })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.add', { folder: f.folder('x'), label: '', passphrase: V2_PASSPHRASE })).code).toBe('bad-request');
    expect(f.keys.key()).toBeNull();
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
  });
});

describe('backup run, verify and listing (Milestone 847)', () => {
  it('runs every destination, records backup_last and per-destination state, lists and fully verifies the backup', async () => {
    const f = open('run');
    await f.ss.add(new Uint8Array(randomBytes(40 * 1024)), 'doc');
    expect((await f.fail('backup.run')).code).toBe('refused');
    const id = (await f.call('backup.destination.add', { folder: f.folder('one'), passphrase: V2_PASSPHRASE })).destination.id as string;
    const ran = await f.call('backup.run');
    expect(ran.ok).toBe(true);
    expect(ran.results).toEqual([expect.objectContaining({ destination: id, ok: true, files: 3, blobs: 1, newBlobs: 1, reusedBlobs: 0 })]);
    const backupId = ran.results[0].backupId as string;
    expect(JSON.parse(getMeta(f.db, 'backup_last')!)).toMatchObject({ ok: true, file: backupId });
    expect(readDestinationState(f.db, id)).toMatchObject({ lastOutcome: 'success', lastBackupId: backupId });
    expect(f.auditRows().find((r) => r.event === 'backup.v2-created')).toMatchObject({ actor_kind: 'cli', outcome: 'success' });

    expect((await f.call('backup.destination.backups', { id })).backups).toEqual([{ backupId, at: '2026-10-04T12:00:00.000Z' }]);
    f.advance(60_000);
    const verified = await f.call('backup.destination.verify', { id });
    expect(verified).toMatchObject({ ok: true, id, backupId, files: 3, blobs: 1 });
    expect(readDestinationState(f.db, id).lastVerifiedAt).toBe('2026-10-04T12:01:00.000Z');
    expect(JSON.parse(f.auditRows().filter((r) => r.event === 'backup.v2-verified').at(-1)!.detail_json!)).toMatchObject({ destination: id, backupId, scope: 'full', trigger: 'manual' });
    expect((await f.fail('backup.destination.verify', { id: 'd-unknown' })).code).toBe('not-found');

    // Without the key (a restored Hub before the destination was added again), a run is refused before anything is written.
    f.keys.clear();
    expect((await f.fail('backup.run')).code).toBe('refused');
  });

  it('a failing destination is reported per destination and as a failed backup_last', async () => {
    const f = open('run-fail');
    const id = (await f.call('backup.destination.add', { folder: f.folder('one'), passphrase: V2_PASSPHRASE })).destination.id as string;
    // The repository disappears (an unplugged or wiped disk).
    const { rmSync } = await import('node:fs');
    rmSync(path.join(f.folder('one'), 'repo'));
    const ran = await f.call('backup.run', { destination: id });
    expect(ran).toEqual({ ok: false, results: [{ destination: id, ok: false, error: 'repository-missing' }] });
    expect(JSON.parse(getMeta(f.db, 'backup_last')!)).toMatchObject({ ok: false, error: 'repository-missing' });
  });
});

describe('backup drill and backup health (Milestone 850)', () => {
  it('drills every destination on demand, needs no confirmation, records the verdict and the manual audit rows, and leaves no scratch directory', async () => {
    const f = open('drill');
    await f.ss.add(new Uint8Array(randomBytes(40 * 1024)), 'doc');
    expect((await f.fail('backup.drill')).code).toBe('refused');
    const id = (await f.call('backup.destination.add', { folder: f.folder('one'), passphrase: V2_PASSPHRASE })).destination.id as string;
    expect((await f.fail('backup.drill', { destination: 'd-unknown' })).code).toBe('not-found');
    // No backup yet: nothing to drill, reported as not ok, nothing recorded.
    expect(await f.call('backup.drill')).toMatchObject({ ok: false, results: [{ destinationId: id, outcome: 'skipped', reason: 'no-backup' }] });
    const ran = await f.call('backup.run');
    expect(ran.ok).toBe(true);
    const drilled = await f.call('backup.drill', { destination: id });
    expect(drilled).toMatchObject({ ok: true, results: [{ destinationId: id, outcome: 'passed', backupId: ran.results[0].backupId, blobs: 1 }] });
    expect(readDestinationState(f.db, id)).toMatchObject({ lastDrillOutcome: 'success', lastDrillBackupId: ran.results[0].backupId });
    expect(f.auditRows().filter((r) => r.event === 'backup.drill-passed')).toMatchObject([{ actor_kind: 'cli', outcome: 'success' }]);
    expect(existsSync(path.join(f.paths.backupsDir, '.tmp', 'restore-drill')) ? readdirSync(path.join(f.paths.backupsDir, '.tmp', 'restore-drill')) : []).toEqual([]);
    // Without the master key the drill is refused before anything is opened.
    f.keys.clear();
    expect((await f.fail('backup.drill')).code).toBe('refused');
  });

  it('a corrupted backup fails the drill as a short code, and the schedule status shows health', async () => {
    const f = open('drill-fail');
    await f.ss.add(new Uint8Array(randomBytes(40 * 1024)), 'doc');
    const id = (await f.call('backup.destination.add', { folder: f.folder('one'), passphrase: V2_PASSPHRASE })).destination.id as string;
    await f.call('backup.run');
    const packs = readdirSync(path.join(f.folder('one'), 'packs')).filter((n) => !n.endsWith('.part'));
    const file = path.join(f.folder('one'), 'packs', packs[0]!);
    const bytes = readFileSync(file);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    writeFileSync(file, bytes);
    const result = await f.call('backup.drill');
    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({ destinationId: id, outcome: 'failed' });
    expect(result.results[0].reason).toMatch(/^[A-Za-z0-9_.-]{1,40}$/);
    expect(f.auditRows().filter((r) => r.event === 'backup.drill-failed')).toMatchObject([{ actor_kind: 'cli', outcome: 'failure' }]);
    const status = await f.call('backup.schedule.status');
    expect(status.health).toEqual({ destinations: [{ id, label: expect.any(String), overdue: null, failed: null, drillFailed: { code: result.results[0].reason } }], noDestination: null });
  });
});

describe('backup destination add, probe and remove for an S3 bucket (Milestone 848)', () => {
  const openS3 = async (label: string, serverOptions: ConstructorParameters<typeof FakeS3Server>[0] = {}) => {
    const f = open(label);
    const server = new FakeS3Server({ minPartBytes: 1024, ...serverOptions });
    servers.push(server);
    const endpoint = await server.start();
    const params = (extra: Record<string, unknown> = {}) => ({
      kind: 's3', endpoint, region: server.options.region, bucket: server.options.bucket, prefix: 'hub-one', allowPrivateNetwork: true,
      credentials: server.credentials, passphrase: V2_PASSPHRASE, ...extra,
    });
    return { f, server, endpoint, params };
  };

  it('creates the repository in the bucket, stores the credentials protected and keeps them out of hub.json, audit, meta, answers and logs', async () => {
    const { f, server, endpoint, params } = await openS3('s3-add', { sessionToken: 'FwoGZXIvYXdzSESSIONTOKENVALUE0123456789' });
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    const added = await f.call('backup.destination.add', params({ label: 'Cloud bucket' }));
    expect(added).toMatchObject({
      added: true, adopted: false,
      destination: { kind: 's3', label: 'Cloud bucket', endpoint, region: 'us-east-1', bucket: 'backups', prefix: 'hub-one', allowPrivateNetwork: true, credentialsStored: true },
    });
    const id = added.destination.id as string;
    expect(id).toMatch(/^d-[0-9a-f]{8}$/);
    expect(server.keys()).toEqual(['hub-one/repo']);
    expect(server.authFailures).toBe(0);
    expect(f.keys.key()).toHaveLength(32);
    expect(f.s3CredentialsPresent()).toBe(true);
    expect(f.s3Credentials.get(id)).toEqual(server.credentials);
    expect(loadOrCreateHubConfig(f.paths.configFile).backup?.destinations).toEqual([
      { id, kind: 's3', label: 'Cloud bucket', endpoint, region: 'us-east-1', bucket: 'backups', prefix: 'hub-one', allowPrivateNetwork: true },
    ]);
    expect(readDestinationState(f.db, id).repoId).toMatch(/^[0-9a-f]{32}$/);
    expect(readExpectedSecrets(f.ss.sdb)).toEqual(expect.arrayContaining(['backup.masterKey', 'backup.s3.credentials']));
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-added')).toEqual([
      { event: 'backup.destination-added', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ destination: id, kind: 's3', adopted: false }) },
    ]);
    const listed = await f.call('backup.destination.list');
    expect(listed.destinations).toEqual([expect.objectContaining({ id, kind: 's3', credentialsStored: true })]);
    const everything = JSON.stringify({
      added, listed, audit: f.auditRows(), meta: f.db.prepare('SELECT * FROM meta').all(), config: readFileSync(f.paths.configFile, 'utf8'),
      logged: logs.map((spy) => spy.mock.calls),
    });
    for (const secret of [server.options.secretAccessKey, 'FwoGZXIvYXdzSESSIONTOKENVALUE0123456789', V2_PASSPHRASE]) expect(everything, secret).not.toContain(secret);
  });

  it('backs up to the bucket, lists, fully verifies and probes it', async () => {
    const { f, server, params } = await openS3('s3-run');
    await f.ss.add(new Uint8Array(randomBytes(120 * 1024)), 'doc');
    const id = (await f.call('backup.destination.add', params())).destination.id as string;
    const ran = await f.call('backup.run');
    expect(ran).toMatchObject({ ok: true, results: [expect.objectContaining({ destination: id, ok: true, blobs: 1, newBlobs: 1 })] });
    const backupId = ran.results[0].backupId as string;
    expect(server.keys().filter((k) => k.startsWith('hub-one/manifests/'))).toHaveLength(1);
    expect(server.keys().some((k) => k.startsWith('hub-one/packs/'))).toBe(true);
    expect(server.uploads.size).toBe(0);
    expect((await f.call('backup.destination.backups', { id })).backups).toEqual([{ backupId, at: '2026-10-04T12:00:00.000Z' }]);
    expect(await f.call('backup.destination.verify', { id })).toMatchObject({ ok: true, id, backupId, blobs: 1 });
    expect(readDestinationState(f.db, id)).toMatchObject({ lastOutcome: 'success', lastBackupId: backupId });
    const before = server.keys();
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ id, kind: 's3', ok: true, conditionalWrites: 'enforced', multipart: true });
    expect(server.keys()).toEqual(before);
  });

  it('refuses an endpoint that would reach the metadata service, a private address without the owner opt-in, plain http and path tricks, storing nothing', async () => {
    const { f, server, params } = await openS3('s3-ssrf');
    const stored = () => ({ config: loadOrCreateHubConfig(f.paths.configFile).backup, key: f.keys.key(), creds: f.s3CredentialsPresent() });
    const before = stored();
    const cases: Array<[string, Record<string, unknown>]> = [
      ['https://169.254.169.254', { allowPrivateNetwork: true }],
      ['https://[fd00:ec2::254]', { allowPrivateNetwork: true }],
      ['https://[fe80::1]', { allowPrivateNetwork: true }],
      ['https://168.63.129.16', { allowPrivateNetwork: true }],
      ['https://127.0.0.1', { allowPrivateNetwork: false }],
      ['https://10.0.0.5', { allowPrivateNetwork: false }],
      ['http://s3.example.com', {}],
      ['http://127.0.0.1:9000', { allowPrivateNetwork: false }],
      ['https://user:pass@s3.example.com', {}],
      ['https://s3.example.com/bucket', {}],
      ['https://s3.example.com?x=1', {}],
      ['ftp://s3.example.com', {}],
      ['not a url', {}],
    ];
    for (const [endpoint, extra] of cases) {
      const error = await f.fail('backup.destination.add', params({ endpoint, ...extra }));
      expect(error.code, endpoint).toBe('bad-request');
      expect(error.message, endpoint).not.toContain(server.options.secretAccessKey);
      expect(error.message, endpoint).not.toContain('pass@');
      expect(stored(), endpoint).toEqual(before);
    }
    expect(server.requests).toEqual([]);
  });

  it('validates the bucket, region, prefix, flags, label, passphrase and credentials without echoing a secret', async () => {
    const { f, server, params } = await openS3('s3-validate');
    const secret = 'sup3r-s3cret-value-that-must-not-leak';
    const bad: Array<Record<string, unknown>> = [
      { bucket: 'AB' }, { bucket: 'has space bucket' }, { bucket: undefined }, { region: 'US EAST' }, { region: undefined }, { prefix: '../x' }, { prefix: 'a b' },
      { forcePathStyle: 'yes' }, { allowPrivateNetwork: 'yes' }, { label: '' }, { label: 'x'.repeat(65) },
      { credentials: undefined }, { credentials: 'AKIA:secret' }, { credentials: { accessKeyId: 'AKIA' } }, { credentials: { accessKeyId: 'AKIA', secretAccessKey: secret, extra: 1 } },
      { credentials: { accessKeyId: 'AK IA', secretAccessKey: secret } }, { credentials: { accessKeyId: 'AKIA', secretAccessKey: secret, sessionToken: 5 } },
      { passphrase: 'short' }, { passphrase: undefined }, { kind: 'azure' },
    ];
    for (const extra of bad) {
      const error = await f.fail('backup.destination.add', params(extra));
      expect(error.code, JSON.stringify(extra).replace(secret, '***')).toBe('bad-request');
      expect(error.message).not.toContain(secret);
    }
    expect(f.keys.key()).toBeNull();
    expect(f.s3CredentialsPresent()).toBe(false);
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(server.requests).toEqual([]);
  });

  it('removes the stored credentials, the key and the definition again when the bucket cannot be written (wrong credentials), keeping them out of the error', async () => {
    const { f, server, params } = await openS3('s3-badcreds');
    const wrong = { accessKeyId: server.options.accessKeyId, secretAccessKey: 'wrong/secret/never/leak/0123456789' };
    const error = await f.fail('backup.destination.add', params({ credentials: wrong }));
    expect(error.code).toBe('unavailable');
    expect(error.message).toContain('auth');
    expect(error.message).not.toContain(wrong.secretAccessKey);
    expect(f.s3CredentialsPresent()).toBe(false);
    expect(f.keys.key()).toBeNull();
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(server.keys()).toEqual([]);
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-added')).toEqual([]);
    expect(JSON.stringify(f.auditRows())).not.toContain(wrong.secretAccessKey);
  });

  it('refuses a second destination at the same bucket location or an overlapping prefix, accepts another prefix, and shares one key and passphrase', async () => {
    const { f, server, params } = await openS3('s3-two');
    await f.call('backup.destination.add', params());
    expect((await f.fail('backup.destination.add', params())).code).toBe('conflict');
    expect((await f.fail('backup.destination.add', params({ prefix: 'hub-one/nested' }))).code).toBe('conflict');
    expect((await f.fail('backup.destination.add', params({ prefix: undefined }))).code).toBe('conflict');
    const key = f.keys.key()!.slice();
    const wrong = await f.fail('backup.destination.add', params({ prefix: 'hub-two', passphrase: `${V2_PASSPHRASE}-other` }));
    expect(wrong.code).toBe('wrong-passphrase-or-corrupt');
    expect(server.keys()).toEqual(['hub-one/repo']);
    await f.call('backup.destination.add', params({ prefix: 'hub-two' }));
    expect(f.keys.key()).toEqual(key);
    expect(server.keys()).toEqual(['hub-one/repo', 'hub-two/repo']);
    expect((await f.call('backup.destination.list')).destinations).toHaveLength(2);
  });

  it('adopts a bucket prefix that already holds this key\'s repository (a rebuilt Hub continues its chain)', async () => {
    const { f, server, params } = await openS3('s3-adopt');
    await f.call('backup.destination.add', params());
    const repo = Buffer.from(server.objects.get('hub-one/repo')!.bytes);
    // A second Hub (no key yet) adds the same bucket location: the repository is adopted, not recreated.
    const other = open('s3-adopt-2');
    const adopted = await other.call('backup.destination.add', params());
    expect(adopted.adopted).toBe(true);
    expect(server.objects.get('hub-one/repo')!.bytes.equals(repo)).toBe(true);
    expect(other.keys.key()).toEqual(f.keys.key());
  });

  it('probes an S3 destination and a local folder, reports failures without throwing, and refuses an unknown id', async () => {
    const { f, server, params } = await openS3('s3-probe');
    const id = (await f.call('backup.destination.add', params())).destination.id as string;
    const report = await f.call('backup.destination.probe', { id });
    expect(report).toMatchObject({ id, kind: 's3', ok: true, write: true, read: true, delete: true, multipart: true, conditionalWrites: 'enforced', addressing: 'path' });
    expect(typeof report.latencyMs).toBe('number');
    expect(JSON.stringify(report)).not.toContain(server.options.secretAccessKey);
    server.fail((r) => r.method === 'PUT' && r.path.includes('/.dude-probe/'), { kind: 'status', status: 403, code: 'AccessDenied' }, 5);
    expect(await f.call('backup.destination.probe', { id })).toMatchObject({ id, kind: 's3', ok: false, failedStep: 'write', reason: 'auth' });
    server.clearFaults();
    const local = (await f.call('backup.destination.add', { folder: f.folder('usb'), passphrase: V2_PASSPHRASE })).destination.id as string;
    expect(await f.call('backup.destination.probe', { id: local })).toEqual({ id: local, kind: 'local-folder', ok: true });
    expect((await f.fail('backup.destination.probe', { id: 'd-unknown' })).code).toBe('not-found');
    expect((await f.fail('backup.destination.probe', {})).code).toBe('bad-request');
    // Credentials that disappeared (a restore onto another machine) are an `unavailable` answer, never an unsigned request.
    const requests = server.requests.length;
    f.s3Credentials.delete(id);
    expect((await f.fail('backup.destination.probe', { id })).code).toBe('unavailable');
    expect(server.requests.length).toBe(requests);
  });

  it('removing an S3 destination is two-step, deletes the credentials, and never touches the bucket', async () => {
    const { f, server, params } = await openS3('s3-remove');
    const first = (await f.call('backup.destination.add', params())).destination.id as string;
    const second = (await f.call('backup.destination.add', params({ prefix: 'hub-two' }))).destination.id as string;
    const preview = await f.call('backup.destination.remove.preview', { id: first });
    expect(preview.consequenceClass).toEqual(['system-config', 'secret-management']);
    expect(preview.summary).toMatchObject({ id: first, kind: 's3', bucket: 'backups', prefix: 'hub-one', removesCredentials: true, last: false });
    expect(JSON.stringify(preview)).not.toContain(server.options.secretAccessKey);
    expect(f.s3Credentials.has(first)).toBe(true);
    expect((await f.fail('backup.destination.remove.apply', { id: first })).code).toBe('bad-request');
    const applied = await f.call('backup.destination.remove.apply', { id: first, confirmToken: preview.confirmToken });
    expect(applied).toMatchObject({ removed: true, id: first, last: false, credentialsRemoved: true });
    expect(f.s3Credentials.has(first)).toBe(false);
    expect(f.s3Credentials.has(second)).toBe(true);
    expect(server.keys()).toEqual(['hub-one/repo', 'hub-two/repo']);
    expect(f.auditRows().filter((r) => r.event === 'backup.destination-removed').map((r) => JSON.parse(r.detail_json!))).toEqual([
      { destination: first, kind: 's3', last: false, unattendedCleared: false, credentialsCleared: true },
    ]);
    const lastPreview = await f.call('backup.destination.remove.preview', { id: second });
    await f.call('backup.destination.remove.apply', { id: second, confirmToken: lastPreview.confirmToken });
    expect(f.s3CredentialsPresent()).toBe(false);
    expect(f.keys.key()).toBeNull();
  });
});
