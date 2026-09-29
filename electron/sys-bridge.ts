import { ipcMain } from 'electron';
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
  ipcMain.handle('dude:sys:call', async (_event, method: unknown, params: unknown): Promise<SysResult<unknown>> => {
    try {
      const call = validateSysCall(method, params);
      if (call.method === 'evt.queryFile' && !isInsideGrantedRoot((call.params as { path: string }).path)) throw new Error('Pick the .evtx file with the native file picker before opening it.');
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
