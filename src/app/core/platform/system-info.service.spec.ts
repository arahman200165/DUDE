import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';
import { SystemCallError, SystemInfoService } from './system-info.service';

describe('SystemInfoService', () => {
  afterEach(() => removeBridge());

  it('is unavailable on the web and throws a friendly error', async () => {
    removeBridge();
    const service = TestBed.inject(SystemInfoService);
    expect(service.available).toBe(false);
    await expect(service.listProcesses()).rejects.toThrow('Windows system tools are available in Desktop DUDE.');
  });

  it('unwraps successful results and forwards method and params', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: { version: '1', pid: 4, elevated: true, arch: 'x64' } }));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: call as never } }));
    const service = TestBed.inject(SystemInfoService);
    expect(service.available).toBe(true);
    expect((await service.helperInfo()).elevated).toBe(true);
    expect(call).toHaveBeenCalledWith('helper.info', {});
    await service.enumRegistryKey({ hive: 'HKLM', path: 'SOFTWARE', view: 'default' });
    expect(call).toHaveBeenLastCalledWith('reg.enumKey', { hive: 'HKLM', path: 'SOFTWARE', view: 'default' });
  });

  it('maps helper failures to SystemCallError with accessDenied', async () => {
    const call = vi.fn(async () => ({ ok: false as const, error: 'Access is denied.', code: 5 }));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: call as never } }));
    const error = await TestBed.inject(SystemInfoService).tcpTable().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SystemCallError);
    expect((error as SystemCallError).accessDenied).toBe(true);
    expect((error as SystemCallError).message).toBe('Access is denied.');
    expect(new SystemCallError('x', 2).accessDenied).toBe(false);
    expect(new SystemCallError('x').accessDenied).toBe(false);
  });
});
