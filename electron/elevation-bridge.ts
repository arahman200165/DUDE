import { app, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { helperPath } from './network-runner';

function helperMode(args: string[]): Promise<{ status: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 4096) child.kill(); });
    child.once('error', reject);
    child.once('close', () => {
      try { resolve(JSON.parse(output) as { status: string; code: number }); }
      catch { reject(new Error('Windows network helper did not return status.')); }
    });
  });
}

export async function isElevated(): Promise<boolean> {
  return (await helperMode(['status'])).status === 'elevated';
}

export async function relaunchElevated(): Promise<boolean> {
  const result = await helperMode(['relaunch', String(process.pid), process.execPath, ...(!app.isPackaged ? [app.getAppPath()] : [])]);
  if (result.status === 'accepted') { setImmediate(() => app.quit()); return true; }
  return false;
}

export function registerElevationHandlers(): void {
  ipcMain.handle('dude:elevation:status', () => isElevated());
  ipcMain.handle('dude:elevation:relaunch', () => relaunchElevated());
}
