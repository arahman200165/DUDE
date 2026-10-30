import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import {
  HUB_STANDBY_PATHS, STANDBY_CONSEQUENCE_CLASS, StandbyObjectName, StandbyObjectsQuery, StandbyObjectsResponse, StandbyRepositoriesResponse, parseStandbyRange,
  standbyObjectPath, standbyObjectsPath,
} from './standby.schema.js';

describe('warm standby contracts', () => {
  it('names the device-token routes and the closed audit events', () => {
    expect(HUB_STANDBY_PATHS.repositories).toBe('/api/v1/standby/repositories');
    expect(standbyObjectsPath('usb-1')).toBe('/api/v1/standby/repositories/usb-1/objects');
    expect(standbyObjectPath('usb-1', 'packs/0123')).toBe('/api/v1/standby/repositories/usb-1/object?name=packs%2F0123');
    expect(HUB_AUDIT_EVENTS).toEqual(expect.arrayContaining(['standby.granted', 'standby.revoked', 'standby.denied', 'standby.pulled']));
    expect([...STANDBY_CONSEQUENCE_CLASS]).toEqual(['authentication', 'database-write']);
  });

  it('accepts exactly the repository object names', () => {
    for (const name of ['repo', `packs/${'a'.repeat(32)}`, `manifests/20261027T101500Z-${'0'.repeat(32)}`]) expect(Value.Check(StandbyObjectName, name), name).toBe(true);
    for (const name of ['repo.part', `packs/${'A'.repeat(32)}`, `packs/${'a'.repeat(32)}.part`, '../repo', 'packs/../repo', 'manifests/x', 'hub.json', '']) expect(Value.Check(StandbyObjectName, name), name).toBe(false);
    expect(Value.Check(StandbyObjectsQuery, { prefix: 'packs/', limit: '10' })).toBe(true);
    expect(Value.Check(StandbyObjectsQuery, { prefix: 'other' })).toBe(false);
    expect(Value.Check(StandbyObjectsQuery, { limit: 10 })).toBe(false);
  });

  it('describes the listing and the repositories without a folder', () => {
    expect(Value.Check(StandbyObjectsResponse, { objects: [{ name: 'repo', size: 10 }], next: null })).toBe(true);
    expect(Value.Check(StandbyRepositoriesResponse, { deviceId: 'd', grantedAt: 't', repositories: [{ id: 'usb', kind: 'local-folder', label: 'USB', lastSuccessAt: null, lastBackupId: null }] })).toBe(true);
    expect(Value.Check(StandbyRepositoriesResponse, { deviceId: 'd', grantedAt: 't', repositories: [{ id: 'b', kind: 's3', label: 'B', lastSuccessAt: null, lastBackupId: null }] })).toBe(false);
  });

  it('parses one byte range and refuses every other form', () => {
    expect(parseStandbyRange(undefined, 100)).toBeNull();
    expect(parseStandbyRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseStandbyRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseStandbyRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseStandbyRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseStandbyRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    expect(parseStandbyRange(' bytes=1-1 ', 100)).toEqual({ start: 1, end: 1 });
    for (const bad of ['bytes=100-', 'bytes=5-4', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'items=0-1', 'bytes=a-b', 'bytes=0-99999999999999999']) {
      expect(parseStandbyRange(bad, 100), bad).toBe('unsatisfiable');
    }
    expect(parseStandbyRange('bytes=0-', 0)).toBe('unsatisfiable');
  });
});
