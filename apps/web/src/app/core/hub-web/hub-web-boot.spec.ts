import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { favoriteCodec, pipelineCodec, type FavoriteItem } from '@dude/persistence';
import type { Pipeline } from '@dude/domain/core/pipeline/pipeline.model';
import { INSTALLATION_STORAGE_KEY } from '../device/device-identity.service';
import { ENTITY_STORE, type LegacyBlob } from '../persistence/entities/entity-store';
import { PersistenceService } from '../persistence/persistence.service';
import { RemoteEntityRegistry } from '../persistence/entities/remote-entity-registry';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';
import { ATTACHED_MARKER_KEY, describeBrowser, dropOriginLocalSharedKeys, readOrMintInstallationId } from './hub-web-boot';
import { HUB_WEB_BOOT, type HubWebBoot } from './hub-web.types';
import { ALL_ON, makeRig } from './testing/fake-hub';

const local = createWindowStorageBackend('local');
const clearLocal = (): void => local.keys('dude:v1:').forEach((k) => local.remove(k));

describe('describeBrowser', () => {
  it('labels Chrome, Edge and Firefox with the platform', () => {
    expect(describeBrowser({ userAgent: 'x', userAgentData: { brands: [{ brand: 'Not A', }, { brand: 'Google Chrome' }], platform: 'Windows' } })).toBe('Browser · Chrome on Windows');
    expect(describeBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 Edg/120' })).toBe('Browser · Edge on Windows');
    expect(describeBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0' })).toBe('Browser · Firefox on Linux');
  });
});

describe('browser installation and first attach', () => {
  beforeEach(clearLocal);
  afterEach(clearLocal);

  it('reuses the stored installation id and mints one that DeviceIdentityService will reuse', () => {
    local.set(INSTALLATION_STORAGE_KEY, JSON.stringify({ deviceId: 'abcdef12-aaaa', environmentId: 'e', displayName: 'n', createdAt: '' }));
    expect(readOrMintInstallationId()).toBe('abcdef12-aaaa');
    clearLocal();
    const minted = readOrMintInstallationId();
    expect(minted).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(readOrMintInstallationId()).toBe(minted);
  });

  it('drops origin-local copies of shared keys once, keeping local-only keys and disabled categories', () => {
    local.set('dude:v1:base64:mode', '"url"');
    local.set('dude:v1:__workspace__:scratchpad', '"notes"');
    local.set('dude:v1:__consent__:base64:mode', 'true');
    local.set(INSTALLATION_STORAGE_KEY, '{}');
    const dropped = dropOriginLocalSharedKeys({ ...ALL_ON, scratchpad: false });
    expect(dropped).toBeGreaterThanOrEqual(1);
    expect(local.get('dude:v1:base64:mode')).toBeNull();
    expect(local.get('dude:v1:__workspace__:scratchpad')).toBe('"notes"');
    expect(local.get('dude:v1:__consent__:base64:mode')).toBe('true');
    expect(local.get(INSTALLATION_STORAGE_KEY)).toBe('{}');
    expect(local.get(ATTACHED_MARKER_KEY)).toBe('1');
    local.set('dude:v1:base64:mode', '"again"');
    expect(dropOriginLocalSharedKeys(ALL_ON)).toBe(0);
    expect(local.get('dude:v1:base64:mode')).toBe('"again"');
  });
});

describe('ENTITY_STORE per host', () => {
  const legacy: LegacyBlob<FavoriteItem> = { namespace: '__favorites__', key: 'pinned', toItems: () => [], fromItems: () => ({}) };
  const pipelineLegacy: LegacyBlob<Pipeline> = { namespace: '__pipelines__', key: 'saved', toItems: (b) => (Array.isArray(b) ? b : []), fromItems: (items) => [...items] };

  beforeEach(() => {
    clearLocal();
    TestBed.resetTestingModule();
  });
  afterEach(clearLocal);

  function hubBoot(access = ALL_ON): HubWebBoot {
    const rig = makeRig();
    return { engine: rig.engine, deviceId: 'dev', access, cursor: 0, floor: 0, retentionDays: 30, records: [], book: rig.book };
  }

  it('uses the Hub-backed collection on hub-web: writes push to the Hub and register for remote changes', async () => {
    const boot = hubBoot();
    TestBed.configureTestingModule({ providers: [{ provide: HUB_WEB_BOOT, useValue: boot }] });
    const collection = TestBed.inject(ENTITY_STORE).collection(pipelineCodec, pipelineLegacy);
    const pipeline: Pipeline = { schemaVersion: 1, id: 'p', name: 'P', steps: [], createdAt: 'a', updatedAt: 'a' };
    await collection.upsert(pipeline);
    expect(boot.book.get('pipeline', 'p').revision).toBe(1);
    TestBed.inject(RemoteEntityRegistry).dispatch('pipeline', [{ entityId: 'q', payload: { ...pipeline, id: 'q' } }], []);
    expect(collection.get('q')).toBeDefined();
  });

  it('drops the origin-local legacy blob of a Hub-backed collection', () => {
    local.set('dude:v1:__pipelines__:saved', '[]');
    TestBed.configureTestingModule({ providers: [{ provide: HUB_WEB_BOOT, useValue: hubBoot() }] });
    TestBed.inject(ENTITY_STORE).collection(pipelineCodec, pipelineLegacy);
    expect(local.get('dude:v1:__pipelines__:saved')).toBeNull();
  });

  it('uses the plain browser collection for a category whose web access is off', async () => {
    const boot = hubBoot({ ...ALL_ON, favorites: false });
    TestBed.configureTestingModule({ providers: [{ provide: HUB_WEB_BOOT, useValue: boot }] });
    const collection = TestBed.inject(ENTITY_STORE).collection(favoriteCodec, legacy);
    await collection.upsert({ id: 'tool:x', kind: 'tool', targetId: 'x', order: 0 });
    expect((boot.engine.client as unknown as { pushes: unknown[] }).pushes ?? []).toHaveLength(0);
    expect(boot.book.get('favorite', 'tool:x').revision).toBeNull();
    expect(TestBed.inject(PersistenceService)).toBeDefined();
  });

  it('keeps the browser collection on every other host (no Hub boot)', async () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(HUB_WEB_BOOT)).toBeNull();
    const collection = TestBed.inject(ENTITY_STORE).collection(pipelineCodec, pipelineLegacy);
    await collection.upsert({ schemaVersion: 1, id: 'p', name: 'P', steps: [], createdAt: 'a', updatedAt: 'a' });
    expect(collection.items()).toHaveLength(1);
    TestBed.tick();
    // Browser storage is the only place it lives.
    expect(local.get('dude:v1:__pipelines__:saved')).not.toBeNull();
  });
});
