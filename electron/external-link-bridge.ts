import { ipcMain, shell, type BrowserWindow } from 'electron';

const MAX_EXTERNAL_URL_LENGTH = 2048;

export type ExternalOpenResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * The only URLs main will hand to the OS browser: absolute http(s), a real host, no embedded
 * credentials, bounded length. Everything else -- `file:`, `javascript:`, `data:`, custom protocol
 * handlers (which can launch other programs), UNC paths -- is refused. The renderer validates the
 * same way before it calls (`core/home-panel`), but main never trusts that: this is the boundary.
 * Runtime imports from `src/app/` aren't allowed here (see AGENTS.md), so the rule is restated.
 */
export function normalizeExternalUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EXTERNAL_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname === '') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url.href;
}

/**
 * `dude:external:open` -- opens an http(s) link in the user's default browser (Phase 30H.6 saved
 * links). Desktop DUDE denies every in-app window open, so this is the single, narrow, explicit
 * route out. It accepts requests only from this window's own renderer.
 */
export function registerExternalLinkHandlers(window: BrowserWindow): void {
  ipcMain.handle('dude:external:open', async (event, url: unknown): Promise<ExternalOpenResult> => {
    if (event.sender !== window.webContents) return { ok: false, error: 'Request rejected.' };
    const href = normalizeExternalUrl(url);
    if (!href) return { ok: false, error: 'Only http:// and https:// links can be opened.' };
    try {
      await shell.openExternal(href);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Couldn’t open the link in your browser.' };
    }
  });
}
