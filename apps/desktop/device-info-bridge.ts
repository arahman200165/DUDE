import { ipcMain, type BrowserWindow } from 'electron';
import * as nodeOs from 'node:os';
import type { DeviceOsFacts } from '@dude/contracts/shared/models/platform-bridge.model';

/** The slice of `node:os` this bridge reads, injectable for tests. */
export interface DeviceOsSource {
  version(): string;
  release(): string;
  arch(): string;
  platform(): string;
  cpus(): readonly { readonly model: string }[];
  totalmem(): number;
}

/**
 * Read-only OS facts for the Device Info tool. Only these seven non-identifying fields are ever
 * returned: never the host name, user name, home directory, network interfaces or any path.
 */
export function collectDeviceOsFacts(source: DeviceOsSource = nodeOs): DeviceOsFacts {
  const cpus = source.cpus();
  return {
    platform: source.platform(),
    osName: source.version(),
    osRelease: source.release(),
    arch: source.arch(),
    cpuModel: (cpus[0]?.model ?? '').trim(),
    cpuCount: cpus.length,
    totalMemoryBytes: source.totalmem(),
  };
}

/** `dude:deviceInfo:osFacts` -- accepts requests only from this window's own renderer and takes no input. */
export function registerDeviceInfoHandlers(window: BrowserWindow, source: DeviceOsSource = nodeOs): void {
  ipcMain.handle('dude:deviceInfo:osFacts', (event): DeviceOsFacts | null => {
    if (event.sender !== window.webContents) return null;
    return collectDeviceOsFacts(source);
  });
}
