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

  it('forwards the process, file and service convenience methods with the right method and params', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: {} }));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: call as never } }));
    const service = TestBed.inject(SystemInfoService);
    const ref = { pid: 12, startKey: '133700000000000000' };
    await service.processDetail(ref);
    expect(call).toHaveBeenLastCalledWith('process.detail', ref);
    await service.processModules(ref);
    expect(call).toHaveBeenLastCalledWith('process.modules', ref);
    await service.processThreads(12);
    expect(call).toHaveBeenLastCalledWith('process.threads', { pid: 12 });
    await service.processHandles(ref);
    expect(call).toHaveBeenLastCalledWith('process.handles', ref);
    await service.fileVersion('C:\\a.exe');
    expect(call).toHaveBeenLastCalledWith('file.version', { path: 'C:\\a.exe' });
    await service.fileSignature('C:\\a.exe');
    expect(call).toHaveBeenLastCalledWith('file.signature', { path: 'C:\\a.exe' });
    await service.listServices();
    expect(call).toHaveBeenLastCalledWith('svc.list', {});
  });

  it('probeDirs forwards dirs and optional extensions and unwraps the result', async () => {
    const data = { dirs: [{ dir: 'C:\\Windows', exists: true, isDirectory: true, executables: ['notepad.exe'] }] };
    const call = vi.fn(async () => ({ ok: true as const, data }));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: call as never } }));
    const service = TestBed.inject(SystemInfoService);
    expect(await service.probeDirs(['C:\\Windows'], ['.exe'])).toEqual(data);
    expect(call).toHaveBeenLastCalledWith('fs.probeDirs', { dirs: ['C:\\Windows'], extensions: ['.exe'] });
    await service.probeDirs(['C:\\Windows']);
    expect(call).toHaveBeenLastCalledWith('fs.probeDirs', { dirs: ['C:\\Windows'] });
  });

  it('surfaces a reused-PID failure as a SystemCallError with code 1168', async () => {
    const call = vi.fn(async () => ({ ok: false as const, error: 'The process has exited or its PID was reused.', code: 1168 }));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: call as never } }));
    const error = await TestBed.inject(SystemInfoService).processDetail({ pid: 1, startKey: '1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SystemCallError);
    expect((error as SystemCallError).code).toBe(1168);
    expect((error as SystemCallError).accessDenied).toBe(false);
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
