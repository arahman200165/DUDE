import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import type { BackgroundAgentResult, BackgroundAgentStatus } from '@dude/contracts';
import { getAgentBackground } from './agent-background';
import type { AgentBackground } from './agent-background';

/**
 * Settings > This Device > Background agent: `dude:device:agentStatus`, `setAgentAutostart`,
 * `stopAgent` and `startAgent`. Main is the trust boundary: each handler accepts only this window's
 * own `webContents`, takes no path or command from the renderer (the only input is a boolean) and
 * answers with a small status object. None of them can start anything but DUDE's own agent.
 */

const FORBIDDEN = 'forbidden';
const NOT_RUNNING: BackgroundAgentStatus = { running: false, stoppedByUser: false, autostart: 'disabled', mechanism: null };

export function registerAgentHandlers(window: BrowserWindow, background: () => AgentBackground = getAgentBackground): void {
  const own = (sender: unknown): boolean => sender === window.webContents;

  ipcMain.handle('dude:device:agentStatus', async (event): Promise<BackgroundAgentStatus> => {
    if (!own(event.sender)) throw new Error(FORBIDDEN);
    try { return await background().status(); } catch { return NOT_RUNNING; }
  });

  ipcMain.handle('dude:device:setAgentAutostart', async (event, enabled: unknown): Promise<BackgroundAgentResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    if (typeof enabled !== 'boolean') return { ok: false, error: 'Invalid request.' };
    try { return await background().setAutostart(enabled); } catch { return { ok: false, error: 'The change did not complete.' }; }
  });

  ipcMain.handle('dude:device:stopAgent', async (event): Promise<BackgroundAgentResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    try { return await background().stop(); } catch { return { ok: false, error: 'The background agent did not stop.' }; }
  });

  ipcMain.handle('dude:device:startAgent', async (event): Promise<BackgroundAgentResult> => {
    if (!own(event.sender)) return { ok: false, error: FORBIDDEN };
    try { return await background().start(); } catch { return { ok: false, error: 'The background agent did not start.' }; }
  });
}
