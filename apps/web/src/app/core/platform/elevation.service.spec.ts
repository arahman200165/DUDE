import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';
import { ElevationService } from './elevation.service';

describe('ElevationService', () => {
  afterEach(() => removeBridge());

  it('stays unknown on the web and refuses to relaunch', async () => {
    removeBridge();
    const service = TestBed.inject(ElevationService);
    await service.refresh();
    expect(service.elevated()).toBeNull();
    await expect(service.relaunch()).rejects.toThrow('Windows system tools are available in Desktop DUDE.');
  });

  it('reads the elevation status and relaunches through the bridge', async () => {
    const relaunch = vi.fn(async () => true);
    installBridge(fakeElectronBridge({ elevation: { status: async () => true, relaunch } }));
    const service = TestBed.inject(ElevationService);
    await service.refresh();
    expect(service.elevated()).toBe(true);
    expect(await service.relaunch()).toBe(true);
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it('keeps the previous value when the status call fails', async () => {
    installBridge(fakeElectronBridge({ elevation: { status: async () => { throw new Error('x'); }, relaunch: async () => false } }));
    const service = TestBed.inject(ElevationService);
    service.elevated.set(false);
    await service.refresh();
    expect(service.elevated()).toBe(false);
  });
});
