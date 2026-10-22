import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAIN_THREAD_INPUT_BYTES } from './text-bytes';
import {
  coerceOption, createTextToolController, defaultOptions, resolveMaxInputBytes, resolveModes, toErrorMessage,
  type OptionSpec, type TextToolRequest, type TextToolSpec, type ToolRunResult,
} from './text-tool-controller';

const upper = (input: string): ToolRunResult => ({ ok: true, output: input.toUpperCase() });
const request = (input: string, modeId = 'default', options: TextToolRequest['options'] = {}): TextToolRequest => ({ input, modeId, options });
const deferred = () => {
  let resolve!: (value: ToolRunResult) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<ToolRunResult>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createTextToolController', () => {
  it('debounces live runs by 150 ms and keeps only the latest request', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('a')); controller.setRequest(request('ab')); controller.setRequest(request('abc'));
    await vi.advanceTimersByTimeAsync(149);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('abc', {});
    expect(controller.getState()).toMatchObject({ status: 'done', result: { ok: true, output: 'ABC' } });
  });
  it('treats an empty input as no result and does not run', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('x')); await vi.advanceTimersByTimeAsync(150);
    controller.setRequest(request(''));
    expect(controller.getState()).toMatchObject({ status: 'idle', result: null });
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('runs on empty input when allowEmptyInput is set (generators)', async () => {
    const controller = createTextToolController({ toolId: 't', allowEmptyInput: true, run: () => ({ ok: true, output: 'generated' }) });
    controller.setRequest(request('')); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState().result).toEqual({ ok: true, output: 'generated' });
  });
  it('discards a stale async result that settles after a newer run', async () => {
    const first = deferred(), second = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('one')); await vi.advanceTimersByTimeAsync(150);
    controller.setRequest(request('two')); await vi.advanceTimersByTimeAsync(150);
    second.resolve({ ok: true, output: 'TWO' }); await vi.advanceTimersByTimeAsync(0);
    first.resolve({ ok: true, output: 'ONE' }); await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState().result).toEqual({ ok: true, output: 'TWO' });
    expect(controller.getState().status).toBe('done');
  });
  it('reports running while pending and keeps the previous result visible', async () => {
    const pending = deferred();
    const run = vi.fn().mockReturnValueOnce({ ok: true, output: 'OLD' }).mockReturnValueOnce(pending.promise);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('a')); await vi.advanceTimersByTimeAsync(150);
    controller.setRequest(request('b')); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState()).toMatchObject({ status: 'running', result: { ok: true, output: 'OLD' } });
    pending.resolve({ ok: true, output: 'NEW' }); await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toMatchObject({ status: 'done', result: { ok: true, output: 'NEW' } });
  });
  it('maps thrown errors, rejections and malformed results to error results', async () => {
    const outcomes: (() => unknown)[] = [() => { throw new Error('bad input'); }, () => Promise.reject('plain string failure'), () => ({ nonsense: true }), () => { throw 42; }];
    const messages: string[] = [];
    for (const [index, outcome] of outcomes.entries()) {
      const controller = createTextToolController({ toolId: 't', run: outcome as never });
      controller.setRequest(request(`x${index}`)); await vi.advanceTimersByTimeAsync(150);
      const result = controller.getState().result;
      expect(result?.ok).toBe(false);
      expect(controller.getState().status).toBe('done');
      if (result && !result.ok) messages.push(result.error);
    }
    expect(messages).toEqual(['bad input', 'plain string failure', 'The tool returned an unreadable result.', 'The tool failed to process this input.']);
    expect(toErrorMessage(new Error('bad input'))).toBe('bad input');
  });
  it('passes through ok:false results from the tool unchanged', async () => {
    const controller = createTextToolController({ toolId: 't', run: () => ({ ok: false, error: 'Invalid Base64' }) });
    controller.setRequest(request('!!')); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState().result).toEqual({ ok: false, error: 'Invalid Base64' });
  });
  it('selects the run by mode and re-runs when the mode or an option changes', async () => {
    const spec: TextToolSpec = { toolId: 't', modes: [
      { id: 'encode', label: 'Encode', run: (input, options) => ({ ok: true, output: `enc:${input}:${String(options['pad'])}` }) },
      { id: 'decode', label: 'Decode', run: input => ({ ok: true, output: `dec:${input}` }) },
    ] };
    const controller = createTextToolController(spec);
    controller.setRequest(request('a', 'encode', { pad: true })); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState().result).toEqual({ ok: true, output: 'enc:a:true' });
    controller.setRequest(request('a', 'encode', { pad: false })); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState().result).toEqual({ ok: true, output: 'enc:a:false' });
    controller.setRequest(request('a', 'decode', { pad: false })); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState().result).toEqual({ ok: true, output: 'dec:a' });
  });
  it('ignores an identical request and falls back to the first mode for an unknown mode id', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('a', 'gone')); controller.setRequest(request('a', 'gone')); await vi.advanceTimersByTimeAsync(150);
    controller.setRequest(request('a', 'gone')); await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('uses offThread instead of run when provided, with the mode id', async () => {
    const run = vi.fn(upper);
    const offThread = vi.fn(async (input: string, _options: unknown, mode: string): Promise<ToolRunResult> => ({ ok: true, output: `${mode}:${input}` }));
    const controller = createTextToolController({ toolId: 't', modes: [{ id: 'format', label: 'Format', run }], offThread });
    controller.setRequest(request('{}', 'format')); await vi.advanceTimersByTimeAsync(150);
    expect(run).not.toHaveBeenCalled();
    expect(offThread).toHaveBeenCalledWith('{}', {}, 'format', expect.any(AbortSignal));
    expect(controller.getState().result).toEqual({ ok: true, output: 'format:{}' });
  });
  describe('offThread abort signal', () => {
    const signals: AbortSignal[] = [];
    const gated = () => {
      signals.length = 0;
      const gates: ReturnType<typeof deferred>[] = [];
      const offThread = vi.fn((_input: string, _options: unknown, _mode: string, signal: AbortSignal) => { signals.push(signal); const gate = deferred(); gates.push(gate); return gate.promise; });
      return { offThread, gates };
    };
    it('aborts the in-flight run when a newer run starts and discards its late result', async () => {
      const { offThread, gates } = gated();
      const controller = createTextToolController({ toolId: 't', run: upper, offThread });
      controller.setRequest(request('a')); await vi.advanceTimersByTimeAsync(150);
      expect(signals[0]!.aborted).toBe(false);
      controller.setRequest(request('ab')); await vi.advanceTimersByTimeAsync(150);
      expect(signals[0]!.aborted).toBe(true);
      expect(signals[1]!.aborted).toBe(false);
      gates[0]!.resolve({ ok: true, output: 'stale' });
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.getState().status).toBe('running');
      gates[1]!.resolve({ ok: true, output: 'fresh' });
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.getState().result).toEqual({ ok: true, output: 'fresh' });
    });
    it('does not report an AbortError from a superseded run as a tool error', async () => {
      const { offThread, gates } = gated();
      const controller = createTextToolController({ toolId: 't', run: upper, offThread });
      controller.setRequest(request('a')); await vi.advanceTimersByTimeAsync(150);
      controller.setRequest(request('ab')); await vi.advanceTimersByTimeAsync(150);
      const abort = new Error('The operation was aborted.'); abort.name = 'AbortError';
      gates[0]!.reject(abort);
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.getState()).toMatchObject({ status: 'running', result: null });
    });
    it('aborts when the request of a non-live tool changes', async () => {
      const { offThread } = gated();
      const manual = createTextToolController({ toolId: 't', live: false, run: upper, offThread });
      manual.setRequest(request('a')); void manual.runNow();
      expect(signals[0]!.aborted).toBe(false);
      manual.setRequest(request('ab'));
      expect(signals[0]!.aborted).toBe(true);
    });
    it('keeps the signal live once a run settles, and a settled run is not aborted by the next idle reset', async () => {
      const offThread = vi.fn(async (_input: string, _options: unknown, _mode: string, signal: AbortSignal): Promise<ToolRunResult> => { signals.push(signal); return { ok: true, output: 'done' }; });
      signals.length = 0;
      const controller = createTextToolController({ toolId: 't', run: upper, offThread });
      controller.setRequest(request('a')); await vi.advanceTimersByTimeAsync(150);
      expect(controller.takeSwap()).toBe('done');
      expect(signals[0]!.aborted).toBe(false);
    });
    it('aborts the previous run for an immediate runNow', async () => {
      const { offThread } = gated();
      const controller = createTextToolController({ toolId: 't', live: false, run: upper, offThread });
      controller.setRequest(request('a')); void controller.runNow();
      void controller.runNow();
      expect(signals[0]!.aborted).toBe(true);
      expect(signals[1]!.aborted).toBe(false);
    });
  });
  it('non-live tools wait for runNow, and an edit clears the stale result', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', live: false, run });
    controller.setRequest(request('abc')); await vi.advanceTimersByTimeAsync(1000);
    expect(run).not.toHaveBeenCalled();
    await controller.runNow();
    expect(controller.getState().result).toEqual({ ok: true, output: 'ABC' });
    controller.setRequest(request('abcd'));
    expect(controller.getState()).toMatchObject({ status: 'idle', result: null });
  });
  it('runNow cancels a pending debounce', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('a')); await controller.runNow();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('swap moves the text output out, clears the result and refuses non-text output', async () => {
    const controller = createTextToolController({ toolId: 't', swap: true, run: upper });
    expect(controller.takeSwap()).toBeNull();
    controller.setRequest(request('abc')); await vi.advanceTimersByTimeAsync(150);
    expect(controller.takeSwap()).toBe('ABC');
    expect(controller.getState()).toMatchObject({ status: 'idle', result: null });
    expect(controller.takeSwap()).toBeNull();

    const rows = createTextToolController({ toolId: 't', run: () => ({ ok: true, output: [{ key: 'a', label: 'A', value: '1' }] }) });
    rows.setRequest(request('x')); await vi.advanceTimersByTimeAsync(150);
    expect(rows.takeSwap()).toBeNull();
    expect(rows.getState().result?.ok).toBe(true);

    const failing = createTextToolController({ toolId: 't', run: () => ({ ok: false, error: 'no' }) });
    failing.setRequest(request('x')); await vi.advanceTimersByTimeAsync(150);
    expect(failing.takeSwap()).toBeNull();
  });
  it('a swap discards a run that was in flight', async () => {
    const pending = deferred();
    const run = vi.fn().mockReturnValueOnce({ ok: true, output: 'FIRST' }).mockReturnValueOnce(pending.promise);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('a')); await vi.advanceTimersByTimeAsync(150);
    controller.setRequest(request('b')); await vi.advanceTimersByTimeAsync(150);
    expect(controller.takeSwap()).toBe('FIRST'); // the finished output is still shown while the second run is pending
    pending.resolve({ ok: true, output: 'LATE' }); await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState().result).toBeNull();
  });
  it('notifies subscribers, and dispose cancels pending work but lets a remount schedule afresh', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.setRequest(request('a')); controller.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).not.toHaveBeenCalled();
    controller.setRequest(request('a')); await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
  it('accepts an injected scheduler', () => {
    const scheduled: { fn: () => void; ms: number }[] = [];
    const controller = createTextToolController({ toolId: 't', run: upper }, { debounceMs: 40, scheduler: { set: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; }, clear: () => undefined } });
    controller.setRequest(request('a'));
    expect(scheduled.map(entry => entry.ms)).toEqual([40]);
    scheduled[0]!.fn();
    expect(controller.getState().result).toEqual({ ok: true, output: 'A' });
  });
});

describe('spec helpers', () => {
  it('normalises a single run into one default mode and rejects a spec with neither', () => {
    expect(resolveModes({ toolId: 't', run: upper }).map(mode => mode.id)).toEqual(['default']);
    expect(() => resolveModes({ toolId: 't' })).toThrow('needs modes or run');
  });
  it('builds default option values and coerces invalid ones', () => {
    const options: OptionSpec[] = [
      { kind: 'switch', id: 'pad', label: 'Pad', default: true },
      { kind: 'select', id: 'alphabet', label: 'Alphabet', default: 'std', choices: [{ value: 'std', label: 'Standard' }, { value: 'url', label: 'URL' }] },
      { kind: 'number', id: 'indent', label: 'Indent', default: 2, min: 0, max: 8 },
      { kind: 'text', id: 'sep', label: 'Separator', default: ',' },
    ];
    expect(defaultOptions(options)).toEqual({ pad: true, alphabet: 'std', indent: 2, sep: ',' });
    expect(coerceOption(options[0]!, 'yes')).toBe(true);
    expect(coerceOption(options[1]!, 'bogus')).toBe('std');
    expect(coerceOption(options[1]!, 'url')).toBe('url');
    expect(coerceOption(options[2]!, 99)).toBe(8);
    expect(coerceOption(options[2]!, -3)).toBe(0);
    expect(coerceOption(options[2]!, Number.NaN)).toBe(2);
    expect(coerceOption(options[3]!, 7)).toBe(',');
  });
});

describe('input budget', () => {
  const KB = 1024;
  it('defaults to 128 KiB on the main thread and to no kit cap when offThread is set', () => {
    expect(resolveMaxInputBytes({ toolId: 't', run: upper })).toBe(DEFAULT_MAIN_THREAD_INPUT_BYTES);
    expect(DEFAULT_MAIN_THREAD_INPUT_BYTES).toBe(128 * KB);
    expect(resolveMaxInputBytes({ toolId: 't', run: upper, offThread: async () => ({ ok: true, output: '' }) })).toBeNull();
    expect(resolveMaxInputBytes({ toolId: 't', run: upper, maxInputBytes: 64 * KB })).toBe(64 * KB);
  });
  it('runs under and at the budget, and does not run over it', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run, maxInputBytes: 10 });
    controller.setRequest(request('a'.repeat(9))); await vi.advanceTimersByTimeAsync(150);
    controller.setRequest(request('a'.repeat(10))); await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ result: { ok: true }, overBudget: false });
    controller.setRequest(request('a'.repeat(11))); await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ status: 'done', overBudget: true, result: { ok: false, error: 'Input is 1 KB; this tool handles up to 1 KB on Android.' } });
  });
  it('measures UTF-8 bytes, not characters', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run, maxInputBytes: 9 });
    controller.setRequest(request('€€€')); await vi.advanceTimersByTimeAsync(150); // 3 x 3 bytes = 9
    expect(run).toHaveBeenCalledTimes(1);
    controller.setRequest(request('€€€€')); // 12 bytes
    expect(controller.getState().overBudget).toBe(true);
  });
  it('reports the size error immediately with a KB/MB message, without waiting for the debounce', () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run });
    controller.setRequest(request('a'.repeat(300 * KB)));
    expect(controller.getState().result).toEqual({ ok: false, error: 'Input is 300 KB; this tool handles up to 128 KB on Android.' });
    controller.setRequest(request('a'.repeat(3 * 1024 * KB)));
    expect(controller.getState().result).toEqual({ ok: false, error: 'Input is 3 MB; this tool handles up to 128 KB on Android.' });
    expect(run).not.toHaveBeenCalled();
  });
  it('recovers when the input shrinks back under the budget', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run, maxInputBytes: 5 });
    controller.setRequest(request('abcdef'));
    expect(controller.getState().overBudget).toBe(true);
    controller.setRequest(request('abc')); await vi.advanceTimersByTimeAsync(150);
    expect(controller.getState()).toMatchObject({ overBudget: false, result: { ok: true, output: 'ABC' } });
  });
  it('rejects an over-budget runNow of a non-live tool and clears stale results on a non-live edit', async () => {
    const run = vi.fn(upper);
    const controller = createTextToolController({ toolId: 't', run, live: false, maxInputBytes: 3 });
    controller.setRequest(request('ab')); await controller.runNow();
    expect(controller.getState().result).toEqual({ ok: true, output: 'AB' });
    controller.setRequest(request('abcd'));
    expect(controller.getState()).toMatchObject({ overBudget: true, result: { ok: false } });
    await controller.runNow();
    expect(run).toHaveBeenCalledTimes(1);
    controller.setRequest(request('abc'));
    expect(controller.getState()).toMatchObject({ overBudget: false, result: null });
  });
  it('leaves offThread tools unbounded by default but honors an explicit cap', async () => {
    const offThread = vi.fn(async (): Promise<ToolRunResult> => ({ ok: true, output: 'done' }));
    const unbounded = createTextToolController({ toolId: 't', run: upper, offThread });
    unbounded.setRequest(request('a'.repeat(2 * 1024 * KB))); await vi.advanceTimersByTimeAsync(150);
    expect(offThread).toHaveBeenCalledTimes(1);
    expect(unbounded.getState()).toMatchObject({ overBudget: false, result: { ok: true } });
    const capped = createTextToolController({ toolId: 't', run: upper, offThread, maxInputBytes: 4 });
    capped.setRequest(request('abcde'));
    expect(capped.getState().overBudget).toBe(true);
    expect(offThread).toHaveBeenCalledTimes(1);
  });
  it('flags a crossing once however many keystrokes stay over the budget', () => {
    const controller = createTextToolController({ toolId: 't', run: upper, maxInputBytes: 4 });
    let crossings = 0; let previous = false;
    controller.subscribe(() => { const now = controller.getState().overBudget; if (now && !previous) crossings += 1; previous = now; });
    for (const text of ['abc', 'abcde', 'abcdef', 'abcdefg']) controller.setRequest(request(text));
    expect(crossings).toBe(1);
    controller.setRequest(request('ab'));
    controller.setRequest(request('abcdefgh'));
    expect(crossings).toBe(2);
  });
});
