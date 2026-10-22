import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortError } from './abort-error';
import { DEFAULT_RUN_ERROR, IDLE_RUN, offThreadErrorMessage, startOffThreadRun, type OffThreadRunState } from './off-thread-run-core';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** A tiny store standing in for React state. */
function harness<T>() {
  let state: OffThreadRunState<T> = IDLE_RUN;
  const history: OffThreadRunState<T>[] = [];
  const setState = (update: OffThreadRunState<T> | ((previous: OffThreadRunState<T>) => OffThreadRunState<T>)) => {
    state = typeof update === 'function' ? update(state) : update;
    history.push(state);
  };
  return { setState, get: () => state, history };
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

describe('startOffThreadRun', () => {
  it('marks busy immediately, waits for the debounce, then publishes the result', async () => {
    const h = harness<string>();
    const execute = vi.fn(async (payload: string) => payload.toUpperCase());
    startOffThreadRun('abc', execute, h.setState, { debounceMs: 200 });
    expect(h.get()).toEqual({ result: null, error: null, busy: true });
    await vi.advanceTimersByTimeAsync(199);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledWith('abc', expect.any(AbortSignal));
    expect(h.get()).toEqual({ result: 'ABC', error: null, busy: false });
  });
  it('defaults to a 150 ms debounce', async () => {
    const h = harness<string>();
    const execute = vi.fn(async () => 'x');
    startOffThreadRun('a', execute, h.setState);
    await vi.advanceTimersByTimeAsync(149);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('keeps the previous result visible while the next run is busy', async () => {
    const h = harness<string>();
    startOffThreadRun('a', async () => 'one', h.setState, { debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    startOffThreadRun('b', async () => 'two', h.setState, { debounceMs: 10 });
    expect(h.get()).toEqual({ result: 'one', error: null, busy: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(h.get()).toEqual({ result: 'two', error: null, busy: false });
  });
  it('cancelling before the debounce elapses never dispatches the run', async () => {
    const h = harness<string>();
    const execute = vi.fn(async () => 'x');
    const cancel = startOffThreadRun('a', execute, h.setState, { debounceMs: 100 });
    cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(execute).not.toHaveBeenCalled();
  });
  it('cancelling a running run aborts its signal and drops its result, even if it resolves anyway', async () => {
    const h = harness<string>();
    const gate = deferred<string>();
    let signal!: AbortSignal;
    const cancel = startOffThreadRun('a', (_payload, s) => { signal = s; return gate.promise; }, h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(false);
    const before = h.history.length;
    cancel();
    expect(signal.aborted).toBe(true);
    gate.resolve('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.history.length).toBe(before);
  });
  it('a superseding run wins over a stale one that settles later', async () => {
    const h = harness<string>();
    const first = deferred<string>();
    const cancelFirst = startOffThreadRun('a', () => first.promise, h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    cancelFirst();
    startOffThreadRun('b', async () => 'fresh', h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    first.resolve('stale');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.get()).toEqual({ result: 'fresh', error: null, busy: false });
  });
  it('treats an AbortError rejection as silence, not as an error', async () => {
    const h = harness<string>();
    startOffThreadRun('a', () => Promise.reject(abortError()), h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.get()).toEqual({ result: null, error: null, busy: true });
  });
  it('maps a rejection to its message, clears the result and stops being busy', async () => {
    const h = harness<string>();
    startOffThreadRun('a', async () => 'ok', h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    startOffThreadRun('b', () => Promise.reject(new Error('boom')), h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.get()).toEqual({ result: null, error: 'boom', busy: false });
  });
  it('uses the fallback message for errors without one, and reports a synchronous throw', async () => {
    const h = harness<string>();
    startOffThreadRun('a', () => Promise.reject(new Error('')), h.setState, { debounceMs: 0, fallbackError: 'Could not process this JSON.' });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.get().error).toBe('Could not process this JSON.');
    startOffThreadRun('b', () => { throw 'nope'; }, h.setState, { debounceMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.get().error).toBe(DEFAULT_RUN_ERROR);
  });
  it('honours an injected scheduler', () => {
    const h = harness<string>();
    const set = vi.fn(() => 'handle'); const clear = vi.fn();
    const cancel = startOffThreadRun('a', async () => 'x', h.setState, { debounceMs: 42, scheduler: { set, clear } });
    expect(set).toHaveBeenCalledWith(expect.any(Function), 42);
    cancel();
    expect(clear).toHaveBeenCalledWith('handle');
  });
});

describe('offThreadErrorMessage', () => {
  it('prefers the error message and falls back otherwise', () => {
    expect(offThreadErrorMessage(new Error('x'), 'fb')).toBe('x');
    expect(offThreadErrorMessage(new Error(''), 'fb')).toBe('fb');
    expect(offThreadErrorMessage('plain', 'fb')).toBe('fb');
    expect(offThreadErrorMessage(null)).toBe(DEFAULT_RUN_ERROR);
  });
});
