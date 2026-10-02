/**
 * Wire protocol shared between the main-thread `WorkerClientService` and a
 * tool's `*.worker.ts` glue file. Kept free of any `self`/`postMessage`
 * references so it can be imported from both worker and main-thread code.
 */

export interface WorkerRequestMessage<TPayload> {
  readonly id: string;
  readonly payload: TPayload;
}

export interface WorkerErrorPayload {
  readonly message: string;
  readonly name?: string;
}

export interface WorkerProgressMessage {
  readonly id: string;
  readonly kind: 'progress';
  readonly progress: number;
}

export interface WorkerResultMessage<TResult> {
  readonly id: string;
  readonly kind: 'result';
  readonly result: TResult;
}

export interface WorkerErrorMessage {
  readonly id: string;
  readonly kind: 'error';
  readonly error: WorkerErrorPayload;
}

export type WorkerResponseMessage<TResult> =
  | WorkerProgressMessage
  | WorkerResultMessage<TResult>
  | WorkerErrorMessage;

export function progressMessage(id: string, progress: number): WorkerProgressMessage {
  return { id, kind: 'progress', progress };
}

export function resultMessage<TResult>(id: string, result: TResult): WorkerResultMessage<TResult> {
  return { id, kind: 'result', result };
}

export function errorMessage(id: string, error: unknown): WorkerErrorMessage {
  return { id, kind: 'error', error: toErrorPayload(error) };
}

export function toErrorPayload(error: unknown): WorkerErrorPayload {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: String(error) };
}
