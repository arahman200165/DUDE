export const OFFLINE_RETRY_MS = 15_000;

export interface OfflineRetryDeps {
  /** Resolves when the Hub answers at all; rejects while it cannot be reached. */
  readonly probe: () => Promise<void>;
  /** Reloads the page so boot runs normally. */
  readonly reload: () => void;
  readonly isVisible?: () => boolean;
  readonly intervalMs?: number;
}

/**
 * The retry loop of the offline boot: every 15 s while the tab is visible (and when it becomes visible again) ask the
 * Hub for anything; the first answer reloads the page. Returns the stop function.
 */
export function startOfflineRetry(deps: OfflineRetryDeps): () => void {
  const visible = deps.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let busy = false;
  let stopped = false;
  const attempt = async (): Promise<void> => {
    if (stopped || busy || !visible()) return;
    busy = true;
    try {
      await deps.probe();
      if (!stopped) {
        stopped = true;
        deps.reload();
      }
    } catch {
      // still down; try again on the next tick
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void attempt(), deps.intervalMs ?? OFFLINE_RETRY_MS);
  const onVisible = (): void => void attempt();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}
