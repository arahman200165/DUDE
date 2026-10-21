const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import { collectDeviceOsFacts, registerDeviceInfoHandlers, type DeviceOsSource } from './device-info-bridge';

const source: DeviceOsSource = {
  version: () => 'Windows 11 Pro',
  release: () => '10.0.26200',
  arch: () => 'x64',
  platform: () => 'win32',
  cpus: () => [{ model: ' Example CPU @ 3.00GHz ' }, { model: 'Example CPU @ 3.00GHz' }],
  totalmem: () => 17_179_869_184,
};

describe('collectDeviceOsFacts', () => {
  it('returns exactly the seven non-identifying facts', () => {
    const facts = collectDeviceOsFacts(source);
    expect(facts).toEqual({
      platform: 'win32',
      osName: 'Windows 11 Pro',
      osRelease: '10.0.26200',
      arch: 'x64',
      cpuModel: 'Example CPU @ 3.00GHz',
      cpuCount: 2,
      totalMemoryBytes: 17_179_869_184,
    });
    expect(Object.keys(facts).sort()).toEqual(['arch', 'cpuCount', 'cpuModel', 'osName', 'osRelease', 'platform', 'totalMemoryBytes']);
  });

  it('copes with no CPU entries', () => {
    expect(collectDeviceOsFacts({ ...source, cpus: () => [] })).toMatchObject({ cpuModel: '', cpuCount: 0 });
  });
});

describe('dude:deviceInfo:osFacts', () => {
  const webContents = {};
  beforeEach(() => {
    mock.handlers.clear();
    registerDeviceInfoHandlers({ webContents } as never, source);
  });

  it('serves the window renderer and refuses any other sender', () => {
    const handler = mock.handlers.get('dude:deviceInfo:osFacts')!;
    expect(handler({ sender: webContents })).toMatchObject({ osName: 'Windows 11 Pro' });
    expect(handler({ sender: {} })).toBeNull();
  });
});
