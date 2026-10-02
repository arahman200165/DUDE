import { ipcMain } from 'electron';
import { startCollabServer, type CollabSession } from './collab-server';

let session: CollabSession | null = null;

type StartResult = { readonly ok: true; readonly url: string; readonly sessionCode: string } | { readonly ok: false; readonly error: string };

export function registerCollabHandlers(): void {
  ipcMain.handle('dude:collab:startSession', async (): Promise<StartResult> => {
    if (session) {
      return { ok: true, url: `ws://${session.lanAddress}:${session.port}`, sessionCode: session.sessionCode };
    }
    try {
      session = await startCollabServer();
      return { ok: true, url: `ws://${session.lanAddress}:${session.port}`, sessionCode: session.sessionCode };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not start the collab server.' };
    }
  });

  ipcMain.handle('dude:collab:stopSession', (): { ok: true } => {
    session?.stop();
    session = null;
    return { ok: true };
  });

  ipcMain.handle('dude:collab:participantCount', (): number => session?.participantCount() ?? 0);
}

export function stopCollabServerOnQuit(): void {
  session?.stop();
  session = null;
}
