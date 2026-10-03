import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { KvMutation } from '@dude/contracts';
import { PersistenceService } from '../persistence/persistence.service';
import { createDeviceKvBackend } from '../persistence/device-store/device-kv-backend';
import { installLocalBackend, resetLocalBackend } from '../persistence/local-backend-registry';
import { RemoteEntityRegistry } from '../persistence/entities/remote-entity-registry';
import type { RemoteUpsert } from '../persistence/entities/entity-store';
import { RemoteChangesService } from './remote-changes.service';

describe('RemoteChangesService', () => {
  const commits: KvMutation[][] = [];
  let backend: ReturnType<typeof createDeviceKvBackend>;

  beforeEach(() => {
    commits.length = 0;
    backend = createDeviceKvBackend(
      { kv: [] },
      {
        commitKv: async (m) => {
          commits.push([...m]);
          return { ok: true as const, count: m.length };
        },
        commitKvNoWait: () => undefined,
        onFlushRequest: () => () => undefined,
      },
      { debounceMs: 5 },
    );
    installLocalBackend(backend);
    TestBed.configureTestingModule({});
  });
  afterEach(() => {
    backend.dispose();
    resetLocalBackend();
  });

  it('routes record types to their collection (upserts and deletes), including usage', () => {
    const registry = TestBed.inject(RemoteEntityRegistry);
    const calls: Record<string, { upserts: readonly RemoteUpsert[]; deletes: readonly string[] }> = {};
    for (const type of ['favorite', 'pipeline', 'user-script', 'project', 'workspace-template', 'home-layout', 'usage']) {
      registry.register(type, { applyRemote: (upserts, deletes) => { calls[type] = { upserts, deletes }; } });
    }
    const service = TestBed.inject(RemoteChangesService);
    service.apply(
      [
        { entityType: 'pipeline', entityId: 'p1', deleted: false, payload: { id: 'p1' } },
        { entityType: 'pipeline', entityId: 'p2', deleted: true, payload: null },
        { entityType: 'favorite', entityId: 'tool:a', deleted: false, payload: { id: 'tool:a' } },
        { entityType: 'user-script', entityId: 's', deleted: true, payload: null },
        { entityType: 'project', entityId: 'pr', deleted: false, payload: {} },
        { entityType: 'workspace-template', entityId: 't', deleted: false, payload: {} },
        { entityType: 'home-layout', entityId: 'default', deleted: false, payload: {} },
        { entityType: 'usage', entityId: 'device-b', deleted: false, payload: {} },
      ],
      42,
    );
    expect(calls['pipeline']).toEqual({ upserts: [{ entityId: 'p1', payload: { id: 'p1' } }], deletes: ['p2'] });
    expect(calls['favorite']?.upserts).toHaveLength(1);
    expect(calls['user-script']).toEqual({ upserts: [], deletes: ['s'] });
    expect(calls['usage']?.upserts[0]?.entityId).toBe('device-b');
    expect(Object.keys(calls)).toHaveLength(7);
    expect(service.changedAt('pipeline', 'p1')).toBe(42);
  });

  it('replays changes for a collection created after they arrived', () => {
    const service = TestBed.inject(RemoteChangesService);
    service.apply([{ entityType: 'project', entityId: 'pr', deleted: false, payload: { id: 'pr' } }]);
    let got: readonly RemoteUpsert[] = [];
    TestBed.inject(RemoteEntityRegistry).register('project', { applyRemote: (u) => { got = u; } });
    expect(got).toEqual([{ entityId: 'pr', payload: { id: 'pr' } }]);
  });

  it('settings update the kv without scheduling a write and a live local signal adopts them', async () => {
    const persistence = TestBed.inject(PersistenceService);
    const indent = TestBed.runInInjectionContext(() => persistence.signal('json', 'indent', 'local', 2));
    await TestBed.inject(ApplicationRef).whenStable();
    backend.set('dude:v1:json:indent', '2');
    await backend.flush();
    commits.length = 0;

    TestBed.inject(RemoteChangesService).apply([
      { entityType: 'setting', entityId: 'json:indent', deleted: false, payload: { namespace: 'json', key: 'indent', value: 8 }, namespace: 'json', key: 'indent', value: 8 },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(indent()).toBe(8);
    expect(backend.get('dude:v1:json:indent')).toBe('8');
    expect(backend.pendingCount()).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(commits).toEqual([]);
  });

  it('scratchpad applies through the kv binding', () => {
    TestBed.inject(RemoteChangesService).apply([{ entityType: 'scratchpad', entityId: 'default', deleted: false, payload: { snippets: [] } }]);
    expect(backend.get('dude:v1:__workspace__:scratchpad')).toBe('{"snippets":[]}');
    expect(backend.pendingCount()).toBe(0);
  });

  it('defers the workspace layout: nothing is written, syncedLayoutAvailable turns on', () => {
    const service = TestBed.inject(RemoteChangesService);
    expect(service.syncedLayoutAvailable()).toBe(false);
    service.apply([{ entityType: 'workspace-layout', entityId: 'default', deleted: false, payload: { tabs: [] } }]);
    expect(service.syncedLayoutAvailable()).toBe(true);
    expect(service.syncedLayout()).toEqual({ tabs: [] });
    expect(backend.get('dude:v1:__workspace__:layout')).toBeNull();
    service.dismissSyncedLayout();
    expect(service.syncedLayoutAvailable()).toBe(false);
  });
});
