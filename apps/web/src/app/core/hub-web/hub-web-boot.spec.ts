import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { favoriteCodec, pipelineCodec, type FavoriteItem } from '@dude/persistence';
import type { Pipeline } from '@dude/domain/core/pipeline/pipeline.model';
import { INSTALLATION_STORAGE_KEY } from '../device/device-identity.service';
import { ENTITY_STORE, type LegacyBlob } from '../persistence/entities/entity-store';
import { PersistenceService } from '../persistence/persistence.service';
import { RemoteEntityRegistry } from '../persistence/entities/remote-entity-registry';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';
import { resetLocalBackend } from '../persistence/local-backend-registry';
import { ATTACHED_MARKER_KEY, bootHubWeb, decideBootFailure, describeBrowser, dropOriginLocalSharedKeys, readOrMintInstallationId, type HubWebBootConnection } from './hub-web-boot';
import { HUB_WEB_BOOT, type HubWebBoot } from './hub-web.types';
import { ALL_ON, FakeHub, apiError, makeRig } from './testing/fake-hub';
import { AUTHORITY_STORAGE_KEY, readAuthorityRecord, type SeenAuthority } from './hub-web-authority';

const ACTIVE: SeenAuthority = { hubInstanceId: 'hub-a', authorityEpoch: 1, authorityState: 'active' };

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

describe('Hub web boot decision', () => {
  afterEach(() => {
    resetLocalBackend();
    clearLocal();
  });

  const liveConnection = (): { hub: FakeHub; connection: HubWebBootConnection } => {
    const hub = new FakeHub();
    hub.webAttach = (async () => ({ deviceId: 'browser-1', access: ALL_ON, retentionDays: 30 })) as never;
    return { hub, connection: { client: hub, hello: async () => ACTIVE, checkSession: async () => undefined } };
  };

  it('classifies the failure: only an unreachable Hub (network, 5xx) is offline', () => {
    expect(decideBootFailure(apiError(401, 'unauthorized'))).toBe('signed-out');
    expect(decideBootFailure(apiError(403, 'forbidden'))).toBe('signed-out');
    expect(decideBootFailure(apiError(503))).toBe('offline');
    expect(decideBootFailure(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('attaches and installs the Hub backend when the session is fine', async () => {
    const { connection } = liveConnection();
    const result = await bootHubWeb({ connect: async () => connection });
    expect(result.mode).toBe('live');
    expect(result.boot?.deviceId).toBe('browser-1');
    expect(result.connection.state()).toBe('live');
    expect(result.kv).not.toBeNull();
  });

  it('takes the signed-out path on 401 and leaves the plain backend alone', async () => {
    const { hub } = liveConnection();
    const result = await bootHubWeb({ connect: async () => ({ client: hub, hello: async () => ACTIVE, checkSession: async () => { throw apiError(401, 'unauthorized'); } }) });
    expect(result.mode).toBe('signed-out');
    expect(result.boot).toBeNull();
    expect(result.kv).toBeNull();
    expect(result.connection.state()).toBe('live');
  });

  it('installs the read-only offline boot on a network error: writes are refused and reverted, the probe waits for the Hub', async () => {
    const { hub } = liveConnection();
    let down = true;
    const connect = async (): Promise<HubWebBootConnection> => {
      if (down) throw new TypeError('Failed to fetch');
      return { client: hub, hello: async () => ACTIVE, checkSession: async () => undefined };
    };
    const result = await bootHubWeb({ connect });
    expect(result.mode).toBe('offline');
    expect(result.connection.state()).toBe('unreachable');
    expect(result.boot?.records).toEqual([]);
    expect(result.boot?.cursor).toBe(0);

    // A shared edit is refused with the usual toast and nothing is kept.
    expect(result.kv?.set('dude:v1:base64:mode', '"url"', { policy: 'local', scope: 'environment' })).toBe(false);
    expect(result.feedback.toasts()[0]?.text).toBe('Hub unreachable — change not saved');
    expect(result.kv?.get('dude:v1:base64:mode')).toBeNull();

    // Hub collections are empty and read-only: the engine refuses the write so the collection rolls back.
    const outcome = await result.boot!.engine.commit({ entityType: 'pipeline', entityId: 'p', schemaVersion: 1, payload: { name: 'P' } });
    expect(outcome).toEqual({ ok: false, error: 'Hub unreachable — change not saved' });

    await expect(result.probe!()).rejects.toBeInstanceOf(TypeError);
    down = false;
    await expect(result.probe!()).resolves.toBeUndefined();
  });

  it('counts any answer as the Hub being back, a 401 included', async () => {
    const result = await bootHubWeb({ connect: async () => { throw apiError(502); } });
    expect(result.mode).toBe('offline');
    const { hub } = liveConnection();
    const answering = await bootHubWeb({ connect: async () => ({ client: hub, hello: async () => ACTIVE, checkSession: async () => { throw apiError(401, 'unauthorized'); } }) });
    expect(answering.mode).toBe('signed-out');
  });

  it('treats a 5xx from the session check as offline too', async () => {
    const { hub } = liveConnection();
    const result = await bootHubWeb({ connect: async () => ({ client: hub, hello: async () => ACTIVE, checkSession: async () => { throw apiError(502); } }) });
    expect(result.mode).toBe('offline');
  });

  describe('authority gate (PD-071)', () => {
    const withHello = (hello: HubWebBootConnection['hello']): { connection: HubWebBootConnection; calls: string[] } => {
      const { hub } = liveConnection();
      const calls: string[] = [];
      return {
        calls,
        connection: {
          client: hub, hello: async () => { calls.push('hello'); return hello(); },
          checkSession: async () => { calls.push('checkSession'); },
        },
      };
    };

    it('an acceptable Hub persists the record and boots exactly as before', async () => {
      const { connection, calls } = withHello(async () => ({ hubInstanceId: 'hub-a', authorityEpoch: 3 }));
      const result = await bootHubWeb({ connect: async () => connection });
      expect(result.mode).toBe('live');
      expect(calls).toEqual(['hello', 'checkSession']);
      expect(readAuthorityRecord(local)).toEqual({ hubInstanceId: 'hub-a', authorityEpoch: 3 });
    });

    it('a transferred Hub blocks before sign-in or attach: only hello is called and the stored record is untouched', async () => {
      local.set(AUTHORITY_STORAGE_KEY, JSON.stringify({ hubInstanceId: 'hub-a', authorityEpoch: 2 }));
      const { connection, calls } = withHello(async () => ({ hubInstanceId: 'hub-a', authorityEpoch: 2, authorityState: 'transferred' }));
      const result = await bootHubWeb({ connect: async () => connection });
      expect(result.mode).toBe('blocked');
      expect(result.blocked).toEqual({ kind: 'transferred' });
      expect(result.boot).toBeNull();
      expect(result.kv).toBeNull();
      expect(calls).toEqual(['hello']);
      expect(readAuthorityRecord(local)).toEqual({ hubInstanceId: 'hub-a', authorityEpoch: 2 });
    });

    it('an older Hub blocks with the facts and the record to store if the owner chooses to continue', async () => {
      local.set(AUTHORITY_STORAGE_KEY, JSON.stringify({ hubInstanceId: 'hub-a', authorityEpoch: 4 }));
      const { connection, calls } = withHello(async () => ({ hubInstanceId: 'hub-b', authorityEpoch: 2 }));
      const result = await bootHubWeb({ connect: async () => connection });
      expect(result.mode).toBe('blocked');
      expect(result.blocked).toEqual({ kind: 'older', storedEpoch: 4, seenEpoch: 2, seen: { hubInstanceId: 'hub-b', authorityEpoch: 2 } });
      expect(calls).toEqual(['hello']);
      expect(readAuthorityRecord(local)).toEqual({ hubInstanceId: 'hub-a', authorityEpoch: 4 });
    });

    it('a failed hello falls through to the ordinary boot (live here, unreachable below)', async () => {
      const failing = withHello(async () => { throw new TypeError('Failed to fetch'); });
      expect((await bootHubWeb({ connect: async () => failing.connection })).mode).toBe('live');
      expect(failing.calls).toEqual(['hello', 'checkSession']);
      expect(readAuthorityRecord(local)).toBeNull();

      const { hub } = liveConnection();
      const down = await bootHubWeb({
        connect: async () => ({ client: hub, hello: async () => { throw apiError(502); }, checkSession: async () => { throw apiError(502); } }),
      });
      expect(down.mode).toBe('offline');
    });

    it('a failed hello followed by a hub-transferred session check still blocks, and is not an outage to retry', async () => {
      const { hub } = liveConnection();
      const result = await bootHubWeb({
        connect: async () => ({ client: hub, hello: async () => { throw apiError(502); }, checkSession: async () => { throw apiError(503, 'hub-transferred'); } }),
      });
      expect(result.mode).toBe('blocked');
      expect(result.blocked).toEqual({ kind: 'transferred' });
      expect(result.probe).toBeUndefined();
      expect(decideBootFailure(apiError(503, 'hub-transferred'))).toBe('signed-out');
    });
  });
});
