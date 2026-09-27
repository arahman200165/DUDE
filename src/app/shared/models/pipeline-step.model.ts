import { DudeDataType } from './tool-io.model';

/**
 * Runtime value passed between chained pipeline steps. Every payload is a plain,
 * JSON-serializable shape by construction — `bytes`/`file` carry base64 text (never a live
 * `Uint8Array`/`Blob`), matching `DudeDataType`'s own "binary/Base64 payload" convention — so a
 * value can cross a `postMessage`/sandbox boundary (user-defined scripting) via a bare
 * `JSON.stringify`/`JSON.parse` round trip with no protocol beyond that.
 */
export type PipelineValue =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'json'; readonly value: unknown }
  | { readonly type: 'bytes'; readonly value: string }
  | { readonly type: 'file'; readonly value: { readonly name: string; readonly mimeType: string; readonly base64: string } }
  | { readonly type: 'table'; readonly value: { readonly columns: readonly string[]; readonly rows: readonly (readonly unknown[])[] } }
  | { readonly type: 'url'; readonly value: string }
  | {
      readonly type: 'http-response';
      readonly value: {
        readonly status: number;
        readonly statusText: string;
        readonly headers: readonly { readonly key: string; readonly value: string }[];
        readonly body: PipelineValue;
      };
    };

export interface PipelineStepError {
  readonly message: string;
  /** Lets the engine tell "this step's input was wrong" apart from "this step is broken." */
  readonly kind: 'invalid-input' | 'execution-error' | 'unsupported';
}

export type PipelineStepResult =
  | { readonly ok: true; readonly output: PipelineValue }
  | { readonly ok: false; readonly error: PipelineStepError };

/**
 * Runs `payload` through a tool's existing worker (the same `worker-protocol` message shape its
 * component already uses) and resolves with the worker's result. It is honoured by the run's
 * abort signal (Phase 26 Item 13).
 */
export type PipelineWorkerOffload = <TPayload, TResult>(createWorker: () => Worker, payload: TPayload) => Promise<TResult>;

/**
 * What the runner hands each step. Both fields are optional, so a step must still work when called
 * bare (unit tests, jsdom): `signal` for cooperative cancellation, and `offload` to move heavy work
 * off the UI thread. Fall back to computing inline when `offload` is absent.
 */
export interface PipelineStepContext {
  readonly signal?: AbortSignal;
  readonly offload?: PipelineWorkerOffload;
}

/**
 * The contract every pipeline-eligible tool exposes via `<id>.pipeline-step.ts` (resolved by
 * `loadPipelineStep`, never registered by hand — see `core/pipeline/AGENTS.md`). Always async and
 * never throws: `run` normalizes whatever result shape the tool's own pure transform already
 * returns into this single envelope, so the engine can treat every step uniformly regardless of
 * whether it runs synchronously, dispatches to a Worker, or is a sandboxed user script.
 */
export interface PipelineStep {
  readonly accepts: readonly DudeDataType[];
  readonly produces: readonly DudeDataType[];
  run(input: PipelineValue, context?: PipelineStepContext): Promise<PipelineStepResult>;
}

export function pipelineValueOfType(value: PipelineValue, type: DudeDataType): boolean {
  return value.type === type;
}
