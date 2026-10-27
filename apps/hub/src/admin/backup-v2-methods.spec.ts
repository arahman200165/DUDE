import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { getMeta } from '@dude/sqlite-store';
import { openV2AdminFixture, V2_PASSPHRASE } from '../backup/backup-v2-admin-fixture.js';
import { makeRepositoryFolder, randomCheapDeps } from '../backup/backup-fixture.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { readDestinationState } from '../hub/backup-destination-state.js';
import { readExpectedSecrets } from '../provisioning/index.js';

const fixtures: Array<ReturnType<typeof openV2AdminFixture>> = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });
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
