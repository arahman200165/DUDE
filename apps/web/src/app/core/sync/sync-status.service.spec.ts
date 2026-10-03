import { TestBed } from '@angular/core/testing';
import { RemoteChangesService } from './remote-changes.service';
import { SYNC_PORT } from './sync.port';
import { SyncStatusService } from './sync-status.service';
import { conflict, createFakeSyncPort, quarantinedOp, syncStatus } from './testing/fake-sync-port';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('SyncStatusService', () => {
  it('is inert without a port (web)', () => {
    TestBed.configureTestingModule({ providers: [{ provide: SYNC_PORT, useValue: null }] });
    const service = TestBed.inject(SyncStatusService);
    expect(service.available).toBe(false);
    expect(service.status()).toBeNull();
    expect(service.enrolled()).toBe(false);
  });

  it('loads status at startup and follows pushed status changes, loading lists when counts change', async () => {
    const fake = createFakeSyncPort({ listConflicts: async () => [conflict()], listQuarantined: async () => [quarantinedOp()] }, syncStatus({ phase: 'standalone' }));
    TestBed.configureTestingModule({ providers: [{ provide: SYNC_PORT, useValue: fake.port }] });
    const service = TestBed.inject(SyncStatusService);
    await tick();
    expect(service.status()?.phase).toBe('standalone');
    expect(service.enrolled()).toBe(false);

    fake.emitStatus(syncStatus({ phase: 'idle', conflicts: 1, quarantined: 1 }));
    await tick();
    expect(service.enrolled()).toBe(true);
    expect(service.conflicts()).toHaveLength(1);
    expect(service.quarantined()).toHaveLength(1);

    fake.emitStatus(syncStatus({ conflicts: 0, quarantined: 0 }));
    await tick();
    expect(service.conflicts()).toEqual([]);
    expect(service.quarantined()).toEqual([]);
  });

  it('forwards onApplied changes to RemoteChangesService.apply from bootstrap', () => {
    const fake = createFakeSyncPort();
    TestBed.configureTestingModule({ providers: [{ provide: SYNC_PORT, useValue: fake.port }] });
    const apply = vi.spyOn(TestBed.inject(RemoteChangesService), 'apply').mockImplementation(() => undefined);
    TestBed.inject(SyncStatusService);
    const changes = [{ entityType: 'favorite', entityId: 'f1', deleted: false, payload: {} }];
    fake.emitApplied(changes);
    expect(apply).toHaveBeenCalledWith(changes);
  });

  it('resolves a conflict through the port and drops it from the inbox', async () => {
    const fake = createFakeSyncPort({ listConflicts: async () => [conflict()] }, syncStatus({ conflicts: 1 }));
    TestBed.configureTestingModule({ providers: [{ provide: SYNC_PORT, useValue: fake.port }] });
    const service = TestBed.inject(SyncStatusService);
    await tick();
    expect(service.conflicts()).toHaveLength(1);
    const result = await service.resolveConflict(1, 'mine');
    expect(result.ok).toBe(true);
    expect(fake.port.resolveConflict).toHaveBeenCalledWith(1, 'mine');
    expect(service.conflicts()).toEqual([]);
  });

  it('surfaces action failures instead of throwing', async () => {
    const fake = createFakeSyncPort({ syncNow: async () => { throw new Error('Hub unreachable'); } });
    TestBed.configureTestingModule({ providers: [{ provide: SYNC_PORT, useValue: fake.port }] });
    const service = TestBed.inject(SyncStatusService);
    await tick();
    await service.syncNow();
    expect(service.error()).toBe('Hub unreachable');
    expect(service.busy()).toBe(false);
  });
});
