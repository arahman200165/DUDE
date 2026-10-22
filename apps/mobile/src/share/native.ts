import { requireNativeModule } from 'expo-modules-core';
import type { IncomingShare } from './share-model';

interface NativeShareModule {
  getPendingShare(maxBytes: number): Promise<IncomingShare | null>;
  clearPendingShare(): void;
  addListener(name: 'onShare', listener: () => void): { remove(): void };
}
// Resolved lazily so importing pure routing code never needs the Android bridge.
const native = (): NativeShareModule => requireNativeModule<NativeShareModule>('DudeShare');

/** The pending ACTION_SEND payload (content is read natively and capped at `maxBytes`), or null. Never logged. */
export const getPendingShare = (maxBytes: number): Promise<IncomingShare | null> => native().getPendingShare(maxBytes);
export const clearPendingShare = (): void => { try { native().clearPendingShare(); } catch { /* nothing pending, or the host has no module */ } };
export const onShare = (listener: () => void): { remove(): void } => native().addListener('onShare', listener);
