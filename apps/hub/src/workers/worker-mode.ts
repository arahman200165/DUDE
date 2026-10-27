import { spawn } from 'node:child_process';
import { isSea } from 'node:sea';

// Internal worker mode (32-SS1, PD-147). The single-executable Hub cannot run a worker from a path, so a worker is the
// Hub executable itself re-spawned with INTERNAL_WORKER_ARG and a worker kind; a Node-process Hub (Docker, foreground,
// the dist bundle) re-spawns `node <bundle>` the same way. `main.ts` calls runInternalWorkerIfRequested before anything
// else, so a worker process never reaches the CLI. Messages are one JSON object per line over the child's stdio. The
// queue and the real worker host arrive in Milestone 834; this module is the spawn contract they build on.

export const INTERNAL_WORKER_ARG = '--internal-worker';

export interface InternalWorkerCommand {
  command: string;
  args: string[];
}

/**
 * The command that starts a worker of `kind`. `sea` and `scriptPath` default to the running process (`isSea()` and the
 * bundle `node` was started with) and exist for tests.
 */
export function internalWorkerArgs(
  kind: string,
  options: { sea?: boolean; scriptPath?: string; execPath?: string } = {},
): InternalWorkerCommand {
  const command = options.execPath ?? process.execPath;
  if (options.sea ?? isSea()) return { command, args: [INTERNAL_WORKER_ARG, kind] };
  const script = options.scriptPath ?? process.argv[1];
  if (!script) throw new Error('Cannot re-spawn a worker: the process has no script path.');
  return { command, args: [script, INTERNAL_WORKER_ARG, kind] };
}

type WorkerHandler = (message: Record<string, unknown>) => Record<string, unknown>;

/** The closed list of worker kinds this executable can run. `ping` exists to prove the spawn contract. */
const WORKER_KINDS: Record<string, WorkerHandler> = {
  ping: (message) => ({ type: 'pong', nonce: message['nonce'], sea: isSea(), pid: process.pid }),
};

/** Reads one JSON line from stdin, answers it on stdout and resolves; never throws. */
async function runWorker(handler: WorkerHandler): Promise<number> {
  process.stdin.setEncoding('utf8');
  let buffered = '';
  for await (const chunk of process.stdin) {
    buffered += chunk as string;
    const newline = buffered.indexOf('\n');
    if (newline < 0) continue;
    try {
      const message = JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>;
      process.stdout.write(`${JSON.stringify(handler(message))}\n`);
      return 0;
    } catch {
      return 2;
    }
  }
  return 2;
}

/** Runs the worker and returns its exit code when argv requests worker mode; undefined for every other invocation. */
export async function runInternalWorkerIfRequested(argv: string[]): Promise<number | undefined> {
  if (argv[0] !== INTERNAL_WORKER_ARG) return undefined;
  const handler = WORKER_KINDS[argv[1] ?? ''];
  return handler ? runWorker(handler) : 2;
}

/** Spawns a worker, sends it one message and resolves with its one reply line; kills it on timeout. */
export function exchangeWithInternalWorker(
  kind: string,
  message: Record<string, unknown>,
  options: { timeoutMs?: number; command?: InternalWorkerCommand } = {},
): Promise<Record<string, unknown>> {
  const { command, args } = options.command ?? internalWorkerArgs(kind);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`worker did not answer within ${options.timeoutMs ?? 15000} ms`));
    }, options.timeoutMs ?? 15000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.split('\n')[0] ?? '';
      if (code === 0 && line) {
        try { resolve(JSON.parse(line) as Record<string, unknown>); return; } catch { /* fall through */ }
      }
      reject(new Error(`worker exited ${code ?? 'abnormally'} without a valid reply${stderr ? `: ${stderr.trim().slice(0, 200)}` : ''}`));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(`${JSON.stringify(message)}\n`);
  });
}
