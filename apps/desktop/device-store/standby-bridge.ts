import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import type { DesktopHubResult } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';

/**
 * Warm standby for the renderer (32-SS1, Milestone 849, PD-151): `dude:standby:status|pullNow|chooseFolder`. The puller itself runs in the Device
 * Agent (it holds the device token and the pinned transport and keeps pulling with no window). Main is the trust boundary: every channel accepts
 * calls only from this window's own `webContents` and takes NO argument, and the standby folder is chosen in the native folder dialog shown HERE,
 * so a path never comes from the renderer; main hands the chosen absolute path to the Agent's `standby.setFolder`. Nothing is logged, and a path
 * never appears in an error.
 */

const FORBIDDEN = 'forbidden';

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });

export type FolderPicker = (window: BrowserWindow) => Promise<string | null>;

/** The native folder dialog. A single existing directory, or null when the user cancelled. */
export const pickStandbyFolder: FolderPicker = async (window) => {
  const options: OpenDialogOptions = { title: 'Choose the standby backup folder', properties: ['openDirectory', 'createDirectory'] };
  const result = await dialog.showOpenDialog(window, options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
};

export function registerStandbyHandlers(
  window: BrowserWindow,
  host: () => DeviceStoreHost | null = getDeviceStoreHost,
  pick: FolderPicker = pickStandbyFolder,
): void {
  const guarded = async <T>(event: { sender: unknown }, args: unknown[], run: (h: DeviceStoreHost) => Promise<T>): Promise<DesktopHubResult<T>> => {
    if (event.sender !== window.webContents) return fail(FORBIDDEN, 'forbidden');
    if (args.length !== 0) return fail('bad-request', 'Invalid request.');
    const h = host();
    if (!h) return fail('unavailable', 'The device agent is not running.');
    try {
      return { ok: true, result: await run(h) };
    } catch (error) {
      if (error instanceof DeviceStoreError) return fail(error.code, error.message);
      return fail('internal', 'The standby request failed.');
    }
  };

  ipcMain.handle('dude:standby:status', (event, ...args: unknown[]) => guarded(event, args, (h) => h.call('standby.status', {})));
  ipcMain.handle('dude:standby:pullNow', (event, ...args: unknown[]) => guarded(event, args, (h) => h.call('standby.pullNow', {})));
  ipcMain.handle('dude:standby:chooseFolder', (event, ...args: unknown[]) => guarded(event, args, async (h) => {
    const folder = await pick(window);
    if (folder === null) return { canceled: true, status: await h.call('standby.status', {}) };
    return { canceled: false, status: await h.call('standby.setFolder', { folder }) };
  }));
}
