import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { favoriteCodec, favoritesToItems, itemsToFavorites } from '@dude/persistence';
import type { FavoriteItem } from '@dude/persistence';
import { PersistenceService } from '../persistence.service';
import { createBrowserEntityCollection } from './browser-entity-store';
import type { LegacyBlob } from './entity-store';

const legacy: LegacyBlob<FavoriteItem> = {
  namespace: '__favorites__',
  key: 'pinned',
  toItems: (blob) => favoritesToItems(blob as { toolIds: string[]; pipelineIds: string[] }),
  fromItems: (items) => itemsToFavorites(items),
};
const KEY = 'dude:v1:__favorites__:pinned';
const item = (id: string, order = 0): FavoriteItem => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });

describe('browser entity collection', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  const make = () => TestBed.runInInjectionContext(() => createBrowserEntityCollection(TestBed.inject(PersistenceService), favoriteCodec, legacy));

  it('reads the existing blob and decodes each item', () => {
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, toolIds: ['a', 7, 'b'], pipelineIds: ['p'] }));
    expect(make().items().map((i) => i.id)).toEqual(['tool:a', 'tool:b', 'pipeline:p']);
  });

  it('round-trips writes through the same blob key and format', async () => {
    const col = make();
    await col.upsert(item('a'));
    await col.importMany([item('b', 1), item('a', 0)]);
    await col.remove('tool:b');
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ schemaVersion: 1, toolIds: ['a'], pipelineIds: [] });
  });

  it('adopts another tab write live', () => {
    const col = make();
    TestBed.tick();
    const value = JSON.stringify({ schemaVersion: 1, toolIds: ['x'], pipelineIds: [] });
    localStorage.setItem(KEY, value);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: value, storageArea: localStorage }));
    expect(col.items().map((i) => i.targetId)).toEqual(['x']);
  });
});
