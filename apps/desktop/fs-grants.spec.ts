import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mock = vi.hoisted(() => ({ docs: new Map<string, unknown>(), userData: '', handles: new Map<string, (...args: any[]) => any>(), dialogResult: { canceled: true, filePaths: [] as string[] }, saveResult: { canceled: true, filePath: undefined as string | undefined }, saveOptions: undefined as unknown }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.userData },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn(async () => mock.dialogResult), showSaveDialog: vi.fn(async (...args: unknown[]) => { mock.saveOptions = args[args.length - 1]; return mock.saveResult; }) },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handles.set(channel, handler) },
}));

// Stand-in for the device store that survives vi.resetModules, so a simulated restart keeps its docs.
vi.mock('./device-store/device-docs', () => ({
  loadDoc: async (name: string, decode: (raw: unknown) => unknown, fallback: unknown) => (mock.docs.has(name) ? decode(mock.docs.get(name)) ?? fallback : fallback),
  saveDoc: async (name: string, value: unknown) => { mock.docs.set(name, JSON.parse(JSON.stringify(value))); },
}));

describe('fs grants', () => {
  let root: string;
  beforeEach(() => {
    vi.resetModules();
    mock.handles.clear();
    mock.docs.clear();
    root = mkdtempSync(join(tmpdir(), 'dude-grants-'));
    mock.userData = mkdtempSync(join(tmpdir(), 'dude-userdata-'));
    mkdirSync(join(root, 'project'));
  });

  it('resolves paths inside a root and refuses traversal, absolute input, and drive-root edge cases', async () => {
    const grants = await import('./fs-grants');
    expect(grants.resolveInRoot('C:\\work', 'a/b.txt')).toBe('C:\\work\\a\\b.txt');
    expect(grants.resolveInRoot('C:\\work', '../escape')).toBeNull();
    expect(grants.resolveInRoot('C:\\work', 'C:\\Windows')).toBeNull();
    expect(grants.resolveInRoot('C:\\work', '')).toBe('C:\\work');
    expect(grants.resolveInRoot('C:\\', 'Users')).toBe('C:\\Users');
    expect(grants.resolveInRoot('C:\\work', '..\\workbench')).toBeNull();
    expect(grants.normalizeRoot('C:\\work\\')).toBe('C:\\work');
    expect(grants.normalizeRoot('C:\\')).toBe('C:\\');
    expect(grants.normalizeRoot('/tmp/project/')).toBe('/tmp/project');
    expect(grants.resolveInRoot('/tmp/project', 'dir/file.txt')).toBe('/tmp/project/dir/file.txt');
    expect(grants.toPosixRelative('/tmp/project', '/tmp/project/dir/file.txt')).toBe('dir/file.txt');
    expect(grants.resolveInRoot('/tmp/project', '../escape')).toBeNull();
    expect(grants.resolveInRoot('/tmp/project', 'C:\\Windows')).toBeNull();
  });

  it('grants only picked paths, persists only remembered ones, and re-grants them on the next launch when they still exist', async () => {
    let grants = await import('./fs-grants');
    const project = join(root, 'project');
    expect(grants.isRootGranted(project)).toBe(false);
    expect((await grants.rememberRoot(project)).ok).toBe(false);
    mock.dialogResult = { canceled: false, filePaths: [project] };
    grants.registerGrantHandlers();
    const picked = await mock.handles.get('dude:fs:pickDirectory')!({ sender: {} });
    expect(picked.rootPath).toBe(project);
    expect(grants.isRootGranted(project)).toBe(true);
    expect((await grants.rememberRoot(project)).ok).toBe(true);

    // Simulate a restart: fresh module state, same userData.
    vi.resetModules();
    grants = await import('./fs-grants');
    expect(grants.isRootGranted(project)).toBe(false);
    const folders = await grants.loadRememberedGrants();
    expect(folders).toHaveLength(1);
    expect(folders[0].available).toBe(true);
    expect(grants.isRootGranted(project)).toBe(true);

    // A remembered folder that disappeared is listed as unavailable and not re-granted.
    rmSync(project, { recursive: true });
    vi.resetModules();
    grants = await import('./fs-grants');
    expect((await grants.loadRememberedGrants())[0].available).toBe(false);
    expect(grants.isRootGranted(project)).toBe(false);
  });

  it('forgetting removes persistence and notifies listeners', async () => {
    const grants = await import('./fs-grants');
    const project = grants.grantPath(join(root, 'project'));
    await grants.rememberRoot(project);
    const forgotten: string[] = [];
    grants.onRootForgotten((path) => forgotten.push(path));
    const result = await grants.forgetRoot(project);
    expect(result.ok && result.folders).toEqual([]);
    expect(forgotten).toEqual([project]);
  });

  it('save-path picks grant exactly one file, once, and nothing else', async () => {
    const grants = await import('./fs-grants');
    grants.registerGrantHandlers();
    const pick = mock.handles.get('dude:fs:pickSavePath')!;
    const target = join(root, 'bundle.zip');

    mock.saveResult = { canceled: true, filePath: undefined };
    expect(await pick({ sender: {} }, { defaultName: 'x.zip' })).toEqual({ canceled: true });
    expect(grants.consumeSavePath(target)).toBe(false);

    mock.saveResult = { canceled: false, filePath: target };
    const picked = await pick({ sender: {} }, { defaultName: '..\evil\bundle.zip', filters: [{ name: 'ZIP', extensions: ['zip', '../x'] }, { name: 3 }] });
    expect(picked).toEqual({ canceled: false, path: target, name: 'bundle.zip' });
    const options = mock.saveOptions as { defaultPath: string; filters: { extensions: string[] }[] };
    expect(options.defaultPath).not.toMatch(/[\/]/);
    expect(options.filters).toEqual([{ name: 'ZIP', extensions: ['zip'] }]);
    // A save grant never makes the folder or the file readable.
    expect(grants.isRootGranted(target)).toBe(false);
    expect(grants.isInsideGrantedRoot(target)).toBe(false);
    expect(grants.consumeSavePath(join(root, 'other.zip'))).toBe(false);
    expect(grants.consumeSavePath(target.toUpperCase())).toBe(true);
    expect(grants.consumeSavePath(target)).toBe(false);
  });
});
