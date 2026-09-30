import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { walkDependencies } from './dependency-walker';
import type { DllSearchContext } from '../src/shared-logic/system/dll-search-order';
import type { DependencyNode } from '../src/shared-logic/system/dependency-walker-types';
import type { SysResult } from '../src/shared-logic/system/system-types';
import { validateSysCall } from './sys-validation';
import { sysHelper } from './sys-helper';
import { pwshStatus, runFixedScript } from './sys-pwsh';
import { isInsideGrantedRoot } from './fs-grants';
import type { ScheduledTaskDetail, ScheduledTaskSummary } from '../src/shared-logic/system/task-types';
import type { StartupProgramsResult } from '../src/shared-logic/system/startup-types';
import { readStartupPrograms } from './startup-programs';
import { listInstalledSoftware } from './installed-software';
import type { InstalledSoftware } from '../src/shared-logic/system/software-types';
import type { WindowsCapability, WindowsFeature } from '../src/shared-logic/system/feature-types';

// Reserved for later milestones: `dude:sys:event` carries streamed helper events (SysStreamEvent).

export function registerSysHandlers(): void {
  ipcMain.handle('dude:dependency:walk', async (_event, path: unknown): Promise<DependencyNode> => {
    if (typeof path !== 'string' || path.length > 32767 || /[\u0000-\u001f\u007f]/.test(path) || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\])/.test(path)) throw new Error('Choose an absolute Windows executable path.');
    if (!isInsideGrantedRoot(path)) throw new Error('Pick the executable with the native file picker before inspecting dependencies.');
    const stats = await fs.stat(path);
    if (!stats.isFile()) throw new Error('The selected path is not a file.');
    const root = process.env.SystemRoot ?? process.env.WINDIR;
    if (!root) throw new Error('Windows directory is unavailable in this process environment.');
    const apiResult = await sysHelper().call('pe.apisetmap', {});
    if (!apiResult.ok) throw new Error(`Could not read Windows API-set map: ${apiResult.error}`);
    const apiSetMap = (apiResult.data as { contracts?: Record<string, string[]> }).contracts ?? {};
    const knownResult = await sysHelper().call('reg.getValues', { hive: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\KnownDLLs', view: '64' });
    if (!knownResult.ok) throw new Error(`Could not read Windows KnownDLLs: ${knownResult.error}`);
    const knownDlls: Record<string, true> = {};
    for (const value of (knownResult.data as { values: readonly { name: string; data: unknown }[] }).values) {
      if (value.name && typeof value.data === 'string' && !/[\\/]/.test(value.data)) knownDlls[value.data] = true;
    }
    const known32Result = await sysHelper().call('reg.getValues', { hive: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\KnownDLLs', view: '32' });
    if (!known32Result.ok) throw new Error('Could not read 32-bit Windows KnownDLLs: ' + known32Result.error);
    const knownDllsX86: Record<string, true> = {};
    for (const value of (known32Result.data as { values: readonly { name: string; data: unknown }[] }).values) {
      if (value.name && typeof value.data === 'string' && !/[\\/]/.test(value.data)) knownDllsX86[value.data] = true;
    }
    const context: DllSearchContext = {
      applicationDirectory: dirname(path), windowsDirectory: root, systemDirectory: join(root, 'System32'),
      syswow64Directory: join(root, 'SysWOW64'), targetArchitecture: 'unknown',
      pathDirectories: (process.env.PATH ?? '').split(';').map((entry) => entry.trim().replace(/^"|"$/g, '')).filter(Boolean),
      knownDlls, knownDllsX86, apiSetMap,
    };
    return walkDependencies(path, { search: context });
  });
  ipcMain.handle('dude:sys:call', async (_event, method: unknown, params: unknown): Promise<SysResult<unknown>> => {
    try {
      const call = validateSysCall(method, params);
      if (call.method === 'evt.queryFile' && !isInsideGrantedRoot((call.params as { path: string }).path)) throw new Error('Pick the .evtx file with the native file picker before opening it.');
      if (call.method === 'acl.get' && (call.params as { target?: { kind?: string; path?: string } }).target?.kind === 'file' && !isInsideGrantedRoot((call.params as { target: { path: string } }).target.path)) throw new Error('Pick the file or folder with the native file picker before inspecting its permissions.');
      return await sysHelper().call(call.method, call.params);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('dude:sys:pwshStatus', (_event, refresh: unknown) => pwshStatus(refresh === true));
  ipcMain.handle('dude:sys:taskList', async (): Promise<ScheduledTaskSummary[]> => {
    const value = await runFixedScript('task.list', {}, new AbortController().signal);
    return Array.isArray(value) ? value as ScheduledTaskSummary[] : value ? [value as ScheduledTaskSummary] : [];
  });
  ipcMain.handle('dude:sys:taskInfo', async (_event, taskPath: unknown, taskName: unknown): Promise<ScheduledTaskDetail> => {
    if (typeof taskPath !== 'string' || taskPath.length > 1024 || !taskPath.startsWith('\\') || /[\u0000-\u001f\u007f]/.test(taskPath) || taskPath.includes('..') || (taskPath !== '\\' && !taskPath.endsWith('\\'))) throw new Error('Invalid Task Scheduler folder path.');
    if (typeof taskName !== 'string' || taskName.length < 1 || taskName.length > 512 || /[\\/\u0000-\u001f\u007f]/.test(taskName) || taskName === '.' || taskName === '..') throw new Error('Invalid scheduled task name.');
    const value = await runFixedScript('task.detail', { taskPath, taskName }, new AbortController().signal);
    return value as ScheduledTaskDetail;
  });
  ipcMain.handle('dude:sys:startupList', (): Promise<StartupProgramsResult> =>
    readStartupPrograms((method, params) => sysHelper().call(method, params)));
  ipcMain.handle('dude:sys:softwareList', (): Promise<InstalledSoftware[]> => listInstalledSoftware());
  ipcMain.handle('dude:sys:featureList', async (): Promise<WindowsFeature[]> => {
    const value = await runFixedScript('feature.list', {}, new AbortController().signal);
    return Array.isArray(value) ? value as WindowsFeature[] : value ? [value as WindowsFeature] : [];
  });
  ipcMain.handle('dude:sys:featureCapabilities', async (): Promise<WindowsCapability[]> => {
    const value = await runFixedScript('feature.capabilities', {}, new AbortController().signal);
    return Array.isArray(value) ? value as WindowsCapability[] : value ? [value as WindowsCapability] : [];
  });
}
