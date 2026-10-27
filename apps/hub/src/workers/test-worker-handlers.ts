import type { WorkerJobImplementations } from './job-worker-host.js';
import { PermanentJobError } from '../queue/job-error.js';

/**
 * Worker-side handlers for specs only (never imported by `main.ts`, so never in a release bundle). They let the worker host and
 * the queue runner exercise success, progress, a handler error, a permanent error, a timeout, a crash, an out-of-memory abort and the
 * environment a worker sees, without a real SaveSphere handler. `test-worker-entry.ts` is the esbuild entry that serves them.
 */
const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const TEST_WORKER_JOB_HANDLERS: WorkerJobImplementations = {
  'test.echo': async ({ payload, progress }) => {
    progress('halfway', 0.5);
    return { summary: 'Echoed.', data: { echo: payload as Record<string, unknown> } };
  },
  'test.sleep': async ({ payload }) => {
    await sleepMs(Number((payload as { ms?: number }).ms ?? 60_000));
    return { summary: 'Slept.' };
  },
  'test.fail': async ({ payload }) => {
    throw new Error(String((payload as { message?: string }).message ?? 'boom'));
  },
  'test.permanent': async () => {
    throw new PermanentJobError('This payload can never work.');
  },
  /** Exits without answering, as a crashed native library would. */
  'test.crash': async () => {
    process.exit(9);
  },
  /** Allocates until V8 aborts at the heap ceiling. */
  'test.oom': async () => {
    const hoard: string[][] = [];
    for (;;) hoard.push(new Array<string>(1_000_000).fill('x'.repeat(64)));
  },
  /** Fails on the first attempt and succeeds on the next. */
  'test.flaky': async ({ attempt }) => {
    if (attempt < 2) process.exit(9);
    return { summary: `Succeeded on attempt ${attempt}.` };
  },
  /** Reports what the worker can see: environment names, working directory and temp locations. */
  'test.env': async () => ({
    summary: 'Environment reported.',
    data: { envNames: Object.keys(process.env).sort(), cwd: process.cwd(), temp: process.env['TEMP'] ?? null, nodeOptions: process.env['NODE_OPTIONS'] ?? null, pid: process.pid },
  }),
  /** Writes into the scratch directory so a spec can check that it is removed afterwards. */
  'test.scratch': async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('scratch.txt', 'x');
    return { summary: 'Wrote.', data: { cwd: process.cwd() } };
  },
};
