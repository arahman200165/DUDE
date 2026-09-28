import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ handles: new Map<string, (...args: any[]) => any>(), posted: [] as unknown[], granted: new Set<string>() }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => 'C:\\userData' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handles.set(channel, handler) },
  utilityProcess: { fork: () => ({ on: vi.fn(), once: vi.fn(), postMessage: (message: unknown) => mock.posted.push(message), kill: vi.fn() }) },
}));
vi.mock('./fs-grants', () => ({
  isRootGranted: (path: unknown) => typeof path === 'string' && mock.granted.has(path),
  normalizeRoot: (path: string) => path.replace(/\\$/, ''),
}));
import { registerFsJobHandlers, validateJobRequest } from './fs-jobs-bridge';

const owner = { id: 3, isDestroyed: () => false, once: vi.fn(), send: vi.fn() };
beforeEach(() => {
  mock.handles.clear();
  mock.posted.length = 0;
  mock.granted = new Set(['C:\\work', 'C:\\out']);
  registerFsJobHandlers();
});

describe('fs job IPC boundary', () => {
  it('refuses ungranted roots, including any …Root param, before anything reaches the worker', () => {
    expect(() => validateJobRequest({ kind: 'walk', root: 'C:\\Windows' })).toThrow(/native picker/);
    expect(() => validateJobRequest({ kind: 'walk', root: 'C:\\work', params: { outputRoot: 'C:\\Windows' } })).toThrow(/output folder/);
    expect(() => validateJobRequest({ kind: '../evil', root: 'C:\\work' })).toThrow(/Unknown/);
    const start = mock.handles.get('dude:fsjob:start')!;
    expect(start({ sender: owner }, { kind: 'walk', root: 'C:\\Windows' }).ok).toBe(false);
    expect(mock.posted).toEqual([]);
  });

  it('starts granted jobs in the worker and caps concurrent jobs per window', () => {
    const start = mock.handles.get('dude:fsjob:start')!;
    for (let index = 0; index < 4; index++) expect(start({ sender: owner }, { kind: 'walk', root: 'C:\\work', params: { outputRoot: 'C:\\out' } }).ok).toBe(true);
    expect(start({ sender: owner }, { kind: 'walk', root: 'C:\\work' }).error).toMatch(/At most four/);
    expect(mock.posted[0]).toMatchObject({ type: 'start', kind: 'walk', root: 'C:\\work', params: { outputRoot: 'C:\\out' } });
  });

  it('only lets a window cancel its own jobs', () => {
    const start = mock.handles.get('dude:fsjob:start')!;
    const other = { ...owner, id: 4 };
    const { jobId } = start({ sender: other }, { kind: 'walk', root: 'C:\\work' });
    expect(mock.handles.get('dude:fsjob:cancel')!({ sender: { id: 99 } }, jobId)).toBe(false);
    expect(mock.handles.get('dude:fsjob:cancel')!({ sender: other }, jobId)).toBe(true);
  });
});
