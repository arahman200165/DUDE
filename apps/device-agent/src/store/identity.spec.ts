import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTemp, commitContext, openOptions, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from './entity-commit.js';
import { openDeviceStore } from './open-store.js';
import { renameDevice } from './identity.js';
import { getMeta } from '@dude/sqlite-store';

afterEach(cleanupTemp);

const fav = (id: string, order = 0) => ({ entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert' as const, payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order } });

describe('device identity', () => {
  it('is stable across reopen and defaults the display name', () => {
    const dir = tempDir();
    const a = openReady(dir);
    const first = a.device;
    expect(first.displayName).toBe('Windows PC');
    expect(first.hubEligible).toBe(true);
    expect(first.storeSchemaVersion).toBe(2);
    a.close();
    const b = openReady(dir);
    expect(b.device.deviceId).toBe(first.deviceId);
    expect(b.device.createdAt).toBe(first.createdAt);
    expect(b.device.clonedFrom).toBeUndefined();
  });

  it('detects a clone: new deviceId, clonedFrom, unsent ops rewritten, secrets need re-entry', () => {
    const dir = tempDir();
    const a = openReady(dir);
    const oldId = a.device.deviceId;
    commitEntity(a.db, commitContext(a), fav('x'));
    a.db.prepare("INSERT INTO secret_refs(ref, purpose, owner, scope, created_at) VALUES('secret:1', 'llm.apiKey', 'o', 'device', 't')").run();
    a.close();
    const b = openReady(dir, { machineGuid: 'guid-B' });
    expect(b.device.deviceId).not.toBe(oldId);
    expect(b.device.clonedFrom).toBe(oldId);
    expect(getMeta(b.db, 'cloned_from')).toBe(oldId);
    expect((b.db.prepare('SELECT device_id FROM outbox').get() as { device_id: string }).device_id).toBe(b.device.deviceId);
    expect((b.db.prepare('SELECT needs_reentry AS n FROM secret_refs').get() as { n: number }).n).toBe(1);
    b.close();
    const c = openReady(dir, { machineGuid: 'guid-B' });
    expect(c.device.deviceId).toBe(b.device.deviceId);
  });

  it('skips clone detection when machineGuid is null', () => {
    const dir = tempDir();
    const a = openReady(dir);
    a.close();
    const b = openReady(dir, { machineGuid: null });
    expect(b.device.deviceId).toBe(a.device.deviceId);
  });

  it('renames with validation, and web devices are not hub eligible', () => {
    const dir = tempDir();
    const s = openReady(dir, { appInfo: { appVersion: '1', platform: 'web', os: 'x', arch: 'y' }, machineGuid: null });
    expect(s.device.hubEligible).toBe(false);
    expect(renameDevice(s.db, '  Desk  ')).toEqual({ ok: true, value: 'Desk' });
    expect(renameDevice(s.db, '')).toMatchObject({ ok: false });
    expect(getMeta(s.db, 'display_name')).toBe('Desk');
  });

  it('reports corrupt for a garbage file', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'dude-device.db'), 'this is not a database'.repeat(100));
    expect(openDeviceStore(openOptions(dir)).status).toBe('corrupt');
  });
});
