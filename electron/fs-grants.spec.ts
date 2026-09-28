import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mock = vi.hoisted(() => ({ userData: '', handles: new Map<string, (...args: any[]) => any>(), dialogResult: { canceled: true, filePaths: [] as string[] } }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.userData },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn(async () => mock.dialogResult) },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handles.set(channel, handler) },
}));

describe('fs grants', () => {
  let root: string;
  beforeEach(() => {
    vi.resetModules();
    mock.handles.clear();
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
});
