/**
 * Native feedback for the tool kit: haptics and the clipboard. The native modules are imported lazily so a binary
 * built without them (or a test host) degrades to a silent no-op instead of crashing the tool screen.
 */
export interface HapticsModule {
  notificationAsync(type: unknown): Promise<void>;
  selectionAsync(): Promise<void>;
  readonly NotificationFeedbackType: { readonly Success: unknown; readonly Error: unknown };
}
export interface ClipboardModule {
  getStringAsync(): Promise<string>;
  setStringAsync(text: string): Promise<boolean>;
}

export interface Feedback {
  hapticSuccess(): Promise<void>;
  hapticError(): Promise<void>;
  hapticSelection(): Promise<void>;
  /** Reads the clipboard text. Call only from an explicit user tap. Resolves null when unavailable. */
  readClipboard(): Promise<string | null>;
  /** Writes text to the clipboard. Resolves false when unavailable. */
  writeClipboard(text: string): Promise<boolean>;
}

export function createFeedback(loadHaptics: () => Promise<HapticsModule>, loadClipboard: () => Promise<ClipboardModule>): Feedback {
  const haptics = async (run: (module: HapticsModule) => Promise<void>): Promise<void> => {
    try { await run(await loadHaptics()); } catch { /* haptics are unavailable (no vibrator, missing module, denied by OS): silently skip */ }
  };
  return {
    hapticSuccess: () => haptics(module => module.notificationAsync(module.NotificationFeedbackType.Success)),
    hapticError: () => haptics(module => module.notificationAsync(module.NotificationFeedbackType.Error)),
    hapticSelection: () => haptics(module => module.selectionAsync()),
    async readClipboard() { try { return await (await loadClipboard()).getStringAsync(); } catch { return null; } },
    async writeClipboard(text) { try { return await (await loadClipboard()).setStringAsync(text); } catch { return false; } },
  };
}

const feedback = createFeedback(
  () => import('expo-haptics') as unknown as Promise<HapticsModule>,
  () => import('expo-clipboard') as unknown as Promise<ClipboardModule>,
);
export const hapticSuccess = feedback.hapticSuccess;
export const hapticError = feedback.hapticError;
export const hapticSelection = feedback.hapticSelection;
export const readClipboard = feedback.readClipboard;
export const writeClipboard = feedback.writeClipboard;
