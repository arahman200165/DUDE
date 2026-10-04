import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cheapDeps } from '../backup/backup-fixture.js';
import { createBackupFile } from '../backup/create-backup.js';
import { applyRestore, previewRestore } from '../backup/restore.js';
import { defaultHubConfig } from '../config/hub-config.js';
import { getAuthorityEpoch } from '../hub/authority.js';
import { listAudit } from '../security/audit.js';
import { PASSWORD, START, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub } from './auth-test-helpers.js';
import { createPairingCode, deviceToken, enroll, enrolled, newDevice } from './device-test-helpers.js';
import type { SimDevice } from './device-test-helpers.js';
import { tempDir } from './test-helpers.js';

const PASSPHRASE = 'restore repair scenario passphrase';

/**
 * The whole 31G re-pair journey on real Hubs: a source Hub with an enrolled desktop device, an encrypted backup, an offline restore
 * into a fresh data root, the restored Hub served by the real server, and the owner re-attaching the SAME device id with a NEW key.
 */
describe('restore then re-pair a desktop device', () => {
  let source: AuthHub;
  let restored: AuthHub;
  let device: SimDevice;
  let root: string;

  beforeAll(async () => {
    source = await startAuthHub();
    const owner = await source.signIn();
    device = (await enrolled(source, owner)).device;

    // hub.json is part of every backup; the restore keeps only port and names from it.
    writeFileSync(source.hub.paths.configFile, `${JSON.stringify(defaultHubConfig())}\n`);
    const deps = cheapDeps(() => new Date(START));
    const created = await createBackupFile({
      db: source.hub.hub.db, paths: source.hub.paths, hubVersion: 'test', hubInstanceId: source.hub.hub.hubInstanceId,
      authorityEpoch: getAuthorityEpoch(source.hub.hub.db), forTransfer: false, targetDir: path.join(source.hub.paths.root, 'out'),
      credential: { passphrase: PASSPHRASE }, deps, workDir: path.join(source.hub.paths.backupsDir, '.tmp'),
    });

    root = tempDir('hub-restored-');
    const preview = await previewRestore({ file: created.file, passphrase: PASSPHRASE, dataRoot: root, deps, now: () => START });
    await applyRestore({
      file: created.file, passphrase: PASSPHRASE, dataRoot: root, confirmToken: preview.confirmToken, oldHubGoneConfirmed: true, deps, now: () => START,
    });
    restored = await startAuthHub({ dataRoot: root, bootstrapped: true });
  });
  afterAll(async () => {
    await restored?.close();
    await source?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('restores a Hub with a new identity whose owner signs in with the old password', async () => {
    expect(restored.hub.hub.hubInstanceId).not.toBe(source.hub.hub.hubInstanceId);
    expect(getAuthorityEpoch(restored.hub.hub.db)).toBe(getAuthorityEpoch(source.hub.hub.db) + 1);
    const wrong = await restored.call('POST', '/auth/sign-in', { body: { password: 'not the password at all' } });
    expect(wrong.status).toBe(401);
  });

  it('shows the device needing re-pair, re-attaches it with a new key, and refuses the old key', async () => {
    const owner = await restored.signIn(PASSWORD);
    const ownerAuth = { cookie: owner.cookie, csrf: owner.csrf };
    const listed = async () => (await restored.call('GET', '/devices', { cookie: owner.cookie })).json.find((d: { deviceId: string }) => d.deviceId === device.deviceId);

    expect(await listed()).toMatchObject({ deviceId: device.deviceId, needsRePair: true, revokedAt: null, unenrolledAt: null });
    expect((await restored.call('GET', '/backup/status', { cookie: owner.cookie })).json).toMatchObject({ devicesNeedingRePair: 1, authority: { state: 'active' } });
    // Restore revoked the old key: the device cannot authenticate yet.
    expect((await deviceToken(restored, device)).token).toBe('');

    // An ordinary code cannot be used to take over the row.
    const ordinary = await createPairingCode(restored, owner);
    const fresh = newDevice(device.deviceId);
    expect((await enroll(restored, fresh, { code: ordinary.json.pairingCode })).status).toBe(409);

    const created = await restored.call('POST', '/pairing-codes', { ...ownerAuth, body: { reattachDeviceId: device.deviceId } });
    expect(created.status).toBe(200);
    expect(created.json.reattachDeviceId).toBe(device.deviceId);
    const res = await enroll(restored, fresh, { code: created.json.pairingCode });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ deviceId: device.deviceId, hubInstanceId: restored.hub.hub.hubInstanceId });

    const { token, res: tokenRes } = await deviceToken(restored, fresh);
    expect(tokenRes.status).toBe(200);
    expect(token).toMatch(/^ddt_/);
    expect(tokenRes.json.authorityEpoch).toBe(getAuthorityEpoch(restored.hub.hub.db));
    expect((await restored.call('GET', '/devices/self', { bearer: token })).status).toBe(200);
    // The old key stays dead.
    expect((await deviceToken(restored, device)).token).toBe('');

    expect(await listed()).toMatchObject({ deviceId: device.deviceId, needsRePair: false, revokedAt: null, unenrolledAt: null, registeredAt: expect.any(String) });
    expect((await restored.call('GET', '/backup/status', { cookie: owner.cookie })).json.devicesNeedingRePair).toBe(0);
    const enrolledAudit = listAudit(restored.hub.hub.db, { limit: 50 }).find((r) => r.event === 'device.enrolled');
    expect((enrolledAudit?.detail as Record<string, unknown>).reattach).toBe(true);
  });
});
