import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import {
  countdownRemainingMs,
  formatClock,
  INITIAL_COUNTDOWN,
  INITIAL_STOPWATCH,
  pauseCountdown,
  pauseStopwatch,
  setCountdownDuration,
  startCountdown,
  startStopwatch,
  stopwatchElapsedMs,
} from "@dude/tool-engine/tools/stopwatch-countdown/stopwatch-countdown-logic";

describe('formatClock fuzzing', () => {
  it('never throws for arbitrary numbers', () => {
    neverThrows((ms: number) => formatClock(ms), fc.double());
  });

  it('always formats as a clock-shaped string', () => {
    invariant(
      (ms: number) => formatClock(ms),
      fc.double({ min: -1e15, max: 1e15, noNaN: true }),
      (formatted) => /^(\d+:)?\d{2}:\d{2}\.\d$/.test(formatted),
    );
  });
});

describe('stopwatch invariants', () => {
  it('elapsed time equals now minus start while running', () => {
    invariant(
      ([startMs, delta]: [number, number]) => stopwatchElapsedMs(startStopwatch(INITIAL_STOPWATCH, startMs), startMs + delta),
      fc.tuple(fc.integer({ min: 0, max: 1e12 }), fc.nat({ max: 1e9 })),
      (elapsed, [, delta]) => elapsed === delta,
    );
  });

  it('pausing freezes the elapsed reading regardless of later queries', () => {
    invariant(
      ([startMs, runFor, laterOffset]: [number, number, number]) => {
        const running = startStopwatch(INITIAL_STOPWATCH, startMs);
        const paused = pauseStopwatch(running, startMs + runFor);
        return [stopwatchElapsedMs(paused, startMs + runFor), stopwatchElapsedMs(paused, startMs + runFor + laterOffset)] as const;
      },
      fc.tuple(fc.integer({ min: 0, max: 1e12 }), fc.nat({ max: 1e9 }), fc.nat({ max: 1e9 })),
      ([atPause, later]) => atPause === later,
    );
  });
});

describe('countdown invariants', () => {
  it('remaining time never goes negative and hits zero once the target passes', () => {
    invariant(
      ([duration, startMs, elapsed]: [number, number, number]) =>
        countdownRemainingMs(startCountdown(setCountdownDuration(duration), startMs), startMs + elapsed),
      fc.tuple(fc.nat({ max: 1e9 }), fc.integer({ min: 0, max: 1e12 }), fc.nat({ max: 2e9 })),
      (remaining, [duration, , elapsed]) => remaining >= 0 && (elapsed < duration ? remaining === duration - elapsed : remaining === 0),
    );
  });

  it('pausing a countdown freezes the remaining reading', () => {
    invariant(
      ([duration, startMs, pauseAfter, laterOffset]: [number, number, number, number]) => {
        const running = startCountdown(setCountdownDuration(duration), startMs);
        const paused = pauseCountdown(running, startMs + pauseAfter);
        return [countdownRemainingMs(paused, startMs + pauseAfter), countdownRemainingMs(paused, startMs + pauseAfter + laterOffset)] as const;
      },
      fc.tuple(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 0, max: 1e12 }), fc.nat({ max: 1e9 }), fc.nat({ max: 1e9 })),
      ([atPause, later]) => atPause === later,
    );
  });

  it('never throws for arbitrary anchor-shaped input', () => {
    neverThrows(
      ([duration, startMs, nowMs]: [number, number, number]) => countdownRemainingMs(startCountdown(setCountdownDuration(duration), startMs), nowMs),
      fc.tuple(fc.double(), fc.double(), fc.double()),
    );
    void INITIAL_COUNTDOWN;
  });
});
