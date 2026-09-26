const mock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\userData' } }));
vi.mock('node:fs', () => ({ promises: { readFile: mock.readFile, writeFile: mock.writeFile } }));

import { checkAndMarkLaunch, markCleanExit } from './crash-detection';

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
