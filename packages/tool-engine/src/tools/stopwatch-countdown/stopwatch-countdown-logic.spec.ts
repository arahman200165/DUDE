import {
  countdownRemainingMs,
  formatClock,
  pauseCountdown,
  pauseStopwatch,
  resetStopwatch,
  setCountdownDuration,
  startCountdown,
  startStopwatch,
  stopwatchElapsedMs,
  tickCountdown,
  INITIAL_COUNTDOWN,
  INITIAL_STOPWATCH,
} from "./stopwatch-countdown-logic.js";

describe('formatClock', () => {
  it('formats under an hour as mm:ss.t', () => {
    expect(formatClock(65_300)).toBe('01:05.3');
  });

  it('formats an hour or more as hh:mm:ss.t', () => {
    expect(formatClock(3_661_000)).toBe('01:01:01.0');
  });

  it('clamps negative durations to zero', () => {
    expect(formatClock(-500)).toBe('00:00.0');
  });
});

describe('stopwatch', () => {
  it('accumulates elapsed time across a start/pause/start cycle', () => {
    let anchor = startStopwatch(INITIAL_STOPWATCH, 1000);
    expect(stopwatchElapsedMs(anchor, 1500)).toBe(500);

    anchor = pauseStopwatch(anchor, 1500);
    expect(stopwatchElapsedMs(anchor, 9999)).toBe(500); // frozen while paused

    anchor = startStopwatch(anchor, 2000);
    expect(stopwatchElapsedMs(anchor, 2300)).toBe(800); // 500 banked + 300 more
  });

  it('is idempotent when starting an already-running stopwatch', () => {
    const running = startStopwatch(INITIAL_STOPWATCH, 1000);
    expect(startStopwatch(running, 5000)).toBe(running);
  });

  it('resets to zero', () => {
    const anchor = startStopwatch(INITIAL_STOPWATCH, 1000);
    expect(resetStopwatch()).toEqual(INITIAL_STOPWATCH);
    expect(stopwatchElapsedMs(resetStopwatch(), 9999)).toBe(0);
    void anchor;
  });
});

describe('countdown', () => {
  it('does nothing when starting with zero duration banked', () => {
    expect(startCountdown(INITIAL_COUNTDOWN, 1000)).toBe(INITIAL_COUNTDOWN);
  });

  it('counts down from a configured duration', () => {
    let anchor = setCountdownDuration(10_000);
    anchor = startCountdown(anchor, 1000);
    expect(countdownRemainingMs(anchor, 4000)).toBe(7000);

    anchor = pauseCountdown(anchor, 4000);
    expect(countdownRemainingMs(anchor, 9999)).toBe(7000); // frozen while paused

    anchor = startCountdown(anchor, 5000);
    expect(countdownRemainingMs(anchor, 6000)).toBe(6000);
  });

  it('never goes negative', () => {
    let anchor = setCountdownDuration(1000);
    anchor = startCountdown(anchor, 0);
    expect(countdownRemainingMs(anchor, 5000)).toBe(0);
  });

  it('auto-pauses at zero via tickCountdown', () => {
    let anchor = setCountdownDuration(1000);
    anchor = startCountdown(anchor, 0);
    anchor = tickCountdown(anchor, 2000);
    expect(anchor).toEqual({ running: false, targetEpochMs: null, remainingMsWhenPaused: 0 });
  });

  it('setCountdownDuration clamps a negative duration to zero', () => {
    expect(setCountdownDuration(-500).remainingMsWhenPaused).toBe(0);
  });
});
