import { PermanentJobError } from '../queue/job-error.js';
import { redactJobError } from '../queue/redact.js';
import type { JobResult } from '../queue/job-kinds.js';
import { WORKER_MAX_LINE_BYTES, parseWorkerRunMessage } from './job-protocol.js';
import type { WorkerOutMessage } from './job-protocol.js';

/** What a worker-side handler sees. Its working directory is already the per-job scratch directory. */
export interface WorkerJobContext {
  jobId: string;
  kind: string;
  payload: unknown;
  attempt: number;
  progress(note: string, fraction?: number): void;
}

/** The code a worker process runs for one kind. No database handle and no Hub secret is reachable from here. */
export type WorkerJobImplementation = (context: WorkerJobContext) => Promise<JobResult>;
export type WorkerJobImplementations = Readonly<Record<string, WorkerJobImplementation>>;

const EXIT_OK = 0;
const EXIT_BAD_REQUEST = 2;
const EXIT_PARENT_GONE = 3;

/**
 * The worker side of the job protocol (`job-protocol.ts`), run when the Hub executable is re-spawned as `--internal-worker job`.
 * It reads one `run` line, runs the matching implementation, writes one `result` line and exits. When stdin closes before that
 * (the Hub exited or killed its pipe) it exits immediately: a worker never outlives the Hub that started it. A handler that blocks
 * the event loop cannot be interrupted from here; the Hub's timeout kill is the bound, and a Hub that died leaves such a handler
 * running only until it yields or finishes.
 */
export function runJobWorkerHost(implementations: WorkerJobImplementations): Promise<number> {
  return new Promise<number>((resolve) => {
    let started = false;
    let finished = false;
    let buffered = '';
    const send = (message: WorkerOutMessage, then?: () => void): void => {
      try { process.stdout.write(`${JSON.stringify(message)}\n`, then); } catch { then?.(); }
    };
    const finish = (code: number): void => { finished = true; process.stdout.write('', () => resolve(code)); };

    const start = async (line: string): Promise<void> => {
      const request = parseWorkerRunMessage(line);
      const implementation = request === undefined ? undefined : Object.prototype.hasOwnProperty.call(implementations, request.kind) ? implementations[request.kind] : undefined;
      if (request === undefined || implementation === undefined) {
        if (request !== undefined) send({ type: 'result', id: request.id, ok: false, error: 'This worker does not run that kind of job.', retryable: false });
        finish(EXIT_BAD_REQUEST);
        return;
      }
      try {
        const result = await implementation({
          jobId: request.id, kind: request.kind, payload: request.payload, attempt: request.attempt,
          progress: (note, fraction) => send({ type: 'progress', id: request.id, note, ...(fraction === undefined ? {} : { fraction }) }),
        });
        send({ type: 'result', id: request.id, ok: true, result }, () => finish(EXIT_OK));
      } catch (error) {
        send({ type: 'result', id: request.id, ok: false, error: redactJobError(error), retryable: !(error instanceof PermanentJobError) }, () => finish(EXIT_OK));
      }
    };

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      if (started) return;
      buffered += chunk;
      const newline = buffered.indexOf('\n');
      if (newline < 0) {
        if (Buffer.byteLength(buffered) > WORKER_MAX_LINE_BYTES) { started = true; finish(EXIT_BAD_REQUEST); }
        return;
      }
      started = true;
      void start(buffered.slice(0, newline));
    });
    // The Hub closed (or lost) our stdin: nobody is waiting for an answer any more.
    process.stdin.on('end', () => { if (!finished) process.exit(EXIT_PARENT_GONE); });
    process.stdin.on('error', () => { if (!finished) process.exit(EXIT_PARENT_GONE); });
  });
}
