import { TestBed } from '@angular/core/testing';
import { RuntimeProbeService } from './runtime-probe.service';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';

describe('RuntimeProbeService', () => {
  afterEach(() => removeBridge());

  it('throws on the web and reports unavailable', async () => {
    removeBridge();
    const service = TestBed.inject(RuntimeProbeService);
    expect(service.available).toBe(false);
    await expect(service.probe([])).rejects.toThrow(/Desktop DUDE/);
  });

  it('delegates to window.dude.runtime.probe on desktop', async () => {
    const probe = vi.fn(async (commands: readonly { id: string }[]) => commands.map((c) => ({ id: c.id, ok: true, stdout: 'v1', stderr: '', exitCode: 0 })));
    installBridge(fakeElectronBridge({ runtime: { probe } }));
    const service = TestBed.inject(RuntimeProbeService);
    expect(service.available).toBe(true);
    const commands = [{ id: 'node:0', exe: 'C:\n\node.exe', args: ['--version'] }];
    expect(await service.probe(commands)).toEqual([{ id: 'node:0', ok: true, stdout: 'v1', stderr: '', exitCode: 0 }]);
    expect(probe).toHaveBeenCalledWith(commands);
  });
});
