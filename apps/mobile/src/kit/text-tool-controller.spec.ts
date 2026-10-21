import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coerceOption, createTextToolController, defaultOptions, resolveModes, toErrorMessage,
  type OptionSpec, type TextToolRequest, type TextToolSpec, type ToolRunResult,
} from './text-tool-controller';

const upper = (input: string): ToolRunResult => ({ ok: true, output: input.toUpperCase() });
const request = (input: string, modeId = 'default', options: TextToolRequest['options'] = {}): TextToolRequest => ({ input, modeId, options });
const deferred = () => { let resolve!: (value: ToolRunResult) => void; const promise = new Promise<ToolRunResult>(done => { resolve = done; }); return { promise, resolve }; };

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
    expect(offThread).toHaveBeenCalledWith('{}', {}, 'format');
    expect(controller.getState().result).toEqual({ ok: true, output: 'format:{}' });
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
