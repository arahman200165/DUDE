/**
 * Pure, framework-free stopwatch/countdown math. Both anchors store only
 * fixed epoch instants (never a raw ticking counter) so elapsed/remaining
 * time can always be *recomputed* from `Date.now()` — on every tick, and
 * after a page reload restores a persisted anchor mid-run.
 */

export function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.round(ms / 100) * 100);
  const totalSeconds = Math.floor(clamped / 1000);
  const tenths = Math.floor((clamped % 1000) / 100);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${tenths}` : `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

export interface StopwatchAnchor {
  readonly running: boolean;
  readonly startEpochMs: number | null;
  readonly accumulatedMs: number;
}

export const INITIAL_STOPWATCH: StopwatchAnchor = { running: false, startEpochMs: null, accumulatedMs: 0 };

export function stopwatchElapsedMs(anchor: StopwatchAnchor, nowMs: number): number {
  if (!anchor.running || anchor.startEpochMs === null) return anchor.accumulatedMs;
  return anchor.accumulatedMs + (nowMs - anchor.startEpochMs);
}

export function startStopwatch(anchor: StopwatchAnchor, nowMs: number): StopwatchAnchor {
  return anchor.running ? anchor : { running: true, startEpochMs: nowMs, accumulatedMs: anchor.accumulatedMs };
}

export function pauseStopwatch(anchor: StopwatchAnchor, nowMs: number): StopwatchAnchor {
  return anchor.running ? { running: false, startEpochMs: null, accumulatedMs: stopwatchElapsedMs(anchor, nowMs) } : anchor;
}

export function resetStopwatch(): StopwatchAnchor {
  return INITIAL_STOPWATCH;
}

export interface CountdownAnchor {
  readonly running: boolean;
  readonly targetEpochMs: number | null;
  readonly remainingMsWhenPaused: number;
}

export const INITIAL_COUNTDOWN: CountdownAnchor = { running: false, targetEpochMs: null, remainingMsWhenPaused: 0 };

export function countdownRemainingMs(anchor: CountdownAnchor, nowMs: number): number {
  if (!anchor.running || anchor.targetEpochMs === null) return anchor.remainingMsWhenPaused;
  return Math.max(0, anchor.targetEpochMs - nowMs);
}

export function startCountdown(anchor: CountdownAnchor, nowMs: number): CountdownAnchor {
  if (anchor.running || anchor.remainingMsWhenPaused <= 0) return anchor;
  return { running: true, targetEpochMs: nowMs + anchor.remainingMsWhenPaused, remainingMsWhenPaused: anchor.remainingMsWhenPaused };
}

export function pauseCountdown(anchor: CountdownAnchor, nowMs: number): CountdownAnchor {
  return anchor.running ? { running: false, targetEpochMs: null, remainingMsWhenPaused: countdownRemainingMs(anchor, nowMs) } : anchor;
}

/** Loads a new duration to count down from, replacing whatever was banked (does not auto-start). */
export function setCountdownDuration(durationMs: number): CountdownAnchor {
  return { running: false, targetEpochMs: null, remainingMsWhenPaused: Math.max(0, durationMs) };
}

/** Once remaining time hits zero while running, the countdown auto-pauses at zero. */
export function tickCountdown(anchor: CountdownAnchor, nowMs: number): CountdownAnchor {
  if (anchor.running && countdownRemainingMs(anchor, nowMs) <= 0) {
    return { running: false, targetEpochMs: null, remainingMsWhenPaused: 0 };
  }
  return anchor;
}
