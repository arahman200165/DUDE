import { ipcMain } from 'electron';
import type { SysResult } from '../src/shared-logic/system/system-types';
import { validateSysCall } from './sys-validation';
import { sysHelper } from './sys-helper';
import { pwshStatus } from './sys-pwsh';

// Reserved for later milestones: `dude:sys:event` carries streamed helper events (SysStreamEvent).

export function registerSysHandlers(): void {
  ipcMain.handle('dude:sys:call', async (_event, method: unknown, params: unknown): Promise<SysResult<unknown>> => {
    try {
      const call = validateSysCall(method, params);
      return await sysHelper().call(call.method, call.params);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('dude:sys:pwshStatus', (_event, refresh: unknown) => pwshStatus(refresh === true));
}
