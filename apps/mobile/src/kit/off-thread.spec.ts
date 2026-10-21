import { beforeEach, describe, expect, it, vi } from 'vitest';

// The worker runtime is mocked: a "runtime" runs scheduled worklets only when the test flushes it, on the same thread.
const state = vi.hoisted(() => ({ scheduled: [] as Array<() => void>, createError: undefined as Error | undefined, created: 0, initializers: [] as Array<() => void> }));
vi.mock('react-native-worklets', () => ({
  createWorkletRuntime: (config: { name: string; initializer: () => void }) => {
    if (state.createError) throw state.createError;
    state.created += 1;
    state.initializers.push(config.initializer);
    return { name: config.name };
  },
  scheduleOnRuntime: (_runtime: unknown, worklet: (...args: unknown[]) => void, ...args: unknown[]) => { state.scheduled.push(() => worklet(...args)); },
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => { queueMicrotask(() => fn(...args)); },
}));
vi.mock('../engine-host/worker-host', () => ({ installWorkerHost: vi.fn() }));

import { defineOffThreadTask, isAbortError, isOffThreadAvailable, resetOffThreadForTests, runOffThread } from './off-thread';

/** Attaches a rejection handler immediately so a rejection that lands during a flush is never reported as unhandled. */
const early = <T>(promise: Promise<T>): Promise<T> => { promise.catch(() => undefined); return promise; };
const flushWorker = async (): Promise<void> => { while (state.scheduled.length) state.scheduled.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)); };

beforeEach(() => { resetOffThreadForTests(); state.scheduled.length = 0; state.initializers.length = 0; state.createError = undefined; state.created = 0; });

describe('runOffThread', () => {
  it('roundtrips the payload and result as JSON and reuses one runtime', async () => {
    const upper = defineOffThreadTask((input: { text: string }) => ({ text: input.text.toUpperCase(), length: input.text.length }));
    const first = runOffThread(upper, { text: 'abc' });
    await flushWorker();
    await expect(first).resolves.toEqual({ text: 'ABC', length: 3 });
    const second = runOffThread(upper, { text: 'de' });
    await flushWorker();
    await expect(second).resolves.toEqual({ text: 'DE', length: 2 });
    expect(state.created).toBe(1);
  });

  it('awaits asynchronous tasks', async () => {
    const task = defineOffThreadTask(async (input: { n: number }) => { await Promise.resolve(); return input.n * 2; });
    const result = runOffThread(task, { n: 21 });
    await flushWorker();
    await expect(result).resolves.toBe(42);
  });

  it('turns an undefined result into null', async () => {
    const result = runOffThread(defineOffThreadTask((_input: null) => undefined), null);
    await flushWorker();
    await expect(result).resolves.toBeNull();
  });

  it('propagates synchronous and asynchronous failures as rejected Errors with their message and name', async () => {
    class ParseFailure extends Error { constructor(message: string) { super(message); this.name = 'ParseFailure'; } }
    const sync = early(runOffThread(defineOffThreadTask((_input: null): string => { throw new ParseFailure('bad json at 3'); }), null));
    await flushWorker();
    await expect(sync).rejects.toMatchObject({ message: 'bad json at 3', name: 'ParseFailure' });
    await expect(sync).rejects.toBeInstanceOf(Error);
    const asynchronous = early(runOffThread(defineOffThreadTask(async (_input: null): Promise<string> => { throw new Error('async boom'); }), null));
    await flushWorker();
    await expect(asynchronous).rejects.toThrow('async boom');
  });

  it('rejects an already aborted signal without touching the worker', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = runOffThread(defineOffThreadTask((_input: null) => 1), null, { signal: controller.signal });
    await expect(result).rejects.toSatisfy(isAbortError);
    expect(state.created).toBe(0);
    expect(state.scheduled).toHaveLength(0);
  });

  it('rejects with AbortError when aborted while running and drops the late result', async () => {
    const task = defineOffThreadTask((_input: null) => 'late');
    const controller = new AbortController();
    const result = early(runOffThread(task, null, { signal: controller.signal }));
    expect(state.scheduled).toHaveLength(1);
    controller.abort();
    await expect(result).rejects.toSatisfy(isAbortError);
    await flushWorker();
    // The worker finished after the abort: the result is dropped and the queue keeps working.
    const next = runOffThread(defineOffThreadTask((_input: null) => 'fresh'), null);
    await flushWorker();
    await expect(next).resolves.toBe('fresh');
  });

  it('never dispatches a job aborted while still queued', async () => {
    const ran: string[] = [];
    const slow = defineOffThreadTask((_input: null) => { ran.push('slow'); return 'slow'; });
    const stale = defineOffThreadTask((_input: null) => { ran.push('stale'); return 'stale'; });
    const latest = defineOffThreadTask((_input: null) => { ran.push('latest'); return 'latest'; });
    const controller = new AbortController();
    const first = runOffThread(slow, null);
    const dropped = early(runOffThread(stale, null, { signal: controller.signal }));
    const kept = runOffThread(latest, null);
    controller.abort();
    await expect(dropped).rejects.toSatisfy(isAbortError);
    await flushWorker();
    await flushWorker();
    await expect(first).resolves.toBe('slow');
    await expect(kept).resolves.toBe('latest');
    expect(ran).toEqual(['slow', 'latest']);
  });

  it('runs jobs in submission order, one at a time', async () => {
    const order: number[] = [];
    const task = defineOffThreadTask((input: { n: number }) => { order.push(input.n); return input.n; });
    const results = [1, 2, 3].map(n => runOffThread(task, { n }));
    expect(state.scheduled).toHaveLength(1);
    await flushWorker();
    await flushWorker();
    await flushWorker();
    await expect(Promise.all(results)).resolves.toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('reports a worker host that failed to install as a task failure', async () => {
    resetOffThreadForTests();
    const task = defineOffThreadTask((_input: null) => 'never');
    const result = early(runOffThread(task, null));
    (globalThis as { __dudeWorkerInitError?: string }).__dudeWorkerInitError = 'no crypto';
    await flushWorker();
    delete (globalThis as { __dudeWorkerInitError?: string }).__dudeWorkerInitError;
    await expect(result).rejects.toThrow('Worker host failed to install: no crypto');
  });

  it('rejects payloads that are not JSON serializable', async () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(runOffThread(defineOffThreadTask((_input: unknown) => 1), circular)).rejects.toBeInstanceOf(Error);
  });
});

describe('isOffThreadAvailable', () => {
  it('is true when the worker runtime can be created, and runs the host installer as its initializer', () => {
    expect(isOffThreadAvailable()).toBe(true);
    expect(state.initializers).toHaveLength(1);
    expect(() => state.initializers[0]!()).not.toThrow();
  });

  it('is false, and runOffThread rejects, when the runtime cannot be created', async () => {
    state.createError = new Error('Native part of Worklets is not initialized');
    expect(isOffThreadAvailable()).toBe(false);
    const result = runOffThread(defineOffThreadTask((_input: null) => 1), null);
    await expect(result).rejects.toMatchObject({ name: 'OffThreadUnavailableError' });
    await expect(result).rejects.toThrow('Native part of Worklets is not initialized');
  });
});
