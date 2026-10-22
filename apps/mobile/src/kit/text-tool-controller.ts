/** Pure state machine behind `defineTextTool`: no React, no native modules. */

export type OptionValue = string | number | boolean;
export type OptionValues = Readonly<Record<string, OptionValue>>;
export interface KeyValueRow { readonly key: string; readonly label: string; readonly value: string }
export type ToolRunResult =
  | { readonly ok: true; readonly output: string | readonly KeyValueRow[] }
  | { readonly ok: false; readonly error: string };

export interface TextToolMode<O extends OptionValues = OptionValues> {
  readonly id: string;
  readonly label: string;
  readonly run: (input: string, options: O) => ToolRunResult | Promise<ToolRunResult>;
}
export interface OptionChoice { readonly value: string; readonly label: string }
export type OptionSpec =
  | { readonly kind: 'switch'; readonly id: string; readonly label: string; readonly default: boolean; readonly key?: string }
  | { readonly kind: 'select'; readonly id: string; readonly label: string; readonly default: string; readonly choices: readonly OptionChoice[]; readonly key?: string }
  | { readonly kind: 'number'; readonly id: string; readonly label: string; readonly default: number; readonly min?: number; readonly max?: number; readonly key?: string }
  | { readonly kind: 'text'; readonly id: string; readonly label: string; readonly default: string; readonly key?: string };

export interface TextToolSpec<O extends OptionValues = OptionValues> {
  /** Stable registry id (also the persisted-preference namespace). */
  readonly toolId: string;
  /** One or more modes. A single-mode tool may give `run` instead. */
  readonly modes?: readonly TextToolMode<O>[];
  readonly run?: (input: string, options: O) => ToolRunResult | Promise<ToolRunResult>;
  readonly options?: readonly OptionSpec[];
  /** Persisted-preference key for the selected mode (default `mode`, the web key). */
  readonly modeKey?: string;
  /** Show a Swap action that moves the output back into the input. */
  readonly swap?: boolean;
  readonly sampleInput?: string;
  /** `text` (default) shows an OutputViewer, `kv` shows a KeyValueList when the result is a row list. */
  readonly outputKind?: 'text' | 'kv';
  /**
   * Replaces `run` when provided, e.g. an off-thread worker call. Passed in by the tool; the kit never imports it.
   * `signal` aborts when the run is superseded (a newer run starts, the request resets, or the output is swapped away); pass it to
   * `runOffThread`. A result that settles after its signal aborted is discarded.
   */
  readonly offThread?: (input: string, options: O, mode: string, signal: AbortSignal) => Promise<ToolRunResult>;
  /** Recompute on every change (debounced 150 ms). Default true. When false a Run button is shown. */
  readonly live?: boolean;
  /** Run even when the input is empty (generators). Default false. */
  readonly allowEmptyInput?: boolean;
  /** Show an Open file button (SAF picker, limited by the manifest `fileInput`). Defaults to whether the manifest declares `fileInput`. */
  readonly openFile?: boolean;
  readonly inputLabel?: string;
  readonly outputLabel?: string;
}

export const DEFAULT_DEBOUNCE_MS = 150;
export const SINGLE_MODE_ID = 'default';

/** The modes of a spec, normalising the single-`run` form. */
export function resolveModes<O extends OptionValues>(spec: TextToolSpec<O>): readonly TextToolMode<O>[] {
  if (spec.modes?.length) return spec.modes;
  if (spec.run) return [{ id: SINGLE_MODE_ID, label: spec.outputLabel ?? 'Result', run: spec.run }];
  throw new Error(`Text tool ${spec.toolId} needs modes or run.`);
}
export function defaultOptions(specs: readonly OptionSpec[] | undefined): OptionValues {
  return Object.fromEntries((specs ?? []).map(option => [option.id, option.default]));
}
export const optionKey = (option: OptionSpec): string => option.key ?? option.id;

/** Coerces a persisted/edited value to the option's type; invalid values return the default. */
export function coerceOption(option: OptionSpec, raw: unknown): OptionValue {
  switch (option.kind) {
    case 'switch': return typeof raw === 'boolean' ? raw : option.default;
    case 'text': return typeof raw === 'string' ? raw : option.default;
    case 'select': return typeof raw === 'string' && option.choices.some(choice => choice.value === raw) ? raw : option.default;
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return option.default;
      return Math.min(option.max ?? Infinity, Math.max(option.min ?? -Infinity, raw));
    }
  }
}

export interface TextToolRequest { readonly input: string; readonly modeId: string; readonly options: OptionValues }
export type TextToolStatus = 'idle' | 'running' | 'done';
export interface TextToolState {
  readonly status: TextToolStatus;
  /** Result of the latest completed run for the current request; null when none, reset by an empty input. */
  readonly result: ToolRunResult | null;
  /** Monotonic id of the latest started run (exposed for tests and debugging). */
  readonly sequence: number;
}
export interface Scheduler { readonly set: (fn: () => void, ms: number) => unknown; readonly clear: (handle: unknown) => void }
const timers: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The tool failed to process this input.';
}
function normalize(result: unknown): ToolRunResult {
  if (result && typeof result === 'object' && 'ok' in result) {
    const value = result as ToolRunResult;
    if (value.ok === true && (typeof value.output === 'string' || Array.isArray(value.output))) return value;
    if (value.ok === false && typeof value.error === 'string') return value;
  }
  return { ok: false, error: 'The tool returned an unreadable result.' };
}

export interface TextToolController {
  getState(): TextToolState;
  subscribe(listener: () => void): () => void;
  /** Supplies the current input/mode/options. Live tools re-run after the debounce; others wait for `runNow`. */
  setRequest(request: TextToolRequest): void;
  /** Runs immediately for the current request, cancelling any pending debounce. Resolves when that run has settled. */
  runNow(): Promise<void>;
  /**
   * Swap semantics: returns the text output to move into the input (null when there is no text output) and
   * clears the result, since it no longer describes the new input.
   */
  takeSwap(): string | null;
  dispose(): void;
}

export function createTextToolController<O extends OptionValues = OptionValues>(
  spec: TextToolSpec<O>,
  options: { readonly debounceMs?: number; readonly scheduler?: Scheduler } = {},
): TextToolController {
  const modes = resolveModes(spec);
  const live = spec.live !== false;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const scheduler = options.scheduler ?? timers;
  let state: TextToolState = { status: 'idle', result: null, sequence: 0 };
  let request: TextToolRequest | null = null;
  let timer: unknown = null;
  let inflight: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: TextToolState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const cancelTimer = (): void => { if (timer !== null) { scheduler.clear(timer); timer = null; } };
  /** Aborts the signal handed to the run that is currently in flight (if any). */
  const abortInflight = (): void => { const controller = inflight; inflight = null; controller?.abort(); };

  const execute = (current: TextToolRequest): Promise<void> => {
    const sequence = state.sequence + 1;
    abortInflight();
    if (current.input === '' && !spec.allowEmptyInput) {
      publish({ status: 'idle', result: null, sequence });
      return Promise.resolve();
    }
    const mode = modes.find(candidate => candidate.id === current.modeId) ?? modes[0]!;
    publish({ ...state, status: 'running', sequence });
    const controller = new AbortController();
    inflight = controller;
    const settle = (result: ToolRunResult): void => {
      // A newer run (or request) owns the state: a late result is discarded, never shown.
      if (sequence !== state.sequence || controller.signal.aborted) return;
      if (inflight === controller) inflight = null;
      publish({ status: 'done', result, sequence });
    };
    let pending: ToolRunResult | Promise<ToolRunResult>;
    try { pending = spec.offThread ? spec.offThread(current.input, current.options as O, mode.id, controller.signal) : mode.run(current.input, current.options as O); }
    catch (error) { settle({ ok: false, error: toErrorMessage(error) }); return Promise.resolve(); }
    if (!(pending instanceof Promise)) { settle(normalize(pending)); return Promise.resolve(); }
    return pending.then(value => settle(normalize(value)), error => settle({ ok: false, error: toErrorMessage(error) }));
  };

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setRequest(next) {
      const previous = request;
      if (previous && previous.input === next.input && previous.modeId === next.modeId && shallowEqual(previous.options, next.options)) return;
      request = next;
      cancelTimer();
      if (!live) {
        // The shown result no longer matches the request; bumping the sequence also discards any in-flight run.
        abortInflight();
        if (state.result || state.status === 'running') publish({ status: 'idle', result: null, sequence: state.sequence + 1 });
        return;
      }
      if (next.input === '' && !spec.allowEmptyInput) { void execute(next); return; }
      timer = scheduler.set(() => { timer = null; void execute(next); }, debounceMs);
    },
    async runNow() {
      if (!request) return;
      cancelTimer();
      await execute(request);
    },
    takeSwap() {
      const result = state.result;
      if (!result?.ok || typeof result.output !== 'string') return null;
      const text = result.output;
      cancelTimer();
      abortInflight();
      publish({ status: 'idle', result: null, sequence: state.sequence + 1 });
      return text;
    },
    /** Cancels pending work and forgets the request, so a remounted view (StrictMode) schedules a fresh run. */
    dispose() { cancelTimer(); request = null; },
  };
}

function shallowEqual(a: OptionValues, b: OptionValues): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
