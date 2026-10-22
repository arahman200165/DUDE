import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { TOOL_METADATA } from '@dude/tool-registry';
import type { FileInputSource } from '../kit/file-io-core';
import { MOBILE_BINDINGS } from '../registry/mobile-bindings.generated';
import { installBackgroundWipe } from '../tools-host/background-wipe';
import { clearPendingShare, getPendingShare, onShare } from './native';
import { runnableToolIds, shareReadCap } from './share-model';
import { shareStore, type PendingShare } from './share-store';

export const SHARE_ROUTE = '/share';
const readCap = (): number => shareReadCap(runnableToolIds(TOOL_METADATA, MOBILE_BINDINGS), TOOL_METADATA as readonly FileInputSource[]);

/** Reads any pending Android share into the in-memory store; the native copy is cleared straight away so it can never replay. */
async function loadPendingShare(): Promise<boolean> {
  try {
    const share = await getPendingShare(readCap());
    if (!share) return false;
    shareStore.set({ share });
    clearPendingShare();
    return true;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    shareStore.set({ error: code === 'ERR_SHARE_UNSUPPORTED' ? 'Only content shared through the Android share sheet can be opened.' : 'The shared content could not be read.' });
    clearPendingShare();
    return true;
  }
}

/**
 * Mounted once at the app root. Reads a pending ACTION_SEND on mount, on every return to the foreground and on the native
 * `onShare` event, then opens the share route. Deep links stay navigation-only (see navigation/deep-links.ts); shares never
 * pass through them and nothing is auto-run, persisted or synchronized.
 */
export function useIncomingShare(): void {
  const router = useRouter();
  const pathname = usePathname();
  const navigationReady = !!useRootNavigationState()?.key;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  useEffect(() => {
    if (!navigationReady) return;
    let active = true;
    const check = () => { void loadPendingShare().then(found => { if (found && active && pathnameRef.current !== SHARE_ROUTE) router.push(SHARE_ROUTE); }); };
    check();
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    let subscription: { remove(): void } | undefined;
    try { subscription = onShare(check); } catch { /* host without the native module: no share events */ }
    const disposeWipe = installBackgroundWipe({ appState: AppState, store: shareStore });
    return () => { active = false; foreground.remove(); subscription?.remove(); disposeWipe(); };
  }, [navigationReady, router]);
}

export function usePendingShare(): PendingShare | null {
  return useSyncExternalStore(shareStore.subscribe, shareStore.get, shareStore.get);
}
