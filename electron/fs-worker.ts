import type { FsJobEvent } from '../src/shared-logic/fs/fs-types';
import { runFsJob, type FsRuntime } from './fs-jobs';
import './fs-job-kinds';

/**
 * Entry point of DUDE's filesystem utility process (Phase 29, Milestone 523), started by
 * `fs-jobs-bridge.ts` with `utilityProcess.fork`. Drive-wide walks, bulk hashing, and content
 * search run here so neither the main process (IPC, windows, tray) nor the renderer stalls. It
 * has no Electron window/IPC access of its own: it only talks to the main process over
 * `parentPort`, and the main process has already checked every root against the user's grants.
 */

type WorkerMessage =
  | { readonly type: 'start'; readonly jobId: string; readonly kind: string; readonly root: string; readonly params: unknown }
  | { readonly type: 'cancel'; readonly jobId: string };

function argument(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? '';
}

const runtime: FsRuntime = { userData: argument('user-data'), attributeHelper: argument('attr-helper') };
const running = new Map<string, AbortController>();
const post = (event: FsJobEvent) => process.parentPort.postMessage(event);

process.parentPort.on('message', (message: { data: WorkerMessage }) => {
  const data = message.data;
  if (data.type === 'cancel') {
    running.get(data.jobId)?.abort();
    return;
  }
  if (data.type === 'start') {
    const abort = new AbortController();
    running.set(data.jobId, abort);
    void runFsJob(data.jobId, data.kind, data.root, data.params, abort.signal, runtime, post).finally(() => running.delete(data.jobId));
  }
});
