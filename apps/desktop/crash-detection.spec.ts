const mock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\userData' } }));
vi.mock('node:fs', () => ({ promises: { readFile: mock.readFile, writeFile: mock.writeFile } }));

import { checkAndMarkLaunch, markCleanExit } from './crash-detection';
import { setDeviceStoreHost } from './device-store/store-client';

describe('crash detection', () => {
  beforeEach(() => {
    mock.readFile.mockReset();
    mock.writeFile.mockReset().mockResolvedValue(undefined);
  });

  it('treats a first launch (no marker file yet) as clean, and marks the new launch unclean', async () => {
    mock.readFile.mockRejectedValueOnce(new Error('ENOENT'));

    const wasRestoredAfterCrash = await checkAndMarkLaunch();

    expect(wasRestoredAfterCrash).toBe(false);
    expect(mock.writeFile).toHaveBeenCalledWith(expect.stringContaining('crash-state.json'), JSON.stringify({ cleanExit: false }), 'utf8');
  });

  it('reports a restored-after-crash launch when the marker still says false', async () => {
    mock.readFile.mockResolvedValueOnce(JSON.stringify({ cleanExit: false }));

    const wasRestoredAfterCrash = await checkAndMarkLaunch();

    expect(wasRestoredAfterCrash).toBe(true);
  });

  it('reports a clean launch when the marker says true', async () => {
    mock.readFile.mockResolvedValueOnce(JSON.stringify({ cleanExit: true }));

    const wasRestoredAfterCrash = await checkAndMarkLaunch();

    expect(wasRestoredAfterCrash).toBe(false);
  });

  it('markCleanExit() writes the clean marker', () => {
    markCleanExit();
    expect(mock.writeFile).toHaveBeenCalledWith(expect.stringContaining('crash-state.json'), JSON.stringify({ cleanExit: true }), 'utf8');
  });
});

describe('crash detection with the device store', () => {
  beforeEach(() => {
    mock.readFile.mockReset();
    mock.writeFile.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => setDeviceStoreHost(null));

  const host = (previous: 'none' | 'clean' | 'unclean') => {
    const call = vi.fn().mockResolvedValue({ previous });
    setDeviceStoreHost({ call, status: () => 'ready', health: () => null, onHealth: () => () => undefined, shutdown: async () => undefined } as never);
    return call;
  };

  it('uses the store marker when ready (unclean means restored after crash)', async () => {
    mock.readFile.mockResolvedValueOnce(JSON.stringify({ cleanExit: true }));
    const call = host('unclean');
    expect(await checkAndMarkLaunch()).toBe(true);
    expect(call).toHaveBeenCalledWith('store.cleanExit', { action: 'launch' });
  });

  it('prefers a clean store marker over a stale JSON marker', async () => {
    mock.readFile.mockResolvedValueOnce(JSON.stringify({ cleanExit: false }));
    host('clean');
    expect(await checkAndMarkLaunch()).toBe(false);
  });

  it('falls back to the JSON marker on the first launch with the store', async () => {
    mock.readFile.mockResolvedValueOnce(JSON.stringify({ cleanExit: false }));
    host('none');
    expect(await checkAndMarkLaunch()).toBe(true);
  });

  it('markCleanExit writes both markers', async () => {
    const call = host('clean');
    await markCleanExit();
    expect(call).toHaveBeenCalledWith('store.cleanExit', { action: 'quit' });
    expect(mock.writeFile).toHaveBeenCalledWith(expect.stringContaining('crash-state.json'), JSON.stringify({ cleanExit: true }), 'utf8');
  });
});
