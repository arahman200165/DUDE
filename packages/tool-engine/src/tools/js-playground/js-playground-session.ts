import { SandboxEvent, SandboxLogLevel, SandboxTerminationReason } from "@dude/contracts/sandbox/code-sandbox-protocol";

export interface JsPlaygroundLogLine {
  readonly level: SandboxLogLevel;
  readonly text: string;
}

export type JsPlaygroundOutcome =
  | { readonly kind: 'result'; readonly value: string | null; readonly durationMs: number }
  | { readonly kind: 'error'; readonly message: string; readonly stack?: string }
  | { readonly kind: 'terminated'; readonly reason: SandboxTerminationReason };

export interface JsPlaygroundState {
  readonly logs: readonly JsPlaygroundLogLine[];
  readonly outcome: JsPlaygroundOutcome | null;
}

export const EMPTY_JS_PLAYGROUND_STATE: JsPlaygroundState = { logs: [], outcome: null };

/** Pure reducer folding one `SandboxEvent` into a displayable transcript — kept framework-free so it's unit-testable without TestBed. */
export function applySandboxEvent(state: JsPlaygroundState, event: SandboxEvent): JsPlaygroundState {
  switch (event.kind) {
    case 'log':
      return { ...state, logs: [...state.logs, { level: event.level, text: event.args.join(' ') }] };
    case 'result':
      return { ...state, outcome: { kind: 'result', value: event.value, durationMs: event.durationMs } };
    case 'error':
      return { ...state, outcome: { kind: 'error', message: event.message, stack: event.stack } };
    case 'terminated':
      return { ...state, outcome: { kind: 'terminated', reason: event.reason } };
  }
}
