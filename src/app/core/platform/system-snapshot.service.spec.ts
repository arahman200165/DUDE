import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';
import { SystemSnapshotService } from './system-snapshot.service';

describe('SystemSnapshotService', () => {
  afterEach(() => removeBridge());

  it('throws on the web', async () => {
    removeBridge();
    const service = TestBed.inject(SystemSnapshotService);
    expect(service.available).toBe(false);
    await expect(service.list()).rejects.toThrow('only available in the desktop app');
  });

  it('unwraps results and surfaces errors', async () => {
    const base = fakeElectronBridge();
    const header = { id: 'a', kind: 'env' as const, name: 'n', source: 's', createdAt: 'x', bytes: 1 };
    installBridge(fakeElectronBridge({
      sysSnapshots: {
        ...base.sysSnapshots,
        list: async () => ({ ok: true, value: [header] }),
        usage: async () => ({ ok: true, value: { count: 1, bytes: 1 } }),
        remove: async () => ({ ok: false, error: 'nope' }),
      },
    }));
    const service = TestBed.inject(SystemSnapshotService);
    expect(await service.list('env')).toEqual([header]);
    expect(await service.usage()).toEqual({ count: 1, bytes: 1 });
    await expect(service.remove('env', 'a')).rejects.toThrow('nope');
  });
});
