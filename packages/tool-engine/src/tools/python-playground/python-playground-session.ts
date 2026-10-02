import { SandboxEvent, SandboxLogLevel, SandboxTerminationReason } from "@dude/contracts/sandbox/code-sandbox-protocol";

export interface PythonPlaygroundLogLine {
  readonly level: SandboxLogLevel;
  readonly text: string;
}

export type PythonPlaygroundOutcome =
  | { readonly kind: 'result'; readonly value: string | null; readonly durationMs: number }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'terminated'; readonly reason: SandboxTerminationReason };

export interface PythonPlaygroundState {
  readonly logs: readonly PythonPlaygroundLogLine[];
  readonly outcome: PythonPlaygroundOutcome | null;
}

export const EMPTY_PYTHON_PLAYGROUND_STATE: PythonPlaygroundState = { logs: [], outcome: null };

/** Pure reducer folding one `SandboxEvent` into a displayable transcript — mirrors `js-playground-session.ts`. */
export function applyPythonSandboxEvent(state: PythonPlaygroundState, event: SandboxEvent): PythonPlaygroundState {
  switch (event.kind) {
    case 'log':
      return { ...state, logs: [...state.logs, { level: event.level, text: event.args.join(' ') }] };
    case 'result':
      return { ...state, outcome: { kind: 'result', value: event.value, durationMs: event.durationMs } };
    case 'error':
      return { ...state, outcome: { kind: 'error', message: event.message } };
    case 'terminated':
      return { ...state, outcome: { kind: 'terminated', reason: event.reason } };
  }
}
