import { describe, expect, it } from 'vitest';
import { kvSyncEntityOf, kvSyncEntityOfStored } from './kv-sync-entity.js';

describe('kvSyncEntityOf', () => {
  it('journals a local-policy environment tool preference as a wrapped setting', () => {
    expect(kvSyncEntityOf('base64', 'mode', 'local', 'environment')).toEqual({ entityType: 'setting', entityId: 'base64:mode', schemaVersion: 1, wrapped: true });
  });
  it('keeps session, user-choice and device-scope keys local', () => {
    expect(kvSyncEntityOf('base64', 'mode', 'session', 'local-only')).toBeUndefined();
    expect(kvSyncEntityOf('base64', 'mode', 'local', 'device')).toBeUndefined();
    expect(kvSyncEntityOf('base64', 'mode', undefined, undefined)).toBeUndefined();
    expect(kvSyncEntityOf('__consent__', 'x', 'local', 'environment')).toBeUndefined();
  });
  it('maps the bound singletons to their own entities with the bare value', () => {
    expect(kvSyncEntityOf('__workspace__', 'scratchpad', 'local', 'environment')).toMatchObject({ entityType: 'scratchpad', entityId: 'default', wrapped: false });
    expect(kvSyncEntityOf('__workspace__', 'layout', 'local', 'device')).toMatchObject({ entityType: 'workspace-layout', wrapped: false });
  });
  it('decides stored keys from the manifests', () => {
    const tools = [{ id: 'base64', persistence: { preferences: 'local' as const } }, { id: 'jwt', persistence: { preferences: 'session' as const } }];
    expect(kvSyncEntityOfStored('base64', 'mode', tools)).toMatchObject({ entityId: 'base64:mode' });
    expect(kvSyncEntityOfStored('jwt', 'mode', tools)).toBeUndefined();
  });
});
