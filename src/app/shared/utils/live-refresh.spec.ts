import { DestroyRef, Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createLiveRefresh } from './live-refresh';

describe('createLiveRefresh', () => {
  let visible = true;
  let focused = true;

  function setup(tick: () => void | Promise<void>, overrides: { interval?: number; paused?: boolean } = {}) {
    const intervalMs = signal(overrides.interval ?? 1000);
    const paused = signal(overrides.paused ?? false);
    const destroyHandlers: Array<() => void> = [];
    const destroyRef = { onDestroy: (fn: () => void) => { destroyHandlers.push(fn); return () => {}; } } as unknown as DestroyRef;
    const refresh = runInInjectionContext(TestBed.inject(Injector), () => createLiveRefresh({ intervalMs, paused, tick, destroyRef }));
    TestBed.tick();
    return { refresh, intervalMs, paused, destroy: () => destroyHandlers.forEach((fn) => fn()) };
  }

  const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

  beforeEach(() => {
    vi.useFakeTimers();
    visible = true;
    focused = true;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (document as unknown as Record<string, unknown>)['visibilityState'];
  });

  it('ticks immediately then every interval', async () => {
    const tick = vi.fn();
    const { refresh, destroy } = setup(tick);
    await flush();
    expect(tick).toHaveBeenCalledTimes(1);
    expect(refresh.running()).toBe(true);
    expect(refresh.lastTickAt()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('never overlaps ticks and schedules only after a tick settles', async () => {
    let release: () => void = () => {};
    let concurrent = 0;
    let maxConcurrent = 0;
    const tick = vi.fn(() => new Promise<void>((resolve) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      release = () => { concurrent--; resolve(); };
    }));
    const { destroy } = setup(tick);
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    release();
    await flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(2);
    release();
    expect(maxConcurrent).toBe(1);
    destroy();
  });

  it('stops while paused and ticks immediately on resume', async () => {
    const tick = vi.fn();
    const { refresh, paused, destroy } = setup(tick);
    await flush();
    paused.set(true);
    TestBed.tick();
    expect(refresh.running()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    paused.set(false);
    TestBed.tick();
    await flush();
    expect(tick).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('does not start when created paused, but refreshNow still ticks once', async () => {
    const tick = vi.fn();
    const { refresh, destroy } = setup(tick, { paused: true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).not.toHaveBeenCalled();
    await refresh.refreshNow();
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(1);
    destroy();
  });

  it('stops when the page is hidden or blurred and ticks immediately when activity returns', async () => {
    const tick = vi.fn();
    const { refresh, destroy } = setup(tick);
    await flush();
    visible = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(refresh.running()).toBe(false);
    visible = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(tick).toHaveBeenCalledTimes(2);

    focused = false;
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(2);
    focused = true;
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(tick).toHaveBeenCalledTimes(3);
    destroy();
  });

  it('keeps looping when a tick throws', async () => {
    const tick = vi.fn().mockRejectedValue(new Error('boom'));
    const { destroy } = setup(tick);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('re-arms the pending timer when the interval changes', async () => {
    const tick = vi.fn();
    const { intervalMs, destroy } = setup(tick, { interval: 10000 });
    await flush();
    intervalMs.set(1000);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('stops ticking and removes listeners on destroy', async () => {
    const tick = vi.fn();
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const { refresh, destroy } = setup(tick);
    await flush();
    destroy();
    expect(refresh.running()).toBe(false);
    expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('blur', expect.any(Function));
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
