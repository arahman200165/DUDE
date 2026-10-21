import type { ToolInputStore } from './tool-input-store';

/** Sensitive in-memory tool inputs are cleared after the app has been away this long (plan decision 20). */
export const BACKGROUND_WIPE_MS = 5 * 60 * 1000;

export interface AppStateSource {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}
export interface BackgroundWipeOptions {
  readonly appState: AppStateSource;
  readonly store: Pick<ToolInputStore, 'clearAll'>;
  readonly now?: () => number;
  readonly wipeMs?: number;
}

/** Records when the app left the foreground and wipes inputs on return once the threshold has elapsed. Returns a disposer. */
export function installBackgroundWipe({ appState, store, now = Date.now, wipeMs = BACKGROUND_WIPE_MS }: BackgroundWipeOptions): () => void {
  let leftAt: number | null = null;
  const subscription = appState.addEventListener('change', state => {
    if (state === 'active') {
      if (leftAt !== null && now() - leftAt >= wipeMs) store.clearAll();
      leftAt = null;
    } else if (leftAt === null) leftAt = now();
  });
  return () => subscription.remove();
}
