import { TestBed } from '@angular/core/testing';
import { NativeFsService } from './native-fs.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('NativeFsService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(fs: Partial<PlatformBridge['fs']>): NativeFsService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ fs: { ...fakeElectronBridge().fs, ...fs } }), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(NativeFsService);
  }

  it('throws when no bridge is present', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(NativeFsService);
    await expect(service.walk('/repo')).rejects.toThrow(/desktop app/);
  });

  it('returns entries on a successful walk', async () => {
    const service = withBridge({
      pickDirectory: async () => ({ canceled: false, rootPath: '/repo', rootName: 'repo' }),
      walk: async () => ({ ok: true, entries: [{ path: 'a.txt', size: 3 }] }),
      readFile: async () => ({ ok: true, data: new ArrayBuffer(0) }),
      readdir: async () => ({ ok: true, names: [] }),
      stat: async () => ({ ok: true, stat: { isFile: true, isDirectory: false, isSymbolicLink: false, size: 3, mtimeMs: 0 } }),
    });

    expect(await service.walk('/repo')).toEqual([{ path: 'a.txt', size: 3 }]);
  });

  it('throws an Error with .code set when a call fails', async () => {
    const service = withBridge({
      pickDirectory: async () => ({ canceled: true }),
      walk: async () => ({ ok: false, error: { code: 'EPERM', message: 'nope' } }),
      readFile: async () => ({ ok: false, error: { code: 'ENOENT', message: 'missing' } }),
      readdir: async () => ({ ok: true, names: [] }),
      stat: async () => ({ ok: true, stat: { isFile: true, isDirectory: false, isSymbolicLink: false, size: 0, mtimeMs: 0 } }),
    });

    await expect(service.readFile('/repo', 'a.txt')).rejects.toMatchObject({ code: 'ENOENT', message: 'missing' });
  });
});
