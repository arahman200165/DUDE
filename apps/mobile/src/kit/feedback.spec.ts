import { describe, expect, it, vi } from 'vitest';
import { createFeedback, type ClipboardModule, type HapticsModule } from './feedback';

const haptics = (): HapticsModule & { notificationAsync: ReturnType<typeof vi.fn>; selectionAsync: ReturnType<typeof vi.fn> } => ({
  notificationAsync: vi.fn(async () => undefined), selectionAsync: vi.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
});
const clipboard = (text = ''): ClipboardModule & { value: string } => {
  const state = { value: text, getStringAsync: async () => state.value, setStringAsync: async (next: string) => { state.value = next; return true; } };
  return state;
};
const missing = async (): Promise<never> => { throw new Error('native module not available'); };

describe('kit feedback', () => {
  it('maps success, error and selection onto the haptics module', async () => {
    const module = haptics();
    const feedback = createFeedback(async () => module, async () => clipboard());
    await feedback.hapticSuccess(); await feedback.hapticError(); await feedback.hapticSelection();
    expect(module.notificationAsync.mock.calls).toEqual([['success'], ['error']]);
    expect(module.selectionAsync).toHaveBeenCalledTimes(1);
  });
  it('is a silent no-op when the haptics module cannot load', async () => {
    const feedback = createFeedback(missing, missing);
    await expect(feedback.hapticSuccess()).resolves.toBeUndefined();
    await expect(feedback.hapticError()).resolves.toBeUndefined();
    await expect(feedback.hapticSelection()).resolves.toBeUndefined();
  });
  it('is a silent no-op when the vibrator call rejects', async () => {
    const module = haptics(); module.notificationAsync.mockRejectedValue(new Error('no vibrator')); module.selectionAsync.mockRejectedValue(new Error('no vibrator'));
    const feedback = createFeedback(async () => module, async () => clipboard());
    await expect(feedback.hapticSuccess()).resolves.toBeUndefined();
    await expect(feedback.hapticSelection()).resolves.toBeUndefined();
  });
  it('reads and writes the clipboard, and reports unavailability instead of throwing', async () => {
    const board = clipboard('pasted');
    const feedback = createFeedback(async () => haptics(), async () => board);
    expect(await feedback.readClipboard()).toBe('pasted');
    expect(await feedback.writeClipboard('copied')).toBe(true);
    expect(board.value).toBe('copied');
    const unavailable = createFeedback(missing, missing);
    expect(await unavailable.readClipboard()).toBeNull();
    expect(await unavailable.writeClipboard('x')).toBe(false);
  });
  it('does not touch the clipboard until asked', async () => {
    const loadClipboard = vi.fn(async () => clipboard('secret'));
    createFeedback(async () => haptics(), loadClipboard);
    expect(loadClipboard).not.toHaveBeenCalled();
  });
});
