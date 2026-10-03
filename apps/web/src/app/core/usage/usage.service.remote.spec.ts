import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceStoreBoot, EntityCommit } from '@dude/contracts';
import { EMPTY_USAGE_STORE, recordUsage } from '@dude/domain/core/usage/usage.model';
import { BOOT_SNAPSHOT } from '../persistence/device-store/boot-snapshot';
import { createDegradedMemoryBackend } from '../persistence/device-store/device-kv-backend';
import { installLocalBackend, resetLocalBackend } from '../persistence/local-backend-registry';
import { createDeviceEntityCollection } from '../persistence/entities/device-entity-store';
import { ENTITY_STORE } from '../persistence/entities/entity-store';
import { RemoteEntityRegistry } from '../persistence/entities/remote-entity-registry';
import { RemoteChangesService } from '../sync/remote-changes.service';
import { UsageService } from './usage.service';

describe('UsageService with remote device records', () => {
  const commits: EntityCommit[] = [];

  beforeEach(() => {
    commits.length = 0;
    installLocalBackend(createDegradedMemoryBackend());
    const boot = { device: { deviceId: 'dev-a' }, records: [] } as unknown as DeviceStoreBoot;
    TestBed.configureTestingModule({
      providers: [
        { provide: BOOT_SNAPSHOT, useValue: { boot } },
        {
          provide: ENTITY_STORE,
          useFactory: () => {
            const registry = TestBed.inject(RemoteEntityRegistry);
            return {
              collection: (codec: never, legacy: never, options: never) => {
                const collection = createDeviceEntityCollection({
                  codec, legacy, options, boot: { records: [] }, persist: true,
                  bridge: {
                    commitEntity: async (commit: EntityCommit) => { commits.push(commit); return { ok: true as const, localRevision: 1, backpressure: false }; },
                    importEntities: async () => ({ ok: true as const, count: 0, backpressure: false }),
                  },
                });
                registry.register((codec as { entityType: string }).entityType, collection);
                return collection;
              },
            };
          },
        },
      ],
    });
  });
  afterEach(() => resetLocalBackend());

  it('adds another device\'s record to the sum and never writes it back', async () => {
    const usage = TestBed.inject(UsageService);
    usage.recordOpen('json', new Date('2026-05-01T10:00:00Z'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commits.map((c) => c.entityId)).toEqual(['dev-a']);

    const remote = recordUsage({ ...EMPTY_USAGE_STORE, deviceId: 'dev-b' }, 'json', '2026-05-02T10:00:00.000Z');
    TestBed.inject(RemoteChangesService).apply([{ entityType: 'usage', entityId: 'dev-b', deleted: false, payload: remote }]);

    expect(usage.frequencyOf('json')).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commits.map((c) => c.entityId)).toEqual(['dev-a']);
  });
});
