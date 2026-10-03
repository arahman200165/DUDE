import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_RETRY_MS, startOfflineRetry } from './hub-web-retry';

describe('startOfflineRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('probes every 15 s while visible and reloads once the Hub answers', async () => {
    const probe = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    const reload = vi.fn();
    const stop = startOfflineRetry({ probe, reload, isVisible: () => true });
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS * 3);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not probe while the tab is hidden', async () => {
    const probe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const stop = startOfflineRetry({ probe, reload: vi.fn(), isVisible: () => false });
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS * 3);
    expect(probe).not.toHaveBeenCalled();
    stop();
  });

  it('stops probing once stopped', async () => {
    const probe = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('down'));
    const stop = startOfflineRetry({ probe, reload: vi.fn(), isVisible: () => true });
    stop();
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS * 2);
    expect(probe).not.toHaveBeenCalled();
  });
});
