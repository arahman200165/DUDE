import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncRecord } from '@dude/contracts/hub';
import type { StorageBackend } from '../persistence/storage-backend';
import { toStorageKey } from '../persistence/device-store/device-kv-backend';
import { createHubKvBackend, type HubKvBackend } from './hub-kv-backend';
import { ALL_ON, apiError, makeRig, type Rig } from './testing/fake-hub';
import type { HubWebAccess } from './hub-web.types';

const META = { policy: 'local', scope: 'environment' } as const;
const key = (ns: string, k: string): string => toStorageKey(ns, k);

function memoryLocal(): StorageBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => (data.set(k, v), true),
    remove: (k) => void data.delete(k),
    keys: (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
}

const settingRecord = (ns: string, k: string, value: unknown, revision = 1): SyncRecord => ({
  entityType: 'setting', entityId: `${ns}:${k}`, revision, deleted: false, payload: { namespace: ns, key: k, value }, schemaVersion: 1, updatedAt: '', updatedByDeviceId: null,
});

describe('createHubKvBackend', () => {
  let rig: Rig;
  let local: ReturnType<typeof memoryLocal>;
  let backends: HubKvBackend[];

  const make = (records: SyncRecord[] = [], access: HubWebAccess = ALL_ON): HubKvBackend => {
    for (const r of records) {
      rig.hub.external(r.entityType, r.entityId, r.payload);
      rig.book.noteRecord({ ...r, revision: rig.hub.head });
    }
    const backend = createHubKvBackend({ engine: rig.engine, access, records, local, debounceMs: 500 });
    backends.push(backend);
    return backend;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rig = makeRig();
    local = memoryLocal();
    backends = [];
  });
  afterEach(() => {
    backends.forEach((b) => b.dispose());
    vi.useRealTimers();
  });

  it('seeds shared keys from the snapshot, ignoring disabled categories', () => {
    const backend = make([settingRecord('base64', 'mode', 'url')], { ...ALL_ON, settings: false });
    expect(backend.get(key('base64', 'mode'))).toBeNull();
    const on = make([settingRecord('base64', 'mode', 'url')]);
    expect(on.get(key('base64', 'mode'))).toBe('"url"');
  });

  it('seeds bound singletons as bare values', () => {
    const record: SyncRecord = { entityType: 'scratchpad', entityId: 'default', revision: 1, deleted: false, payload: 'hello', schemaVersion: 1, updatedAt: '', updatedByDeviceId: null };
    const backend = make([record]);
    expect(backend.get(key('__workspace__', 'scratchpad'))).toBe('"hello"');
  });

  it('sends non-shared keys to browser storage and never to the Hub', () => {
    const backend = make();
    backend.set(key('base64', 'cache'), '1', { policy: 'session', scope: 'local-only' });
    backend.set(key('__consent__', 'x:y'), 'true', { policy: 'local', scope: 'device' });
    expect(local.data.size).toBe(2);
    expect(backend.pendingCount()).toBe(0);
    expect(backend.get(key('base64', 'cache'))).toBe('1');
    expect(backend.keys('dude:v1:')).toHaveLength(2);
  });

  it('keeps a shared write in memory, debounces and pushes a setting op like the Agent', async () => {
    const backend = make();
    backend.set(key('base64', 'mode'), '"a"', META);
    backend.set(key('base64', 'mode'), '"b"', META);
    backend.set(key('base64', 'wrap'), 'true', META);
    expect(backend.get(key('base64', 'mode'))).toBe('"b"');
    expect(local.data.size).toBe(0);
    expect(rig.hub.pushes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.hub.pushes).toHaveLength(1);
    expect(rig.hub.pushes[0]!.map((o) => [o.entityType, o.entityId, o.payload, o.opKind, o.basedOnRevision])).toEqual([
      ['setting', 'base64:mode', { namespace: 'base64', key: 'mode', value: 'b' }, 'upsert', null],
      ['setting', 'base64:wrap', { namespace: 'base64', key: 'wrap', value: true }, 'upsert', null],
    ]);
    expect(backend.pendingCount()).toBe(0);
    expect(rig.book.get('setting', 'base64:mode').revision).toBe(1);
  });

  it('pushes a bound singleton with the bare value and a delete for a removed key', async () => {
    const backend = make([settingRecord('base64', 'mode', 'x')]);
    backend.set(key('__workspace__', 'scratchpad'), '"notes"', META);
    backend.remove(key('base64', 'mode'));
    await vi.advanceTimersByTimeAsync(500);
    const ops = rig.hub.pushes[0]!;
    expect(ops.find((o) => o.entityType === 'scratchpad')).toMatchObject({ entityId: 'default', payload: 'notes', opKind: 'upsert' });
    expect(ops.find((o) => o.entityType === 'setting')).toMatchObject({ opKind: 'delete', payload: null, basedOnRevision: 1 });
    expect(backend.get(key('base64', 'mode'))).toBeNull();
  });

  it('keeps a write local when its category is off', () => {
    const backend = make([], { ...ALL_ON, scratchpad: false });
    backend.set(key('__workspace__', 'scratchpad'), '"mine"', META);
    expect(local.data.get(key('__workspace__', 'scratchpad'))).toBe('"mine"');
    expect(backend.pendingCount()).toBe(0);
  });

  it('refuses a shared write while the Hub is unreachable: not stored, previous value handed back, toast', async () => {
    const backend = make([settingRecord('base64', 'mode', 'old')]);
    const adopted: unknown[][] = [];
    backend.setAdopter((ns, k, v) => adopted.push([ns, k, v]));
    rig.connection.set('unreachable');
    expect(backend.set(key('base64', 'mode'), '"new"', META)).toBe(false);
    expect(backend.get(key('base64', 'mode'))).toBe('"old"');
    await vi.advanceTimersByTimeAsync(0);
    expect(adopted).toEqual([['base64', 'mode', 'old']]);
    expect(rig.feedback.toasts()[0]?.text).toBe('Hub unreachable — change not saved');
    backend.remove(key('base64', 'mode'));
    expect(backend.get(key('base64', 'mode'))).toBe('"old"');
    expect(rig.hub.pushes).toHaveLength(0);
  });

  it('reverts a write whose push fails', async () => {
    const backend = make([settingRecord('base64', 'mode', 'old')]);
    const adopted: unknown[][] = [];
    backend.setAdopter((ns, k, v) => adopted.push([ns, k, v]));
    backend.set(key('base64', 'mode'), '"new"', META);
    rig.hub.failWith = apiError(503);
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.get(key('base64', 'mode'))).toBe('"old"');
    expect(adopted).toEqual([['base64', 'mode', 'old']]);
    expect(backend.pendingCount()).toBe(0);
  });

  it('reverts when the connection dropped between the write and the flush', async () => {
    const backend = make([settingRecord('base64', 'mode', 'old')]);
    backend.set(key('base64', 'mode'), '"new"', META);
    rig.connection.set('reconnecting');
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.get(key('base64', 'mode'))).toBe('"old"');
    expect(rig.hub.pushes).toHaveLength(0);
  });

  it('adopts the Hub value after an lww conflict is re-committed (mine wins)', async () => {
    const backend = make([settingRecord('base64', 'mode', 'old')]);
    rig.hub.external('setting', 'base64:mode', { namespace: 'base64', key: 'mode', value: 'other-device' });
    backend.set(key('base64', 'mode'), '"mine"', META);
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.hub.pushes).toHaveLength(2);
    expect(backend.get(key('base64', 'mode'))).toBe('"mine"');
    expect((rig.hub.records.get('setting\u0000base64:mode')?.payload as { value: unknown }).value).toBe('mine');
  });

  it('applyRemote updates the cache without writing, and refuses a key with an unflushed local write', async () => {
    const backend = make();
    expect(backend.applyRemote?.('base64', 'mode', 'remote')).toBe(true);
    expect(backend.get(key('base64', 'mode'))).toBe('"remote"');
    expect(backend.pendingCount()).toBe(0);
    backend.set(key('base64', 'mode'), '"local"', META);
    expect(backend.applyRemote?.('base64', 'mode', 'remote2')).toBe(false);
    expect(backend.get(key('base64', 'mode'))).toBe('"local"');
    await backend.flush();
    expect(backend.applyRemote?.('base64', 'mode', null)).toBe(true);
    expect(backend.get(key('base64', 'mode'))).toBeNull();
  });
});
