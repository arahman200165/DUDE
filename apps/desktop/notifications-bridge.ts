import { ipcMain, Notification } from 'electron';

/**
 * Native OS notifications (Phase 8 Stage 5), triggered from the renderer —
 * most trigger sources (a worker or LLM-proxy call finishing) live there,
 * not in the main process, so this is a thin renderer-to-native call rather
 * than something the main process decides to show unprompted.
 */
export function registerNotificationHandlers(): void {
  ipcMain.handle('dude:notifications:show', (_event, title: string, body: string): { ok: true } | { ok: false; error: string } => {
    if (!Notification.isSupported()) return { ok: false, error: 'not-supported' };
    new Notification({ title, body }).show();
    return { ok: true };
  });
}
