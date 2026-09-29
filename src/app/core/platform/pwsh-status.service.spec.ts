import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';
import { PwshStatusService } from './pwsh-status.service';

describe('PwshStatusService', () => {
  afterEach(() => removeBridge());

  it('reports desktop-only on the web', async () => {
    removeBridge();
    const service = TestBed.inject(PwshStatusService);
    expect(await service.ensureLoaded()).toEqual({ available: false, reason: 'Desktop only' });
    expect(service.status()).toEqual({ available: false, reason: 'Desktop only' });
  });

  it('caches after the first load and refetches when forced', async () => {
    const pwshStatus = vi.fn(async (_refresh?: boolean) => ({ available: true, version: '7.4.1' }));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, pwshStatus } }));
    const service = TestBed.inject(PwshStatusService);
    expect(service.status()).toBeNull();
    await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);
    await service.refresh();
    expect(pwshStatus).toHaveBeenCalledTimes(1);
    expect(service.status()?.version).toBe('7.4.1');
    await service.refresh(true);
    expect(pwshStatus).toHaveBeenCalledTimes(2);
    expect(pwshStatus).toHaveBeenLastCalledWith(true);
  });

  it('turns a bridge failure into an unavailable status', async () => {
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, pwshStatus: async () => { throw new Error('ipc down'); } } }));
    expect(await TestBed.inject(PwshStatusService).refresh()).toEqual({ available: false, reason: 'ipc down' });
  });
});
