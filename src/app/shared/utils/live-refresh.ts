import { DestroyRef, Signal, effect, signal, untracked } from '@angular/core';

export interface LiveRefreshOptions {
  readonly intervalMs: Signal<number>;
  readonly paused: Signal<boolean>;
  /** One refresh. May be async; a throw is swallowed so the loop keeps going (surface errors inside `tick`). */
  readonly tick: () => void | Promise<void>;
  readonly destroyRef: DestroyRef;
}

export interface LiveRefresh {
  /** True while the loop is active (not paused, page visible and focused). */
  readonly running: Signal<boolean>;
  /** `Date.now()` when the last tick settled, or null before the first. */
  readonly lastTickAt: Signal<number | null>;
  /** A manual tick that works even while paused; it joins an in-flight tick instead of overlapping it. */
  refreshNow(): Promise<void>;
}

/**
 * Visibility-aware polling loop for live tools (process monitor, port table, ...).
 *
 * Must be called in an injection context (a component/service constructor or field initializer): it
 * registers an `effect` to react to `intervalMs`/`paused` and a `destroyRef` cleanup that stops the
 * timer and removes the document/window listeners.
 *
 * The loop is active only when not paused AND the page is visible AND has focus. On becoming active it
 * ticks immediately, then re-schedules with `setTimeout` only after each tick settles, so ticks never
 * overlap. Changing the interval re-arms a pending timer without ticking.
 */
export function createLiveRefresh(options: LiveRefreshOptions): LiveRefresh {
  const running = signal(false);
  const lastTickAt = signal<number | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let destroyed = false;

  const canRun = (): boolean => !options.paused() && document.visibilityState === 'visible' && document.hasFocus();

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (): void => {
    clearTimer();
    if (destroyed || !running()) return;
    timer = setTimeout(() => { timer = undefined; void runTick(); }, options.intervalMs());
  };

  const runTick = (): Promise<void> => {
    if (inFlight) return inFlight;
    clearTimer();
    const current: Promise<void> = (async () => {
      try { await options.tick(); } catch { /* a failed tick must not stop the loop */ }
      lastTickAt.set(Date.now());
    })().finally(() => {
      inFlight = null;
      schedule();
    });
    inFlight = current;
    return current;
  };

  const sync = (): void => {
    if (destroyed) return;
    const active = canRun();
    if (active === running()) return;
    running.set(active);
    if (active) void runTick();
    else clearTimer();
  };

  const onVisibility = (): void => sync();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);
  window.addEventListener('blur', onVisibility);

  options.destroyRef.onDestroy(() => {
    destroyed = true;
    clearTimer();
    running.set(false);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onVisibility);
    window.removeEventListener('blur', onVisibility);
  });

  effect(() => {
    options.intervalMs();
    options.paused();
    untracked(() => {
      sync();
      if (timer !== undefined) schedule();
    });
  });

  return { running: running.asReadonly(), lastTickAt: lastTickAt.asReadonly(), refreshNow: () => runTick() };
}
