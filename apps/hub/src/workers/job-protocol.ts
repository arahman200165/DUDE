import type { JobResult } from '../queue/job-kinds.js';

/**
 * The JSON-lines protocol between the worker pool (Hub) and a job worker process (32-SS1, Milestone 834). One job per process:
 * the Hub writes ONE `run` line to the child's stdin and keeps stdin open; the child writes `progress` lines and exactly one
 * `result` line to stdout, then exits. Stdin closing before the result means the Hub is gone and the child exits at once.
 * Nothing secret is in either direction: a payload is the queue payload (no credential-looking key) and an error is redacted.
 */
export const WORKER_MAX_LINE_BYTES = 1024 * 1024;

export interface WorkerRunMessage {
  type: 'run';
  id: string;
  kind: string;
  payload: unknown;
  attempt: number;
}

export interface WorkerProgressMessage {
  type: 'progress';
  id: string;
  note: string;
  fraction?: number;
}

export type WorkerResultMessage =
  | { type: 'result'; id: string; ok: true; result: JobResult }
  | { type: 'result'; id: string; ok: false; error: string; retryable: boolean };

export type WorkerOutMessage = WorkerProgressMessage | WorkerResultMessage;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parses one worker stdout line; undefined for anything that is not a well-formed message. */
export function parseWorkerOutMessage(line: string): WorkerOutMessage | undefined {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return undefined; }
  if (!isRecord(value) || typeof value['id'] !== 'string') return undefined;
  if (value['type'] === 'progress' && typeof value['note'] === 'string') {
    return { type: 'progress', id: value['id'], note: value['note'].slice(0, 200), ...(typeof value['fraction'] === 'number' ? { fraction: value['fraction'] } : {}) };
  }
  if (value['type'] === 'result' && value['ok'] === true && isRecord(value['result']) && typeof value['result']['summary'] === 'string') {
    const result = value['result'];
    return {
      type: 'result', id: value['id'], ok: true,
      result: {
        summary: String(result['summary']).slice(0, 200),
        ...(isRecord(result['data']) ? { data: result['data'] } : {}),
        ...(result['attention'] === true ? { attention: true } : {}),
      },
    };
  }
  if (value['type'] === 'result' && value['ok'] === false && typeof value['error'] === 'string') {
    return { type: 'result', id: value['id'], ok: false, error: value['error'], retryable: value['retryable'] !== false };
  }
  return undefined;
}

/** Parses the single `run` line a worker reads from stdin; undefined when malformed. */
export function parseWorkerRunMessage(line: string): WorkerRunMessage | undefined {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return undefined; }
  if (!isRecord(value) || value['type'] !== 'run' || typeof value['id'] !== 'string' || typeof value['kind'] !== 'string') return undefined;
  return { type: 'run', id: value['id'], kind: value['kind'], payload: value['payload'], attempt: typeof value['attempt'] === 'number' ? value['attempt'] : 1 };
}
