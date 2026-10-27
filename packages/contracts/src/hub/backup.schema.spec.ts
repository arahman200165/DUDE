import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { BACKUP_V2_RETENTION_DEFAULT, BackupStatusResponse } from './backup.schema.js';

describe('BackupStatusResponse', () => {
  const base = { authority: { epoch: 1, state: 'active' }, lastBackup: null, schedule: { configured: false }, defaultFolder: 'C:\\Hub\\backups', devicesNeedingRePair: 0 };

  it('accepts a fresh Hub, a recorded success and failure, and a configured schedule', () => {
    expect(Value.Check(BackupStatusResponse, base)).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, lastBackup: { at: '2026-10-04T00:00:00.000Z', ok: true, file: 'a.dudebackup', size: 12 } })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, lastBackup: { at: '2026-10-04T00:00:00.000Z', ok: false, error: 'ENOSPC' } })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 3, state: 'transferred' }, schedule: { configured: true, folder: 'D:\\b', intervalHours: 24, retention: 7, keyPresent: true }, devicesNeedingRePair: 2 })).toBe(true);
  });

  it('accepts the backup v2 destinations, retention and next run (Milestone 847)', () => {
    const destination = {
      id: 'd-1a2b3c4d', kind: 'local-folder', label: 'USB disk', lastSuccessAt: '2026-10-27T00:00:00.000Z', lastBackupId: '20261027T000000Z-' + 'a'.repeat(32),
      lastError: null, lastErrorAt: null, lastVerifiedAt: '2026-10-27T00:00:01.000Z', repoBytes: 1234, nextDueAt: '2026-10-28T00:00:00.000Z',
    };
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [destination], retention: BACKUP_V2_RETENTION_DEFAULT, nextScheduledAt: null })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [{ ...destination, repoBytes: -1 }] })).toBe(false);
    const { label: _label, ...unlabelled } = destination;
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [unlabelled] })).toBe(false);
    expect(BACKUP_V2_RETENTION_DEFAULT).toEqual({ daily: 7, weekly: 4, monthly: 6 });
    for (const event of ['backup.v2-created', 'backup.v2-failed', 'backup.v2-verified', 'backup.v2-pruned', 'backup.destination-added', 'backup.destination-removed', 'backup.rewrapped']) {
      expect(HUB_AUDIT_EVENTS).toContain(event);
    }
  });

  it('rejects a bad epoch, an unknown state, a missing field and a negative count', () => {
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 0, state: 'active' } })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 1, state: 'gone' } })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, devicesNeedingRePair: -1 })).toBe(false);
    const { defaultFolder: _omitted, ...missing } = base;
    expect(Value.Check(BackupStatusResponse, missing)).toBe(false);
  });
});
