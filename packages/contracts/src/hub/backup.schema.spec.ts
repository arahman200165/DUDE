import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { BACKUP_DRIVE_CONNECT_ACTION, BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS, BACKUP_DRIVE_SCOPE, BACKUP_V2_RETENTION_DEFAULT, BackupStatusResponse, HUB_BACKUP_DRIVE_PATHS } from './backup.schema.js';

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
    for (const event of ['backup.v2-created', 'backup.v2-failed', 'backup.v2-verified', 'backup.v2-pruned', 'backup.destination-added', 'backup.destination-removed', 'backup.drive-authorized', 'backup.rewrapped', 'backup.drill-passed', 'backup.drill-failed']) {
      expect(HUB_AUDIT_EVENTS).toContain(event);
    }
  });

  it('accepts the backup health and restore drill fields, optional so a Hub from before still reads (Milestone 850)', () => {
    const destination = {
      id: 'd-1a2b3c4d', kind: 'local-folder', label: 'USB disk', lastSuccessAt: null, lastBackupId: null, lastError: null, lastErrorAt: null, lastVerifiedAt: null, repoBytes: null, nextDueAt: null,
    };
    const drilled = { ...destination, overdue: true, lastDrillAt: '2026-10-28T00:00:00.000Z', lastDrillOutcome: 'failure', lastDrillBackupId: 'b', lastDrillError: 'integrity-failed', nextDrillDueAt: '2026-10-29T00:00:00.000Z' };
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [destination, drilled, { ...drilled, lastDrillOutcome: null, lastDrillAt: null, nextDrillDueAt: null }] })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [{ ...drilled, lastDrillOutcome: 'maybe' }] })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [{ ...drilled, overdue: 'yes' }] })).toBe(false);
    const health = { overdue: false, lastRunFailed: true, drillFailed: false, noDestinationSince: null };
    expect(Value.Check(BackupStatusResponse, { ...base, health })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, health: { ...health, noDestinationSince: '2026-10-28T00:00:00.000Z' } })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, health: { overdue: false } })).toBe(false);
  });

  it('rejects a bad epoch, an unknown state, a missing field and a negative count', () => {
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 0, state: 'active' } })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 1, state: 'gone' } })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, devicesNeedingRePair: -1 })).toBe(false);
    const { defaultFolder: _omitted, ...missing } = base;
    expect(Value.Check(BackupStatusResponse, missing)).toBe(false);
  });
});

describe('the Google Drive backup destination contract (Milestone 856)', () => {
  it('names one callback route under the backup namespace, asks only for the drive.file scope and tags the connect action', () => {
    expect(HUB_BACKUP_DRIVE_PATHS).toEqual({ callback: '/api/v1/backup/drive/callback' });
    expect(BACKUP_DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    expect(BACKUP_DRIVE_CONNECT_ACTION).toBe('backup.destination.drive.connect');
    expect([...BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS]).toEqual(['secret-management', 'remote-write']);
    expect(HUB_AUDIT_EVENTS).toContain('backup.drive-authorized');
  });

  it('reports a Drive destination in the status read model by its kind string, like any other', () => {
    const base = { authority: { epoch: 1, state: 'active' }, lastBackup: null, schedule: { configured: false }, defaultFolder: 'C:\Hub\backups', devicesNeedingRePair: 0 };
    const destination = { id: 'd-1a2b3c4d', kind: 'drive', label: 'My Drive', lastSuccessAt: null, lastBackupId: null, lastError: 'reauth', lastErrorAt: '2026-10-30T00:00:00.000Z', lastVerifiedAt: null, repoBytes: null, nextDueAt: null };
    expect(Value.Check(BackupStatusResponse, { ...base, destinations: [destination] })).toBe(true);
  });
});
