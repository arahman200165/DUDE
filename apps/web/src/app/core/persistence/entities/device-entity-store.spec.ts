import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityCommit, EntityCommitResult } from '@dude/contracts';
import { favoriteCodec, favoritesToItems, itemsToFavorites } from '@dude/persistence';
import type { FavoriteItem } from '@dude/persistence';
import { createDegradedMemoryBackend } from '../device-store/device-kv-backend';
import { installLocalBackend, resetLocalBackend } from '../local-backend-registry';
import { createDeviceEntityCollection, IMPORT_CHUNK, type DeviceEntityBridge } from './device-entity-store';
import { ENTITY_IMPORT_NAMESPACE } from './entity-legacy-import';
import type { LegacyBlob } from './entity-store';

const legacy: LegacyBlob<FavoriteItem> = {
  namespace: '__favorites__',
  key: 'pinned',
  toItems: (blob) => favoritesToItems(blob as { toolIds: string[]; pipelineIds: string[] }),
  fromItems: (items) => itemsToFavorites(items),
};

const item = (id: string, order = 0): FavoriteItem => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });

interface FakeBridge extends DeviceEntityBridge {
  commits: EntityCommit[];
  imports: EntityCommit[][];
  failNext: boolean;
}

function fakeBridge(): FakeBridge {
  const bridge: FakeBridge = {
    commits: [],
    imports: [],
    failNext: false,
    commitEntity: async (commit): Promise<EntityCommitResult> => {
      if (bridge.failNext) {
        bridge.failNext = false;
        return { ok: false, error: 'disk full' };
      }
      bridge.commits.push(commit);
      return { ok: true, localRevision: bridge.commits.length, backpressure: false };
    },
    importEntities: async (commits) => {
      bridge.imports.push([...commits]);
      return { ok: true, count: commits.length, backpressure: false };
    },
  };
  return bridge;
}

const record = (i: FavoriteItem) => ({ entityType: 'favorite', entityId: i.id, payload: i });

describe('device entity collection', () => {
  beforeEach(() => installLocalBackend(createDegradedMemoryBackend()));
  afterEach(() => {
    resetLocalBackend();
    vi.restoreAllMocks();
  });

  const make = (bridge: FakeBridge, records: ReturnType<typeof record>[] = [], persist = true) =>
    createDeviceEntityCollection({ codec: favoriteCodec, legacy, boot: { records }, bridge, persist, options: { compare: (a, b) => a.order - b.order } });

  it('hydrates from boot records, dropping undecodable ones', () => {
    const col = make(fakeBridge(), [
      record(item('b', 1)),
      record(item('a', 0)),
      { entityType: 'favorite', entityId: 'x', payload: { nope: true } as unknown as FavoriteItem },
      { entityType: 'pipeline', entityId: 'p', payload: {} as unknown as FavoriteItem },
    ]);
    expect(col.items().map((i) => i.targetId)).toEqual(['a', 'b']);
  });

  it('upserts optimistically then commits', async () => {
    const bridge = fakeBridge();
    const col = make(bridge);
    const pending = col.upsert(item('a'));
    expect(col.items()).toHaveLength(1);
    expect(await pending).toEqual({ ok: true, backpressure: false });
    expect(bridge.commits).toMatchObject([{ entityType: 'favorite', entityId: 'tool:a', op: 'upsert' }]);
  });

  it('rolls back and reports a failed upsert', async () => {
    const bridge = fakeBridge();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const col = make(bridge, [record(item('a', 0))]);
    bridge.failNext = true;
    const result = await col.upsert({ ...item('a'), order: 5 });
    expect(result).toEqual({ ok: false, error: 'disk full' });
    expect(col.get('tool:a')?.order).toBe(0);
    bridge.failNext = true;
    await col.upsert(item('new'));
    expect(col.get('tool:new')).toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it('removes with a delete commit and rolls back on failure', async () => {
    const bridge = fakeBridge();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const col = make(bridge, [record(item('a'))]);
    bridge.failNext = true;
    expect((await col.remove('tool:a')).ok).toBe(false);
    expect(col.items()).toHaveLength(1);
    expect((await col.remove('tool:a')).ok).toBe(true);
    expect(col.items()).toHaveLength(0);
    expect(bridge.commits).toMatchObject([{ op: 'delete', entityId: 'tool:a' }]);
  });

  it('importMany chunks at 1000 with one entity type per call', async () => {
    const bridge = fakeBridge();
    const col = make(bridge);
    const values = Array.from({ length: IMPORT_CHUNK + 5 }, (_, n) => item(`t${n}`, n));
    expect((await col.importMany(values)).ok).toBe(true);
    expect(bridge.imports.map((c) => c.length)).toEqual([IMPORT_CHUNK, 5]);
    expect(bridge.imports.flat().every((c) => c.entityType === 'favorite' && c.op === 'upsert')).toBe(true);
    expect(col.items()).toHaveLength(IMPORT_CHUNK + 5);
  });

  it('surfaces backpressure from a commit', async () => {
    const bridge = fakeBridge();
    bridge.commitEntity = async () => ({ ok: true, localRevision: 1, backpressure: true });
    expect(await make(bridge).upsert(item('a'))).toEqual({ ok: true, backpressure: true });
  });

  it('degraded store keeps changes in memory only', async () => {
    const bridge = fakeBridge();
    const col = make(bridge, [], false);
    expect((await col.upsert(item('a'))).ok).toBe(true);
    expect(col.items()).toHaveLength(1);
    expect(bridge.commits).toEqual([]);
  });

  describe('legacy blob import', () => {
    const blobKey = 'dude:v1:__favorites__:pinned';
    const markerKey = `dude:v1:${ENTITY_IMPORT_NAMESPACE}:favorite`;

    it('converts the old blob once, then drops it and marks the type done', async () => {
      const backend = createDegradedMemoryBackend();
      installLocalBackend(backend);
      backend.set(blobKey, JSON.stringify({ schemaVersion: 1, toolIds: ['a', 'b'], pipelineIds: [] }));
      const bridge = fakeBridge();
      const col = make(bridge);
      expect(col.items().map((i) => i.targetId)).toEqual(['a', 'b']);
      await vi.waitFor(() => expect(backend.get(markerKey)).toBe('true'));
      expect(bridge.imports).toHaveLength(1);
      expect(bridge.imports[0]).toHaveLength(2);
      expect(backend.get(blobKey)).toBeNull();

      // A later launch with a leftover blob never re-imports.
      backend.set(blobKey, JSON.stringify({ schemaVersion: 1, toolIds: ['z'], pipelineIds: [] }));
      const again = make(fakeBridge());
      expect(again.items()).toEqual([]);
    });

    it('leaves the blob in place when the import fails so the next launch retries', async () => {
      const backend = createDegradedMemoryBackend();
      installLocalBackend(backend);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      backend.set(blobKey, JSON.stringify({ schemaVersion: 1, toolIds: ['a'], pipelineIds: [] }));
      const bridge = fakeBridge();
      bridge.importEntities = async () => ({ ok: false, error: 'busy' });
      make(bridge);
      await new Promise((r) => setTimeout(r, 0));
      expect(backend.get(blobKey)).not.toBeNull();
      expect(backend.get(markerKey)).toBeNull();
    });

    it('does not import when the store already has records', () => {
      const backend = createDegradedMemoryBackend();
      installLocalBackend(backend);
      backend.set(blobKey, JSON.stringify({ schemaVersion: 1, toolIds: ['old'], pipelineIds: [] }));
      const bridge = fakeBridge();
      const col = make(bridge, [record(item('kept'))]);
      expect(col.items().map((i) => i.targetId)).toEqual(['kept']);
      expect(bridge.imports).toEqual([]);
      expect(backend.get(blobKey)).toBeNull();
    });
  });
});
