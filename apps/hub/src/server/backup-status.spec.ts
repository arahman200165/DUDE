import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BackupStatusResponse } from '@dude/contracts/hub';
import { Value } from 'typebox/value';
import { writeBackupLast } from '../backup/backup-state.js';
import { applyBackupScheduleChange, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import { getAuthorityEpoch, setAuthority } from '../hub/authority.js';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { tempDir } from './test-helpers.js';

/** `GET /api/v1/backup/status`: the owner's read model of authority, the last backup, the schedule and re-pair needs. */
describe('GET /backup/status', () => {
  let h: AuthHub;
  let owner: Signed;
  let keyPresent = false;
  const db = () => h.hub.hub.db;
  beforeAll(async () => { h = await startAuthHub({ backup: { scheduleKeyPresent: () => keyPresent } }); });
  afterAll(async () => { await h.close(); });
  beforeEach(async () => {
    db().prepare('DELETE FROM throttle').run();
    db().prepare("DELETE FROM meta WHERE key = 'backup_last'").run();
    setAuthority(db(), { epoch: 1, state: 'active' });
    keyPresent = false;
    owner = await h.signIn();
  });

  const status = () => h.call('GET', '/backup/status', { cookie: owner.cookie });

  it('reports a fresh Hub: authority 1 active, no backup, no schedule, the default folder and nothing to re-pair', async () => {
    const res = await status();
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(res.json).toEqual({
      authority: { epoch: 1, state: 'active' },
      lastBackup: null,
      schedule: { configured: false, keyPresent: false },
      defaultFolder: h.hub.paths.backupsDir,
      devicesNeedingRePair: 0,
    });
    expect(Value.Check(BackupStatusResponse, res.json)).toBe(true);
  });

  it('is owner-only: a missing credential is 401 and a device token is refused', async () => {
    expect((await h.call('GET', '/backup/status')).status).toBe(401);
    const { token } = await enrolled(h, owner);
    expect((await h.call('GET', '/backup/status', { bearer: token, noOrigin: true })).status).toBe(403);
    expect((await h.call('GET', '/backup/status', { cookie: 'not-a-session' })).status).toBe(401);
  });

  it('works with an owner bearer session too', async () => {
    const { token } = await enrolled(h, owner);
    const bearer = await h.call('POST', '/auth/owner/bearer', { bearer: token, noOrigin: true, body: { password: PASSWORD } });
    expect(bearer.status).toBe(200);
    const res = await h.call('GET', '/backup/status', { bearer: bearer.json.accessToken as string, noOrigin: true });
    expect(res.status).toBe(200);
    expect(res.json.authority).toEqual({ epoch: 1, state: 'active' });
  });

  it('returns the last backup record (file NAME only) for a success and a failure', async () => {
    writeBackupLast(db(), { at: '2026-03-01T00:10:00.000Z', ok: true, file: 'dude-hub-20260301T001000Z.dudebackup', size: 4096 });
    expect((await status()).json.lastBackup).toEqual({ at: '2026-03-01T00:10:00.000Z', ok: true, file: 'dude-hub-20260301T001000Z.dudebackup', size: 4096 });
    writeBackupLast(db(), { at: '2026-03-01T01:00:00.000Z', ok: false, error: 'ENOSPC' });
    const failed = await status();
    expect(failed.json.lastBackup).toEqual({ at: '2026-03-01T01:00:00.000Z', ok: false, error: 'ENOSPC' });
    expect(Value.Check(BackupStatusResponse, failed.json)).toBe(true);
  });

  it('reports the configured schedule and whether its key is present, never the key or other paths', async () => {
    const folder = path.join(tempDir('hub-sched-'), 'sched');
    const configFile = h.hub.paths.configFile;
    writeHubConfig(configFile, applyBackupScheduleChange(loadOrCreateHubConfig(configFile), { folder, intervalHours: 12, retention: 5 }));
    keyPresent = true;
    const res = await status();
    expect(res.status).toBe(200);
    expect(res.json.schedule).toEqual({ configured: true, folder, intervalHours: 12, retention: 5, keyPresent: true });
    expect(res.json.defaultFolder).toBe(h.hub.paths.backupsDir);
    keyPresent = false;
    expect((await status()).json.schedule.keyPresent).toBe(false);
    // Nothing but the two folders carries a path: the whole body names no other directory of this Hub.
    for (const secret of [h.hub.paths.configDir, h.hub.paths.tlsDir, h.hub.paths.dbFile]) expect(res.raw.body).not.toContain(JSON.stringify(secret).slice(1, -1));
    writeHubConfig(configFile, applyBackupScheduleChange(loadOrCreateHubConfig(configFile), null));
    expect((await status()).json.schedule).toEqual({ configured: false, keyPresent: false });
  });

  it('reflects the authority epoch and counts only active desktop devices awaiting re-pair', async () => {
    setAuthority(db(), { epoch: 4, state: 'active' });
    expect((await status()).json.authority).toEqual({ epoch: 4, state: 'active' });
    expect((await status()).json.devicesNeedingRePair).toBe(0);
    const a = await enrolled(h, owner);
    const b = await enrolled(h, owner);
    await enrolled(h, owner);
    db().prepare('UPDATE devices SET needs_re_pair = 1 WHERE device_id IN (?, ?)').run(a.device.deviceId, b.device.deviceId);
    expect((await status()).json.devicesNeedingRePair).toBe(2);
    db().prepare('UPDATE devices SET revoked_at = ? WHERE device_id = ?').run(new Date(h.clock.t).toISOString(), b.device.deviceId);
    expect((await status()).json.devicesNeedingRePair).toBe(1);
    db().prepare('UPDATE devices SET needs_re_pair = 0 WHERE device_id = ?').run(a.device.deviceId);
    expect((await status()).json.devicesNeedingRePair).toBe(0);
  });

  it('is fenced like every other API route once the Hub is transferred', async () => {
    setAuthority(db(), { epoch: getAuthorityEpoch(db()), state: 'transferred' });
    const res = await status();
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('hub-transferred');
  });
});
