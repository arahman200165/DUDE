import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { BackupStatusResponse } from './backup.schema.js';

describe('BackupStatusResponse', () => {
  const base = { authority: { epoch: 1, state: 'active' }, lastBackup: null, schedule: { configured: false }, defaultFolder: 'C:\\Hub\\backups', devicesNeedingRePair: 0 };

  it('accepts a fresh Hub, a recorded success and failure, and a configured schedule', () => {
    expect(Value.Check(BackupStatusResponse, base)).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, lastBackup: { at: '2026-10-04T00:00:00.000Z', ok: true, file: 'a.dudebackup', size: 12 } })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, lastBackup: { at: '2026-10-04T00:00:00.000Z', ok: false, error: 'ENOSPC' } })).toBe(true);
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 3, state: 'transferred' }, schedule: { configured: true, folder: 'D:\\b', intervalHours: 24, retention: 7, keyPresent: true }, devicesNeedingRePair: 2 })).toBe(true);
  });

  it('rejects a bad epoch, an unknown state, a missing field and a negative count', () => {
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 0, state: 'active' } })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, authority: { epoch: 1, state: 'gone' } })).toBe(false);
    expect(Value.Check(BackupStatusResponse, { ...base, devicesNeedingRePair: -1 })).toBe(false);
    const { defaultFolder: _omitted, ...missing } = base;
    expect(Value.Check(BackupStatusResponse, missing)).toBe(false);
  });
});
