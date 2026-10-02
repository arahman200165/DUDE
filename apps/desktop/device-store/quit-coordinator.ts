import type { BrowserWindow } from 'electron';
import type { DeviceStoreHost } from './agent-host';
import { requestRendererFlush } from './store-bridge';

export const FLUSH_TIMEOUT_MS = 1_500;
export const QUIT_TOTAL_TIMEOUT_MS = 4_000;

interface QuitApp {
  on(event: 'before-quit', listener: (event: { preventDefault(): void }) => void): unknown;
  quit(): void;
}

export interface QuitCoordinatorOptions {
  app: QuitApp;
  getWindow: () => BrowserWindow | null;
  host: () => DeviceStoreHost | null;
  markCleanExit: () => Promise<void> | void;
  /**
   * True when the agent should keep running after the app quits (a packaged build whose "start at sign-in"
   * preference is on). Then quit detaches from the agent; otherwise it shuts the agent down. Defaults to false.
   */
  keepAgentRunning?: () => boolean;
  /** Test seam; defaults to the renderer flush handshake. */
  flush?: (window: BrowserWindow, timeoutMs: number) => Promise<void>;
  flushTimeoutMs?: number;
  totalTimeoutMs?: number;
}

/**
 * Orderly quit for the device store. The first `before-quit` is cancelled; then, in order, the
 * renderer flushes its debounced writes, the clean-exit marker is written, the Device Agent
 * either checkpoints and keeps running (detach, when the user keeps it resident) or checkpoints and exits, and `app.quit()` runs again (that second `before-quit` passes through).
 * The whole sequence is capped so a hung renderer or agent can never keep the app open.
 *
 * `autoUpdater.quitAndInstall()` is unaffected: electron-updater spawns the installer
 * synchronously first, then calls `app.quit()` from `setImmediate`, which re-enters here and
 * simply quits a moment later; the install-on-quit hook runs on the final `quit` event.
 */
export function installQuitCoordinator(options: QuitCoordinatorOptions): void {
  const flush = options.flush ?? requestRendererFlush;
  const flushTimeout = options.flushTimeoutMs ?? FLUSH_TIMEOUT_MS;
  const total = options.totalTimeoutMs ?? QUIT_TOTAL_TIMEOUT_MS;
  let phase: 'idle' | 'running' | 'done' = 'idle';

  const sequence = async (): Promise<void> => {
    const window = options.getWindow();
    if (window) await flush(window, flushTimeout);
    await options.markCleanExit();
    const host = options.host();
    if (!host) return;
    if (options.keepAgentRunning?.()) await host.detach();
    else await host.shutdown();
  };

  options.app.on('before-quit', (event) => {
    if (phase === 'done') return;
    event.preventDefault();
    if (phase === 'running') return;
    phase = 'running';
    let cap: ReturnType<typeof setTimeout> | undefined;
    const capped = new Promise<void>((resolve) => { cap = setTimeout(resolve, total); });
    void Promise.race([sequence().catch(() => undefined), capped]).then(() => {
      if (cap) clearTimeout(cap);
      phase = 'done';
      options.app.quit();
    });
  });
}
